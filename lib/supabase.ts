import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export interface OrganizationRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface DoorProjectRow {
  id: string;
  organization_id: string;
  name: string;
  configuration: unknown;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isConfigured(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const supabase: SupabaseClient | null =
  isConfigured(supabaseUrl) && isConfigured(supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isDemoMode = supabase === null;

export function requireSupabase(): SupabaseClient {
  if (supabase === null) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the .env file.'
    );
  }
  return supabase;
}

export type { User as SupabaseUser };
