// Pure application navigation + project-selection helpers.
//
// These functions contain no React or browser dependencies so the entry flow
// (login -> dashboard -> projects -> project workspace) can be unit tested and
// reused by every route without duplicating route strings.

import type { UserRole } from './device-access';
import type { CatalogRecord, CatalogStatus } from './project-catalog';

export const ROUTES = {
  root: '/',
  login: '/login',
  dashboard: '/dashboard',
  projects: '/projects',
  admin: '/admin',
  devicePending: '/device-pending',
  deviceDenied: '/device-denied',
} as const;

export const PROJECT_ROUTE_PREFIX = '/project/';

/** Canonical workspace URL for a stored project (cloud row id or local id). */
export function projectWorkspacePath(projectId: string): string {
  return `${PROJECT_ROUTE_PREFIX}${encodeURIComponent(projectId)}`;
}

/** Extracts the project id from a workspace pathname, or null when not one. */
export function parseProjectId(pathname: string): string | null {
  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) return null;
  const raw = pathname.slice(PROJECT_ROUTE_PREFIX.length).split(/[/?#]/)[0];
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return raw.length > 0 ? raw : null;
  }
}

/** Post-authentication landing route. Both roles land on the dashboard. */
export function postLoginPath(_role: UserRole | null): string {
  return ROUTES.dashboard;
}

/** Only database-authorized administrators may reach the admin area. */
export function canAccessAdmin(role: UserRole | null): boolean {
  return role === 'admin';
}

export function findCatalogRecord(records: CatalogRecord[], projectId: string): CatalogRecord | null {
  return records.find((record) => record.id === projectId) ?? null;
}

export interface CatalogFilterOptions {
  query?: string;
  status?: 'all' | CatalogStatus;
  showArchived?: boolean;
  sort?: 'recent' | 'alpha';
}

export function filterCatalogRecords(records: CatalogRecord[], options: CatalogFilterOptions = {}): CatalogRecord[] {
  const needle = (options.query ?? '').trim().toLowerCase();
  const status = options.status ?? 'all';
  const showArchived = options.showArchived ?? false;
  const sort = options.sort ?? 'recent';
  return records
    .filter((record) => showArchived || !record.archived)
    .filter((record) => status === 'all' || record.status === status)
    .filter((record) => {
      if (!needle) return true;
      return [record.name, record.clientName, record.projectNumber, record.siteAddress]
        .some((value) => value.toLowerCase().includes(needle));
    })
    .sort((a, b) =>
      sort === 'alpha' ? a.name.localeCompare(b.name) : Date.parse(b.savedAt) - Date.parse(a.savedAt)
    );
}

export function recentCatalogRecords(records: CatalogRecord[], limit = 6): CatalogRecord[] {
  return [...records]
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, Math.max(0, limit));
}

export type ProjectLoadState = 'loading' | 'ready' | 'not-found' | 'denied' | 'error';

/** Maps a storage failure message to a user-facing workspace state. */
export function classifyProjectLoadError(message: string): 'denied' | 'error' {
  return /approved|denied|unauthor|revoked|credential|token|session expired|forbidden|access/i.test(
    message
  )
    ? 'denied'
    : 'error';
}
