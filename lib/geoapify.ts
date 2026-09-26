import "server-only"

export type GeoapifyLocation = {
  id: string
  name: string
  formatted: string
  addressLine1: string
  addressLine2: string
  latitude: number
  longitude: number
  resultType: string
}

type RawLocation = {
  place_id?: string
  name?: string
  formatted?: string
  address_line1?: string
  address_line2?: string
  lat?: number
  lon?: number
  result_type?: string
}

function apiKey(){
  const key=process.env.GEOAPIFY_API_KEY?.trim()
  if(!key) throw new Error("Locatiezoeker is nog niet geconfigureerd.")
  return key
}

function normalize(item:RawLocation,index:number):GeoapifyLocation|null{
  if(typeof item.lat!=="number"||typeof item.lon!=="number")return null
  const formatted=item.formatted||[item.address_line1,item.address_line2].filter(Boolean).join(", ")
  if(!formatted)return null
  return {
    id:item.place_id||`${item.lat}:${item.lon}:${index}`,
    name:item.name||item.address_line1||formatted,
    formatted,
    addressLine1:item.address_line1||item.name||formatted,
    addressLine2:item.address_line2||"",
    latitude:item.lat,
    longitude:item.lon,
    resultType:item.result_type||"unknown",
  }
}

async function request(path:"autocomplete"|"search",text:string,lang:string,limit:number){
  const params=new URLSearchParams({
    text,
    format:"json",
    limit:String(limit),
    lang:["nl","fr","en"].includes(lang)?lang:"nl",
    apiKey:apiKey(),
  })
  const response=await fetch(`https://api.geoapify.com/v1/geocode/${path}?${params.toString()}`,{
    headers:{Accept:"application/json"},
    cache:"no-store",
    signal:AbortSignal.timeout(8_000),
  })
  if(!response.ok)throw new Error("Locaties konden niet worden opgezocht.")
  const payload=await response.json() as {results?:RawLocation[]}
  return (payload.results||[])
    .map(normalize)
    .filter((value):value is GeoapifyLocation=>Boolean(value))
}

export async function autocompleteGeoapify(text:string,lang="nl",limit=6){
  const query=text.trim()
  if(query.length<2)return []
  if(query.length>200)throw new Error("Zoekopdracht is te lang.")
  return request("autocomplete",query,lang,Math.min(Math.max(limit,1),10))
}

export async function geocodeGeoapify(text:string,lang="nl"){
  const query=text.trim()
  if(!query)return null
  const results=await request("search",query,lang,1)
  return results[0]||null
}
