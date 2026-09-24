// ============================================================
// Supabase Client — Browser (Client Components)
// Uses the anon key only. RLS enforced by Supabase.
// ============================================================

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/crew-database'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createBrowserClient<Database>(url, anonKey)
}
