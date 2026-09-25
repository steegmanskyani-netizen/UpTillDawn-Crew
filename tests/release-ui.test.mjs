import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')


test('normal admin UI is separate from God Mode editing controls', async () => {
  const topbar = await read('components/layout/topbar.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const settings = await read('app/(app)/settings/page.tsx')
  const auth = await read('lib/actions/auth.ts')
  const godPage = await read('app/god-mode/page.tsx')
  const godEditor = await read('components/god-mode/god-mode-editor.tsx')

  assert.doesNotMatch(settings, /AdminEditControls|EDIT MODE|Actieve rol/)
  assert.doesNotMatch(topbar, /editMode|Actieve rol|EDIT MODE/)
  assert.doesNotMatch(sidebar, /editMode|EDIT MODE/)
  assert.match(auth, /email === 'edit@uptilldown'/)
  assert.match(auth, /redirect\('\/god-mode'\)/)
  assert.match(godPage, /GodStudio/)
  assert.match(godEditor, /Admin/)
  assert.match(godEditor, /Personeel/)
  assert.match(godEditor, /Verantwoordelijke/)
  assert.match(godEditor, /AI app-editor/)
})


test('role-driven release navigation uses saved conditions and God Mode ordering', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const sidebar = await read('components/layout/sidebar.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')
  const navigation = await read('components/layout/navigation-items.ts')
  const editor = await read('components/god-mode/god-mode-editor.tsx')
  const api = await read('app/api/god/rules/route.ts')
  const roleUi = await read('lib/role-ui.ts')

  assert.match(layout, /from\("role_ui_rules"\)/)
  assert.match(layout, /feature\("workplaces",Boolean\(isAdmin\)\|\|context\.assignedWorkplaceRole\)/)
  assert.match(layout, /feature\("tasks",Boolean\(isAdmin\)\|\|context\.shiftActive\)/)
  assert.match(layout, /feature\("incidents",isAdmin\?true:context\.shiftActive\)/)
  assert.match(sidebar, /featureOrder/)
  assert.match(sidebar, /featureLabels/)
  assert.match(mobile, /NAV_ITEMS/)
  assert.match(mobile, /featureVisibility/)
  assert.match(navigation, /key:"incidents"/)
  assert.match(editor, /GOD MODE WIJZIGINGEN OPSLAAN/)
  assert.match(editor, /draggable/)
  assert.match(editor, /Zichtbaar/)
  assert.match(editor, /Bruikbaar/)
  assert.match(api, /upt_god_save_role_rules/)
  assert.match(roleUi, /"staff" \| "responsible_lead" \| "admin"/)
  assert.match(layout, /const activeUiRole=roles\[0\]/)
  assert.match(layout, /activeUiRole==="admin"\?"admin"/)
})


