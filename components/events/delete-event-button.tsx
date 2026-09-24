"use client"

import { deleteEvent } from "@/lib/actions/uptilldawn"

export function DeleteEventButton({eventId,eventName}:{eventId:string;eventName:string}){
  return <form action={deleteEvent} onSubmit={event=>{
    if(!window.confirm(`Evenement “${eventName}” definitief verwijderen? Alle gekoppelde operationele gegevens worden mee verwijderd.`)){
      event.preventDefault()
    }
  }}>
    <input type="hidden" name="event_id" value={eventId}/>
    <button className="rounded-lg border border-red-500/50 px-3 py-2 font-bold text-red-300">Verwijderen</button>
  </form>
}
