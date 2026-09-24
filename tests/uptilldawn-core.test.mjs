import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('UPTILLDAWN core migrations exist in order', () => {
  for (const n of ['026_uptilldawn_core.sql','027_uptilldawn_phase2.sql','028_uptilldawn_operations.sql','029_uptilldawn_hardening.sql']) {
    assert.equal(fs.existsSync(new URL(`../supabase/migrations/${n}`, import.meta.url)), true, n);
  }
});

test('time RPCs require auth and are restricted to authenticated role', () => {
  const sql = read('supabase/migrations/029_uptilldawn_hardening.sql');
  assert.match(sql, /Authentication required/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.upt_start_work\(UUID,UUID\) FROM PUBLIC/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.upt_start_work\(UUID,UUID\) TO authenticated/);
  assert.match(sql, /Invalid shift/);
});

test('remote check-in requires a fresh selfie path at database level', () => {
  const sql = read('supabase/migrations/029_uptilldawn_hardening.sql');
  assert.match(sql, /check_ins_remote_selfie_required/);
  assert.match(sql, /NOT remote OR selfie_path IS NOT NULL/);
});

test('PWA manifest and service worker are present', () => {
  assert.equal(fs.existsSync(new URL('../app/manifest.ts', import.meta.url)), true);
  assert.equal(fs.existsSync(new URL('../public/sw.js', import.meta.url)), true);
  assert.match(read('app/manifest.ts'), /UP TILL DAWN PERSONEELSBEHEER/);
});
