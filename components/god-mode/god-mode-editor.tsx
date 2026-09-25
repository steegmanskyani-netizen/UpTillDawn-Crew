"use client"

import Link from "next/link"
import { useEffect,useState } from "react"
import { godModeLogout } from "@/lib/actions/god-mode"
import {
  getDefaultRoleUiRules,
  type RoleCondition,
  type RoleRuleRole,
  type RoleUiRule,
} from "@/lib/role-ui"

const roles:Array<{value:RoleRuleRole;label:string}>=[
  {value:"admin",label:"Admin"},
  {value:"staff",label:"Personeel"},
  {value:"responsible_lead",label:"Verantwoordelijke"},
]

const conditions:Array<{value:RoleCondition;label:string}>=[
  {value:"always",label:"Altijd"},
  {value:"assigned_event",label:"Na evenementtoewijzing"},
  {value:"assigned_workplace_role",label:"Na werkplek/roltoewijzing"},
  {value:"event_active",label:"Tijdens evenement"},
  {value:"shift_active",label:"Tijdens actieve shift"},
  {value:"never",label:"Nooit"},
]

type AiPatch={
  feature_key:string
  label:string|null
  visible:boolean|null
  enabled:boolean|null
  condition_key:RoleCondition|null
  sort_order:number|null
}
type AiReply={answer:string;patches:AiPatch[]}

