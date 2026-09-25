import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/crew-server'
import { STUDIO_REPOSITORY } from '@/lib/god-studio'

export class StudioError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function authorizeStudio(request: Request) {
  const origin = request.headers.get('origin')
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new StudioError('Ongeldige oorsprong.', 403)
  }
  const token = (await cookies()).get('uptilldawn-god-session')?.value
  if (!token) throw new StudioError('Meld opnieuw aan bij God Mode.', 401)
  const client = await createClient()
  const {data, error} = await client.rpc('upt_god_session_valid', {p_token: token})
  if (error || data !== true) throw new StudioError('God Mode sessie verlopen.', 401)
  return {client, token}
}

export async function repositoryCredential(context: Awaited<ReturnType<typeof authorizeStudio>>) {
  const {data, error} = await context.client.rpc('upt_god_repository_secret', {p_token: context.token})
  if (error) throw new StudioError('De repositorykoppeling kon niet worden gelezen.', 503)
  if (!data) throw new StudioError('Koppel GitHub in het tabblad Koppeling om code op te slaan.', 428)
  return data
}

export async function github<T>(path: string, credential?: string, method = 'GET', body?: unknown): Promise<T> {
  if ((path !== '' && !path.startsWith('/')) || path.includes('..') || /[\r\n]/.test(path)) throw new StudioError('Ongeldig repositorypad.')
  const response = await fetch(`https://api.github.com/repos/${STUDIO_REPOSITORY}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'UpTillDawn-GodMode',
      ...(credential ? {Authorization: `Bearer ${credential}`} : {}),
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) {
    const messages: Record<number,string> = {
      401: 'De GitHub-sleutel is ongeldig of verlopen.',
      403: 'GitHub weigert deze actie. Controleer de repositoryrechten en API-limiet.',
      404: 'GitHub-bestand, workflow of toegangsrecht ontbreekt.',
      409: 'De broncode is intussen gewijzigd. Laad de nieuwste versie.',
      422: 'GitHub kon de wijziging niet toepassen. Controleer de bestanden en branch.',
    }
    throw new StudioError(messages[response.status] || `GitHub is tijdelijk niet beschikbaar (${response.status}).`, response.status === 401 || response.status === 403 ? 403 : 409)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function studioResponse(payload: unknown, status = 200) {
  return Response.json(payload, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}})
}

export function studioFailure(error: unknown) {
  if (error instanceof StudioError) return studioResponse({error: error.message}, error.status)
  return studioResponse({error: 'De actie kon niet worden voltooid. Vernieuw de status voordat je opnieuw opslaat.'}, 500)
}

export async function studioBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 2_000_000) throw new StudioError('Aanvraag te groot.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new StudioError('Lege aanvraag.')
  const decoder = new TextDecoder()
  let size = 0, text = ''
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_000_000) { await reader.cancel(); throw new StudioError('Aanvraag te groot.', 413) }
      text += decoder.decode(value, {stream: true})
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  try { return JSON.parse(text) as unknown } catch { throw new StudioError('Ongeldige aanvraag.') }
}
