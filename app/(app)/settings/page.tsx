import { createClient } from '@/lib/supabase/crew-server'
import { ProfileForm } from '@/components/crew/profile-form'
import { LanguageSwitcher } from '@/components/language-switcher'
import { AdminEditControls } from '@/components/settings/admin-edit-controls'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  if (!user) return null

  const { data, error } = await s.rpc('upt_own_profile_details')
  const profile = data?.[0]
  let photoUrl: string | null = null
  if (profile?.profile_photo_url) {
    const { data: signed } = await s.storage.from('profile-photos').createSignedUrl(profile.profile_photo_url, 300)
    photoUrl = signed?.signedUrl || null
  }

  return <main className="mx-auto max-w-xl space-y-5 p-5">
    <div>
      <h1 className="text-3xl font-black">Profiel</h1>
      <p className="text-sm text-muted-foreground">{profile?.email || user.email}</p>
    </div>
    {error || !profile
      ? <p>Profiel kon niet worden geladen.</p>
      : <ProfileForm id={user.id} initial={profile} photoUrl={photoUrl}/>}
    <section className="rounded-2xl border p-4">
      <LanguageSwitcher />
    </section>
    <AdminEditControls />
  </main>
}
