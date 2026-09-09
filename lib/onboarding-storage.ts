import { isDemoAuth, getCurrentUser } from './auth';
import { requireSupabase } from './supabase';
import { protectedRpcCredential } from './device-api';
import {
  CURRENT_ONBOARDING_VERSION,
  EMPTY_ONBOARDING_STATE,
  mergeOnboarding,
  type OnboardingState,
} from './onboarding-core';

const LOCAL_PREFIX = 'fullaludoor.onboarding';

// ---------------------------------------------------------------------------
// Browser-local cache. This makes onboarding decisions survive refresh and
// browser restarts for the same user, in demo mode and as a fallback when the
// cloud profile copy is unreachable (e.g. schema not yet migrated).
// ---------------------------------------------------------------------------

function localKey(userId: string): string {
  return `${LOCAL_PREFIX}.v${CURRENT_ONBOARDING_VERSION}.${userId}`;
}

function readLocal(userId: string): OnboardingState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      completed: parsed.completed === true,
      skipped: parsed.skipped === true,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
    };
  } catch {
    return null;
  }
}

function writeLocal(userId: string, state: OnboardingState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(state));
  } catch {
    // private mode / quota — ignore
  }
}

// ---------------------------------------------------------------------------
// Cloud copy (per-user onboarding columns on public.profiles via RPCs). Uses
// the exact same approved-device authorization as every other app RPC.
// ---------------------------------------------------------------------------

function toState(value: unknown): OnboardingState | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    completed: record.onboarding_completed === true,
    skipped: record.onboarding_skipped === true,
    version: typeof record.onboarding_version === 'number' ? record.onboarding_version : 0,
    completedAt: typeof record.onboarding_completed_at === 'string' ? record.onboarding_completed_at : null,
  };
}

async function cloudGet(): Promise<OnboardingState | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('app_get_onboarding', {
    p_token: await protectedRpcCredential(),
  });
  if (error) throw error;
  return toState(data);
}

async function cloudSet(state: OnboardingState): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('app_set_onboarding', {
    p_token: await protectedRpcCredential(),
    p_completed: state.completed,
    p_version: state.version,
    p_skipped: state.skipped,
    p_completed_at: state.completedAt,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadOnboardingState(): Promise<OnboardingState> {
  const demo = isDemoAuth();
  const user = demo ? null : await getCurrentUser();
  const userId = user?.id ?? 'local';

  const local = readLocal(userId) ?? EMPTY_ONBOARDING_STATE;
  if (demo || !user) return local;

  try {
    const cloud = await cloudGet();
    if (!cloud) return local;
    return mergeOnboarding(local, cloud);
  } catch {
    return local;
  }
}

export async function saveOnboardingState(state: OnboardingState): Promise<void> {
  const demo = isDemoAuth();
  const user = demo ? null : await getCurrentUser();
  const userId = user?.id ?? 'local';

  writeLocal(userId, state);
  if (demo || !user) return;

  try {
    await cloudSet(state);
  } catch {
    // Cloud persistence is best-effort; the local copy above still satisfies
    // refresh / restart persistence for this browser session.
  }
}
