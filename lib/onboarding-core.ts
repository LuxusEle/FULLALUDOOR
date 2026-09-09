// Pure onboarding state rules (no DOM, no storage) — unit tested.

export const CURRENT_ONBOARDING_VERSION = 1;

export interface OnboardingState {
  completed: boolean;
  skipped: boolean;
  /** Version the last decision (complete/skip) was recorded at. */
  version: number;
  completedAt: string | null;
}

export const EMPTY_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  skipped: false,
  version: 0,
  completedAt: null,
};

/**
 * Whether the welcome/onboarding should be offered to this user.
 *
 * A user is only a "brand-new" user when they have never completed AND never
 * skipped. Skipping is treated as a conscious decision for this version. Users
 * who completed an earlier onboarding version are not treated as brand-new —
 * they can replay the tour from the help control instead.
 */
export function requiresOnboarding(state: OnboardingState, currentVersion = CURRENT_ONBOARDING_VERSION): boolean {
  if (state.completed || state.skipped) return false;
  return state.version < currentVersion;
}

export function markCompleted(state: OnboardingState, currentVersion = CURRENT_ONBOARDING_VERSION, now = new Date()): OnboardingState {
  return {
    completed: true,
    skipped: false,
    version: Math.max(state.version, currentVersion),
    completedAt: now.toISOString(),
  };
}

export function markSkipped(state: OnboardingState, currentVersion = CURRENT_ONBOARDING_VERSION): OnboardingState {
  return {
    completed: false,
    skipped: true,
    version: Math.max(state.version, currentVersion),
    completedAt: state.completedAt,
  };
}

/** Merge a local cache and a cloud copy into one authoritative state. */
export function mergeOnboarding(local: OnboardingState, cloud: OnboardingState | null): OnboardingState {
  if (!cloud) return local;
  if (!local.completed && !local.skipped && !cloud.completed && !cloud.skipped) {
    return { ...cloud, version: Math.max(local.version, cloud.version) };
  }
  const completed = local.completed || cloud.completed;
  const skipped = !completed && (local.skipped || cloud.skipped);
  const version = Math.max(local.version, cloud.version);
  const completedAt = completed
    ? cloud.completedAt && local.completedAt
      ? new Date(Math.max(Date.parse(local.completedAt), Date.parse(cloud.completedAt))).toISOString()
      : (cloud.completedAt ?? local.completedAt)
    : null;
  return { completed, skipped, version, completedAt };
}
