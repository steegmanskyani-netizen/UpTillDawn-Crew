import { z } from 'zod'
import type { Json } from '@/types/crew-database'
import { authorizeStudio, StudioError, studioBody, studioFailure, studioResponse } from '@/lib/god-studio-server'

export async function GET(request: Request) {
  try {
    const {client,token} = await authorizeStudio(request)
    const params = new URL(request.url).searchParams
    const table = params.get('table')
    const result = table
      ? await client.rpc('upt_god_data_rows', {p_token: token, p_table: table, p_offset: z.coerce.number().int().min(0).max(100000).parse(params.get('offset') || 0)})
      : await client.rpc('upt_god_data_catalog', {p_token: token})
    if (result.error) throw new StudioError('Gegevens konden niet worden geladen.', 400)
    return studioResponse({data: result.data})
  } catch (error) { return studioFailure(error) }
}

export async function POST(request: Request) {
  try {
    const {client,token} = await authorizeStudio(request)
    const input = z.object({
      table: z.string().min(1).max(100), operation: z.enum(['insert','update','delete']),
      key: z.record(z.unknown()), before: z.record(z.unknown()).nullable(), values: z.record(z.unknown()),
    }).strict().parse(await studioBody(request))
    const {data,error} = await client.rpc('upt_god_data_mutate', {
      p_token: token, p_table: input.table, p_operation: input.operation,
      p_key: input.key as Json, p_before: input.before as Json, p_values: input.values as Json,
    })
    if (error) {
      const conflict = error.message.includes('Row changed')
      throw new StudioError(conflict ? 'Deze rij is intussen gewijzigd. Laad de gegevens opnieuw.' : 'Wijziging geweigerd: controleer verplichte velden, gegevenstypes en gekoppelde records.', conflict ? 409 : 400)
    }
    return studioResponse(data)
  } catch (error) {
    if (error instanceof z.ZodError) return studioResponse({error: 'Ongeldige gegevens.'}, 400)
    return studioFailure(error)
  }
}
