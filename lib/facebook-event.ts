export type FacebookEventInfo = {
  sourceUrl: string
  name: string | null
  venue: string | null
  address: string | null
  startAt: string | null
  endAt: string | null
}

function decodeHtml(value:string){
  return value
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
}

function escapeRegex(value:string){
  return value.replace(/[.*+?^$()|[\]\\]/g,"\\$&")
}

function meta(html:string,key:string){
  const escaped=escapeRegex(key)
  const patterns=[
    new RegExp('<meta[^>]+(?:property|name)=["\\']'+escaped+'["\\'][^>]+content=["\\']([^"\\']*)["\\'][^>]*>',"i"),
    new RegExp('<meta[^>]+content=["\\']([^"\\']*)["\\'][^>]+(?:property|name)=["\\']'+escaped+'["\\'][^>]*>',"i"),
  ]
  for(const pattern of patterns){
    const match=html.match(pattern)
    if(match?.[1])return decodeHtml(match[1].trim())
  }
  return null
}

function iso(value:unknown){
  if(typeof value==="number"&&Number.isFinite(value)){
    const ms=value<10_000_000_000?value*1000:value
    const date=new Date(ms)
    return Number.isNaN(date.getTime())?null:date.toISOString()
  }
  if(typeof value!=="string"||!value.trim())return null
  const numeric=Number(value)
  if(/^\d{10,13}$/.test(value.trim())&&Number.isFinite(numeric))return iso(numeric)
  const date=new Date(value)
  return Number.isNaN(date.getTime())?null:date.toISOString()
}

function findEvent(node:unknown):Record<string,unknown>|null{
  if(!node)return null
  if(Array.isArray(node)){
    for(const item of node){
      const found=findEvent(item)
      if(found)return found
    }
    return null
  }
  if(typeof node!=="object")return null
  const record=node as Record<string,unknown>
  const type=record["@type"]
  if(type==="Event"||(Array.isArray(type)&&type.includes("Event")))return record
  for(const value of Object.values(record)){
    const found=findEvent(value)
    if(found)return found
  }
  return null
}

function locationParts(value:unknown){
  if(!value||typeof value!=="object")return {venue:null as string|null,address:null as string|null}
  const location=value as Record<string,unknown>
  const venue=typeof location.name==="string"?location.name.trim()||null:null
  const raw=location.address
  if(typeof raw==="string")return {venue,address:raw.trim()||null}
  if(raw&&typeof raw==="object"){
    const a=raw as Record<string,unknown>
    const parts=[
      a.streetAddress,
      a.postalCode,
      a.addressLocality,
      a.addressRegion,
      a.addressCountry,
    ].filter((item):item is string=>typeof item==="string"&&Boolean(item.trim()))
    return {venue,address:parts.join(", ")||null}
  }
  return {venue,address:null}
}

function timestampFromHtml(html:string,keys:string[]){
  for(const key of keys){
    const escaped=escapeRegex(key)
    const match=html.match(new RegExp('["\\']'+escaped+'["\\']\\s*:\\s*["\\']?(\\d{10,13})["\\']?',"i"))
    if(match?.[1]){
      const parsed=iso(match[1])
      if(parsed)return parsed
    }
  }
  return null
}

export function isFacebookEventUrl(raw:string){
  try{
    const url=new URL(raw)
    const host=url.hostname.toLowerCase()
    const facebook=host==="facebook.com"||host.endsWith(".facebook.com")||host==="fb.me"
    return url.protocol==="https:"&&facebook&&(url.pathname.includes("/events/")||host==="fb.me")
  }catch{return false}
}

export async function fetchFacebookEventInfo(raw:string):Promise<FacebookEventInfo>{
  if(!isFacebookEventUrl(raw))throw new Error("Gebruik een geldige openbare Facebook-evenementlink.")
  const url=new URL(raw)
  const response=await fetch(url.toString(),{
    redirect:"follow",
    cache:"no-store",
    headers:{
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "Accept":"text/html,application/xhtml+xml",
      "Accept-Language":"nl-BE,nl;q=0.9,en;q=0.8",
    },
  })
  if(!response.ok)throw new Error("Facebook-evenement kon niet worden geopend.")
  const html=(await response.text()).slice(0,4_000_000)

  let structured:Record<string,unknown>|null=null
  for(const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const parsed=JSON.parse(decodeHtml(match[1]))
      structured=findEvent(parsed)
      if(structured)break
    }catch{}
  }

  const loc=locationParts(structured?.location)
  const ogTitle=meta(html,"og:title")
  const name=(typeof structured?.name==="string"?structured.name:ogTitle)?.replace(/\s*\|\s*Facebook\s*$/i,"").trim()||null
  const startAt=iso(structured?.startDate)
    ||timestampFromHtml(html,["event_start_timestamp","start_timestamp","startTimestamp","start_time"])
  const endAt=iso(structured?.endDate)
    ||timestampFromHtml(html,["event_end_timestamp","end_timestamp","endTimestamp","end_time"])

  return {
    sourceUrl:response.url||url.toString(),
    name,
    venue:loc.venue,
    address:loc.address,
    startAt,
    endAt,
  }
}
