import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const missingSupabaseClientEnv = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : '',
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : '',
].filter(Boolean)

export function getSupabaseConfigurationMessage() {
  if (isSupabaseConfigured) return ''
  if (import.meta.env.DEV) return `Missing browser Supabase configuration: ${missingSupabaseClientEnv.join(', ')}.`
  return 'Application database connection is not configured.'
}

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(getSupabaseConfigurationMessage())
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null
