import Link from 'next/link'
import { createClient } from '@/lib/supabase/crew-server'
import { markNotificationRead } from '@/lib/actions/uptilldawn'
import { nlStatus } from '@/lib/ui-nl'
import { PushNotificationSettings } from '@/components/push-notification-settings'

export const dynamic = 'force-dynamic'

function safeNotificationLink(value:string|null){
  return value
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    ? value
    : null
}

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const { data, error } = await s.from('crew_notifications')
    .select('id,title,body,kind,link,read_at,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return <main className="space-y-4 p-4 md:p-8">
    <h1 className="text-3xl font-black">Meldingen</h1>
    <PushNotificationSettings/>
    {error ? <p>Meldingen konden niet worden geladen.</p> : !data?.length ? <p>Geen meldingen.</p> : data.map(n => {
      const safeLink=safeNotificationLink(n.link)
      return <article key={n.id} className={`rounded-xl border p-4 ${n.read_at ? '' : 'border-violet-500'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{n.title}</h2>
            {n.body && <p className="mt-1 text-sm">{n.body}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString('nl-BE')} · {nlStatus(n.kind)}</p>
          </div>
          {!n.read_at && <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs font-bold text-violet-300">NIEUW</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {safeLink && <Link href={safeLink} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold">OPENEN</Link>}
          {!n.read_at && <form action={markNotificationRead}>
            <input type="hidden" name="notification_id" value={n.id}/>
            <button className="rounded-lg border px-3 py-2 text-sm">Markeer gelezen</button>
          </form>}
        </div>
      </article>
    })}
  </main>
}
