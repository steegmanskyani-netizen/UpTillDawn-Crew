// Smoke test: proves the application's core configuration boots and the
// expected entry points are present. Runs on the built-in node:test runner,
// so it needs no extra dependencies.

import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)

test('next.config.mjs loads and exports a valid config object', async () => {
  const mod = await import('../next.config.mjs')
  const config = mod.default
  assert.ok(config, 'next.config.mjs must have a default export')
  assert.equal(typeof config, 'object')
  assert.equal(config.images?.unoptimized, true)
  assert.equal(config.experimental?.serverActions, undefined, 'production/test config must not allow Codespaces Server Action origins')
})

test('core entry points exist', async () => {
  const entries = ['middleware.ts', 'app', 'lib', 'components', 'package.json']
  for (const entry of entries) {
    await assert.doesNotReject(
      access(fileURLToPath(new URL(entry, root))),
      `expected ${entry} to exist at the project root`,
    )
  }
})
