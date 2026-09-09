import { describe, expect, it } from 'vitest';
import {
  filterStepsByTargets,
  TOUR_STEPS,
  visibleTourSteps,
  type TourStep,
} from './onboarding-steps';

describe('tour definition', () => {
  it('has a final workflow step last', () => {
    const finalStep = TOUR_STEPS[TOUR_STEPS.length - 1];
    expect(finalStep.final).toBe(true);
    expect(finalStep.title).toContain('Workflow');
  });

  it('skips the not-yet-shipped Resources step automatically', () => {
    const steps = visibleTourSteps({ hasProject: false });
    expect(steps.some((step) => step.section === 'resources')).toBe(false);
  });

  it('only shows project-scoped steps when a project is open', () => {
    const none = visibleTourSteps({ hasProject: false });
    const open = visibleTourSteps({ hasProject: true });
    expect(none.some((step) => step.requiresProject)).toBe(false);
    expect(open.filter((step) => step.requiresProject).length).toBeGreaterThan(0);
  });

  it('every concrete step declares a title, copy and target', () => {
    for (const step of TOUR_STEPS.filter((s) => !s.final && !s.skipAlways)) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.paragraphs.length).toBeGreaterThan(0);
      expect(step.target.length).toBeGreaterThan(0);
    }
  });

  it('does not crash when a target is missing — it skips that step', () => {
    const onlyDashboardExists = (step: TourStep) => step.target.includes('nav-dashboard');
    const shown = filterStepsByTargets(visibleTourSteps({ hasProject: true }), onlyDashboardExists);
    expect(shown.length).toBeGreaterThanOrEqual(1);
    expect(shown.every((step) => step.target === '' || step.target.includes('nav-dashboard'))).toBe(true);
  });
});
