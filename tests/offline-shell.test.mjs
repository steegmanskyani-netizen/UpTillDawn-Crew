import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('offline shell script is syntactically valid and keeps ordered dependency references', async () => {
  const html = await readFile(new URL('../public/offline.html', import.meta.url), 'utf8')
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  assert.ok(match, 'offline shell must contain an inline script')
  assert.doesNotThrow(() => new Function(match[1]))

  assert.match(match[1], /session_operation_id/)
  assert.match(match[1], /break_operation_id/)
  assert.match(match[1], /incident_photo/)
  assert.match(match[1], /uptilldawn-offline-shell/)
  assert.match(match[1], /navigator\.geolocation/)
})

test('service worker caches the current offline shell version', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /uptilldawn-public-v7/)
  assert.match(sw, /\/offline\.html/)
  assert.match(sw, /\/offline-public\.html/)
  assert.match(sw, /event\.request\.mode==='navigate'/)
  assert.match(sw, /publicRoute\?['"]\/offline-public\.html['"]:['"]\/offline\.html['"]/)
})


test('all public auth routes use the privacy-safe offline fallback', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  for (const route of ['/signup','/forgot-password','/verify-email','/disabled','/unauthorized']) {
    assert.ok(sw.includes(`url.pathname==='${route}'`), `${route} must be treated as public offline`)
  }
})
