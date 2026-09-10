// Pure, unit-tested project-catalog helpers for the FullAluDoor Dashboard.
//
// These functions only read real stored project documents (the same shape used
// by lib/project-storage.ts). They never invent values: every number rendered
// by the dashboard originates from an actual stored project, and any metric we
// cannot compute reliably is simply not produced here.

import type { StoredProject } from './project-storage';
import type { OpeningItem } from './types';

export type IssueSeverity = 'info' | 'review' | 'warning' | 'critical';

export interface ProjectIssue {
  code: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  tag?: string;
}

/** Conservative fabricable envelope used by the workspace dimension editor. */
export const MIN_WIDTH_MM = 500;
export const MAX_WIDTH_MM = 4500;
export const MIN_HEIGHT_MM = 600;
export const MAX_HEIGHT_MM = 3500;

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  info: 0,
  review: 1,
  warning: 2,
  critical: 3,
};

export function severityRank(severity: IssueSeverity): number {
  return SEVERITY_RANK[severity];
}

export function openingHasIssue(opening: OpeningItem): boolean {
  return deriveOpeningIssues(opening).length > 0;
}

export function deriveOpeningIssues(opening: OpeningItem): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const outOfRange =
    opening.width < MIN_WIDTH_MM ||
    opening.width > MAX_WIDTH_MM ||
    opening.height < MIN_HEIGHT_MM ||
    opening.height > MAX_HEIGHT_MM;

  if (outOfRange) {
    issues.push({
      code: 'DIMENSION_OUT_OF_RANGE',
      severity: 'critical',
      tag: opening.tag,
      title: `${opening.tag} is outside the fabricable envelope`,
      detail: `${opening.width} × ${opening.height} mm — allowed 500–4500 mm wide and 600–3500 mm high.`,
    });
  }

  if (typeof opening.quantity !== 'number' || opening.quantity < 1) {
    issues.push({
      code: 'INVALID_QUANTITY',
      severity: 'critical',
      tag: opening.tag,
      title: `${opening.tag} has an invalid quantity`,
      detail: 'Every scheduled opening must have a quantity of at least one.',
    });
  }

  if (!opening.location || opening.location.trim().length === 0) {
    issues.push({
      code: 'MISSING_LOCATION',
      severity: 'review',
      tag: opening.tag,
      title: `${opening.tag} has no installation location`,
      detail: 'Add the floor / room / position before releasing to fabrication.',
    });
  }

  return issues;
}

/**
 * Validation issues for a full stored project document. Only real signals are
 * used (dimensions, quantity, location, references). This is the single source
 * that feeds both the global "pending reviews" tally and the attention panel.
 */
export function deriveProjectIssues(doc: StoredProject): ProjectIssue[] {
  const issues: ProjectIssue[] = [];

  if (doc.openings.length === 0) {
    issues.push({
      code: 'NO_OPENINGS',
      severity: 'critical',
      title: 'Project has no scheduled openings',
      detail: 'Open the project schedule and add at least one aluminium opening.',
    });
  }

  if (!doc.project.projectNumber || doc.project.projectNumber.trim().length === 0) {
    issues.push({
      code: 'MISSING_PROJECT_REF',
      severity: 'review',
      title: 'Project number / reference is not set',
      detail: 'Assign a project reference (e.g. FA-2026-014) before releasing the dossier.',
    });
  }

  if (!doc.project.clientName || doc.project.clientName.trim().length === 0) {
    issues.push({
      code: 'MISSING_CLIENT',
      severity: 'info',
      title: 'Client name is not set',
      detail: 'Quotations and the dossier cover reference the client name.',
    });
  }

  for (const opening of doc.openings) {
    issues.push(...deriveOpeningIssues(opening));
  }

  return issues;
}

/** Lifecycle label we can honestly derive from a stored document snapshot. */
export type CatalogStatus = 'draft' | 'review' | 'in-progress';

export function catalogStatus(doc: StoredProject): CatalogStatus {
  if (doc.openings.length === 0) return 'draft';
  const hasNonInfoIssue = deriveProjectIssues(doc).some(
    (issue) => issue.severity !== 'info'
  );
  return hasNonInfoIssue ? 'review' : 'in-progress';
}

/** Fabrication-facing status label derived from real validation signals only. */
export type FabricationStatus = 'DRAFT' | 'IN PROGRESS' | 'REQUIRES REVIEW';

export function fabricationStatusLabel(status: CatalogStatus): FabricationStatus {
  if (status === 'review') return 'REQUIRES REVIEW';
  if (status === 'in-progress') return 'IN PROGRESS';
  return 'DRAFT';
}

