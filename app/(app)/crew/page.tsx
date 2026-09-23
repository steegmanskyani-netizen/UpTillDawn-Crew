import { createClient } from '@/lib/supabase/crew-server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) redirect('/login')

  const { data: crew, error } = await s.rpc('upt_crew_directory')
  if (error) {
    return <main className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="text-3xl font-black">Personeel</h1>
      <p className="mt-4">Personeelslijst kon niet worden geladen.</p>
    </main>
  }

  const photos = new Map<string, string>()
  await Promise.all((crew || []).filter(member => member.profile_photo_url).map(async member => {
    const { data } = await s.storage.from('profile-photos').createSignedUrl(member.profile_photo_url!, 300)
    if (data?.signedUrl) photos.set(member.id, data.signedUrl)
  }))

  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Personeel</h1>
      <p className="text-sm text-muted-foreground">Alleen naam, profielfoto en telefoonnummer worden hier getoond.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(crew || []).map(member => <article key={member.id} className="flex items-center gap-4 rounded-2xl border p-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted text-xl font-black">
          {photos.get(member.id)
            ? <>
              {/* Private signed storage URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos.get(member.id)} alt="" className="h-full w-full object-cover"/>
            </>
            : (member.full_name || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-bold">{member.full_name || 'Naam ontbreekt'}</h2>
          {member.phone_number
            ? <a href={`tel:${member.phone_number}`} className="break-all text-sm underline">{member.phone_number}</a>
            : <p className="text-sm text-muted-foreground">Geen telefoonnummer</p>}
        </div>
      </article>)}
    </div>
  </main>
}
