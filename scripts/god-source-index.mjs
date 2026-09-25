import ts from 'typescript'
import {readdir,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
const targets=[]
async function walk(dir){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const file=join(dir,item.name)
  if(item.isDirectory())await walk(file)
  else if(/\.(ts|tsx)$/.test(file)){
   const text=await readFile(file,'utf8')
   const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
   function visit(node){
    if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
     const opening=ts.isJsxElement(node)?node.openingElement:node
     const kind=opening.tagName.getText(source)
     if(/^(button|Button|a|Link|form|input|select|textarea|h[1-6])$/.test(kind)){
      const attrs=opening.attributes.properties
      const handler=attrs.filter(a=>ts.isJsxAttribute(a)&&/^(onClick|onSubmit|action|href)$/.test(a.name.getText(source))).map(a=>a.getText(source)).join(' ').slice(0,220)
      const label=(ts.isJsxElement(node)?node.children.map(c=>c.getText(source)).join(' '):opening.getText(source)).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180)
      targets.push({file:file.replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,kind,label,handler})
     }
    }
    if(ts.isFunctionDeclaration(node)&&node.name&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))targets.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,kind:'functie',label:node.name.getText(source),handler:node.name.getText(source)})
    ts.forEachChild(node,visit)
   }
   visit(source)
  }
 }
}
for(const dir of ['app','components','lib'])await walk(dir)
await writeFile('lib/god-source-index.json',JSON.stringify(targets,null,2)+'\n')
console.log(`${targets.length} onderdelen geïndexeerd`)
