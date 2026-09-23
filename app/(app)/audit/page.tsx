import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/crew-server'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const current = await getCurrentUser()
  if (!current?.isAdmin) redirect('/')

  const s = await createClient()
  const { data, error } = await s
    .from('upt_audit_logs')
    .select('id,action,entity_type,entity_id,actor_id,created_at,metadata')
    .order('created_at', { ascending: false })
    .limit(200)

  return <main className="space-y-4 p-4 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Auditlog</h1>
      <p className="text-sm text-muted-foreground">Laatste 200 server-auditgebeurtenissen.</p>
    </div>
    {error && <p className="rounded-xl border border-red-500/40 p-4">Auditlog kon niet worden geladen.</p>}
    <div className="space-y-2">
      {(data || []).map(entry => <article className="rounded-xl border p-3 text-sm" key={entry.id}>
        <p><strong>{entry.action}</strong> · {entry.entity_type}</p>
        <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString('nl-BE')} · ID {entry.entity_id || '—'}</p>
      </article>)}
    </div>
  </main>
}
