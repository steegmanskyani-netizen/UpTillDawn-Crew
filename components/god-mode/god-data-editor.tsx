'use client'

import { useEffect, useState } from 'react'

type Table = {name: string; primaryKey: string[]; columns: {name: string; type: string; required: boolean; generated: boolean}[]}
type Row = Record<string, unknown>

export function GodDataEditor() {
  const [tables,setTables] = useState<Table[]>([])
  const [table,setTable] = useState('')
  const [rows,setRows] = useState<Row[]>([])
  const [offset,setOffset] = useState(0)
  const [original,setOriginal] = useState<Row | null>(null)
  const [editing,setEditing] = useState(false)
  const [value,setValue] = useState('{}')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [confirmDelete,setConfirmDelete] = useState(false)
  const definition = tables.find(t=>t.name===table)

  async function load(name: string, page = 0) {
    setBusy(true); setMessage(''); setEditing(false)
    try {
      const response = await fetch(`/api/god/data?table=${encodeURIComponent(name)}&offset=${page}`,{cache:'no-store'})
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setRows(data.data); setTable(name); setOffset(page)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Laden mislukt.') }
    finally { setBusy(false) }
  }

  useEffect(()=>{
    let active=true
    void fetch('/api/god/data',{cache:'no-store'}).then(async response=>{
      const data=await response.json()
      if(!response.ok)throw new Error(data.error)
      if(active)setTables(data.data)
    }).catch(error=>{if(active)setMessage(String(error.message||'Laden mislukt.'))})
    return()=>{active=false}
  },[])

  function edit(row: Row | null) {
    setOriginal(row); setConfirmDelete(false); setEditing(true)
    const values={...row}
    for(const col of definition?.columns || [])if(col.generated)delete values[col.name]
    setValue(JSON.stringify(values,null,2))
  }

  async function save(remove = false) {
    if(!definition || busy)return
    setBusy(true);setMessage('')
    try {
      const values = remove ? {} : JSON.parse(value)
      const key = Object.fromEntries(definition.primaryKey.map(name=>[name,original?.[name]]))
      const response = await fetch('/api/god/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,operation:remove?'delete':original?'update':'insert',key:original?key:{},before:original,values})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error)
      await load(table,offset)
      setMessage(remove?'Record verwijderd en gelogd.':'Record opgeslagen en gelogd.')
    }catch(error){setMessage(error instanceof Error?error.message:'Opslaan mislukt.')}
    finally{setBusy(false)}
  }

  return <section className="space-y-4">
    <div><h2 className="text-xl font-black">Alle applicatiegegevens</h2><p className="text-sm text-muted-foreground">Bekijk en bewerk de tabellen van de app. Wijzigingen werken direct; bestaande databaseregels blijven fouten en ongeldige koppelingen tegenhouden.</p></div>
    <div className="flex flex-wrap gap-2"><select aria-label="Databasetabel" value={table} disabled={busy} onChange={e=>void load(e.target.value)} className="min-w-0 rounded-xl border bg-background p-3"><option value="" disabled>Kies een tabel</option>{tables.map(t=><option key={t.name}>{t.name}</option>)}</select><button disabled={!table||busy} onClick={()=>edit(null)} className="rounded-xl border px-4 py-2 font-bold">Record toevoegen</button><button disabled={!table||busy} onClick={()=>void load(table,offset)} className="rounded-xl border px-4 py-2">Vernieuwen</button></div>
    {definition&&<details className="rounded-xl border p-3"><summary>Velden en gegevenstypes</summary><ul className="mt-2 space-y-1 text-sm">{definition.columns.map(c=><li key={c.name}><code>{c.name}</code> — {c.type}{c.required?' · verplicht':''}{c.generated?' · automatisch':''}</li>)}</ul></details>}
    <div className="max-h-[45vh] overflow-auto rounded-xl border"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Actie</th>{definition?.columns.map(c=><th key={c.name} className="whitespace-nowrap p-2">{c.name}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index} className="border-t"><td className="p-2"><button disabled={!definition?.primaryKey.length||busy} onClick={()=>edit(row)} className="rounded border p-2">Bewerken</button></td>{definition?.columns.map(c=><td key={c.name} className="max-w-64 truncate p-2" title={JSON.stringify(row[c.name])}>{typeof row[c.name]==='object'?JSON.stringify(row[c.name]):String(row[c.name]??'')}</td>)}</tr>)}</tbody></table></div>
    {table&&<div className="flex items-center gap-3"><button disabled={offset===0||busy} onClick={()=>void load(table,Math.max(0,offset-50))} className="rounded border p-2">Vorige</button><span className="text-sm">{offset+1}–{offset+rows.length}</span><button disabled={rows.length<50||busy} onClick={()=>void load(table,offset+50)} className="rounded border p-2">Volgende</button></div>}
    {editing&&<div className="space-y-3 rounded-xl border border-violet-500/50 p-4"><h3 className="font-bold">{original?'Record bewerken':'Nieuw record'} · {table}</h3><p className="text-xs text-muted-foreground">JSON: gebruik aanhalingstekens voor tekst, true/false voor schakelaars en null voor lege waarden. Laat velden weg om hun standaardwaarde te gebruiken.</p><textarea aria-label="Record JSON" value={value} onChange={e=>setValue(e.target.value)} rows={16} spellCheck={false} className="w-full rounded-xl border bg-background p-3 font-mono text-sm"/><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void save()} className="rounded-xl bg-violet-600 px-4 py-2 font-bold text-white">Direct opslaan</button><button disabled={busy} onClick={()=>setEditing(false)} className="rounded-xl border px-4 py-2">Sluiten</button>{original&&<button disabled={busy} onClick={()=>setConfirmDelete(true)} className="rounded-xl border border-red-500 px-4 py-2 text-red-500">Verwijderen</button>}</div>{confirmDelete&&<div role="alert" className="rounded-xl border border-red-500 p-3"><p>Dit verwijdert het record. Gekoppelde records kunnen door databaseregels ook worden verwijderd.</p><button disabled={busy} onClick={()=>void save(true)} className="mt-2 rounded bg-red-600 p-2 font-bold text-white">Record definitief verwijderen</button></div>}</div>}
    {message&&<p role="status" className="rounded-xl border p-3">{message}</p>}
  </section>
}
