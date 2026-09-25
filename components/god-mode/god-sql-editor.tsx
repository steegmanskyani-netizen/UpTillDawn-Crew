'use client'
import {useState} from 'react'

const templates = [
  {name:'Workflowfuncties bekijken',sql:"select p.oid::regprocedure as functie, pg_get_functiondef(p.oid) as code\nfrom pg_proc p join pg_namespace n on n.oid=p.pronamespace\nwhere n.nspname='public' and p.prokind='f' and p.proname like 'upt_%'\norder by p.proname;"},
  {name:'Automatische triggers bekijken',sql:"select event_object_table as tabel, trigger_name, event_manipulation as gebeurtenis, action_statement as actie\nfrom information_schema.triggers where trigger_schema='public'\norder by event_object_table,trigger_name;"},
  {name:'Geplande automatiseringen bekijken',sql:'select jobid,schedule,command,active from cron.job order by jobid;'},
  {name:'God Mode wijzigingenlog',sql:'select * from upt_private.god_data_audit order by changed_at desc limit 100;'},
]

export function GodSqlEditor(){
  const [sql,setSql]=useState(templates[0].sql)
  const [write,setWrite]=useState(false)
  const [confirmed,setConfirmed]=useState(false)
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState('')
  async function run(){
    if(busy)return
    setBusy(true);setResult('')
    try{
      const response=await fetch('/api/god/sql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'query',query:sql,write})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error)
      setResult(JSON.stringify(data.data,null,2));setConfirmed(false)
    }catch(error){setResult(error instanceof Error?error.message:'SQL uitvoeren mislukt.')}
    finally{setBusy(false)}
  }
  return <section className="space-y-4"><h2 className="text-xl font-black">Logica, workflows & SQL</h2><p className="text-sm text-muted-foreground">Open de bestaande functies en triggers, wijzig hun SQL of voeg nieuwe functies, tabellen en automatiseringen toe. Deze werkruimte voert opdrachten uit op de productiedatabase. Een broncodeherstel draait gegevenswijzigingen niet terug.</p><div className="flex flex-wrap gap-2">{templates.map(t=><button key={t.name} onClick={()=>{setSql(t.sql);setConfirmed(false)}} className="rounded-xl border px-3 py-2 text-sm">{t.name}</button>)}</div><textarea aria-label="SQL-programmering" rows={22} value={sql} spellCheck={false} onChange={e=>{setSql(e.target.value);setConfirmed(false)}} className="w-full rounded-xl border bg-background p-3 font-mono text-sm"/><label className="flex items-center gap-2"><input type="checkbox" checked={write} onChange={e=>{setWrite(e.target.checked);setConfirmed(false)}}/> Schrijven en structuurwijzigingen toestaan</label>{write&&<label className="flex items-start gap-2 rounded-xl border border-amber-500/50 p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Ik heb deze SQL gecontroleerd en wil deze wijziging uitvoeren op de live database.</label>}<button disabled={busy||!sql.trim()||(write&&!confirmed)} onClick={()=>void run()} className="rounded-xl bg-violet-600 px-5 py-3 font-bold text-white disabled:opacity-50">{busy?'UITVOEREN…':write?'WIJZIGING UITVOEREN':'ALLEEN LEZEN UITVOEREN'}</button>{result&&<pre role="status" className="max-h-[60vh] overflow-auto rounded-xl border p-3 text-xs">{result}</pre>}</section>
}
