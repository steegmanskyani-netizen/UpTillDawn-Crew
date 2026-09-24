"use client"

import Script from "next/script"
import { useEffect, useRef, useState } from "react"

type Props = {
  defaultVenue?: string | null
  defaultAddress?: string | null
  defaultLatitude?: number | null
  defaultLongitude?: number | null
}

type PlaceAutocompleteElementConstructor = new (options?: Record<string, unknown>) => HTMLElement & { value?: string }
type GoogleMapsWindow = Window & {
  google?: {
    maps: {
      importLibrary: (name: string) => Promise<{ PlaceAutocompleteElement: PlaceAutocompleteElementConstructor }>
    }
  }
}

type SelectedPlace = {
  displayName?: string
  formattedAddress?: string
  location?: { lat: () => number; lng: () => number }
  googleMapsURI?: string
  fetchFields: (options: { fields: string[] }) => Promise<void>
}

export function GooglePlaceFields({
  defaultVenue,
  defaultAddress,
  defaultLatitude,
  defaultLongitude,
}: Props) {
  const apiKey=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const venueHost=useRef<HTMLDivElement>(null)
  const addressHost=useRef<HTMLDivElement>(null)
  const venueWidget=useRef<HTMLElement & { value?: string } | null>(null)
  const addressWidget=useRef<HTMLElement & { value?: string } | null>(null)
  const [ready,setReady]=useState(false)
  const [venue,setVenue]=useState(defaultVenue||"")
  const [address,setAddress]=useState(defaultAddress||"")
  const [latitude,setLatitude]=useState(defaultLatitude?.toString()||"")
  const [longitude,setLongitude]=useState(defaultLongitude?.toString()||"")
  const [mapsUri,setMapsUri]=useState(
    defaultLatitude!=null&&defaultLongitude!=null
      ? `https://www.google.com/maps/search/?api=1&query=${defaultLatitude},${defaultLongitude}`
      : ""
  )

  useEffect(()=>{
    if(!ready||!apiKey||!venueHost.current||!addressHost.current)return
    let cancelled=false
    const googleMaps=(window as GoogleMapsWindow).google?.maps
    if(!googleMaps)return

    async function initialize(){
      const library=await googleMaps.importLibrary("places")
      if(cancelled)return
      const Autocomplete=library.PlaceAutocompleteElement

      const bind=(host:HTMLDivElement,initial:string,placeholder:string,kind:"venue"|"address")=>{
        host.innerHTML=""
        const element=new Autocomplete({value:initial,placeholder})
        element.className="block w-full rounded-lg border bg-background"
        element.addEventListener("gmp-select",async rawEvent=>{
          const event=rawEvent as Event & {placePrediction?:{toPlace:()=>SelectedPlace}}
          if(!event.placePrediction)return
          const place=event.placePrediction.toPlace()
          await place.fetchFields({fields:["displayName","formattedAddress","location","googleMapsURI"]})
          const nextVenue=place.displayName||venue
          const nextAddress=place.formattedAddress||address
          const lat=place.location?.lat()
          const lng=place.location?.lng()
          setVenue(nextVenue)
          setAddress(nextAddress)
          if(typeof lat==="number"&&typeof lng==="number"){
            setLatitude(String(lat))
            setLongitude(String(lng))
          }
          setMapsUri(place.googleMapsURI||(
            typeof lat==="number"&&typeof lng==="number"
              ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
              : ""
          ))
          if(venueWidget.current&&kind==="address")venueWidget.current.value=nextVenue
          if(addressWidget.current&&kind==="venue")addressWidget.current.value=nextAddress
        })
        host.appendChild(element)
        return element
      }

      venueWidget.current=bind(venueHost.current!,venue,"Zoek locatie via Google Maps","venue")
      addressWidget.current=bind(addressHost.current!,address,"Zoek adres via Google Maps","address")
    }
    void initialize()
    return()=>{cancelled=true}
  },[address,apiKey,ready,venue])

  return <div className="grid gap-3 md:grid-cols-2">
    {apiKey&&<Script
      src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&libraries=places&v=weekly`}
      strategy="afterInteractive"
      onLoad={()=>setReady(true)}
    />}
    {apiKey
      ? <>
          <label className="grid gap-1 text-sm">Locatie<div ref={venueHost}/></label>
          <label className="grid gap-1 text-sm">Adres<div ref={addressHost}/></label>
        </>
      : <>
          <label className="grid gap-1 text-sm">Locatie<input value={venue} onChange={e=>setVenue(e.target.value)} maxLength={200} placeholder="Locatie" className="rounded-lg border bg-background p-3"/></label>
          <label className="grid gap-1 text-sm">Adres<input value={address} onChange={e=>setAddress(e.target.value)} maxLength={500} placeholder="Adres" className="rounded-lg border bg-background p-3"/></label>
        </>}
    <input type="hidden" name="venue" value={venue}/>
    <input type="hidden" name="address" value={address}/>
    <input type="hidden" name="latitude" value={latitude}/>
    <input type="hidden" name="longitude" value={longitude}/>
    <div className="md:col-span-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {mapsUri&&<a href={mapsUri} target="_blank" rel="noreferrer" className="underline">Open adres in Google Maps</a>}
      {!apiKey&&<span>Google Maps-suggesties worden actief zodra de Maps/Places API-key is ingesteld.</span>}
    </div>
  </div>
}
