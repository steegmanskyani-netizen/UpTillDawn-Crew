'use client'
import {useRef,useState} from 'react'
const ACCEPT='.pdf,.docx,.pptx,.xlsx,.txt,.csv,image/jpeg,image/png,image/webp'
type ExtractedImage={name:string;mimeType:string;base64:string}
function decodedFile(image:ExtractedImage){const binary=atob(image.base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new File([bytes],image.name,{type:image.mimeType})}
export function BriefingAnalysisFields({defaultTitle='',defaultBody='',bodyPlaceholder='Algemene instructie'}:{defaultTitle?:string;defaultBody?:string;bodyPlaceholder?:string}){
 const [title,setTitle]=useState(defaultTitle),[body,setBody]=useState(defaultBody),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),extractedRef=useRef<HTMLInputElement>(null)
 async function analyze(file:File){
  setBusy(true);setMessage('Bestand wordt gelezen…');if(extractedRef.current)extractedRef.current.value=''
  try{
   const analysisForm=new FormData();analysisForm.set('file',file)
   const mediaForm=new FormData();mediaForm.set('file',file)
   const [analysisResponse,mediaResponse]=await Promise.all([fetch('/api/briefing-analyze',{method:'POST',body:analysisForm}),fetch('/api/briefing-extract-media',{method:'POST',body:mediaForm})])
   const result=await analysisResponse.json() as {title?:string;instructions?:string;error?:string};if(!analysisResponse.ok)throw new Error(result.error||'Analyse mislukt.');setTitle(result.title||'');setBody(result.instructions||'')
   let extracted=0
   if(mediaResponse.ok&&extractedRef.current){const media=await mediaResponse.json() as {images?:ExtractedImage[]};const transfer=new DataTransfer();for(const image of media.images||[])transfer.items.add(decodedFile(image));extracted=transfer.files.length;extractedRef.current.files=transfer.files}
   setMessage(extracted?`Titel en instructies zijn ingevuld. ${extracted} ingesloten afbeelding${extracted===1?'':'en'} wordt automatisch als bijlage opgeslagen. Controleer alles voor opslaan.`:'Titel en instructies zijn automatisch ingevuld. Controleer ze voor opslaan.')
  }catch(error){setMessage(error instanceof Error?error.message:'Analyse mislukt.')}finally{setBusy(false)}
 }
 return <>
  <label className="grid gap-1 rounded-xl border border-dashed p-3 text-sm">Briefingbestand automatisch uitlezen
   <input name="briefing_document" type="file" accept={ACCEPT} disabled={busy} className="rounded-lg border bg-background p-2" onChange={event=>{const file=event.target.files?.[0];if(file)void analyze(file)}}/>
   <input ref={extractedRef} name="photos" type="file" multiple className="hidden" tabIndex={-1} aria-hidden="true"/>
   <span className="text-xs text-muted-foreground">PDF, DOCX, PPTX, XLSX, TXT, CSV, JPG, PNG of WEBP · maximaal 20 MB. Afbeeldingen in DOCX, PPTX en XLSX worden waar mogelijk automatisch als bijlage toegevoegd.</span>{message&&<span className="text-xs">{message}</span>}
  </label>
  <input name="title" required placeholder="Titel" className="border bg-background p-3" value={title} onChange={event=>setTitle(event.target.value)}/>
  <textarea name="body" required placeholder={bodyPlaceholder} className="min-h-28 border bg-background p-3" value={body} onChange={event=>setBody(event.target.value)}/>
 </>
}
