import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/crew-server'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function parseJsonObject(value: string) {
  const cleaned = value.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(cleaned) as { title?: unknown; instructions?: unknown }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,approved')
    .eq('id', user.id)
    .single()

  if (!profile?.approved || !['admin', 'responsible_lead'].includes(profile.role)) {
    return NextResponse.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Geen bestand ontvangen.' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Bestand is leeg of groter dan 20 MB.' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Dit bestandstype wordt niet ondersteund.' }, { status: 415 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Documentanalyse is niet geconfigureerd.' }, { status: 503 })

  const upload = new FormData()
  upload.set('purpose', 'user_data')
  upload.set('file', file, file.name)

  const uploaded = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upload,
  })

  if (!uploaded.ok) {
    return NextResponse.json({ error: 'Bestand kon niet voor analyse worden voorbereid.' }, { status: 502 })
  }

  const uploadedFile = await uploaded.json() as { id: string }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_id: uploadedFile.id,
            },
            {
              type: 'input_text',
              text: 'Lees dit briefingbestand volledig. Geef uitsluitend geldige JSON terug met exact twee stringvelden: "title" en "instructions". title is een korte duidelijke Nederlandse titel. instructions bevat alle operationeel relevante algemene instructies, helder gestructureerd en zonder informatie te verzinnen. Neem relevante tekst uit afbeeldingen in het document mee wanneer die leesbaar is.',
            },
          ],
        }],
        text: { format: { type: 'json_object' } },
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Documentanalyse is mislukt.' }, { status: 502 })
    }

    const result = await response.json() as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
      output_text?: string
    }
    const outputText = result.output_text || result.output
      ?.flatMap(item => item.content || [])
      .find(item => item.type === 'output_text')?.text

    if (!outputText) return NextResponse.json({ error: 'Geen analyse ontvangen.' }, { status: 502 })

    const parsed = parseJsonObject(outputText)
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    const instructions = typeof parsed.instructions === 'string' ? parsed.instructions.trim() : ''
    if (!title || !instructions) return NextResponse.json({ error: 'Onvolledige analyse ontvangen.' }, { status: 502 })

    return NextResponse.json({ title, instructions })
  } catch {
    return NextResponse.json({ error: 'Documentanalyse kon niet worden verwerkt.' }, { status: 502 })
  } finally {
    await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(uploadedFile.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => undefined)
  }
}
