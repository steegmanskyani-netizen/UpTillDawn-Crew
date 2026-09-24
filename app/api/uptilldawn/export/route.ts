import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/crew-server'
import { allocateTime } from '@/lib/crew-time'
import type { Tables } from '@/types/crew-database'

type PageResult<T> = { data: T[] | null; error: unknown }

async function allPages<T>(
  load: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
) {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1)
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) return rows
    if (rows.length >= 250_000) throw new Error('Export is te groot om veilig in één bestand te verwerken.')
  }
}

export async function GET() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return new NextResponse('Aanmelden vereist.', { status: 401 })

  const { data: profile } = await s.from('profiles').select('role,approved').eq('id', user.id).single()
  if (!profile?.approved || profile.role !== 'admin') return new NextResponse('Geen toegang.', { status: 403 })

  let sessions: Tables<'work_sessions'>[]
  let breaks: Tables<'break_sessions'>[]
  let transitions: Tables<'workplace_transitions'>[]
  let events: Tables<'events'>[]
  let people: Pick<Tables<'profiles'>, 'id' | 'full_name'>[]
  let shifts: Tables<'shifts'>[]
  let workplaces: Pick<Tables<'workplaces'>, 'id' | 'name'>[]
  let leads: Tables<'responsible_assignments'>[]
  let checkins: Pick<Tables<'check_ins'>, 'user_id' | 'event_id' | 'status'>[]
  let briefings: Tables<'briefings'>[]
  let acks: Tables<'briefing_acknowledgements'>[]
  let tasks: Tables<'tasks'>[]
  let assignments: Tables<'task_assignments'>[]

  try {
    ;[
      sessions,
      breaks,
      transitions,
      events,
      people,
      shifts,
      workplaces,
      leads,
      checkins,
      briefings,
      acks,
      tasks,
      assignments,
    ] = await Promise.all([
      allPages<Tables<'work_sessions'>>((from, to) => s.from('work_sessions').select('*').order('started_at').order('id').range(from, to)),
      allPages<Tables<'break_sessions'>>((from, to) => s.from('break_sessions').select('*').order('id').range(from, to)),
      allPages<Tables<'workplace_transitions'>>((from, to) => s.from('workplace_transitions').select('*').order('id').range(from, to)),
      allPages<Tables<'events'>>((from, to) => s.from('events').select('*').order('id').range(from, to)),
      allPages<Pick<Tables<'profiles'>, 'id' | 'full_name'>>((from, to) => s.from('profiles').select('id,full_name').order('id').range(from, to)),
      allPages<Tables<'shifts'>>((from, to) => s.from('shifts').select('*').order('id').range(from, to)),
      allPages<Pick<Tables<'workplaces'>, 'id' | 'name'>>((from, to) => s.from('workplaces').select('id,name').order('id').range(from, to)),
      allPages<Tables<'responsible_assignments'>>((from, to) => s.from('responsible_assignments').select('*').order('id').range(from, to)),
      allPages<Pick<Tables<'check_ins'>, 'user_id' | 'event_id' | 'status'>>((from, to) => s.from('check_ins').select('user_id,event_id,status').order('id').range(from, to)),
      allPages<Tables<'briefings'>>((from, to) => s.from('briefings').select('*').order('id').range(from, to)),
      allPages<Tables<'briefing_acknowledgements'>>((from, to) => s.from('briefing_acknowledgements').select('*').order('id').range(from, to)),
      allPages<Tables<'tasks'>>((from, to) => s.from('tasks').select('*').order('id').range(from, to)),
      allPages<Tables<'task_assignments'>>((from, to) => s.from('task_assignments').select('*').order('id').range(from, to)),
    ])
  } catch {
    return new NextResponse('Exportgegevens konden niet volledig worden geladen.', { status: 503 })
  }

  let rows
  try {
    rows = allocateTime(
      sessions.map(x => ({
        ...x,
        workplace_id: shifts.find(y => y.id === x.shift_id)?.workplace_id || null,
      })),
      breaks,
      transitions,
      Date.now(),
    )
  } catch {
    return new NextResponse('Tijdregistraties vereisen correctie voor export.', { status: 409 })
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Werkpleksegmenten')
  const headers = ['Datum','Evenement','Medewerker','Werkplek','Rol','Verantwoordelijke','Dienst start','Dienst einde','Brutoduur','Betaalde pauze','Onbetaalde pauze','Netto-uren','Overwerk','Instructies bevestigd','Taken bevestigd','Inklokstatus']
  ws.columns = headers.map(h => ({ header: h, key: h, width: 24 }))

  for (const row of rows) {
    const event = events.find(e => e.id === row.eventId)
    const shift = shifts.find(x => x.user_id === row.userId && x.event_id === row.eventId && x.workplace_id === row.workplaceId && Date.parse(x.scheduled_start) <= row.start && Date.parse(x.scheduled_end) > row.start)
    const zone = event?.timezone || 'Europe/Brussels'
    const date = (n: number) => new Intl.DateTimeFormat('nl-BE', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(n)
    const required = briefings.filter(b => b.event_id === row.eventId && b.required && (!b.workplace_id || b.workplace_id === row.workplaceId))
    const own = assignments.filter(a => a.user_id === row.userId && tasks.some(t => t.id === a.task_id && t.event_id === row.eventId && (!t.workplace_id || t.workplace_id === row.workplaceId)))

    ws.addRow({
      'Datum': date(row.start),
      'Evenement': event?.name,
      'Medewerker': people.find(p => p.id === row.userId)?.full_name,
      'Werkplek': workplaces.find(w => w.id === row.workplaceId)?.name,
      'Rol': shift?.role_name,
      'Verantwoordelijke': leads.filter(l => l.workplace_id === row.workplaceId).map(l => people.find(p => p.id === l.user_id)?.full_name || l.user_id).join(', '),
      'Dienst start': shift ? date(Date.parse(shift.scheduled_start)) : '',
      'Dienst einde': shift ? date(Date.parse(shift.scheduled_end)) : '',
      'Brutoduur': row.grossSeconds / 3600,
      'Betaalde pauze': row.regularBreakSeconds / 3600,
      'Onbetaalde pauze': row.excessBreakSeconds / 3600,
      'Netto-uren': row.netSeconds / 3600,
      'Overwerk': 'Niet vastgesteld',
      'Instructies bevestigd': required.every(b => acks.some(a => a.briefing_id === b.id && a.user_id === row.userId && a.version === b.version)) ? 'Ja' : 'Nee',
      'Taken bevestigd': own.length ? own.every(a => a.status === 'COMPLETED') ? 'Ja' : 'Nee' : 'N.v.t.',
      'Inklokstatus': checkins.some(c => c.user_id === row.userId && c.event_id === row.eventId && c.status === 'approved') ? 'Goedgekeurd' : 'Niet goedgekeurd',
    })
  }

  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: 'A1', to: 'P1' }

  const notes = wb.addWorksheet('Toelichting')
  notes.addRow(['Tijden zijn per werkpleksegment; totalen worden niet nogmaals als datarij toegevoegd.'])
  notes.addRow(['Numerieke duurkolommen zijn decimale uren. Eerste 60 minuten pauze per medewerker/event zijn betaald.'])
  notes.addRow(['Overwerk is niet berekend: een goedgekeurde overwerkdefinitie ontbreekt.'])
  notes.addRow(['Actieve sessies zijn een momentopname; controleer registraties voor loonverwerking.'])

  const buffer = await wb.xlsx.writeBuffer()
  const { error } = await s.rpc('upt_audit_export')
  if (error) return new NextResponse('Export kon niet worden geaudit.', { status: 503 })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="uptilldawn-uren.xlsx"',
      'cache-control': 'private, no-store',
    },
  })
}
