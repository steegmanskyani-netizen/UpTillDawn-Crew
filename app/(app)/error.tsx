'use client'
export default function Error({reset}:{reset:()=>void}){return <main className="p-8"><h1 className="text-2xl font-bold">De actie kon niet worden voltooid.</h1><p>Controleer je invoer en verbinding.</p><button onClick={reset} className="mt-4 rounded-xl border p-3">Opnieuw proberen</button></main>}
