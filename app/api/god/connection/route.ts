import { z } from 'zod'
import { authorizeStudio, github, studioBody, studioFailure, studioResponse, StudioError } from '@/lib/god-studio-server'
import { STUDIO_REPOSITORY } from '@/lib/god-studio'

export async function POST(request: Request) {
  try {
    const context = await authorizeStudio(request)
    const body = z.object({credential: z.string().trim().min(20).max(500)}).strict().parse(await studioBody(request))
    const repo = await github<{full_name: string; permissions?: {push?: boolean}}>('', body.credential)
    if (repo.full_name !== STUDIO_REPOSITORY || repo.permissions?.push !== true) throw new StudioError('Deze sleutel heeft geen schrijftoegang tot UpTillDawn-Crew.', 403)
    const {error} = await context.client.rpc('upt_god_repository_connect', {p_token: context.token, p_secret: body.credential})
    if (error) throw new StudioError('De GitHub-koppeling kon niet worden opgeslagen.', 503)
    return studioResponse({ok: true})
  } catch (error) {
    if (error instanceof z.ZodError) return studioResponse({error: 'Vul een geldige GitHub-sleutel in.'}, 400)
    return studioFailure(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await authorizeStudio(request)
    const {error} = await context.client.rpc('upt_god_repository_disconnect', {p_token: context.token})
    if (error) throw new StudioError('Ontkoppelen mislukt.', 503)
    return studioResponse({ok: true})
  } catch (error) { return studioFailure(error) }
}
