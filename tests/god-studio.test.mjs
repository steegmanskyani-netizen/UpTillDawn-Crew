import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {editablePath,changeSetSchema,summarizeChanges} from '../lib/god-studio.ts'

function read(path){ return readFile(new URL(`../${path}`, import.meta.url),'utf8') }

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


test('all powerful God Mode API routes use the shared studio guard', async()=>{
  const paths=[
    'app/api/god/code-assistant/route.ts',
    'app/api/god/connection/route.ts',
    'app/api/god/data/route.ts',
    'app/api/god/source/route.ts',
    'app/api/god/sql/route.ts',
  ]
  for(const path of paths){
    const source=await read(path)
    assert.match(source,/authorizeStudio\(request\)/,path)
    assert.match(source,/studioFailure/,path)
  }
})

test('God Mode source publication is proposal-first and CI-gated', async()=>{
  const source=await read('app/api/god/source/route.ts')
  assert.match(source,/god-mode\//)
  assert.match(source,/\/pulls/)
  assert.match(source,/actions\/workflows\/ci\.yml\/runs/)
  assert.match(source,/latest\.status !== 'completed' \|\| latest\.conclusion !== 'success'/)
  assert.match(source,/compare\/main\.\.\./)
  assert.match(source,/merge_method: 'squash'/)
  assert.doesNotMatch(source,/git\/refs\/heads\/main.*POST/)
})

test('God Mode SQL keeps read-only and write execution explicit', async()=>{
  const source=await read('app/api/god/sql/route.ts')
  const editor=await read('components/god-mode/god-sql-editor.tsx')
  assert.match(source,/read_only:readOnly/)
  assert.match(source,/body\.query,!body\.write/)
  assert.match(source,/upt_god_database_secret/)
  assert.match(editor,/write&&!confirmed/)
  assert.match(editor,/Ik heb deze SQL gecontroleerd/)
})

test('God Mode data and connection routes keep credentials and mutations behind token RPCs', async()=>{
  const connection=await read('app/api/god/connection/route.ts')
  const data=await read('app/api/god/data/route.ts')
  assert.match(connection,/repo\.full_name !== STUDIO_REPOSITORY/)
  assert.match(connection,/permissions\?\.push !== true/)
  assert.match(connection,/upt_god_repository_connect/)
  assert.match(connection,/upt_god_repository_disconnect/)
  assert.match(data,/upt_god_data_catalog/)
  assert.match(data,/upt_god_data_rows/)
  assert.match(data,/upt_god_data_mutate/)
  assert.match(data,/operation: z\.enum\(\['insert','update','delete'\]\)/)
})

test('God Mode AI proposals are bounded and schema validated before reaching drafts', async()=>{
  const route=await read('app/api/god/code-assistant/route.ts')
  const studio=await read('components/god-mode/god-studio.tsx')
  assert.match(route,/message: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(8000\)/)
  assert.match(route,/files: z\.array/)
  assert.match(route,/<=140000/)
  assert.match(route,/resultSchema\.safeParse/)
  assert.match(studio,/AI wil een bestaand bestand wijzigen dat niet was geopend/)
})
