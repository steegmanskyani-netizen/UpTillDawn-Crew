import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('admin can switch live role mode while test mode remains separate', async () => {
  const providers = await read('lib/providers.tsx')
  const topbar = await read('components/layout/topbar.tsx')
  const auth = await read('lib/actions/auth.ts')
  assert.match(providers, /upt_set_admin_role_mode/)
  assert.match(providers, /roleMode/)
  assert.match(topbar, /aria-label="Actieve rol"/)
  assert.match(topbar, /<option value="admin">Beheerder<\/option>/)
  assert.match(topbar, /<option value="employee">Personeel<\/option>/)
  assert.match(topbar, /<option value="responsible_lead">Verantwoordelijke<\/option>/)
  assert.match(auth, /upt_current_effective_role/)
})

test('role-driven release navigation uses saved conditions and ordering', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')
  const editor = await read('components/layout/test-mode-editor.tsx')
  const topbar = await read('components/layout/topbar.tsx')
  const providers = await read('lib/providers.tsx')
  const roleUi = await read('lib/role-ui.ts')

  assert.match(layout, /from\("role_ui_rules"\)/)
  assert.match(layout, /feature\("workplaces",Boolean\(isAdmin&&!testMode\)\|\|context\.assignedWorkplaceRole\)/)
  assert.match(layout, /feature\("tasks",Boolean\(isAdmin&&!testMode\)\|\|context\.shiftActive\)/)
  assert.match(layout, /feature\("incidents",context\.shiftActive\)/)
  assert.match(sidebar, /featureOrder/)
  assert.match(sidebar, /featureLabels/)
  assert.match(mobile, /operationalItems/)
  assert.doesNotMatch(mobile, /key:"incidents"/)
  assert.match(editor, /TESTLAYOUT & ROLRECHTEN OPSLAAN/)
  assert.match(editor, /draggable/)
  assert.match(editor, /Zichtbaar/)
  assert.match(editor, /Bruikbaar/)
  assert.match(topbar, /<option value="admin">Beheerder<\/option>/)
  assert.match(providers, /type TestRole = UiRole \| null/)
  assert.match(roleUi, /"staff" \| "responsible_lead" \| "admin"/)
  assert.match(editor, /testRole === "admin" \? "admin"/)
  assert.match(layout, /const activeUiRole=roles\[0\]/)
  assert.match(layout, /activeUiRole==="admin"\?"admin"/)
  assert.match(sidebar, /featureVisibility/)
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
  assert.match(events, /action=\{assignAvailableCrewShift\}/)
  assert.match(actions, /export async function setEventAvailability/)
  assert.match(actions, /export async function assignAvailableCrewShift/)
})

test('task assignment supports multiple selected staff members and starts with shift', async () => {
  const fields = await read('components/crew/assignment-scope-fields.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')
  const tasks = await read('app/(app)/tasks/page.tsx')

  assert.match(fields, /multiplePeople/)
  assert.match(fields, /type="checkbox" name="user_id"/)
  assert.match(actions, /fd\.getAll\('user_id'\)/)
  assert.match(actions, /for\(const target of rest\)/)
  assert.match(tasks, /hasActiveShift/)
  assert.match(tasks, /Taken zijn beschikbaar vanaf de start van je toegewezen shift\./)
})

test('staff can see only own incidents while managers can manage active-shift incidents', async () => {
  const incidents = await read('app/(app)/incidents/page.tsx')
  const layout = await read('components/layout/app-layout.tsx')

  assert.match(incidents, /manager\?'Incidenten':'Urgent melden'/)
  assert.match(incidents, /'Mijn incidenten'/)
  assert.match(incidents, /incident\.reporter_id===user\.id\|\|incident\.user_id===user\.id/)
  assert.match(incidents, /if\(!isAdmin&&!activeShifts\.length\)redirect\('\/events'\)/)
  assert.match(layout, /profile\?\.role==="staff"\) query=query\.eq\("reporter_id",user\.id\)/)
  assert.match(layout, /showUrgent=.*context\.shiftActive/)
})

