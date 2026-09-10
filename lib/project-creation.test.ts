import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTRACTOR, buildBlankOpening, buildNewProject, isWindowSystem } from './project-creation';

describe('buildBlankOpening', () => {
  it('tags doors with D and windows with W', () => {
    expect(buildBlankOpening('100D-single', 1, 1000).tag).toBe('D-01');
    expect(buildBlankOpening('casement', 2, 1000).tag).toBe('W-02');
    expect(buildBlankOpening('70S-sliding-2p', 3, 1000).tag).toBe('W-03');
    expect(isWindowSystem('100D-double')).toBe(false);
    expect(isWindowSystem('100S-sliding-2p')).toBe(true);
  });

  it('starts from the live system default size', () => {
    const opening = buildBlankOpening('100D-single', 1, 1000);
    expect(opening.width).toBe(900);
    expect(opening.height).toBe(2100);
    expect(opening.quantity).toBe(1);
    expect(opening.system).toBe('100D-single');
  });
});

describe('buildNewProject', () => {
  const now = new Date(2026, 8, 10, 12, 0, 0);

  it('creates one project with one blank unit and sensible defaults', () => {
    const { project, openings } = buildNewProject({ projectName: 'Skyline Residence' }, [], now);
    expect(project.projectName).toBe('Skyline Residence');
    expect(project.date).toBe('2026-09-10');
    expect(project.currency).toBe('LKR');
    expect(project.taxRatePercent).toBe(8);
    expect(project.contractorName).toBe(DEFAULT_CONTRACTOR);
    expect(project.projectNumber).toBe('FA-2026-001');
    expect(openings).toHaveLength(1);
    expect(openings[0].id).toBe(`open-${now.getTime()}-1`);
  });

  it('keeps a user-supplied project number and never duplicates one', () => {
    const supplied = buildNewProject({ projectName: 'A', projectNumber: 'ALU-2026-08' }, [], now);
    expect(supplied.project.projectNumber).toBe('ALU-2026-08');

    const generated = buildNewProject({ projectName: 'B' }, ['FA-2026-001', 'FA-2026-002'], now);
    expect(generated.project.projectNumber).toBe('FA-2026-003');
  });

  it('trims blank names to a safe default', () => {
    const { project } = buildNewProject({ projectName: '   ' }, [], now);
    expect(project.projectName).toBe('New Project');
  });
});
