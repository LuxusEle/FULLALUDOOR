import { describe, expect, it } from 'vitest';
import type { OpeningItem, ProjectMetadata } from './types';
import type { StoredProject } from './project-storage';
import {
  catalogStatus,
  catalogTotals,
  deriveOpeningIssues,
  deriveProjectIssues,
  formatProjectNumber,
  formatRelativeTime,
  isRecentlyModified,
  MAX_WIDTH_MM,
  MIN_HEIGHT_MM,
  MIN_WIDTH_MM,
  nextProjectNumber,
  openingHasIssue,
  parseProjectNumber,
  severityRank,
  toCatalogRecord,
} from './project-catalog';

const DAY = 24 * 60 * 60 * 1000;

function opening(overrides: Partial<OpeningItem> = {}): OpeningItem {
  return {
    id: 'open-1',
    tag: 'D-01',
    name: 'Single Door',
    system: '100D-single',
    width: 950,
    height: 2200,
    quantity: 1,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Ground Floor',
    hingeSide: 'left',
    ...overrides,
  };
}

function project(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    id: 'proj-1',
    projectName: 'Villa Residence',
    clientName: 'ABC Construction',
    projectNumber: 'FA-2026-014',
    date: '2026-09-01',
    currency: 'USD',
    taxRatePercent: 8,
    contractorName: 'ALU DOOR Pro Engineering',
    ...overrides,
  };
}

function doc(openings: OpeningItem[], meta: Partial<ProjectMetadata> = {}, savedAt = '2026-09-10T09:00:00.000Z'): StoredProject {
  return {
    version: 1,
    savedAt,
    project: project(meta),
    openings,
  };
}

describe('deriveOpeningIssues', () => {
  it('accepts a healthy opening', () => {
    expect(openingHasIssue(opening())).toBe(false);
    expect(deriveOpeningIssues(opening())).toHaveLength(0);
  });

  it('flags dimensions outside the fabricable envelope as critical', () => {
    const tooWide = deriveOpeningIssues(opening({ width: MAX_WIDTH_MM + 1 }));
    expect(tooWide).toHaveLength(1);
    expect(tooWide[0].severity).toBe('critical');
    expect(tooWide[0].code).toBe('DIMENSION_OUT_OF_RANGE');

    const tooShort = deriveOpeningIssues(opening({ height: MIN_HEIGHT_MM - 1 }));
    expect(tooShort[0].severity).toBe('critical');
    expect(deriveOpeningIssues(opening({ width: MIN_WIDTH_MM - 1 }))[0].severity).toBe('critical');
  });

  it('flags a zero quantity as critical', () => {
    const issues = deriveOpeningIssues(opening({ quantity: 0 }));
    expect(issues.some((issue) => issue.code === 'INVALID_QUANTITY')).toBe(true);
  });

  it('flags a missing location for review', () => {
    const issues = deriveOpeningIssues(opening({ location: '   ' }));
    expect(issues.some((issue) => issue.code === 'MISSING_LOCATION')).toBe(true);
    expect(issues.some((issue) => issue.severity === 'review')).toBe(true);
  });
});

describe('deriveProjectIssues / catalogStatus', () => {
  it('flags an empty project', () => {
    const issues = deriveProjectIssues(doc([]));
    expect(issues.some((issue) => issue.code === 'NO_OPENINGS')).toBe(true);
    expect(catalogStatus(doc([]))).toBe('draft');
  });

  it('flags a missing project reference for review', () => {
    const issues = deriveProjectIssues(doc([opening()], { projectNumber: '  ' }));
    expect(issues.some((issue) => issue.code === 'MISSING_PROJECT_REF')).toBe(true);
  });

  it('does not invent issues for a complete project', () => {
    const issues = deriveProjectIssues(doc([opening()]));
    expect(issues).toHaveLength(0);
    expect(catalogStatus(doc([opening()]))).toBe('in-progress');
  });

  it('reports review status when a real issue exists', () => {
    const stored = doc([opening({ location: '' })]);
    expect(catalogStatus(stored)).toBe('review');
  });
});

