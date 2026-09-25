import { z } from 'zod'
import { Buffer } from 'node:buffer'
import { authorizeStudio, github, repositoryCredential, StudioError, studioBody, studioFailure, studioResponse } from '@/lib/god-studio-server'
import { changeSetSchema, editablePath, MAX_SOURCE_BYTES, shaSchema, sourcePath, STUDIO_REPOSITORY } from '@/lib/god-studio'

type GitTree = {sha: string; truncated?: boolean; tree: {path: string; type: string; mode: string; sha: string; size?: number}[]}
type GitCommit = {sha: string; tree: {sha: string}; message: string}
type Pull = {number: number; html_url: string; state: string; merged: boolean; head: {sha: string; ref: string; repo: {full_name: string}}; base: {ref: string}}
type Run = {id: number; name: string; path: string; head_sha: string; status: string; conclusion: string | null; html_url: string; run_attempt: number}

async function currentHead(credential?: string) {
  return (await github<{object: {sha: string}}>('/git/ref/heads/main', credential)).object.sha
}

export async function GET(request: Request) {
  try {
    const context = await authorizeStudio(request)
    const {data: credential} = await context.client.rpc('upt_god_repository_secret', {p_token: context.token})
    const key = credential || undefined
    const params = new URL(request.url).searchParams
    const action = params.get('action') || 'tree'
    if (action === 'tree') {
      const head = await currentHead(key)
      const tree = await github<GitTree>(`/git/trees/${head}?recursive=1`, key)
      if (tree.truncated) throw new StudioError('De repository is te groot om volledig te laden.', 413)
      return studioResponse({head, connected: Boolean(key), repository: STUDIO_REPOSITORY, files: tree.tree.filter(item => item.type === 'blob' && editablePath(item.path))})
    }
    if (action === 'file') {
      const path = sourcePath.parse(params.get('path'))
      const ref = shaSchema.parse(params.get('ref'))
      const data = await github<{content: string; encoding: string; sha: string; size: number}>(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`, key)
      if (data.size > MAX_SOURCE_BYTES || data.encoding !== 'base64') throw new StudioError('Dit bestand is te groot voor de ingebouwde teksteditor.', 413)
      return studioResponse({path, sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8')})
    }
    if (action === 'history') {
      const commits = await github<{sha: string; html_url: string; commit: {message: string; author: {date: string}}}[]>('/commits?sha=main&per_page=30', key)
      const pulls = await github<Pull[]>('/pulls?state=open&per_page=100', key)
      return studioResponse({commits, pulls: pulls.filter(p => p.head.repo?.full_name === STUDIO_REPOSITORY && p.head.ref.startsWith('god-mode/'))})
    }
    if (action === 'checks') {
      const sha = shaSchema.parse(params.get('sha'))
      const {workflow_runs: runs} = await github<{workflow_runs: Run[]}>(`/actions/runs?head_sha=${sha}&per_page=100`, key)
      return studioResponse({runs: runs.map(({id,name,path,head_sha,status,conclusion,html_url,run_attempt}) => ({id,name,path,head_sha,status,conclusion,html_url,run_attempt}))})
    }
    throw new StudioError('Onbekende actie.')
  } catch (error) {
    if (error instanceof z.ZodError) return studioResponse({error: 'Ongeldige bestandsaanvraag.'}, 400)
    return studioFailure(error)
  }
}

async function createProposal(key: string, base: string, tree: string, title: string) {
  const commit = await github<{sha: string}>('/git/commits', key, 'POST', {message: title, tree, parents: [base]})
  const branch = `god-mode/${Date.now()}-${crypto.randomUUID().slice(0,8)}`
  await github('/git/refs', key, 'POST', {ref: `refs/heads/${branch}`, sha: commit.sha})
  const pull = await github<Pull>('/pulls', key, 'POST', {title, head: branch, base: 'main', body: 'Gemaakt in God Mode. Controleer de gewijzigde code en de CI-resultaten vóór publicatie.'})
  return {sha: commit.sha, branch, number: pull.number, url: pull.html_url}
}

export async function POST(request: Request) {
  try {
    const context = await authorizeStudio(request)
    const key = await repositoryCredential(context)
    const raw = await studioBody(request)
    const action = z.object({action: z.enum(['save','restore','publish'])}).parse(raw).action
    if (action === 'save') {
      const {action: _action, ...input} = raw as Record<string, unknown>
      void _action
      const body = changeSetSchema.parse(input)
      if (await currentHead(key) !== body.base) throw new StudioError('Er staat nieuwere code op main. Bewaar je concept en laad de actuele versie.', 409)
      const base = await github<GitCommit>(`/git/commits/${body.base}`, key)
      const original = await github<GitTree>(`/git/trees/${body.base}?recursive=1`, key)
      if (original.truncated) throw new StudioError('De volledige bestandslijst ontbreekt.', 409)
      const entries = body.changes.map(change => {
        const existing = original.tree.find(item => item.path === change.path)
        if (existing && (existing.type !== 'blob' || !['100644','100755'].includes(existing.mode))) throw new StudioError('Dit bestandstype kan niet worden gewijzigd.')
        if (change.content === null && !existing) throw new StudioError('Het te verwijderen bestand bestaat niet.')
        return {path: change.path, mode: existing?.mode || '100644', type: 'blob', ...(change.content === null ? {sha: null} : {content: change.content})}
      })
      const tree = await github<{sha: string}>('/git/trees', key, 'POST', {base_tree: base.tree.sha, tree: entries})
      const proposal = await createProposal(key, body.base, tree.sha, body.title)
      return studioResponse({ok: true, proposal})
    }
    if (action === 'restore') {
      const body = z.object({action: z.literal('restore'), target: shaSchema, base: shaSchema}).strict().parse(raw)
      if (await currentHead(key) !== body.base) throw new StudioError('Main is gewijzigd. Vernieuw eerst de versiegeschiedenis.', 409)
      const target = await github<GitCommit>(`/git/commits/${body.target}`, key)
      const proposal = await createProposal(key, body.base, target.tree.sha, `Herstel broncode naar ${body.target.slice(0,8)}`)
      return studioResponse({ok: true, proposal, notice: 'Herstelt broncode; bestaande databasegegevens worden niet teruggedraaid.'})
    }
    const body = z.object({action: z.literal('publish'), number: z.number().int().positive(), sha: shaSchema}).strict().parse(raw)
    const pull = await github<Pull>(`/pulls/${body.number}`, key)
    if (pull.head.repo?.full_name !== STUDIO_REPOSITORY || !pull.head.ref.startsWith('god-mode/') || pull.base.ref !== 'main' || pull.head.sha !== body.sha || pull.state !== 'open') throw new StudioError('Het voorstel is gewijzigd of al gesloten.', 409)
    const runs = await github<{workflow_runs: Run[]}>(`/actions/workflows/ci.yml/runs?head_sha=${body.sha}&per_page=100`, key)
    const latest = [...runs.workflow_runs].sort((a,b) => b.id - a.id)[0]
    if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') throw new StudioError('Publiceren kan pas nadat de CI-controle van deze code is geslaagd.', 409)
    const comparison = await github<{behind_by: number}>(`/compare/main...${body.sha}`, key)
    if (comparison.behind_by > 0) throw new StudioError('Main is intussen gewijzigd. Werk het voorstel bij op GitHub en laat de tests opnieuw lopen.', 409)
    const merge = await github<{merged: boolean; sha: string}>(`/pulls/${body.number}/merge`, key, 'PUT', {sha: body.sha, merge_method: 'squash'})
    if (!merge.merged) throw new StudioError('GitHub heeft de wijziging niet samengevoegd.', 409)
    return studioResponse({ok: true, sha: merge.sha, notice: 'Code staat op main. Cloudflare start de gekoppelde productiebuild; livegang volgt pas na een geslaagde deployment.'})
  } catch (error) {
    if (error instanceof z.ZodError) return studioResponse({error: error.issues[0]?.message || 'Ongeldige wijziging.'}, 400)
    return studioFailure(error)
  }
}