/** Normalized row the Dashboard renders (built from a real ref + document). */
export interface CatalogRecord {
  id: string;
  name: string;
  clientName: string;
  projectNumber: string;
  siteAddress: string;
  projectDate: string;
  revision: string;
  savedAt: string;
  kind: 'cloud' | 'local';
  openingCount: number;
  totalLeaves: number;
  issues: ProjectIssue[];
  status: CatalogStatus;
  fabricationStatus: FabricationStatus;
  archived: boolean;
}

export interface ProjectNumber {
  prefix: string;
  year: number;
  seq: number;
}

export function parseProjectNumber(value: string): ProjectNumber | null {
  const match = /^(FA|ALU)[- ]?(\d{4})[- ](\d{2,})$/i.exec(value.trim());
  if (!match) return null;
  return { prefix: match[1].toUpperCase(), year: Number(match[2]), seq: Number(match[3]) };
}

export function formatProjectNumber(year: number, seq: number): string {
  return `FA-${year}-${String(seq).padStart(3, '0')}`;
}

/**
 * Next sequential project number (FA-YYYY-NNN) that does not collide with any
 * existing number. Sequence restarts per calendar year and skips used numbers.
 */
export function nextProjectNumber(existing: string[], now = new Date()): string {
  const year = now.getFullYear();
  const used = new Set(
    existing
      .map(parseProjectNumber)
      .filter((parsed): parsed is ProjectNumber => parsed !== null && parsed.year === year)
      .map((parsed) => parsed.seq)
  );
  let seq = 1;
  while (used.has(seq)) seq += 1;
  return formatProjectNumber(year, seq);
}

export function projectRevision(doc: StoredProject): string {
  const number = doc.project.projectNumber?.trim() || 'PROJECT';
  const date = doc.project.date ? doc.project.date.replaceAll('-', '') : '';
  return date ? `${number}-${date}` : `${number}-R0`;
}

export function toCatalogRecord(
  doc: StoredProject,
  ref: { id: string; savedAt: string; kind: 'cloud' | 'local'; name: string }
): CatalogRecord {
  const issues = deriveProjectIssues(doc);
  const status = catalogStatus(doc);
  return {
    id: ref.id,
    name: doc.project.projectName || ref.name,
    clientName: doc.project.clientName,
    projectNumber: doc.project.projectNumber,
    siteAddress: doc.project.siteAddress ?? '',
    projectDate: doc.project.date,
    revision: projectRevision(doc),
    savedAt: ref.savedAt,
    kind: ref.kind,
    openingCount: doc.openings.length,
    totalLeaves: doc.openings.reduce((sum, o) => sum + (o.quantity || 0), 0),
    issues,
    status,
    fabricationStatus: fabricationStatusLabel(status),
    archived: doc.project.archived === true,
  };
}

export interface CatalogTotals {
  totalProjects: number;
  recentProjects: number;
  totalOpenings: number;
  projectsWithIssues: number;
  openIssues: number;
  criticalIssues: number;
  reviewProjects: number;
  inProgressProjects: number;
}

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isRecentlyModified(savedAt: string, now: number, windowMs = ACTIVE_WINDOW_MS): boolean {
  const time = Date.parse(savedAt);
  if (Number.isNaN(time)) return false;
  return now - time <= windowMs && time <= now;
}

/**
 * Global summary numbers for the Dashboard stat cards. Every figure is derived
 * from real stored project rows — never from placeholder values.
 */
export function catalogTotals(records: CatalogRecord[], now = Date.now()): CatalogTotals {
  let totalOpenings = 0;
  let recentProjects = 0;
  let projectsWithIssues = 0;
  let openIssues = 0;
  let criticalIssues = 0;
  let reviewProjects = 0;
  let inProgressProjects = 0;

  for (const record of records) {
    if (isRecentlyModified(record.savedAt, now)) recentProjects += 1;
    totalOpenings += record.totalLeaves;
    if (record.status === 'review') reviewProjects += 1;
    if (record.status === 'in-progress') inProgressProjects += 1;
    if (record.issues.length > 0) projectsWithIssues += 1;
    openIssues += record.issues.length;
    criticalIssues += record.issues.filter((issue) => issue.severity === 'critical').length;
  }

  return {
    totalProjects: records.length,
    recentProjects,
    totalOpenings,
    projectsWithIssues,
    openIssues,
    criticalIssues,
    reviewProjects,
    inProgressProjects,
  };
}

export function formatRelativeTime(savedAt: string, now = Date.now()): string {
  const time = Date.parse(savedAt);
  if (Number.isNaN(time)) return 'recently';

  const diffMs = now - time;
  if (diffMs < 0) return 'just now';
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks}w ago`;
  }
  const months = Math.round(days / 30);
  if (months < 24) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

/** Absolute, locale-aware timestamp fallback (used when a date is too old). */
export function formatAbsoluteTime(savedAt: string): string {
  const time = Date.parse(savedAt);
  if (Number.isNaN(time)) return savedAt;
  return new Date(time).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
