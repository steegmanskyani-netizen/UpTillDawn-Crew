import { getCurrentUser } from '@/lib/actions/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { setAccountStatus } from '@/lib/actions/uptilldawn'

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!(await getCurrentUser())?.isAdmin) redirect('/')
  const s = await createClient()
  const { data, error } = await s.rpc('upt_admin_personnel_details')

  const photos = new Map<string,string>()
  await Promise.all((data || []).filter(p => p.profile_photo_url).map(async p => {
    const { data: signed } = await s.storage.from('profile-photos').createSignedUrl(p.profile_photo_url!, 300)
    if (signed?.signedUrl) photos.set(p.id, signed.signedUrl)
  }))

  return <main className="p-4 md:p-8">
    <h1 className="mb-5 text-3xl font-black">Personeel & goedkeuringen</h1>
    {error && <p>Personeelsgegevens konden niet worden geladen.</p>}
    <div className="grid gap-3">{data?.map(p =>
      <div key={p.id} className="rounded-2xl border p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {photos.get(p.id) && <a href={photos.get(p.id)} target="_blank" rel="noreferrer" className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.get(p.id)} alt="" className="h-full w-full object-cover"/>
          </a>}
          <div className="min-w-0 flex-1">
            <b>{p.full_name || 'Naam ontbreekt'}</b>
            <p className="break-all text-sm text-muted-foreground">{p.email || 'Geen e-mail'}</p>
            <p className="text-sm text-muted-foreground">{p.role} · {p.approved ? 'APPROVED' : 'PENDING'}</p>
            <details className="mt-3 rounded-xl border p-3">
              <summary className="cursor-pointer font-semibold">Privé personeelsgegevens</summary>
              <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <div><dt className="text-muted-foreground">Telefoon</dt><dd>{p.phone_number || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Geboortedatum</dt><dd>{p.date_of_birth || '—'}</dd></div>
                <div className="md:col-span-2"><dt className="text-muted-foreground">Adres</dt><dd>{p.home_address || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Rijksregisternummer</dt><dd>{p.national_register_number || '—'}</dd></div>
                <div><dt className="text-muted-foreground">IBAN</dt><dd>{p.iban || '—'}</dd></div>
              </dl>
            </details>
          </div>
          <form action={setAccountStatus} className="flex flex-wrap gap-2">
            <input type="hidden" name="user_id" value={p.id}/>
            <select name="status" defaultValue={p.approved ? 'approved' : 'pending'} className="rounded-lg border bg-background p-2">
              <option value="pending">PENDING</option>
              <option value="approved">APPROVED</option>
              <option value="rejected">REJECTED</option>
              <option value="suspended">SUSPENDED</option>
            </select>
            <select name="role" defaultValue={p.role} className="rounded-lg border bg-background p-2">
              <option value="staff">Staff</option>
              <option value="responsible_lead">Responsible</option>
              <option value="admin">Admin</option>
            </select>
            <button className="rounded-lg bg-violet-600 px-4">Opslaan</button>
          </form>
        </div>
      </div>)}</div>
  </main>
}
