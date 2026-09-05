import { describe, expect, it } from 'vitest';
import { deriveDoor } from './door-model';
import { nestProjectCuts } from './nesting-engine';
import { buildManufacturingDossier } from './manufacturing-dossier';
import type { CutItem, OpeningItem, ProjectMetadata } from './types';

const project: ProjectMetadata = {
  id: 'test-project',
  projectName: 'Dossier Test Project',
  clientName: 'Test Client',
  projectNumber: 'TEST-001',
  date: '2026-09-05',
  currency: 'USD',
  taxRatePercent: 8,
  contractorName: 'Test Fabricator',
};

const opening = (id: string, tag: string, width: number): OpeningItem => ({
  id,
  tag,
  name: `${tag} test opening`,
  system: '100D-single',
  width,
  height: 2200,
  quantity: 1,
  finish: 'natural',
  glass: '6mm-clear',
  location: 'Ground Floor',
  hingeSide: 'left',
  openingAngle: 8,
});

function makeDossier(openings: OpeningItem[]) {
  const derived = openings.map((item) => deriveDoor(item));
  const nesting = nestProjectCuts(derived.flatMap((item) => item.cutList));
  return buildManufacturingDossier(project, derived, nesting, '2026-09-05 12:00');
}

describe('manufacturing dossier transformation', () => {
  it('builds a single-opening dossier from live geometry and nesting', () => {
    const dossier = makeDossier([opening('1', 'D-01', 950)]);

    expect(dossier.openings).toHaveLength(1);
    expect(dossier.revision).toBe('TEST-001-20260905');
    expect(dossier.allCuts.length).toBeGreaterThan(0);
    expect(dossier.profiles.some((profile) => profile.id === '100D-3105')).toBe(true);
    expect(dossier.profiles.find((profile) => profile.id === '100D-3105')?.points).toBeTruthy();
    expect(dossier.profiles.find((profile) => profile.id === '100D-3105')?.sourcePage).toBe(51);
    expect(dossier.profiles.find((profile) => profile.id === '100D-3105')?.catalogueReference).toContain('catalogue page 51');
    expect(dossier.totals.cutPieces).toBeGreaterThan(0);
    expect(dossier.totals.glassPanels).toBeGreaterThan(0);
    expect(dossier.checks.every((check) => check.openingTag === 'D-01')).toBe(true);
  });

  it('aggregates multiple openings without losing opening references', () => {
    const dossier = makeDossier([opening('1', 'D-01', 950), opening('2', 'D-02', 1800)]);

    expect(dossier.openings).toHaveLength(2);
    expect(new Set(dossier.allCuts.map((cut: CutItem) => cut.openingTag))).toEqual(new Set(['D-01', 'D-02']));
    expect(new Set(dossier.glass.map((panel) => panel.openingTag))).toEqual(new Set(['D-01', 'D-02']));
    expect(new Set(dossier.hardware.map((item) => item.openingTag))).toEqual(new Set(['D-01', 'D-02']));
    expect(dossier.nesting.totalBarsToPull).toBeGreaterThan(0);
  });

  it('exposes real nesting efficiency and material totals', () => {
    const dossier = makeDossier([opening('1', 'D-01', 950)]);
    const kerfFromBars = dossier.nesting.resultsByProfile
      .flatMap((profile) => profile.bars)
      .reduce((sum, bar) => sum + bar.kerfWasteMm, 0);

    expect(dossier.totals.totalKerfMm).toBe(kerfFromBars);
    expect(dossier.totals.totalCutLengthMm).toBeGreaterThan(0);
    expect(dossier.nesting.overallEfficiencyPercent).toBeGreaterThan(0);
    expect(dossier.quote.grandTotal).toBeGreaterThanOrEqual(0);
    expect(dossier.bom.length).toBeGreaterThan(0);
  });
});
