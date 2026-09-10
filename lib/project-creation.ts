// Shared, pure project-creation helpers.
//
// The dashboard, the project list and the workspace all create projects through
// these functions so a project is only ever defined one way. Persistence stays
// in the existing storage layer (lib/project-storage.ts).

import type { OpeningItem, ProjectMetadata, TypologyId } from './types';
import { TYPOLOGY_LABELS } from './types';
import { nextProjectNumber } from './project-catalog';

export const DEFAULT_CONTRACTOR = 'ALU DOOR Pro Engineering';

export const SYSTEM_DEFAULT_SIZE: Record<TypologyId, { width: number; height: number }> = {
  '100D-single': { width: 900, height: 2100 },
  '100D-double': { width: 1800, height: 2100 },
  '100S-sliding-2p': { width: 2400, height: 2100 },
  '70S-sliding-2p': { width: 1800, height: 2100 },
  '70S-sliding-4p': { width: 3200, height: 2200 },
  '74-cgroove': { width: 1800, height: 1500 },
  casement: { width: 800, height: 1200 },
};

export function isWindowSystem(system: TypologyId): boolean {
  return system === 'casement' || system.startsWith('70S') || system.startsWith('100S');
}

export function generateProjectId(seed: number): string {
  return `proj-${seed.toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
}

export function buildBlankOpening(system: TypologyId, nextIndex: number, seed: number): OpeningItem {
  const size = SYSTEM_DEFAULT_SIZE[system];
  const prefix = isWindowSystem(system) ? 'W' : 'D';
  return {
    id: `open-${seed}-${nextIndex}`,
    tag: `${prefix}-${String(nextIndex).padStart(2, '0')}`,
    name: TYPOLOGY_LABELS[system],
    system,
    width: size.width,
    height: size.height,
    quantity: 1,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Ground Floor',
    hingeSide: 'left',
  };
}

export interface NewProjectInput {
  projectName: string;
  clientName?: string;
  projectNumber?: string;
  date?: string;
  currency?: string;
  taxRatePercent?: number;
  contractorName?: string;
}

export interface NewProjectResult {
  project: ProjectMetadata;
  openings: OpeningItem[];
}

/**
 * Builds a brand new project with one blank unit. The project number is only
 * auto-generated when the user did not supply one, and never collides with an
 * existing project number.
 */
export function buildNewProject(
  input: NewProjectInput,
  existingNumbers: string[],
  now: Date = new Date()
): NewProjectResult {
  const seed = now.getTime();
  const project: ProjectMetadata = {
    id: generateProjectId(seed),
    projectName: input.projectName?.trim() || 'New Project',
    clientName: input.clientName?.trim() || '',
    projectNumber: input.projectNumber?.trim() || nextProjectNumber(existingNumbers, now),
    date: input.date || now.toISOString().slice(0, 10),
    currency: input.currency || 'LKR',
    taxRatePercent: input.taxRatePercent ?? 8,
    contractorName: input.contractorName?.trim() || DEFAULT_CONTRACTOR,
  };
  return {
    project,
    openings: [buildBlankOpening('100D-single', 1, seed)],
  };
}
