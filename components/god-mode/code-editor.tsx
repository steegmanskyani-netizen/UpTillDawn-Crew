'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import CodeMirror, {type ReactCodeMirrorRef} from '@uiw/react-codemirror'
import {javascript} from '@codemirror/lang-javascript'
import {json} from '@codemirror/lang-json'
import {sql} from '@codemirror/lang-sql'
import {css} from '@codemirror/lang-css'
import {html} from '@codemirror/lang-html'
import {oneDark} from '@codemirror/theme-one-dark'
import {openSearchPanel} from '@codemirror/search'
import {undo,redo} from '@codemirror/commands'

export default function CodeEditor({value,onChange,path,line=1,readOnly=false}:{value:string;onChange:(value:string)=>void;path:string;line?:number;readOnly?:boolean}){
  const ref=useRef<ReactCodeMirrorRef>(null)
  const [notice,setNotice]=useState('')
  const extensions=useMemo(()=>path.endsWith('.sql')?[sql()]:/\.jsonc?$/.test(path)?[json()]:/\.css$/.test(path)?[css()]:/\.(html|svg)$/.test(path)?[html()]:[javascript({jsx:true,typescript:true})],[path])
  useEffect(()=>{
    const view=ref.current?.view
    if(view){const target=view.state.doc.line(Math.max(1,Math.min(line,view.state.doc.lines)));view.dispatch({selection:{anchor:target.from},scrollIntoView:true})}
  },[line,path])
  async function format(){
    try{
      const prettier=await import('prettier/standalone')
      let result:string
      if(/\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(path)){
        const [typescript,estree,babel]=await Promise.all([import('prettier/plugins/typescript'),import('prettier/plugins/estree'),import('prettier/plugins/babel')])
        result=await prettier.format(value,{parser:path.endsWith('.json')?'json':/\.tsx?$/.test(path)?'typescript':'babel',plugins:[typescript.default,estree.default,babel.default],semi:false,singleQuote:true})
      }else if(/\.(css|scss)$/.test(path)){
        const plugin=await import('prettier/plugins/postcss');result=await prettier.format(value,{parser:'css',plugins:[plugin.default]})
      }else{setNotice('Formatteren ondersteunt hier TypeScript, JavaScript, JSON en CSS.');return}
      onChange(result);setNotice('Code geformatteerd. Nog niet opgeslagen.')
    }catch(error){setNotice(error instanceof Error?error.message:'Formatteren mislukt.')}
  }
  function insertButton(){
    const view=ref.current?.view;if(!view)return
    const selection=view.state.selection.main
    view.dispatch({changes:{from:selection.from,to:selection.to,insert:'<button type="button" onClick={() => window.location.assign("/events")}>Evenementen openen</button>'}})
    setNotice('Knopsjabloon ingevoegd. Gebruik onClick in een clientcomponent ("use client").')
  }
  return <div className="min-w-0 space-y-2"><div className="flex flex-wrap gap-2 text-xs"><button onClick={()=>{if(ref.current?.view)openSearchPanel(ref.current.view)}} className="rounded border px-3 py-2">Zoeken / vervangen</button><button disabled={readOnly} onClick={()=>{if(ref.current?.view)undo(ref.current.view)}} className="rounded border px-3 py-2">Ongedaan</button><button disabled={readOnly} onClick={()=>{if(ref.current?.view)redo(ref.current.view)}} className="rounded border px-3 py-2">Opnieuw</button><button disabled={readOnly} onClick={()=>void format()} className="rounded border px-3 py-2">Formatteren</button><button disabled={readOnly} onClick={insertButton} className="rounded border px-3 py-2">Knop invoegen</button></div><CodeMirror ref={ref} value={value} onChange={onChange} height="60vh" theme={oneDark} extensions={extensions} readOnly={readOnly} aria-label={`Code: ${path}`} basicSetup={{lineNumbers:true,foldGutter:true,highlightActiveLine:true,autocompletion:true,bracketMatching:true,searchKeymap:true}} className="overflow-hidden rounded-xl border text-sm"/>{notice&&<p role="status" className="whitespace-pre-wrap text-xs text-amber-400">{notice}</p>}</div>
}
