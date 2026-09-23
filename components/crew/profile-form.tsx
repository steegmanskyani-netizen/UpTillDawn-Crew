'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/crew-client'

type ProfileValues = {
  full_name?: string | null
  home_address?: string | null
  phone_number?: string | null
  date_of_birth?: string | null
  national_register_number?: string | null
  iban?: string | null
  profile_photo_url?: string | null
}

export function ProfileForm({
  id,
  initial,
  photoUrl,
}: {
  id: string
  initial: ProfileValues
  photoUrl?: string | null
}) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  return <form className="space-y-4" onSubmit={async e => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg('')
    const form = new FormData(e.currentTarget)
    const s = createClient()
    const file = form.get('photo')
    const oldPath = initial.profile_photo_url || null
    let uploadedPath: string | null = null
    let nextPhotoPath = oldPath

    try {
      if (file instanceof File && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) throw new Error('De profielfoto mag maximaal 5 MB zijn.')
        const extByType: Record<string, string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
        const ext = extByType[file.type]
        if (!ext) throw new Error('Gebruik een JPG-, PNG- of WEBP-foto.')
        uploadedPath = `${id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await s.storage.from('profile-photos').upload(uploadedPath, file, {
          contentType: file.type,
          upsert: false,
        })
        if (uploadError) throw new Error('Profielfoto uploaden mislukt.')
        nextPhotoPath = uploadedPath
      }

      const value = (name: string) => String(form.get(name) || '').trim()
      const { error } = await s.rpc('upt_update_own_profile', {
        p_full_name: value('name'),
        p_home_address: value('address') || undefined,
        p_phone_number: value('phone') || undefined,
        p_date_of_birth: value('dob') || undefined,
        p_national_register_number: value('national_register') || undefined,
        p_iban: value('iban') || undefined,
        p_profile_photo_path: nextPhotoPath || undefined,
      })
      if (error) throw new Error('Profiel opslaan mislukt.')

      if (uploadedPath && oldPath && oldPath !== uploadedPath) {
        await s.storage.from('profile-photos').remove([oldPath])
      }
      setMsg('Profiel opgeslagen.')
      router.refresh()
    } catch (error) {
      if (uploadedPath) await s.storage.from('profile-photos').remove([uploadedPath])
      setMsg(error instanceof Error ? error.message : 'Opslaan mislukt.')
    } finally {
      setBusy(false)
    }
  }}>
    {photoUrl && <div className="overflow-hidden rounded-2xl border">
      {/* Private signed storage URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="Profielfoto" className="max-h-72 w-full object-contain bg-black/20"/>
    </div>}
    <label className="block">Naam<input name="name" required maxLength={200} defaultValue={initial.full_name || ''} className="mt-1 block w-full rounded-xl border bg-background p-3"/></label>
    <label className="block">Adres<textarea name="address" maxLength={500} defaultValue={initial.home_address || ''} className="mt-1 block min-h-20 w-full rounded-xl border bg-background p-3"/></label>
    <label className="block">Telefoon<input name="phone" type="tel" maxLength={40} defaultValue={initial.phone_number || ''} className="mt-1 block w-full rounded-xl border bg-background p-3"/></label>
    <label className="block">Geboortedatum<input name="dob" type="date" defaultValue={initial.date_of_birth || ''} className="mt-1 block w-full rounded-xl border bg-background p-3"/></label>
    <label className="block">Rijksregisternummer<input name="national_register" autoComplete="off" maxLength={32} defaultValue={initial.national_register_number || ''} className="mt-1 block w-full rounded-xl border bg-background p-3"/></label>
    <label className="block">IBAN<input name="iban" autoComplete="off" maxLength={34} defaultValue={initial.iban || ''} className="mt-1 block w-full rounded-xl border bg-background p-3 uppercase"/></label>
    <label className="block">Permanente profielfoto<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full rounded-xl border bg-background p-3"/></label>
    <p className="text-xs text-muted-foreground">Adres, geboortedatum, rijksregisternummer en IBAN zijn afgeschermd voor gewone crew-accounts.</p>
    <button disabled={busy} className="w-full rounded-xl bg-violet-600 p-3 font-bold">{busy ? 'OPSLAAN…' : 'PROFIEL OPSLAAN'}</button>
    {msg && <p role="status">{msg}</p>}
  </form>
}
