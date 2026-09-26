import Image from 'next/image'
import { getCurrentUser } from '@/lib/actions/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-server'
import { setAccountStatus } from '@/lib/actions/uptilldawn'
import { deletePersonnel } from '@/lib/actions/personnel'
import { nlRole, nlStatus } from '@/lib/ui-nl'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const current=await getCurrentUser()
  if (!current?.isAdmin) redirect('/')
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
          {photos.get(p.id) && <a href={photos.get(p.id)} target="_blank" rel="noreferrer" className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border">
            <Image src={photos.get(p.id)!} alt="" fill sizes="80px" unoptimized className="object-cover"/>
          </a>}
          <div className="min-w-0 flex-1">
            <b>{p.full_name || 'Naam ontbreekt'}</b>
            <p className="break-all text-sm text-muted-foreground">{p.email || 'Geen e-mail'}</p>
            <p className="text-sm text-muted-foreground">{nlRole(p.role)} · {nlStatus(p.approved ? 'approved' : 'pending')}</p>
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
          <div className="flex flex-col gap-2">
            <form action={setAccountStatus} className="flex flex-wrap gap-2">
              <input type="hidden" name="user_id" value={p.id}/>
              <select name="status" defaultValue={p.approved ? 'approved' : 'pending'} className="rounded-lg border bg-background p-2"><option value="pending">In afwachting</option><option value="approved">Goedgekeurd</option></select>
              <select name="role" defaultValue={p.role} className="rounded-lg border bg-background p-2"><option value="staff">Personeel</option><option value="responsible_lead">Verantwoordelijke</option><option value="admin">Beheerder</option></select>
              <button className="rounded-lg bg-violet-600 px-4">Opslaan</button>
            </form>
            {p.id!==current.id&&<form action={deletePersonnel} className="self-start">
              <input type="hidden" name="user_id" value={p.id}/>
              <button className="rounded-lg border border-red-500/60 px-4 py-2 font-semibold text-red-500">Definitief verwijderen</button>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Verwijdert account, persoonsgegevens, toewijzingen en gekoppelde gebruikersdata. Deze actie is definitief.</p>
            </form>}
          </div>
        </div>
      </div>)}</div>
  </main>
}
