import { SyncCenter } from '@/components/crew/sync-center'

export default function Page() {
  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
    <div>
      <h1 className="text-3xl font-black">Synchronisatie</h1>
      <p className="text-muted-foreground">Controleer lokale acties die nog niet door de server zijn bevestigd.</p>
    </div>
    <SyncCenter/>
  </main>
}
