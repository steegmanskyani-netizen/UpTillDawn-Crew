import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceRoots = ['app', 'components', 'lib']

async function sourceFiles() {
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (/\.(?:ts|tsx|mjs|js)$/.test(entry.name)) files.push(full)
    }
  }
  for (const sourceRoot of sourceRoots) await walk(join(root, sourceRoot))
  files.push(join(root, 'proxy.ts'), join(root, 'next.config.mjs'))
  return files
}

test('active runtime has no service-role secret or retired StaffPortal schema references', async () => {
  const retired = /\b(?:user_profiles|user_roles|leave_requests|expense_claims|purchase_requests|departments|locations)\b/
  for (const file of await sourceFiles()) {
    const text = await readFile(file, 'utf8')
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i, relative(root, file))
    assert.doesNotMatch(text, retired, relative(root, file))
  }
})

test('public environment example exposes only required browser-safe variables', async () => {
  const text = await readFile(join(root, '.env.example'), 'utf8')
  const keys = text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=', 1)[0])
  assert.deepEqual(keys, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  ])
})

test('migration history has unique version prefixes', async () => {
  const names = (await readdir(join(root, 'supabase', 'migrations')))
    .filter(name => name.endsWith('.sql'))
  const versions = names.map(name => name.split('_', 1)[0])
  assert.equal(new Set(versions).size, versions.length, 'migration version prefixes must be unique')
})