describe('toCatalogRecord', () => {
  it('maps a real document to a dashboard row', () => {
    const stored = doc([opening(), opening({ tag: 'D-02', quantity: 2 })]);
    const record = toCatalogRecord(stored, {
      id: 'row-1',
      name: stored.project.projectName,
      savedAt: stored.savedAt,
      kind: 'local',
    });
    expect(record.name).toBe('Villa Residence');
    expect(record.clientName).toBe('ABC Construction');
    expect(record.projectNumber).toBe('FA-2026-014');
    expect(record.openingCount).toBe(2);
    expect(record.totalLeaves).toBe(3);
    expect(record.status).toBe('in-progress');
    expect(record.issues).toHaveLength(0);
  });
});

describe('catalogTotals', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');

  it('aggregates real rows without inventing anything', () => {
    const rows = [
      toCatalogRecord(
        doc([opening(), opening({ tag: 'W-01', quantity: 3 })], {}, '2026-09-09T12:00:00.000Z'),
        { id: 'a', name: 'A', savedAt: '2026-09-09T12:00:00.000Z', kind: 'local' }
      ),
      toCatalogRecord(
        doc([opening()], { projectNumber: '' }, '2026-09-01T12:00:00.000Z'),
        { id: 'b', name: 'B', savedAt: '2026-09-01T12:00:00.000Z', kind: 'cloud' }
      ),
    ];
    const totals = catalogTotals(rows, now);
    expect(totals.totalProjects).toBe(2);
    expect(totals.totalOpenings).toBe(5);
    expect(totals.recentProjects).toBe(1);
    expect(totals.reviewProjects).toBe(1);
    expect(totals.projectsWithIssues).toBe(1);
  });

  it('counts zero when there are no projects', () => {
    const totals = catalogTotals([], now);
    expect(totals.totalProjects).toBe(0);
    expect(totals.totalOpenings).toBe(0);
    expect(totals.openIssues).toBe(0);
  });
});

describe('time helpers', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');

  it('identifies recently modified projects inside the 7-day window', () => {
    expect(isRecentlyModified(new Date(now - 2 * DAY).toISOString(), now)).toBe(true);
    expect(isRecentlyModified(new Date(now - 8 * DAY).toISOString(), now)).toBe(false);
  });

  it('formats a relative timestamp', () => {
    expect(formatRelativeTime(new Date(now - 10 * 1000).toISOString(), now)).toBe('just now');
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe('5m ago');
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now)).toBe('2h ago');
    expect(formatRelativeTime(new Date(now - 2 * DAY).toISOString(), now)).toBe('2d ago');
    expect(formatRelativeTime(new Date(now - 60 * DAY).toISOString(), now)).toBe('2mo ago');
  });
});

describe('severityRank', () => {
  it('orders severities', () => {
    expect(severityRank('info')).toBeLessThan(severityRank('review'));
    expect(severityRank('review')).toBeLessThan(severityRank('warning'));
    expect(severityRank('warning')).toBeLessThan(severityRank('critical'));
  });
});

describe('project numbering', () => {
  const now = new Date(2026, 8, 10);

  it('parses and formats FA-YYYY-NNN numbers', () => {
    expect(parseProjectNumber('FA-2026-014')).toEqual({ prefix: 'FA', year: 2026, seq: 14 });
    expect(parseProjectNumber('FA-2026-001')).toEqual({ prefix: 'FA', year: 2026, seq: 1 });
    expect(formatProjectNumber(2026, 1)).toBe('FA-2026-001');
    expect(parseProjectNumber('not-a-number')).toBeNull();
  });

  it('generates the next unused number and skips gaps only where needed', () => {
    const existing = ['FA-2026-001', 'FA-2026-002', 'FA-2025-050'];
    expect(nextProjectNumber(existing, now)).toBe('FA-2026-003');
  });

  it('never collides with existing numbers', () => {
    const existing = Array.from({ length: 300 }, (_, index) => `FA-2026-${String(index + 1).padStart(3, '0')}`);
    const next = nextProjectNumber(existing, now);
    expect(existing).not.toContain(next);
    expect(parseProjectNumber(next)?.year).toBe(2026);
  });

  it('ignores other prefixes when sequencing FA numbers', () => {
    expect(nextProjectNumber(['ALU-2026-999'], now)).toBe('FA-2026-001');
  });
});

describe('catalog record archive flag', () => {
  it('marks archived documents', () => {
    const stored = doc([opening()], { archived: true });
    const record = toCatalogRecord(stored, {
      id: 'r',
      name: stored.project.projectName,
      savedAt: stored.savedAt,
      kind: 'local',
    });
    expect(record.archived).toBe(true);
  });
});