test('staff cannot see manager creation controls', async () => {
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

test('future event availability includes event setup and breakdown choices', async () => {
  const events = await read('app/(app)/events/page.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')

  assert.match(events, /name="response" value="can"/)
  assert.match(events, /name="response" value="cannot"/)
  assert.match(events, /name="setup_available" value="yes"/)
  assert.match(events, /name="setup_available" value="no"/)
  assert.match(events, /name="breakdown_available" value="yes"/)
  assert.match(events, /name="breakdown_available" value="no"/)
  assert.match(events, /Beschikbare mensen/)
  assert.match(events, /action=\{assignAvailableCrewShift\}/)
  assert.match(actions, /upt_set_event_availability_extended/)
  assert.match(actions, /shiftKind==='setup'/)
  assert.match(actions, /availability\?\.breakdown_available===true/)
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
  assert.match(layout, /activeUiRole==="employee"/)
  assert.match(layout, /\.eq\("reporter_id",user\.id\)/)
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


test('work and pause follows the QR start window and setup or breakdown shifts', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const operations = await read('app/(app)/operations/page.tsx')
  const roleUi = await read('lib/role-ui.ts')
  const migration = await read('supabase/migrations/20260925105232_god_mode_event_import_shift_windows.sql')

  assert.match(layout, /showOperations=feature\("operations",isAdmin\?true:context\.shiftActive\)/)
  assert.match(operations, /startWindowEnd/)
  assert.match(operations, /windowStart/)
  assert.match(operations, /windowEnd/)
  assert.match(operations, /\.lte\('scheduled_start',startWindowEnd\)/)
  assert.match(operations, /\.gte\('scheduled_end',now\)/)
  assert.match(roleUi, /navRule\("responsible_lead","operations","Mijn werkuren",20,"shift_active"\)/)
  assert.match(migration, /shift_kind in \('event','setup','breakdown'\)/)
  assert.match(migration, /interval '3 days'/)
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


test('responsible workplace access is read-only and QR requests enforce routed approvals', async () => {
  const workplaces = await read('app/(app)/workplaces/page.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')
  const operations = await read('app/(app)/operations/operations-client.tsx')
  const qr = await read('components/crew/qr-shift-request.tsx')
  const migration = await read('supabase/migrations/20260925180617_qr_workflow_completion.sql')

  assert.match(workplaces, /isAdmin&&<AdminOnly>[\s\S]*action=\{addWorkplace\}/)
  assert.doesNotMatch(workplaces, /\(isAdmin\|\|isResponsible\).*action=\{addWorkplace\}/)
  assert.match(workplaces, /Alleen-lezen: bekijk per werkplek wie er ingepland is en wie verantwoordelijk is/)
  assert.match(workplaces, /Personeel op deze werkplek/)
  assert.match(actions, /export async function addWorkplace\(fd:FormData\)\{\s*const \{s\}=await adminClient\(\)/)
  assert.match(operations, /row\.user_id!==p\.userId/)
  assert.match(operations, /STARTUREN AANVRAGEN/)
  assert.match(operations, /Reden bij afwijzing \(verplicht\)/)
  assert.match(qr, /Wend je tot de verantwoordelijke/)
  assert.match(qr, /REMOTE AANVRAAG/)
  assert.match(migration, /reviewer_kind/)
  assert.match(migration, /Reden voor afwijzing is verplicht/)
  assert.match(migration, /insert into public\.work_sessions/)
  assert.match(migration, /time_review_requests/)
  assert.match(migration, /upt_admin_review_early_start/)
})



test('QR attendance cannot be bypassed by legacy direct clock actions', async () => {
  const operations = await read('app/(app)/operations/operations-client.tsx')
  const hardening = await read('supabase/migrations/20260925182046_qr_direct_clock_bypass_hardening.sql')
  const qrPage = await read('app/qr/page.tsx')
  const qrClient = await read('components/crew/qr-shift-request.tsx')
  const qrAsset = await read('public/uptilldawn-crew-qr.svg')
  const login = await read('app/(auth)/login/page.tsx')
  const returnAfterLogin = await read('components/auth/return-after-login.tsx')
  const appLayout = await read('app/(app)/layout.tsx')

  assert.match(qrPage, /redirect\('\/login\?next=\/qr'\)/)
  assert.match(qrPage, /profile\?\.approved/)
  assert.match(qrClient, /upt_qr_request/)
  assert.match(qrClient, /REMOTE AANVRAAG/)
  assert.match(operations, /href="\/qr"/)
  assert.doesNotMatch(operations, /stop_work/)
  assert.doesNotMatch(operations, /start_work/)
  assert.match(hardening, /Direct werk starten is uitgeschakeld/)
  assert.match(hardening, /Direct werk stoppen is uitgeschakeld/)
  assert.match(hardening, /revoke all on function public\.upt_start_work/)
  assert.match(qrAsset, /viewBox="0 0 37 37"/)
  assert.match(login, /uptilldawn-return-after-login/)
  assert.match(returnAfterLogin, /sessionStorage\.getItem\('uptilldawn-return-after-login'\)/)
  assert.match(returnAfterLogin, /router\.replace\(target\)/)
  assert.match(appLayout, /<ReturnAfterLogin\/>/)
})

test('admin approvals and work-hours navigation remain accessible', async () => {
  const layout = await read('components/layout/app-layout.tsx')
  const admin = await read('app/(app)/admin/page.tsx')
  assert.match(layout, /adminOperationsRoute=Boolean\(isAdmin&&pathname\.startsWith\("\/operations"\)\)/)
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
  const editor = await read('components/god-mode/god-mode-editor.tsx')
  const layout = await read('components/layout/app-layout.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')

  assert.match(roleUi, /ROLE_UI_DEFAULTS/)
  assert.match(roleUi, /navRule\("admin","operations","Werkuren",30\)/)
  assert.match(roleUi, /navRule\("responsible_lead","operations","Mijn werkuren",20,"shift_active"\)/)
  assert.match(roleUi, /navRule\("staff","operations","Mijn werkuren",20,"shift_active"\)/)
  assert.match(roleUi, /navRule\("staff","shifts","Mijn shift's",40,"assigned_event"\)/)
  assert.match(roleUi, /navRule\("staff","workplaces","Werkplekken",60,"assigned_event"\)/)
  assert.match(roleUi, /navRule\("admin","shifts","Shift's",40\)/)
  assert.match(roleUi, /navRule\("admin","briefings","Briefing",70\)/)
  assert.match(roleUi, /navRule\("admin","chat","Chat's",90\)/)
  assert.match(roleUi, /navRule\("responsible_lead","incidents","Help",100,"shift_active"\)/)
  assert.match(roleUi, /navRule\("staff","chat","Chat's",80\)/)
  assert.match(editor, /Standaard laden/)
  assert.match(editor, /getDefaultRoleUiRules\(role\)/)
  assert.match(layout, /effectiveRules=rules\.length\?rules:defaultRules/)
  assert.match(mobile, /getDefaultRoleUiLabel\(roleKey,item\.key,item\.label\)/)
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



test('God Mode contains isolated role tabs session exit and free AI app editor', async () => {
  const editor = await read('components/god-mode/god-mode-editor.tsx')
  const page = await read('app/god-mode/page.tsx')
  const route = await read('app/api/edit-assistant/route.ts')
  const rulesApi = await read('app/api/god/rules/route.ts')
  const wrangler = await read('wrangler.jsonc')
  const env = await read('.env.example')

  assert.match(editor, /Admin/)
  assert.match(editor, /Personeel/)
  assert.match(editor, /Verantwoordelijke/)
  assert.match(editor, /God Mode afsluiten/)
  assert.match(editor, /AI app-editor/)
  assert.match(editor, /GOD MODE WIJZIGINGEN OPSLAAN/)
  assert.match(page, /uptilldawn-god-session/)
  assert.match(page, /upt_god_session_valid/)
  assert.match(rulesApi, /upt_god_role_rules/)
  assert.match(rulesApi, /upt_god_save_role_rules/)
  assert.match(route, /uptilldawn-god-session/)
  assert.match(route, /getCloudflareContext/)
  assert.match(route, /@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast/)
  assert.match(route, /response_format/)
  assert.match(route, /json_schema/)
  assert.match(wrangler, /"ai": \{ "binding": "AI" \}/)
  assert.doesNotMatch(route, /OPENAI_API_KEY|api\.openai\.com/)
  assert.doesNotMatch(env, /OPENAI_API_KEY/)
})

test('mobile navigation uses role and shift specific quick tabs with expandable drawer', async () => {
  const navigation = await read('components/layout/navigation-items.ts')
  const sidebar = await read('components/layout/sidebar.tsx')
  const mobile = await read('components/layout/mobile-nav.tsx')
  const topbar = await read('components/layout/topbar.tsx')
  const layout = await read('components/layout/app-layout.tsx')

  assert.match(sidebar, /NAV_ITEMS/)
  assert.match(mobile, /NAV_ITEMS/)
  assert.match(mobile, /ASSIGNED_EVENT_KEYS=\["events","briefings","shifts","workplaces"\]/)
  assert.match(mobile, /STAFF_ACTIVE_SHIFT_KEYS=\["operations","shifts","briefings","tasks"\]/)
  assert.match(mobile, /RESPONSIBLE_ACTIVE_SHIFT_KEYS=\["operations","shifts","workplaces","incidents"\]/)
  assert.match(mobile, /assignedEvent/)
  assert.match(mobile, /shiftActive/)
  assert.match(mobile, /compactItems=contextualItems\.length\?contextualItems:fallbackItems/)
  assert.match(mobile, /items\.slice\(0,3\)/)
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
  assert.match(layout, /assignedEvent=\{context\.assignedEvent\}/)
  assert.match(layout, /shiftActive=\{context\.shiftActive\}/)

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


test('responsible overview shows live workplace personnel timers', async () => {
  const dashboard = await read('app/(app)/page.tsx')
  const live = await read('components/responsible/responsible-live-personnel.tsx')

  assert.match(dashboard, /responsible_assignments/)
  assert.match(dashboard, /upt_responsible_crew_directory/)
  assert.match(dashboard, /work_sessions/)
  assert.match(dashboard, /break_sessions/)
  assert.match(dashboard, /Personeel van mijn werkplek/)
  assert.match(dashboard, /ResponsibleLivePersonnel/)
  assert.match(live, /PAUZE/)
  assert.match(live, /WERKT/)
  assert.match(live, /Pauzetimer/)
  assert.match(live, /Werktimer/)
  assert.match(live, /router\.refresh\(\)/)
})


test('staff overview shows workplace personnel status without timers', async () => {
  const dashboard = await read('app/(app)/page.tsx')
  const status = await read('components/crew/staff-workplace-personnel.tsx')
  const migration = await read('supabase/migrations/20260925060751_uptilldawn_staff_workplace_live_status.sql')

  assert.match(dashboard, /upt_staff_workplace_live_status/)
  assert.match(dashboard, /StaffWorkplacePersonnel/)
  assert.match(dashboard, /current\.role==='staff'/)
  assert.match(status, /WERKT/)
  assert.match(status, /PAUZE/)
  assert.match(status, /router\.refresh\(\)/)
  assert.doesNotMatch(status, /Werktimer|Pauzetimer|formatDigital|setInterval\([^)]*1000/)
  assert.match(migration, /public\.upt_effective_role\(auth\.uid\(\)\)='staff'/)
  assert.match(migration, /revoke all on function public\.upt_staff_workplace_live_status\(\) from anon/)
  assert.match(migration, /grant execute on function public\.upt_staff_workplace_live_status\(\) to authenticated/)
})


test('admin can turn a workplace responsible back into staff', async () => {
  const workplaces = await read('app/(app)/workplaces/page.tsx')
  const actions = await read('lib/actions/uptilldawn.ts')

  assert.match(workplaces, /demoteResponsibleToStaff/)
  assert.match(workplaces, /PERSONEEL MAKEN/)
  assert.match(workplaces, /person\.role==='responsible_lead'/)
  assert.match(actions, /export async function demoteResponsibleToStaff/)
  assert.match(actions, /from\('responsible_assignments'\)[\s\S]*\.delete\(\)/)
  assert.match(actions, /event_role:'employee'/)
  assert.match(actions, /p_role:'staff'/)
  assert.match(actions, /!allAssignments\?\.length/)
  assert.match(actions, /Een beheerder kan hier niet naar personeel worden omgezet\./)
})


test('installed PWA supports background updates and web push', async () => {
  const manifest = await read('app/manifest.ts')
  const sw = await read('public/sw.js')
  const register = await read('components/pwa-register.tsx')
  const prompt = await read('components/push-permission-prompt.tsx')
  const settings = await read('components/push-notification-settings.tsx')
  const client = await read('lib/push-client.ts')
  const configRoute = await read('app/api/push/config/route.ts')
  const subscriptionRoute = await read('app/api/push/subscription/route.ts')
  const migration = await read('supabase/migrations/20260925062147_uptilldawn_web_push_pwa.sql')
  const timeoutCleanup = await read('supabase/migrations/20260925065915_uptilldawn_push_delivery_timeout_cleanup.sql')
  const edge = await read('supabase/functions/push-notification/index.ts')

  assert.match(manifest, /id:'\/'/)
  assert.match(manifest, /display:'standalone'/)
  assert.match(sw, /addEventListener\('push'/)
  assert.match(sw, /showNotification/)
  assert.match(sw, /notificationclick/)
  assert.match(sw, /pushsubscriptionchange/)
  assert.match(sw, /periodicsync/)
  assert.match(sw, /uptilldawn-app-refresh/)
  assert.match(register, /updateViaCache:"none"/)
  assert.match(register, /periodicSync/)
  assert.match(register, /registration\.update\(\)/)
  assert.match(prompt, /TOESTAAN/)
  assert.match(settings, /PUSHMELDINGEN INSCHAKELEN/)
  assert.match(client, /Notification\.requestPermission\(\)/)
  assert.match(client, /pushManager\.subscribe/)
  assert.match(client, /applicationServerKey/)
  assert.match(configRoute, /upt_push_public_key/)
  assert.match(subscriptionRoute, /upt_save_push_subscription/)
  assert.match(subscriptionRoute, /upt_remove_push_subscription/)
  assert.match(migration, /create extension if not exists pg_net/)
  assert.match(migration, /create table if not exists public\.push_subscriptions/)
  assert.match(migration, /crew_notifications_push_dispatch/)
  assert.doesNotMatch(migration, /insert into upt_private\.push_delivery_config/)
  assert.match(timeoutCleanup, /timeout_milliseconds := 10000/)
  assert.match(edge, /npm:web-push@3\.6\.7/)
  assert.match(edge, /webpush\.sendNotification/)
  assert.match(edge, /x-upt-push-secret/)
})


test('server admin routes honor permanent maker/admin privilege', async () => {
  const geocode = await read('app/api/geocode/autocomplete/route.ts')
  const exportRoute = await read('app/api/uptilldawn/export/route.ts')

  for (const source of [geocode, exportRoute]) {
    assert.match(source, /upt_is_approved/)
    assert.match(source, /upt_is_admin/)
    assert.doesNotMatch(source, /profile\.role\s*!==?\s*['"]admin['"]/)
  }
})


test('first launch follows device language while explicit choice remains authoritative', async () => {
  const locale = await read('components/locale-sync.tsx')
  const switcher = await read('components/language-switcher.tsx')

  assert.match(locale, /navigator\.languages/)
  assert.match(locale, /storedLocale \|\| deviceLocale\(\)/)
  assert.match(locale, /localStorage\.setItem\("uptilldawn-language", locale\)/)
  assert.match(switcher, /navigator\.languages/)
  assert.match(switcher, /stored === "nl" \|\| stored === "fr" \|\| stored === "en"/)
})

test('permanent admin login portal selects the matching visible role mode', async () => {
  const auth = await read('lib/actions/auth.ts')

  assert.match(auth, /requestedPortal === 'responsible'[\s\S]*hasPermanentAdminAccess/)
  assert.match(auth, /requestedRoleMode/)
  assert.match(auth, /requestedPortal === 'admin'[\s\S]*'admin'/)
  assert.match(auth, /requestedPortal === 'responsible'[\s\S]*'responsible_lead'/)
  assert.match(auth, /: 'staff'/)
  assert.match(auth, /upt_set_admin_role_mode/)
})


test('push is scoped to the authenticated account and removed before logout', async () => {
  const topbar = await read('components/layout/topbar.tsx')
  const prompt = await read('components/push-permission-prompt.tsx')
  const register = await read('components/pwa-register.tsx')
  const push = await read('lib/push-client.ts')

  assert.match(topbar, /disablePushNotifications/)
  assert.match(topbar, /await disablePushNotifications\(\)/)
  assert.match(topbar, /await signOut\(\)/)
  assert.ok(topbar.indexOf('await disablePushNotifications()') < topbar.indexOf('await signOut()'))
  assert.match(prompt, /canPrompt/)
  assert.match(prompt, /user&&profile\?\.approved/)
  assert.match(register, /canUsePush/)
  assert.match(register, /user&&profile\?\.approved/)
  assert.match(push, /upt\/push\/subscription|\/api\/push\/subscription/)
  assert.match(push, /subscription\.unsubscribe\(\)/)
})

test('language switcher hydrates safely before applying stored or device locale', async () => {
  const switcher = await read('components/language-switcher.tsx')
  assert.match(switcher, /useState\("nl"\)/)
  assert.match(switcher, /useEffect\(\(\) =>/)
  assert.match(switcher, /navigator\.languages/)
})


test('expired or missing auth also drops the local push endpoint', async () => {
  const register = await read('components/pwa-register.tsx')
  const push = await read('lib/push-client.ts')

  assert.match(register, /loading/)
  assert.match(register, /!loading&&!canUsePush/)
  assert.match(register, /clearLocalPushSubscription/)
  assert.match(push, /export async function clearLocalPushSubscription/)
  assert.match(push, /pushManager\.getSubscription\(\)/)
  assert.match(push, /subscription\.unsubscribe\(\)/)
})


test('push endpoints are HTTPS-only and private-network targets are rejected', async () => {
  const subscriptionRoute = await read('app/api/push/subscription/route.ts')
  const edge = await read('supabase/functions/push-notification/index.ts')
  const migration = await read('supabase/migrations/20260925080357_uptilldawn_push_endpoint_hardening.sql')

  assert.match(subscriptionRoute, /safePushEndpoint/)
  assert.match(subscriptionRoute, /url\.protocol!=="https:"/)
  assert.match(subscriptionRoute, /192&&b===168/)
  assert.match(edge, /safePushEndpoint\(sub\.endpoint\)/)
  assert.match(edge, /remove unsafe endpoint/)
  assert.match(migration, /not like 'https:\/\/%'/)
})


test('notification links cannot escape the app origin', async () => {
  const notifications = await read('app/(app)/notifications/page.tsx')
  const sw = await read('public/sw.js')
  const edge = await read('supabase/functions/push-notification/index.ts')

  assert.match(notifications, /!value\.startsWith\('\/\/'\)/)
  assert.match(notifications, /safeLink && <Link href=\{safeLink\}/)
  assert.match(sw, /function safeLocalPath/)
  assert.match(sw, /!value\.startsWith\('\/\/'\)/)
  assert.match(edge, /function safeNotificationLink/)
  assert.match(edge, /link:safeNotificationLink\(notification\.link\)/)
})



test('role-scoped incidents overview and badges follow the active login role', async () => {
  const incidents = await read('app/(app)/incidents/page.tsx')
  const overview = await read('app/(app)/page.tsx')
  const layout = await read('components/layout/app-layout.tsx')

  assert.match(incidents, /activeWorkplaceIds/)
  assert.match(incidents, /isResponsible.*incident\.workplace_id/s)
  assert.doesNotMatch(incidents, /return isAdmin\|\|manager\|\|/)

  assert.match(overview, /activeResponsibleWorkplaces/)
  assert.match(overview, /incident\.workplace_id/)
  assert.match(overview, /responsibleAssignmentsResult/)

  assert.match(layout, /activeUiRole==="admin"/)
  assert.match(layout, /activeResponsibleWorkplaceIds/)
  assert.match(layout, /allowedChannelIds/)
  assert.match(layout, /\.eq\("reporter_id",user\.id\)/)
  assert.doesNotMatch(layout, /profile\?\.role==="staff"/)
})


test('God Mode database writes require a private expiring session token', async () => {
  const actions = await read('lib/actions/god-mode.ts')
  const api = await read('app/api/god/rules/route.ts')
  const schema = await read('supabase/migrations/20260925105232_god_mode_event_import_shift_windows.sql')
  const exclusive = await read('supabase/migrations/20260925105642_god_mode_exclusive_editor_and_info_admin_bootstrap.sql')

  assert.match(schema, /god_mode_sessions/)
  assert.match(schema, /token_hash bytea primary key/)
  assert.match(schema, /interval '2 hours'/)
  assert.match(schema, /failed_attempts/)
  assert.match(schema, /v_failed>=5/)
  assert.match(schema, /interval '15 minutes'/)
  assert.match(schema, /upt_god_save_role_rules/)
  assert.match(exclusive, /drop policy if exists role_ui_rules_admin_update/)
  assert.match(exclusive, /drop function if exists public\.upt_verify_admin_edit_code/)
  assert.match(actions, /httpOnly:true/)
  assert.match(actions, /sameSite:'strict'/)
  assert.match(api, /p_token:session/)
})

test('AI editor rejects cross-site POST requests', async () => {
  const route = await read('app/api/edit-assistant/route.ts')
  assert.match(route, /sec-fetch-site/)
  assert.match(route, /fetchSite==="cross-site"/)
  assert.match(route, /origin&&origin!==new URL\(request\.url\)\.origin/)
  assert.match(route, /Ongeldige oorsprong/)
})


test('non-admin role views filter admin-broad event reads to real role visibility', async () => {
  const events = await read('app/(app)/events/page.tsx')
  const dashboard = await read('app/(app)/page.tsx')

  assert.match(events, /visibleEvents=user\.isAdmin/)
  assert.match(events, /future\|\|assigned/)
  assert.match(events, /responsibleResult/)
  assert.match(events, /visibleEvents\.map/)
  assert.match(dashboard, /const rawEvents = eventsResult\.data \|\| \[\]/)
  assert.match(dashboard, /assignedEventIds/)
  assert.match(dashboard, /Date\.parse\(event\.start_at\)>nowMs\|\|assignedEventIds\.has\(event\.id\)/)
})


test('canonical production origin exposes public SEO surface without indexing private app routes', async () => {
  const layout = await read('app/layout.tsx')
  const authLayout = await read('app/(auth)/layout.tsx')
  const robots = await read('app/robots.ts')
  const sitemap = await read('app/sitemap.ts')
  const edge = await read('supabase/functions/push-notification/index.ts')

  assert.match(layout, /https:\/\/crew\.uptilldawn\.workers\.dev/)
  assert.match(layout, /metadataBase/)
  assert.match(authLayout, /robots: \{ index: true, follow: true \}/)
  assert.match(robots, /crew\.uptilldawn\.workers\.dev\/sitemap\.xml/)
  assert.match(robots, /'\/admin'/)
  assert.match(robots, /'\/api\/'/)
  assert.match(sitemap, /crew\.uptilldawn\.workers\.dev/)
  assert.match(sitemap, /\/login/)
  assert.match(edge, /https:\/\/crew\.uptilldawn\.workers\.dev/)
})


test('QR attendance owns start and stop while offline queue keeps only supported time actions', async () => {
  const queue = await read('lib/crew-queue.ts')
  const operations = await read('app/(app)/operations/operations-client.tsx')
  const syncCenter = await read('components/crew/sync-center.tsx')

  assert.match(queue, /RETIRED_CLOCK_ERROR/)
  assert.match(queue, /op\.type === 'start_work' \|\| op\.type === 'stop_work'/)
  assert.match(queue, /Start- en stopuren kunnen niet offline worden gestart/)
  assert.doesNotMatch(operations, /work\('start_work'/)
  assert.doesNotMatch(operations, /work\('stop_work'/)
  assert.match(operations, /href="\/qr"/)
  assert.match(syncCenter, /Start- en stopuren verlopen via QR/)
})
