import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  canAccessAdmin,
  classifyProjectLoadError,
  filterCatalogRecords,
  findCatalogRecord,
  parseProjectId,
  postLoginPath,
  projectWorkspacePath,
  recentCatalogRecords,
} from './project-routing';
import type { CatalogRecord } from './project-catalog';

function record(overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    id: 'row-1',
    name: 'Luxury Villa Glazing Project',
    clientName: 'Atelier Architecture & Interiors',
    projectNumber: 'ALU-2026-08',
    siteAddress: '12 Marine Drive, Colombo',
    projectDate: '2026-08-01',
    revision: 'ALU-2026-08-20260801',
    savedAt: '2026-09-01T10:00:00.000Z',
    kind: 'cloud',
    openingCount: 3,
    totalLeaves: 3,
    issues: [],
    status: 'in-progress',
    fabricationStatus: 'IN PROGRESS',
    archived: false,
    ...overrides,
  };
}

describe('project routing', () => {
  it('builds and parses the canonical workspace path', () => {
    expect(projectWorkspacePath('abc123')).toBe('/project/abc123');
    expect(parseProjectId('/project/abc123')).toBe('abc123');
    expect(parseProjectId('/project/abc123?tab=designs')).toBe('abc123');
    expect(parseProjectId('/project/a%20b')).toBe('a b');
    expect(parseProjectId('/projects')).toBeNull();
    expect(parseProjectId('/')).toBeNull();
  });

  it('always lands authenticated users on the dashboard', () => {
    expect(postLoginPath('admin')).toBe(ROUTES.dashboard);
    expect(postLoginPath('user')).toBe(ROUTES.dashboard);
    expect(postLoginPath(null)).toBe(ROUTES.dashboard);
  });

  it('restricts admin access to the admin role', () => {
    expect(canAccessAdmin('admin')).toBe(true);
    expect(canAccessAdmin('user')).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });

  it('classifies access failures separately from generic errors', () => {
    expect(classifyProjectLoadError('This Windows device has not been approved.')).toBe('denied');
    expect(classifyProjectLoadError('DEVICE_CREDENTIAL_REQUIRED')).toBe('denied');
    expect(classifyProjectLoadError('Network timeout')).toBe('error');
  });
});

describe('catalog selection', () => {
  const records: CatalogRecord[] = [
    record({ id: 'a', name: 'Alpha Tower', savedAt: '2026-09-03T10:00:00.000Z', clientName: 'Alpha Co' }),
    record({ id: 'b', name: 'Beta Villa', savedAt: '2026-09-01T10:00:00.000Z', status: 'review', fabricationStatus: 'REQUIRES REVIEW' }),
    record({ id: 'c', name: 'Gamma Works', savedAt: '2026-08-20T10:00:00.000Z', archived: true }),
  ];

  it('finds a project by id and returns null when missing', () => {
    expect(findCatalogRecord(records, 'b')?.name).toBe('Beta Villa');
    expect(findCatalogRecord(records, 'missing')).toBeNull();
  });

  it('hides archived projects unless requested', () => {
    expect(filterCatalogRecords(records).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterCatalogRecords(records, { showArchived: true }).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by query and status, and sorts', () => {
    expect(filterCatalogRecords(records, { query: 'beta' }).map((r) => r.id)).toEqual(['b']);
    expect(filterCatalogRecords(records, { query: 'colombo' }).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterCatalogRecords(records, { status: 'review' }).map((r) => r.id)).toEqual(['b']);
    expect(filterCatalogRecords(records, { sort: 'alpha' }).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterCatalogRecords(records, { sort: 'recent' }).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('returns the most recent projects up to the limit', () => {
    expect(recentCatalogRecords(records, 2).map((r) => r.id)).toEqual(['a', 'b']);
    expect(recentCatalogRecords(records, 0)).toEqual([]);
  });

  it('drops a deleted project from the selectable list', () => {
    const remaining = records.filter((r) => r.id !== 'a');
    expect(findCatalogRecord(remaining, 'a')).toBeNull();
    expect(remaining.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('handles an empty project library', () => {
    expect(filterCatalogRecords([])).toEqual([]);
    expect(recentCatalogRecords([])).toEqual([]);
    expect(findCatalogRecord([], 'anything')).toBeNull();
  });
});