test('current brand asset is used on public auth screens', async () => {
  for (const path of [
    'app/(auth)/forgot-password/page.tsx',
    'app/(auth)/signup/page.tsx',
    'app/(auth)/verify-email/verify-email-client.tsx',
    'app/auth/reset-password/page.tsx',
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

test('workplace visibility requires specific shift or responsible assignment', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const page = await read('app/(app)/workplaces/page.tsx')
  const migration = await read('supabase/migrations/20260924180631_uptilldawn_role_layout_shift_chat_media.sql')

  assert.match(layout, /assignedWorkplaceRole=\(shifts\|\|\[\]\)\.length>0\|\|\(responsibleAssignments\|\|\[\]\)\.length>0/)
  assert.match(page, /responsible_assignments/)
  assert.match(page, /shifts/)
  assert.match(migration, /when 'assigned_workplace_role'/)
})

test('event page exposes Geoapify-linked location editing and explicit empty state', async () => {
  const events = await read('app/(app)/events/page.tsx')
  const places = await read('components/events/geoapify-place-fields.tsx')
  const geoapify = await read('lib/geoapify.ts')
  assert.match(events, /GeoapifyPlaceFields/)
  assert.match(events, /Alle informatie bewerken/)
  assert.match(events, /DeleteEventButton/)
  assert.match(events, /Geen evenementen beschikbaar\./)
  assert.match(places, /\/api\/geocode\/autocomplete/)
  assert.match(places, /Open adres in Google Maps/)
  assert.match(places, /GPS-coördinaten/)
  assert.match(geoapify, /api\.geoapify\.com\/v1\/geocode/)
  assert.match(geoapify, /GEOAPIFY_API_KEY/)
})

test('event-scoped tools stop after the event or shift window', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const migration = await read('supabase/migrations/20260924180631_uptilldawn_role_layout_shift_chat_media.sql')

  assert.match(layout, /\.gte\("end_at",nowIso\)/)
  assert.match(layout, /Date\.parse\(s\.scheduled_start\)<=now\.getTime\(\)&&Date\.parse\(s\.scheduled_end\)>=now\.getTime\(\)/)
  assert.match(migration, /'shift_active'/)
  assert.match(migration, /now\(\) between s\.scheduled_start and s\.scheduled_end/)
})

test('post-event app tools redirect back to events for non-admin roles', async () => {
  for (const path of [
    'app/(app)/tasks/page.tsx',
    'app/(app)/briefings/page.tsx',
    'app/(app)/shifts/page.tsx',
    'app/(app)/operations/page.tsx',
    'app/(app)/incidents/page.tsx',
  ]) {
    const text = await read(path)
    assert.match(text, /redirect\('\/events'\)/, path)
  }
})

test('work and pause is visible from event start but actions require an active shift', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const operations = await read('app/(app)/operations/page.tsx')
  const migration = await read('supabase/migrations/20260924181844_uptilldawn_event_start_work_nav_and_shift_enforcement.sql')

  assert.match(layout, /operationalMode=context\.eventActive\|\|previewAll/)
  assert.match(operations, /\.lte\('scheduled_start',now\)/)
  assert.match(operations, /\.gte\('scheduled_end',now\)/)
  assert.match(migration, /condition_key='event_active'/)
  assert.match(migration, /Je dienst is nog niet gestart of is al afgelopen\./)
})

test('chat is restricted to organization and assigned event channels with button-only send', async () => {
  const chat = await read('components/crew/chat-client.tsx')
  const page = await read('app/(app)/chat/page.tsx')
  const migration = await read('supabase/migrations/20260924180631_uptilldawn_role_layout_shift_chat_media.sql')

  assert.match(page, /\.in\('kind',\['organization','event'\]\)/)
  assert.doesNotMatch(page, /private/)
  assert.match(chat, /Enter = nieuwe regel · verzenden gebeurt met de knop\./)
  assert.doesNotMatch(chat, /onKeyDown/)
  assert.match(chat, /cache/)
  assert.match(migration, /now\(\) >= e\.start_at/)
  assert.match(migration, /e\.end_at \+ interval '3 days'/)
})


test('responsible workplace access is read-only and own start approval requires admin', async () => {
  const workplaces = await read('app/(app)/workplaces/page.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')
  const operations = await read('app/(app)/operations/operations-client.tsx')
  const migration = await read('supabase/migrations/20260924211724_uptilldawn_responsible_workplace_readonly_and_admin_time_approval.sql')

  assert.match(workplaces, /isAdmin&&<AdminOnly>[\s\S]*action=\{addWorkplace\}/)
  assert.doesNotMatch(workplaces, /\(isAdmin\|\|isResponsible\).*action=\{addWorkplace\}/)
  assert.match(workplaces, /Alleen-lezen: bekijk per werkplek wie er ingepland is en wie verantwoordelijk is/)
  assert.match(workplaces, /Personeel op deze werkplek/)
  assert.match(actions, /export async function addWorkplace\(fd:FormData\)\{\s*const \{s\}=await adminClient\(\)/)
  const approvedStart = await read('supabase/migrations/20260924212325_uptilldawn_responsible_admin_approved_start.sql')
  assert.match(operations, /p\.isAdmin\|\|c\.user_id!==p\.userId/)
  assert.match(operations, /UREN STARTEN AANVRAGEN/)
  assert.match(operations, /automatisch vanaf de aanvraagtijd/)
  assert.match(migration, /v_requester_role='responsible_lead'/)
  assert.match(migration, /Een verantwoordelijke kan zijn eigen starturen niet goedkeuren/)
  const roleSnapshot = await read('supabase/migrations/20260924212645_uptilldawn_checkin_role_snapshot.sql')
  assert.match(approvedStart, /RESPONSIBLE_WORK_START_APPROVED/)
  assert.match(approvedStart, /insert into public\.work_sessions/)
  assert.match(roleSnapshot, /requested_role/)
  assert.match(roleSnapshot, /coalesce\(v_check_in\.requested_role,public\.upt_effective_role\(v_check_in\.user_id\)\)/)
})
