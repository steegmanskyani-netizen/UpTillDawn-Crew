import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('staff-facing release navigation is lifecycle-gated', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')

  assert.match(layout, /setShowWorkplaces\(hasOpenResponsibleEvent\)/)
  assert.match(layout, /setShowIncidents\(false\)/)
  assert.match(layout, /setShowTasks\(hasOpenMemberEvent\)/)
  assert.match(layout, /setShowBriefings\(hasOpenMemberEvent\)/)
  assert.match(sidebar, /i\.href === "\/workplaces"\) return showWorkplaces/)
  assert.match(sidebar, /i\.href === "\/incidents"\) return showIncidents/)
  assert.match(mobile, /i\.href==="\/incidents"\) return showIncidents/)
})

test('staff cannot see manager creation controls in test mode', async () => {
  const tasks = await read('app/(app)/tasks/page.tsx')
  const briefings = await read('app/(app)/briefings/page.tsx')
  const shifts = await read('app/(app)/shifts/page.tsx')
  const dashboard = await read('app/(app)/page.tsx')

  assert.match(tasks, /<ManagerOnly><form action=\{createTask\}/)
  assert.match(briefings, /<ManagerOnly><div[^>]*>[\s\S]*action=\{createBriefing\}/)
  assert.match(briefings, /action=\{createPersonalInstruction\}/)
  assert.match(shifts, /<AdminOnly><form action=\{createShift\}/)
  assert.match(dashboard, /<ManagerOnly><Card href="\/incidents"/)
})

test('future event availability and batch assignment are present', async () => {
  const events = await read('app/(app)/events/page.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')

  assert.ok(events.includes('>IK KAN</button>'))
  assert.ok(events.includes('>IK KAN NIET</button>'))
  assert.match(events, /Mensen die kunnen/)
  assert.match(events, /action=\{addAvailableEventMembers\}/)
  assert.match(actions, /export async function setEventAvailability/)
  assert.match(actions, /export async function addAvailableEventMembers/)
})

test('task assignment supports multiple selected staff members', async () => {
  const fields = await read('components/crew/assignment-scope-fields.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')

  assert.match(fields, /multiplePeople/)
  assert.match(fields, /type="checkbox" name="user_id"/)
  assert.match(actions, /fd\.getAll\('user_id'\)/)
  assert.match(actions, /for\(const target of rest\)/)
})

test('open incidents are manager-only while staff keep urgent reporting', async () => {
  const incidents = await read('app/(app)/incidents/page.tsx')
  const dashboard = await read('app/(app)/page.tsx')

  assert.match(incidents, /\{manager && <>/)
  assert.match(incidents, /manager \? 'Incidenten' : 'Urgent melden'/)
  assert.match(dashboard, /<ManagerOnly><Card href="\/incidents"/)
})

test('current brand asset is used on public auth screens', async () => {
  for (const path of [
    'app/(auth)/forgot-password/page.tsx',
    'app/(auth)/signup/page.tsx',
    'app/(auth)/verify-email/verify-email-client.tsx',
  ]) {
    const text = await read(path)
    assert.match(text, /\/up-till-dawn-mark\.webp/)
    assert.doesNotMatch(text, /alt="Uptilldawn"/)
  }
})


test('dashboard follows event lifecycle visibility', async () => {
  const dashboard = await read('app/(app)/page.tsx')
  assert.match(dashboard, /AssignedEventOnly available=\{hasEventAssignment\}/)
  assert.match(dashboard, /hasActiveIncidentContext && <ManagerOnly>/)
  assert.match(dashboard, /Geen evenementen beschikbaar\./)
})

test('responsible workplace navigation requires event assignment', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const page = await read('app/(app)/workplaces/page.tsx')
  assert.match(layout, /setShowWorkplaces\(hasOpenResponsibleEvent\)/)
  assert.match(sidebar, /i\.href === "\/workplaces"\) return showWorkplaces/)
  assert.match(page, /event_role', 'responsible_lead'/)
})

test('event page exposes explicit empty state', async () => {
  const events = await read('app/(app)/events/page.tsx')
  assert.match(events, /Geen evenementen beschikbaar\./)
})


test('event tools disappear after the assigned event ends', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  assert.match(layout, /\.gte\("end_at", now\)/)
  assert.match(layout, /hasOpenMemberEvent/)
  assert.match(layout, /hasOpenResponsibleEvent/)
  assert.match(layout, /setShowTasks\(hasOpenMemberEvent\)/)
  assert.match(layout, /setShowBriefings\(hasOpenMemberEvent\)/)
  assert.match(layout, /setShowWorkplaces\(hasOpenResponsibleEvent\)/)
})
