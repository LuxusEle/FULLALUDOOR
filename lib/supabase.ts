import { createClient } from '@supabase/supabase-js';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase=url&&anonKey?createClient(url,anonKey):null;
export const isDemoMode=!supabase;
