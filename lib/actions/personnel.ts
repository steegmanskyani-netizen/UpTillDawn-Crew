'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/crew-server'
const uuid=z.string().uuid()
export async function deletePersonnel(fd:FormData){
 const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)throw new Error('Aanmelden vereist.')
 const target=uuid.parse(fd.get('user_id'));if(target===user.id)throw new Error('Je kunt je eigen account niet verwijderen.')
 const [{data:isAdmin},{data:profile},{data:attachments}]=await Promise.all([s.rpc('upt_is_admin',{uid:user.id}),s.from('profiles').select('profile_photo_url').eq('id',target).maybeSingle(),s.from('work_attachments').select('storage_path').eq('uploaded_by',target)])
 if(!isAdmin)throw new Error('Geen toegang.')
 const workPaths=(attachments||[]).map(row=>row.storage_path).filter(Boolean)
 if(workPaths.length){const {error}=await s.storage.from('work-media').remove(workPaths);if(error)throw new Error('Media van deze gebruiker kon niet veilig worden verwijderd.')}
 if(profile?.profile_photo_url){const {error}=await s.storage.from('profile-photos').remove([profile.profile_photo_url]);if(error)throw new Error('Profielfoto kon niet veilig worden verwijderd.')}
 const rpc=s.rpc as unknown as (fn:string,args:Record<string,string>)=>Promise<{error:{message?:string}|null}>
 const {error}=await rpc('upt_admin_delete_user',{p_user:target});if(error)throw new Error(error.message||'Gebruiker verwijderen mislukt.')
 revalidatePath('/personnel');revalidatePath('/chat');revalidatePath('/events');revalidatePath('/workplaces');revalidatePath('/shifts');revalidatePath('/tasks');revalidatePath('/briefings');revalidatePath('/')
}
