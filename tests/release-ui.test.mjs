import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('admin role switch and edit mode controls are gated inside settings', async () => {
  const providers = await read('lib/providers.tsx')
  const topbar = await read('components/layout/topbar.tsx')
  const controls = await read('components/settings/admin-edit-controls.tsx')
  const settings = await read('app/(app)/settings/page.tsx')
  const auth = await read('lib/actions/auth.ts')

  assert.match(providers, /upt_set_admin_role_mode/)
  assert.match(providers, /editMode/)
  assert.match(controls, /verifyAdminSettingsCode/)
  assert.match(controls, /aria-label="Actieve rol"/)
  assert.match(controls, /<option value="admin">/)
  assert.match(controls, /<option value="employee">/)
  assert.match(controls, /<option value="responsible_lead">/)
  assert.match(controls, /EDIT MODE ACTIVEREN/)
  assert.match(settings, /<AdminEditControls \/>/)
  assert.match(auth, /verifyAdminSettingsCode/)
  assert.match(auth, /code !== '2315'/)
  assert.doesNotMatch(controls, /2315/)
  assert.doesNotMatch(topbar, /aria-label="Actieve rol"/)
  assert.doesNotMatch(topbar, /EDIT MODE ACTIVEREN/)
  assert.match(auth, /upt_current_effective_role/)
})

test('role-driven release navigation uses saved conditions and ordering', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')
  const navigation = await read('components/layout/navigation-items.ts')
  const editor = await read('components/layout/edit-mode-editor.tsx')
  const controls = await read('components/settings/admin-edit-controls.tsx')
  const providers = await read('lib/providers.tsx')
  const roleUi = await read('lib/role-ui.ts')

  assert.match(layout, /from\("role_ui_rules"\)/)
  assert.match(layout, /feature\("workplaces",Boolean\(isAdmin&&!editMode\)\|\|context\.assignedWorkplaceRole\)/)
  assert.match(layout, /feature\("tasks",Boolean\(isAdmin&&!editMode\)\|\|context\.shiftActive\)/)
  assert.match(layout, /feature\("incidents",isAdmin\?true:context\.shiftActive\)/)
  assert.match(sidebar, /featureOrder/)
  assert.match(sidebar, /featureLabels/)
  assert.match(mobile, /NAV_ITEMS/)
  assert.match(mobile, /featureVisibility/)
  assert.match(navigation, /key:"incidents"/)
  assert.match(editor, /EDITLAYOUT & ROLRECHTEN OPSLAAN/)
  assert.match(editor, /draggable/)
  assert.match(editor, /Zichtbaar/)
  assert.match(editor, /Bruikbaar/)
  assert.match(controls, /<option value="admin">/)
  assert.match(providers, /type EditRole = UiRole \| null/)
  assert.match(roleUi, /"staff" \| "responsible_lead" \| "admin"/)
  assert.match(editor, /editRole === "admin" \? "admin"/)
  assert.match(layout, /const activeUiRole=roles\[0\]/)
  assert.match(layout, /activeUiRole==="admin"\?"admin"/)
  assert.match(sidebar, /featureVisibility/)
})

