import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/actions/auth'

export default async function Page(){
 if(!(await getCurrentUser())?.isAdmin) redirect('/')
 return <main className="p-6"><h1 className="text-3xl font-bold">Excel</h1><p className="my-4 text-muted-foreground">Admin-only urenexport.</p><a className="inline-block rounded-xl border px-4 py-3" href="/api/uptilldawn/export">Download .xlsx</a></main>
}
