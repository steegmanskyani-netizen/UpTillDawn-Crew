import test from 'node:test'
import assert from 'node:assert/strict'
import {editablePath,changeSetSchema,summarizeChanges} from '../lib/god-studio.ts'

test('source editor accepts application, workflow and migration files',()=>{
  for(const path of ['app/(app)/events/page.tsx','lib/actions/uptilldawn.ts','.github/workflows/ci.yml','supabase/migrations/20260925123535_god_mode_source_studio.sql','components/nieuwe-knop.tsx','.env.example'])assert.equal(editablePath(path),true,path)
})
test('source editor rejects traversal, control bytes, secrets and URL query injection',()=>{
  for(const path of ['../file.ts','a/../../file.ts','/file.ts','a\\file.ts','.git/config','node_modules/test.js','.env','.env.local','a.ts?ref=main','a.ts#x','a%2Ffile.ts','a//file.ts','a\n.ts','asset.png'])assert.equal(editablePath(path),false,path)
})
test('change sets require an exact base, unique paths, and bounded content',()=>{
  const base='a'.repeat(40)
  assert.equal(changeSetSchema.safeParse({base,title:'Knop toevoegen',changes:[{path:'components/new.tsx',content:'export default function Button(){return <button>Nieuw</button>}'}]}).success,true)
  assert.equal(changeSetSchema.safeParse({base:'main',title:'Wijzig',changes:[{path:'a.ts',content:''}]}).success,false)
  assert.equal(changeSetSchema.safeParse({base,title:'Wijzig',changes:[{path:'a.ts',content:''},{path:'a.ts',content:null}]}).success,false)
  assert.equal(changeSetSchema.safeParse({base,title:'Wijzig',changes:[{path:'a.ts',content:'x'.repeat(500001)}]}).success,false)
})
test('diff preserves shared context and reports changed line numbers',()=>{
  assert.deepEqual(summarizeChanges('a\nb\nc','a\nx\nc'),{line:2,removed:['b'],added:['x']})
  assert.deepEqual(summarizeChanges('a','a'),{line:2,removed:[],added:[]})
  assert.deepEqual(summarizeChanges('a\nb','a'),{line:2,removed:['b'],added:[]})
})
