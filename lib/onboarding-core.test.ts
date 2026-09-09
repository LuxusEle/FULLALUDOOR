import { describe, expect, it } from 'vitest';
import {
  CURRENT_ONBOARDING_VERSION,
  EMPTY_ONBOARDING_STATE,
  markCompleted,
  markSkipped,
  mergeOnboarding,
  requiresOnboarding,
  type OnboardingState,
} from './onboarding-core';

describe('onboarding state rules', () => {
  it('shows onboarding for a brand-new user', () => {
    expect(requiresOnboarding(EMPTY_ONBOARDING_STATE)).toBe(true);
  });

  it('does not re-show for a completed user', () => {
    const state = markCompleted(EMPTY_ONBOARDING_STATE);
    expect(state.completed).toBe(true);
    expect(requiresOnboarding(state)).toBe(false);
  });

  it('does not re-show for a skipped user', () => {
    const state = markSkipped(EMPTY_ONBOARDING_STATE);
    expect(state.skipped).toBe(true);
    expect(requiresOnboarding(state)).toBe(false);
  });

  it('does not treat a completed older-version user as brand new', () => {
    const oldCompleted: OnboardingState = {
      completed: true,
      skipped: false,
      version: CURRENT_ONBOARDING_VERSION - 1,
      completedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(requiresOnboarding(oldCompleted, CURRENT_ONBOARDING_VERSION)).toBe(false);
  });

  it('offers onboarding again only if a future version ships and nothing was decided', () => {
    const untouchedV0 = { ...EMPTY_ONBOARDING_STATE };
    expect(requiresOnboarding(untouchedV0, 2)).toBe(true);
  });

  it('records a completion timestamp', () => {
    const state = markCompleted(EMPTY_ONBOARDING_STATE, 1, new Date('2026-09-10T10:00:00Z'));
    expect(state.completedAt).toBe('2026-09-10T10:00:00.000Z');
    expect(state.version).toBe(1);
  });

  it('merge prefers completion across local/cloud copies', () => {
    const local = markSkipped(EMPTY_ONBOARDING_STATE);
    const cloud = markCompleted(EMPTY_ONBOARDING_STATE);
    const merged = mergeOnboarding(local, cloud);
    expect(merged.completed).toBe(true);
    expect(merged.skipped).toBe(false);
    expect(merged.version).toBe(CURRENT_ONBOARDING_VERSION);
  });

  it('merge falls back to local when there is no cloud copy', () => {
    const local = markCompleted(EMPTY_ONBOARDING_STATE);
    expect(mergeOnboarding(local, null)).toEqual(local);
  });
});
