// ============================================================
// Supabase Admin Client — Service Role
// ONLY used in server-side trusted code (Route Handlers, Server Actions).
// NEVER import this in any client component.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// This client bypasses RLS entirely.
// Use only for admin operations that are explicitly guarded by server-side role checks.
function getAdminClient() {
 if (!url || !serviceKey) throw new Error("Server administrator credentials are not configured")
 return createClient<Database>(url, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
})


}
// Lazy creation prevents unused legacy routes from requiring a service key at build time.
let instance: ReturnType<typeof getAdminClient> | undefined
export const supabaseAdmin = new Proxy({} as ReturnType<typeof getAdminClient>, {
 get(_target, property) {
  instance ??= getAdminClient()
  const value = Reflect.get(instance, property)
  return typeof value === "function" ? value.bind(instance) : value
 }
})
