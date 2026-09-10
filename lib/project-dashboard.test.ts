import { describe, expect, it } from 'vitest';
import type { OpeningItem, ProjectMetadata } from './types';
import { deriveDoor } from './door-model';
import { nestProjectCuts } from './nesting-engine';
import { buildManufacturingDossier } from './manufacturing-dossier';
import { buildProjectDashboard } from './project-dashboard';

function opening(overrides: Partial<OpeningItem> = {}): OpeningItem {
  return {
    id: 'o1',
    tag: 'D-01',
    name: 'Main Entrance',
    system: '100D-single',
    width: 950,
    height: 2200,
    quantity: 2,
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
    projectName: 'Luxury Villa Glazing Project',
    clientName: 'Atelier Architecture & Interiors',
    projectNumber: 'ALU-2026-08',
    date: '2026-09-05',
    currency: 'LKR',
    taxRatePercent: 8,
    contractorName: 'Alu Door Pro',
    siteAddress: '12 Marine Drive, Colombo',
    ...overrides,
  };
}

function modelFor(openings: OpeningItem[], meta: Partial<ProjectMetadata> = {}) {
  const metaProject = project(meta);
  const derived = openings.map(deriveDoor);
  const nesting = nestProjectCuts(derived.flatMap((d) => d.cutList));
  const dossier = buildManufacturingDossier(metaProject, derived, nesting);
  return buildProjectDashboard({
    project: metaProject,
    openings,
    derivedOpenings: derived,
    nesting,
    dossier,
    activities: [
      { id: 'a1', kind: 'opened', title: 'Project opened', projectName: metaProject.projectName, ts: 2 },
      { id: 'a2', kind: 'saved', title: 'Other project saved', projectName: 'Another Project', ts: 3 },
    ],
    lastUpdated: '2026-09-05T10:00:00.000Z',
  });
}

describe('buildProjectDashboard', () => {
  it('scopes identity to the current project only', () => {
    const model = modelFor([opening()]);
    expect(model.identity.name).toBe('Luxury Villa Glazing Project');
    expect(model.identity.number).toBe('ALU-2026-08');
    expect(model.identity.client).toBe('Atelier Architecture & Interiors');
    expect(model.identity.site).toBe('12 Marine Drive, Colombo');
    expect(model.identity.revision).toBe('ALU-2026-08-20260905');
    expect(model.identity.lastUpdated).toBe('2026-09-05T10:00:00.000Z');
  });

  it('derives metrics from the live derived model and nesting', () => {
    const model = modelFor([opening()]);
    const byKey = Object.fromEntries(model.metrics.map((m) => [m.key, m]));
    expect(byKey.openings.value).toBe('1');
    expect(byKey.quantity.value).toBe('2');
    expect(Number(byKey.aluminium.value)).toBeGreaterThan(0);
    expect(Number(byKey['glass-panels'].value)).toBeGreaterThan(0);
    expect(Number(byKey['stock-bars'].value)).toBeGreaterThanOrEqual(1);
    expect(Number(byKey.yield.value)).toBeGreaterThan(0);
    expect(Number(byKey.yield.value)).toBeLessThanOrEqual(100);
  });

  it('lists every opening with its live values and status', () => {
    const model = modelFor([opening(), opening({ id: 'o2', tag: 'W-01', name: 'Slider', system: '70S-sliding-2p', width: 2000 })]);
    expect(model.openings).toHaveLength(2);
    expect(model.openings[0]).toMatchObject({ tag: 'D-01', width: 950, quantity: 2, status: 'READY' });
    expect(model.openings[1].systemLabel).toContain('70S');
  });

  it('flags an opening outside the fabricable envelope for review', () => {
    const model = modelFor([opening({ width: 9999 })]);
    expect(model.openings[0].status).toBe('REVIEW');
    expect(model.design.incomplete).toBe(1);
    expect(model.readiness.status).toBe('REQUIRES REVIEW');
  });

  it('keeps design counters consistent', () => {
    const model = modelFor([opening(), opening({ id: 'o2', tag: 'D-02' })]);
    expect(model.design.total).toBe(2);
    expect(model.design.configured + model.design.incomplete).toBe(2);
    expect(['READY', 'IN PROGRESS', 'REVIEW', 'BLOCKED']).toContain(model.design.threeD);
  });

  it('reuses the manufacturing dossier for fabrication, materials and commercial totals', () => {
    const model = modelFor([opening()]);
    expect(model.materials.glass.panelCount).toBeGreaterThan(0);
    expect(model.fabrication.stockBars).toBeGreaterThanOrEqual(1);
    expect(model.commercial.available).toBe(true);
    expect(model.commercial.grandTotal).toBeGreaterThan(0);
    const lineSum = model.commercial.lines.reduce((sum, line) => sum + line.amount, 0);
    expect(lineSum).toBeCloseTo(model.commercial.subtotal, 1);
  });

  it('produces a readiness checklist with a derived status', () => {
    const model = modelFor([opening()]);
    expect(model.readiness.items.length).toBeGreaterThanOrEqual(9);
    expect(['READY', 'REQUIRES REVIEW', 'BLOCKED']).toContain(model.readiness.status);
    expect(model.health).toHaveLength(5);
  });

  it('treats a project with no openings as blocked', () => {
    const model = modelFor([]);
    expect(model.identity.status).toBe('BLOCKED');
    expect(model.metrics.find((m) => m.key === 'glazed-area')?.state).toBe('na');
    expect(model.readiness.items.find((item) => item.key === 'release')?.state).toBe('blocked');
  });

  it('only includes activity belonging to this project', () => {
    const model = modelFor([opening()]);
    expect(model.activity).toHaveLength(1);
    expect(model.activity[0].title).toBe('Project opened');
  });

  it('surfaces only real project notes', () => {
    const model = modelFor([opening({ notes: 'Check threshold' })]);
    expect(model.notes.some((note) => note.label === 'Site address')).toBe(true);
    expect(model.notes.some((note) => note.value === 'Check threshold')).toBe(true);
    expect(model.notes.some((note) => note.label === 'Client phone')).toBe(false);
  });
});