export function GodModeEditor(){
  const [role,setRole]=useState<RoleRuleRole>("admin")
  const [rules,setRules]=useState<RoleUiRule[]>([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState("")
  const [dragKey,setDragKey]=useState<string|null>(null)
  const [aiPrompt,setAiPrompt]=useState("")
  const [aiBusy,setAiBusy]=useState(false)
  const [aiReply,setAiReply]=useState<AiReply|null>(null)
  const [aiError,setAiError]=useState("")

  async function load(nextRole:RoleRuleRole){
    setLoading(true);setMessage("");setAiReply(null);setAiError("")
    try{
      const response=await fetch("/api/god/rules?role="+nextRole,{cache:"no-store"})
      const payload=await response.json().catch(()=>null) as {rules?:RoleUiRule[];error?:string}|null
      if(!response.ok||!payload){setMessage(payload?.error||"Rolregels konden niet worden geladen.");return}
      setRules(payload.rules?.length?payload.rules:getDefaultRoleUiRules(nextRole))
    }catch{setMessage("Rolregels konden niet worden geladen.")}
    finally{setLoading(false)}
  }

  useEffect(()=>{const timer=window.setTimeout(()=>void load(role),0);return()=>window.clearTimeout(timer)},[role])

  function patch(key:string,changes:Partial<RoleUiRule>){
    setRules(current=>current.map(item=>item.feature_key===key?{...item,...changes}:item))
  }

  function dropOn(target:string){
    if(!dragKey||dragKey===target)return
    setRules(current=>{
      const next=[...current]
      const from=next.findIndex(item=>item.feature_key===dragKey)
      const to=next.findIndex(item=>item.feature_key===target)
      if(from<0||to<0)return current
      const [moved]=next.splice(from,1)
      next.splice(to,0,moved)
      return next.map((item,index)=>({...item,sort_order:(index+1)*10}))
    })
    setDragKey(null)
  }

  async function save(){
    if(busy)return
    setBusy(true);setMessage("")
    try{
      const response=await fetch("/api/god/rules",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({role,rules}),
      })
      const payload=await response.json().catch(()=>null) as {ok?:boolean;rules?:RoleUiRule[];error?:string}|null
      if(!response.ok||!payload?.ok){setMessage(payload?.error||"Opslaan mislukt.");return}
      setRules(payload.rules||rules)
      setMessage("God Mode wijzigingen opgeslagen.")
    }catch{setMessage("Opslaan mislukt.")}
    finally{setBusy(false)}
  }

  async function askAi(){
    const prompt=aiPrompt.trim()
    if(!prompt||aiBusy)return
    setAiBusy(true);setAiError("");setAiReply(null)
    try{
      const response=await fetch("/api/edit-assistant",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message:prompt,role,path:"/god-mode",rules}),
      })
      const payload=await response.json().catch(()=>null) as (AiReply&{error?:string})|null
      if(!response.ok||!payload){setAiError(payload?.error||"AI kon niet antwoorden.");return}
      setAiReply({answer:payload.answer,patches:Array.isArray(payload.patches)?payload.patches:[]})
    }catch{setAiError("AI kon niet worden bereikt.")}
    finally{setAiBusy(false)}
  }

  function applyAi(){
    if(!aiReply?.patches.length)return
    const byKey=new Map(aiReply.patches.map(item=>[item.feature_key,item]))
    setRules(current=>current.map(item=>{
      const change=byKey.get(item.feature_key)
      if(!change)return item
      return {
        ...item,
        ...(change.label!==null?{label:change.label.slice(0,80)}:{}),
        ...(change.visible!==null?{visible:change.visible}:{}),
        ...(change.enabled!==null?{enabled:change.enabled}:{}),
        ...(change.condition_key!==null?{condition_key:change.condition_key}:{}),
        ...(change.sort_order!==null?{sort_order:change.sort_order}:{}),
      }
    }).sort((a,b)=>a.sort_order-b.sort_order).map((item,index)=>({...item,sort_order:(index+1)*10})))
    setAiReply(current=>current?{...current,patches:[]}:current)
    setMessage("AI-wijzigingen toegepast. Controleer ze en sla daarna op.")
  }

  return <div className="space-y-5">
    <section className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
      <div className="grid grid-cols-3 gap-1 rounded-xl border p-1">
        {roles.map(item=><button
          key={item.value}
          type="button"
          aria-pressed={role===item.value}
          onClick={()=>setRole(item.value)}
          className={"rounded-lg px-3 py-2 text-sm font-bold "+(role===item.value?"bg-violet-600 text-white":"hover:bg-muted")}
        >{item.label}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/" className="rounded-xl border px-4 py-2 text-sm font-bold">Website openen</Link>
        <Link href="/god-mode/setup" className="rounded-xl border px-4 py-2 text-sm font-bold">God login wijzigen</Link>
        <form action={godModeLogout}><button className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold">God Mode afsluiten</button></form>
      </div>
    </section>

    <section className="space-y-3 rounded-2xl border border-violet-500/40 bg-violet-500/5 p-4">
      <div>
        <h2 className="text-lg font-black">AI app-editor</h2>
        <p className="text-sm text-muted-foreground">De AI werkt uitsluitend op de rolregels die hieronder zichtbaar zijn. Wijzigingen worden eerst als voorstel toegepast en pas na Opslaan definitief.</p>
      </div>
      <textarea
        value={aiPrompt}
        onChange={e=>setAiPrompt(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="Bijv. zet Werkplekken vóór Taken en toon Werkuren alleen tijdens een actieve shift."
        className="w-full rounded-xl border bg-background p-3"
      />
      <button type="button" disabled={aiBusy||!aiPrompt.trim()} onClick={()=>void askAi()} className="w-full rounded-xl bg-violet-600 p-3 font-black text-white disabled:opacity-50">
        {aiBusy?"AI DENKT…":"VRAAG AI"}
      </button>
      {aiError&&<p role="alert" className="rounded-xl border border-red-500/40 p-3 text-red-500">{aiError}</p>}
      {aiReply&&<div className="space-y-3 rounded-xl border bg-background p-3">
        <p className="whitespace-pre-wrap text-sm">{aiReply.answer}</p>
        {aiReply.patches.length>0&&<button type="button" onClick={applyAi} className="w-full rounded-xl border border-violet-500/50 p-3 font-black">
          {aiReply.patches.length} AI-WIJZIGING{aiReply.patches.length===1?"":"EN"} TOEPASSEN
        </button>}
      </div>}
    </section>

    <section className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black">Layout & rolrechten</h2><p className="text-sm text-muted-foreground">Sleep om de volgorde te wijzigen. Dit is de enige editor die rolregels kan opslaan.</p></div>
        <button type="button" disabled={busy||loading} onClick={()=>setRules(getDefaultRoleUiRules(role))} className="rounded-xl border px-4 py-2 font-bold">Standaard laden</button>
      </div>
      {loading&&<p className="text-muted-foreground">Rolregels laden…</p>}
      {!loading&&rules.map(rule=><article
        key={rule.feature_key}
        draggable
        onDragStart={()=>setDragKey(rule.feature_key)}
        onDragOver={e=>e.preventDefault()}
        onDrop={()=>dropOn(rule.feature_key)}
        className="rounded-xl border p-3"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="cursor-grab font-bold">☰ {rule.label}</span>
          <code className="text-xs text-muted-foreground">{rule.feature_key}</code>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">Label
            <input value={rule.label} maxLength={80} onChange={e=>patch(rule.feature_key,{label:e.target.value})} className="rounded-lg border bg-background p-2"/>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={rule.visible} onChange={e=>patch(rule.feature_key,{visible:e.target.checked})}/> Zichtbaar</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={rule.enabled} onChange={e=>patch(rule.feature_key,{enabled:e.target.checked})}/> Bruikbaar</label>
          <label className="grid gap-1 text-sm sm:col-span-2">Wanneer
            <select value={rule.condition_key} onChange={e=>patch(rule.feature_key,{condition_key:e.target.value as RoleCondition})} className="rounded-lg border bg-background p-2">
              {conditions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </article>)}
      {message&&<p role="status" className="rounded-xl border p-3">{message}</p>}
      <button type="button" disabled={busy||loading} onClick={()=>void save()} className="w-full rounded-xl bg-violet-600 p-3 font-black text-white disabled:opacity-50">
        {busy?"OPSLAAN…":"GOD MODE WIJZIGINGEN OPSLAAN"}
      </button>
    </section>
  </div>
}
