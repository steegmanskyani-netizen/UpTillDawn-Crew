"use client"

import { useEffect, useId, useMemo, useState } from "react"

type Props = {
  defaultVenue?: string | null
  defaultAddress?: string | null
  defaultLatitude?: number | null
  defaultLongitude?: number | null
}

type Suggestion = {
  id:string
  name:string
  formatted:string
  addressLine1:string
  addressLine2:string
  latitude:number
  longitude:number
  resultType:string
}

type Field="venue"|"address"

export function GeoapifyPlaceFields({
  defaultVenue,
  defaultAddress,
  defaultLatitude,
  defaultLongitude,
}:Props){
  const fieldId=useId()
  const venueId=`${fieldId}-venue`
  const addressId=`${fieldId}-address`
  const venueListId=`${fieldId}-venue-list`
  const addressListId=`${fieldId}-address-list`
  const [venue,setVenue]=useState(defaultVenue||"")
  const [address,setAddress]=useState(defaultAddress||"")
  const [latitude,setLatitude]=useState(defaultLatitude?.toString()||"")
  const [longitude,setLongitude]=useState(defaultLongitude?.toString()||"")
  const [focused,setFocused]=useState<Field|null>(null)
  const [suggestions,setSuggestions]=useState<Suggestion[]>([])
  const [activeIndex,setActiveIndex]=useState(-1)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState("")

  const query=focused==="venue"?venue:focused==="address"?address:""
  const mapsUri=useMemo(()=>{
    if(!latitude||!longitude)return ""
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
  },[latitude,longitude])

  useEffect(()=>{
    if(!focused||query.trim().length<2)return

    const controller=new AbortController()
    const timer=window.setTimeout(async()=>{
      try{
        setLoading(true)
        setError("")
        const htmlLang=document.documentElement.lang.slice(0,2).toLowerCase()
        const lang=["nl","fr","en"].includes(htmlLang)?htmlLang:"nl"
        const response=await fetch(`/api/geocode/autocomplete?q=${encodeURIComponent(query.trim())}&lang=${lang}`,{
          signal:controller.signal,
          headers:{Accept:"application/json"},
        })
        const payload=await response.json() as {results?:Suggestion[];error?:string}
        if(!response.ok){
          setSuggestions([])
          setError(payload.error||"Locaties konden niet worden opgezocht.")
          return
        }
        setSuggestions(payload.results||[])
        setActiveIndex(-1)
      }catch(fetchError){
        if(fetchError instanceof DOMException&&fetchError.name==="AbortError")return
        setSuggestions([])
        setError("Locaties konden niet worden opgezocht.")
      }finally{
        if(!controller.signal.aborted)setLoading(false)
      }
    },300)

    return()=>{
      window.clearTimeout(timer)
      controller.abort()
    }
  },[focused,query])

  const clearLink=()=>{
    setLatitude("")
    setLongitude("")
  }

  const focusField=(field:Field)=>{
    setFocused(field)
    setSuggestions([])
    setActiveIndex(-1)
    setError("")
  }

  const editField=(field:Field,value:string)=>{
    if(field==="venue")setVenue(value)
    else setAddress(value)
    clearLink()
    setFocused(field)
    setActiveIndex(-1)
    setError("")
    if(value.trim().length<2){
      setSuggestions([])
      setLoading(false)
    }
  }

  const blurField=(field:Field)=>{
    window.setTimeout(()=>{
      setFocused(current=>current===field?null:current)
      setSuggestions([])
      setActiveIndex(-1)
    },120)
  }

  const selectSuggestion=(suggestion:Suggestion)=>{
    setVenue(suggestion.name||suggestion.addressLine1||suggestion.formatted)
    setAddress(suggestion.formatted)
    setLatitude(String(suggestion.latitude))
    setLongitude(String(suggestion.longitude))
    setSuggestions([])
    setActiveIndex(-1)
    setFocused(null)
    setError("")
  }

  const handleKeyDown=(event:React.KeyboardEvent<HTMLInputElement>)=>{
    if(!suggestions.length)return
    if(event.key==="ArrowDown"){
      event.preventDefault()
      setActiveIndex(index=>Math.min(index+1,suggestions.length-1))
    }else if(event.key==="ArrowUp"){
      event.preventDefault()
      setActiveIndex(index=>Math.max(index-1,0))
    }else if(event.key==="Enter"&&activeIndex>=0){
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    }else if(event.key==="Escape"){
      setSuggestions([])
      setActiveIndex(-1)
    }
  }

  const suggestionList=(field:Field)=>{
    if(focused!==field)return null
    return <div id={field==="venue"?venueListId:addressListId} className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-background shadow-xl" role="listbox">
      {loading&&<p className="p-3 text-sm text-muted-foreground">Locaties zoeken…</p>}
      {!loading&&suggestions.map((suggestion,index)=><button
        key={suggestion.id}
        type="button"
        role="option"
        aria-selected={activeIndex===index}
        onMouseDown={event=>event.preventDefault()}
        onClick={()=>selectSuggestion(suggestion)}
        className={`block w-full border-b p-3 text-left last:border-b-0 ${activeIndex===index?"bg-muted":""}`}
      >
        <span className="block font-semibold">{suggestion.name}</span>
        <span className="block text-xs text-muted-foreground">{suggestion.formatted}</span>
      </button>)}
      {!loading&&query.trim().length>=2&&!suggestions.length&&!error&&<p className="p-3 text-sm text-muted-foreground">Geen locaties gevonden.</p>}
    </div>
  }

  return <div className="grid gap-3 md:grid-cols-2">
    <div className="relative grid gap-1 text-sm">
      <label htmlFor={venueId}>Locatie</label>
      <input
        id={venueId}
        value={venue}
        onChange={event=>editField("venue",event.target.value)}
        onFocus={()=>focusField("venue")}
        onBlur={()=>blurField("venue")}
        onKeyDown={handleKeyDown}
        maxLength={200}
        placeholder="Zoek locatie"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={venueListId}
        aria-expanded={focused==="venue"&&suggestions.length>0}
        className="rounded-lg border bg-background p-3"
      />
      {suggestionList("venue")}
    </div>

    <div className="relative grid gap-1 text-sm">
      <label htmlFor={addressId}>Adres</label>
      <input
        id={addressId}
        value={address}
        onChange={event=>editField("address",event.target.value)}
        onFocus={()=>focusField("address")}
        onBlur={()=>blurField("address")}
        onKeyDown={handleKeyDown}
        maxLength={500}
        placeholder="Zoek adres"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={addressListId}
        aria-expanded={focused==="address"&&suggestions.length>0}
        className="rounded-lg border bg-background p-3"
      />
      {suggestionList("address")}
    </div>

    <input type="hidden" name="venue" value={venue}/>
    <input type="hidden" name="address" value={address}/>
    <input type="hidden" name="latitude" value={latitude}/>
    <input type="hidden" name="longitude" value={longitude}/>

    <div className="md:col-span-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>Kies een suggestie om locatie, adres en GPS-coördinaten automatisch aan elkaar te koppelen.</span>
      {mapsUri&&<a href={mapsUri} target="_blank" rel="noreferrer" className="underline">Open adres in Google Maps</a>}
      <span>
        Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Geoapify</a>
        {" · "}
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>
      </span>
      {error&&<span className="font-semibold text-red-500">{error}</span>}
    </div>
  </div>
}