test('staff cannot see manager creation controls in edit mode', async () => {
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

  assert.match(incidents, /manager\?'Help':'Urgent melden'/)
  assert.match(incidents, /'Mijn help oproepen'/)
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

test('chat includes organization, event and authorized workplace channels with button-only send', async () => {
  const chat = await read('components/crew/chat-client.tsx')
  const page = await read('app/(app)/chat/page.tsx')
  const migration = await read('supabase/migrations/20260924213600_uptilldawn_workplace_task_and_chat_scope.sql')

  assert.match(page, /\.in\('kind',\['organization','event','workplace'\]\)/)
  assert.doesNotMatch(page, /private/)
  assert.match(chat, /Werkplekken/)
  assert.match(chat, /workplaceChannels/)
  assert.match(chat, /Enter = nieuwe regel · verzenden gebeurt met de knop\./)
  assert.doesNotMatch(chat, /onKeyDown/)
  assert.match(chat, /cache/)
  assert.match(migration, /c\.kind='workplace'/)
  assert.match(migration, /upt_is_responsible\(c\.event_id,c\.workplace_id,auth\.uid\(\)\)/)
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


test('admin approvals and work-hours navigation remain accessible', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const admin = await read('app/(app)/admin/page.tsx')
  assert.match(layout, /adminOperationsRoute=Boolean\(isAdmin&&!editMode&&pathname\.startsWith\("\/operations"\)\)/)
  assert.match(layout, /showOperations=feature\("operations",isAdmin\?true:context\.shiftActive\)/)
  assert.match(admin, /Goedkeuringen openen/)
  assert.match(admin, /Lopende diensten & pauzes/)
  assert.doesNotMatch(admin, /Snelle beheerlinks/)
})

test('responsible task creation is restricted to assigned workplace', async () => {
  const tasks = await read('app/(app)/tasks/page.tsx')
  const fields = await read('components/crew/assignment-scope-fields.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')
  const migration = await read('supabase/migrations/20260924213600_uptilldawn_workplace_task_and_chat_scope.sql')

  assert.match(tasks, /from\('responsible_assignments'\)/)
  assert.match(tasks, /p_workplace: assignment\.workplace_id/)
  assert.match(tasks, /workplaceRequired=\{!isAdmin\}/)
  assert.match(fields, /workplaceRequired\?'Werkplek…':'Geheel evenement'/)
  assert.match(actions, /Je kunt alleen taken beheren binnen je eigen toegewezen werkplek\./)
  assert.match(actions, /Selecteer alleen personeel dat aan jouw werkplek is toegewezen\./)
  assert.match(migration, /p_workplace is not null[\s\S]*upt_is_responsible\(p_event,p_workplace,auth\.uid\(\)\)/)
})


test('admin live personnel and running shift cards use digital clocks and workplace sorting', async () => {
  const admin = await read('app/(app)/admin/page.tsx')
  const timers = await read('components/admin/live-operations-timers.tsx')
  assert.match(admin, /AdminActivePersonnel/)
  assert.match(admin, /AdminRunningShifts/)
  assert.match(admin, /responsibleKeys/)
  assert.match(timers, /localeCompare\(b\.name,'nl'\)/)
  assert.match(timers, /Number\(b\.isResponsible\)-Number\(a\.isResponsible\)/)
  assert.match(timers, /WERK/)
  assert.match(timers, /PAUZE/)
  assert.match(timers, /Startuur/)
  assert.match(timers, /font-mono/)
})

test('personal work screen uses live work and pause clocks without payable metric', async () => {
  const operations = await read('app/(app)/operations/operations-client.tsx')
  assert.match(operations, /LiveWorkSummary/)
  assert.match(operations, /formatDigital/)
  assert.match(operations, /Resterend tegoed/)
  assert.doesNotMatch(operations, /Betaalbaar:/)
  assert.doesNotMatch(operations, /net_payable_seconds/)
})


test('admin dashboard includes active responsible assignment even when underlying profile role is admin', async () => {
  const admin = await read('app/(app)/admin/page.tsx')
  assert.match(admin, /const isResponsible=responsibleKeys\.has/)
  assert.match(admin, /const isOperationalPerson=isResponsible\|\|person\.role==='staff'\|\|person\.role==='responsible_lead'/)
  assert.match(admin, /isResponsible\|\|person\?\.role==='staff'\|\|person\?\.role==='responsible_lead'/)
})


test('active personnel cards show identity only while running shifts keep timers and status', async () => {
  const timers = await read('components/admin/live-operations-timers.tsx')
  const activeSection = timers.slice(timers.indexOf('export function AdminActivePersonnel'), timers.indexOf('export function AdminRunningShifts'))
  const runningSection = timers.slice(timers.indexOf('export function AdminRunningShifts'))
  assert.match(activeSection, /person\.name/)
  assert.match(activeSection, /person\.role/)
  assert.match(activeSection, /person\.title/)
  assert.doesNotMatch(activeSection, /formatDigital/)
  assert.doesNotMatch(activeSection, /PAUZE/)
  assert.doesNotMatch(activeSection, /WERK/)
  assert.match(runningSection, /formatDigital/)
  assert.match(runningSection, /shift\.status/)
})


test('work hours navigation labels are role-specific', async () => {
  const sidebar = await read('components/layout/sidebar.tsx')
  const navigation = await read('components/layout/navigation-items.ts')
  const layout = await read('components/layout/app-layout.tsx')
  assert.match(navigation, /label:"Mijn werkuren"/)
  assert.match(navigation, /roles:\["employee","responsible_lead","admin"\]/)
  assert.match(sidebar, /getDefaultRoleUiLabel\(roleKey,i\.key,i\.label\)/)
  assert.match(layout, /showOperations=feature\("operations",isAdmin\?true:context\.shiftActive\)/)
})


test('admin help navigation and help calls are accessible and consistently named', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const admin = await read('app/(app)/admin/page.tsx')
  const incidents = await read('app/(app)/incidents/page.tsx')

  assert.match(layout, /showIncidents=feature\("incidents",isAdmin\?true:context\.shiftActive\)/)
  assert.match(sidebar, /getDefaultRoleUiLabel\(roleKey,i\.key,i\.label\)/)
  assert.match(admin, /<Stat href="\/incidents" label="Open help oproepen"/)
  assert.match(admin, /<h2 className="text-xl font-bold">Open help oproepen<\/h2>/)
  assert.match(incidents, /manager\?'Help':'Urgent melden'/)
  assert.match(incidents, /manager\?'Open help oproepen':'Mijn help oproepen'/)
})


test('current production role UI is the canonical default baseline', async () => {
  const roleUi = await read('lib/role-ui.ts')
  const editor = await read('components/layout/edit-mode-editor.tsx')
  const layout = await read('components/layout/app-layout.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')

  assert.match(roleUi, /ROLE_UI_DEFAULTS/)
  assert.match(roleUi, /navRule\("admin","operations","Werkuren",30\)/)
  assert.match(roleUi, /navRule\("responsible_lead","operations","Mijn werkuren",20,"event_active"\)/)
  assert.match(roleUi, /navRule\("staff","operations","Mijn werkuren",20,"shift_active"\)/)
  assert.match(roleUi, /navRule\("staff","shifts","Mijn shift's",40,"assigned_event"\)/)
  assert.match(roleUi, /navRule\("staff","workplaces","Werkplekken",60,"assigned_workplace_role",false,false\)/)
  assert.match(roleUi, /navRule\("admin","shifts","Shift's",40\)/)
  assert.match(roleUi, /navRule\("admin","briefings","Briefing",70\)/)
  assert.match(roleUi, /navRule\("admin","chat","Chat's",90\)/)
  assert.match(roleUi, /navRule\("responsible_lead","incidents","Help",100,"shift_active"\)/)
  assert.match(roleUi, /navRule\("staff","chat","Chat's",80\)/)
  assert.match(editor, /STANDAARD LADEN/)
  assert.match(editor, /getDefaultRoleUiRules\(role\)/)
  assert.match(layout, /effectiveRules=rules\.length\?rules:defaultRules/)
  assert.match(mobile, /getDefaultRoleUiLabel\(roleKey,i\.key,i\.label\)/)
})

test('maker account keeps permanent admin privilege independent of visible status', async () => {
  const auth = await read('lib/actions/auth.ts')
  const providers = await read('lib/providers.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')
  const migration = await read('supabase/migrations/20260924232314_uptilldawn_immutable_app_owner.sql')

  assert.match(auth, /upt_current_is_owner/)
  assert.match(auth, /hasPermanentAdminAccess/)
  assert.match(auth, /requestedPortal === 'admin'[\s\S]*upt_set_admin_role_mode/)
  assert.match(auth, /realIsAdmin: hasPermanentAdminAccess/)
  assert.match(providers, /isOwner/)
  assert.match(providers, /profile\?\.role === "admin" \|\| isOwner/)
  assert.match(actions, /upt_is_admin/)
  assert.match(migration, /upt_private\.app_owners/)
  assert.match(migration, /on delete restrict/)
  assert.match(migration, /upt_private\.is_app_owner\(uid\)[\s\S]*public\.upt_effective_role\(uid\)='admin'/)
  assert.match(migration, /Het maker-account kan niet worden gedeactiveerd\./)
  assert.match(migration, /before update or delete on public\.profiles/)
  assert.match(migration, /before update or delete on upt_private\.app_owners/)
  assert.match(migration, /Owner identity is environment data and is intentionally not hard-coded here\./)
})


test('edit mode contains role tabs, exit control and owner-only free AI app editor', async () => {
  const editor = await read('components/layout/edit-mode-editor.tsx')
  const route = await read('app/api/edit-assistant/route.ts')
  const wrangler = await read('wrangler.jsonc')
  const env = await read('.env.example')

  assert.match(editor, /aria-label="Edit rol"/)
  assert.match(editor, /Admin/)
  assert.match(editor, /Personeel/)
  assert.match(editor, /Verantwoordelijke/)
  assert.match(editor, /setEditRole/)
  assert.match(editor, /EDIT MODE AFSLUITEN/)
  assert.match(editor, /setEditMode\(false\)/)
  assert.match(editor, /AI app-editor/)
  assert.match(editor, /isOwner&&/)
  assert.match(editor, /WIJZIGING/)
  assert.match(route, /upt_current_is_owner/)
  assert.match(route, /getCloudflareContext/)
  assert.match(route, /@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast/)
  assert.match(route, /response_format/)
  assert.match(route, /json_schema/)
  assert.match(wrangler, /"ai": \{ "binding": "AI" \}/)
  assert.doesNotMatch(route, /OPENAI_API_KEY|api\.openai\.com/)
  assert.doesNotMatch(env, /OPENAI_API_KEY/)
  assert.doesNotMatch(editor, /OPENAI_API_KEY/)
})


test('mobile navigation uses a maximum-three compact view with expandable drawer', async () => {
  const navigation = await read('components/layout/navigation-items.ts')
  const sidebar = await read('components/layout/sidebar.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')
  const topbar = await read('components/layout/topbar.tsx')
  const layout = await read('components/layout/app-layout.tsx')

  assert.match(sidebar, /NAV_ITEMS/)
  assert.match(mobile, /NAV_ITEMS/)
  assert.match(mobile, /compactItems/)
  assert.match(mobile, /items\.slice\(0,3\)/)
  assert.match(mobile, /items\.slice\(-3\)/)
  assert.match(mobile, /items\.slice\(activeIndex-1,activeIndex\+2\)/)
  assert.match(mobile, /ChevronUp/)
  assert.match(mobile, /ChevronDown/)
  assert.match(mobile, /aria-expanded=\{expanded\}/)
  assert.match(mobile, /bottom-full/)
  assert.match(mobile, /max-h-\[60dvh\]/)
  assert.doesNotMatch(mobile, /overflow-x-auto|snap-x|touch-pan-x|scrollIntoView/)
  assert.match(topbar, /up-till-dawn-mark\.webp/)
  assert.match(topbar, /md:hidden/)
  assert.match(layout, /chatMissed=\{chatMissed\}/)
  assert.match(layout, /incidentMissed=\{incidentMissed\}/)

  const expectedOrder = [
    '"overview"',
    '"operations"',
    '"events"',
    '"workplaces"',
    '"shifts"',
    '"briefings"',
    '"tasks"',
    '"chat"',
    '"crew"',
    '"incidents"',
    '"exports"',
    '"personnel"',
    '"settings"',
  ]
  let last = -1
  for (const key of expectedOrder) {
    const index = navigation.indexOf(`key:${key}`)
    assert.ok(index > last, `${key} must preserve desktop navigation order`)
    last = index
  }
})


test('authenticated users open the overview for their active role', async () => {
  const dashboard = await read('app/(app)/page.tsx')
  const auth = await read('lib/actions/auth.ts')
  const admin = await read('app/(app)/admin/page.tsx')

  assert.match(dashboard, /if \(current\.isAdmin\) redirect\('\/admin'\)/)
  assert.match(auth, /redirect\(requestedPortal === 'admin' \? '\/admin' : '\/'\)/)
  assert.doesNotMatch(auth, /requestedPortal === 'responsible'[\s\S]{0,120}'\/operations'/)
  assert.match(admin, /if\(!current\?\.isAdmin\) redirect\('\/'\)/)
})
