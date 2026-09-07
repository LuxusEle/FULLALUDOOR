import { isDemoMode, requireSupabase, type SupabaseUser } from './supabase';

export type AuthResult = { ok: true } | { ok: false; message: string };

export function isDemoAuth(): boolean {
  return isDemoMode;
}

export async function getCurrentUser(): Promise<SupabaseUser | null> {
  if (isDemoMode) return null;
  const { data } = await requireSupabase().auth.getSession();
  return data.session?.user ?? null;
}

export function subscribeToAuth(onChange: (user: SupabaseUser | null) => void): () => void {
  if (isDemoMode) {
    return () => undefined;
  }

  const supabase = requireSupabase();
  void supabase.auth.getSession().then(({ data }) => {
    onChange(data.session?.user ?? null);
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user ?? null);
  });

  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (isDemoMode) {
    return { ok: false, message: 'Supabase credentials are not configured in .env' };
  }
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (isDemoMode) {
    return { ok: false, message: 'Supabase credentials are not configured in .env' };
  }
  const { data, error } = await requireSupabase().auth.signUp({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }
  if (data.session === null) {
    return {
      ok: false,
      message: 'Account created. Confirm the verification email before signing in.',
    };
  }
  return { ok: true };
}

export async function signOutCurrentUser(): Promise<AuthResult> {
  if (isDemoMode) {
    return { ok: true };
  }
  const { error } = await requireSupabase().auth.signOut();
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
