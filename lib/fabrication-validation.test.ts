import { describe, expect, it } from 'vitest';
import { deriveDoor, expandOpeningCuts } from './door-model';
import { nestProjectCuts, DEFAULT_STOCK_LEN_MM } from './nesting-engine';
import { buildProjectBOM } from './bom-engine';
import { buildManufacturingDossier } from './manufacturing-dossier';
import { deriveFabricationMembers } from './member-model';
import { validateFabrication } from './fabrication-validation';
import type { MemberOverride, OpeningItem, ProjectMetadata } from './types';

const project: ProjectMetadata = {
  id: 'p-pdf',
  projectName: 'PDF Calculation Audit',
  clientName: 'Test Client',
  projectNumber: 'FA-2026-200',
  date: '2026-09-12',
  currency: 'LKR',
  taxRatePercent: 8,
  contractorName: 'Test Fabricator',
};

function opening(overrides: Partial<OpeningItem> = {}): OpeningItem {
  return {
    id: 'o1',
    tag: 'D-01',
    name: 'Main Entrance',
    system: '100D-single',
    width: 900,
    height: 2100,
    quantity: 1,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Ground Floor',
    hingeSide: 'left',
    ...overrides,
  };
}

function pipeline(openings: OpeningItem[]) {
  const derived = openings.map((item) => deriveDoor(item));
  const cuts = expandOpeningCuts(derived);
  const nesting = nestProjectCuts(cuts);
  const bom = buildProjectBOM(derived, nesting);
  const fabricationMembers = derived.flatMap((d) => {
    const units = Math.max(1, Math.round(d.config.quantity || 1));
    return deriveFabricationMembers(d.config).map((member) => ({ ...member, qty: member.qty * units }));
  });
  return { derived, cuts, nesting, bom, fabricationMembers };
}

describe('bead cut-length calculation', () => {
  it('cuts horizontal beads to the glass width and vertical beads to the glass height (never averaged)', () => {
    const d = deriveDoor(opening());
    const byId = new Map(d.cutList.map((cut) => [cut.id, cut]));
    const lowerGlass = d.glassPanels.find((panel) => panel.id.endsWith('G1'))!;
    const upperGlass = d.glassPanels.find((panel) => panel.id.endsWith('G2'))!;

    expect(byId.get('B-U')?.length).toBeCloseTo(lowerGlass.width, 1);
    expect(byId.get('B-L')?.length).toBeCloseTo(lowerGlass.width, 1);
    expect(byId.get('B-UV')?.length).toBeCloseTo(upperGlass.height, 1);
    expect(byId.get('B-LV')?.length).toBeCloseTo(lowerGlass.height, 1);
    // The old implementation averaged width and height into one value.
    expect(byId.get('B-U')?.length).not.toBeCloseTo((lowerGlass.width + upperGlass.height) / 2, 0.5);
    // Four bead cuts, two horizontal (qty 2) and two vertical (qty 2).
    expect(byId.get('B-U')?.qty).toBe(2);
    expect(byId.get('B-UV')?.qty).toBe(2);
  });

  it('applies the same per-orientation rule to the double door', () => {
    const d = deriveDoor(opening({ system: '100D-double', width: 1800 }));
    const byId = new Map(d.cutList.map((cut) => [cut.id, cut]));
    const lowerGlass = d.glassPanels.find((panel) => panel.id.includes('GL1'))!;
    const upperGlass = d.glassPanels.find((panel) => panel.id.includes('GU1'))!;
    expect(byId.get('B-D')?.length).toBeCloseTo(lowerGlass.width, 1);
    expect(byId.get('B-DVL')?.length).toBeCloseTo(lowerGlass.height, 1);
    expect(byId.get('B-DVU')?.length).toBeCloseTo(upperGlass.height, 1);
  });
});

describe('canonical fabrication members', () => {
  it('keeps left and right jambs as separate physical instances', () => {
    const members = deriveFabricationMembers(opening());
    const left = members.find((member) => member.memberId === 'left-jamb');
    const right = members.find((member) => member.memberId === 'right-jamb');
    expect(left?.displayId).toBe('D-01-LJ-01');
    expect(right?.displayId).toBe('D-01-RJ-01');
    expect(left?.qty).toBe(1);
    expect(right?.qty).toBe(1);
  });

  it('carries the custom flag, standard length and delta', () => {
    const overrides: Record<string, MemberOverride> = {
      'left-jamb': { memberId: 'left-jamb', mode: 'custom', length: 2125 },
    };
    const members = deriveFabricationMembers(opening({ memberOverrides: overrides }));
    const left = members.find((member) => member.memberId === 'left-jamb')!;
    expect(left.custom).toBe(true);
    expect(left.lengthMm).toBe(2125);
    expect(left.standardLengthMm).toBe(2100);
    expect(left.deltaMm).toBe(25);
    const right = members.find((member) => member.memberId === 'right-jamb')!;
    expect(right.custom).toBe(false);
    expect(right.lengthMm).toBe(2100);
  });

  it('expands quantities for multi-unit openings at the project level', () => {
    const single = deriveDoor(opening());
    const doubled = deriveDoor(opening({ quantity: 2 }));
    const expanded = expandOpeningCuts([doubled]);
    const singleJamb = single.cutList.find((cut) => cut.id === 'F-J')!;
    const doubledJamb = expanded.find((cut) => cut.id === 'F-J')!;
    expect(doubledJamb.qty).toBe(singleJamb.qty * 2);
  });
});

describe('fabrication reconciliation', () => {
  it('passes on a clean standard project', () => {
    const { derived, nesting, bom, fabricationMembers } = pipeline([opening()]);
    const validation = validateFabrication({ openings: derived, fabricationMembers, nesting, bom });
    expect(validation.ok).toBe(true);
    expect(validation.summary.bomReconciled).toBe(true);
    expect(validation.summary.nestingReconciled).toBe(true);
    expect(validation.summary.physicalMembers).toBe(validation.summary.nestedPieces);
  });

  it('flags an overfilled stock bar as invalid nesting', () => {
    const { derived, nesting, bom, fabricationMembers } = pipeline([opening()]);
    const tampered = {
      ...nesting,
      resultsByProfile: nesting.resultsByProfile.map((profile) => ({
        ...profile,
        bars: profile.bars.map((bar) => ({ ...bar, cuts: [...bar.cuts, { ...bar.cuts[0], cutId: 'injected', lengthMm: DEFAULT_STOCK_LEN_MM }] })),
      })),
    };
    const validation = validateFabrication({ openings: derived, fabricationMembers, nesting: tampered, bom });
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'INVALID_NESTING')).toBe(true);
  });

  it('flags a cut list / nesting mismatch', () => {
    const { derived, nesting, bom, fabricationMembers } = pipeline([opening()]);
    const tampered = {
      ...nesting,
      resultsByProfile: nesting.resultsByProfile.map((profile) => ({
        ...profile,
        bars: profile.bars.map((bar) => ({ ...bar, cuts: bar.cuts.slice(0, Math.max(0, bar.cuts.length - 1)) })),
      })),
    };
    const validation = validateFabrication({ openings: derived, fabricationMembers, nesting: tampered, bom });
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'NESTING_QTY_MISMATCH' || issue.code === 'MEMBER_COUNT_MISMATCH')).toBe(true);
  });

  it('counts custom members as reviews without auto-passing them', () => {
    const { derived, nesting, bom, fabricationMembers } = pipeline([
      opening({ memberOverrides: { 'left-jamb': { memberId: 'left-jamb', mode: 'custom', length: 2125 } } }),
    ]);
    const validation = validateFabrication({ openings: derived, fabricationMembers, nesting, bom });
    expect(validation.summary.customMembers).toBe(1);
    expect(validation.summary.reviews).toBe(1);
    expect(validation.ok).toBe(true);
  });

  it('reconciles a real dossier end to end', () => {
    const openings = [opening(), opening({ id: 'o2', tag: 'D-02', width: 1000, height: 2200 })];
    const { derived, cuts, nesting } = pipeline(openings);
    const dossier = buildManufacturingDossier(project, derived, nesting, '2026-09-12 10:00');
    expect(dossier.validation.ok).toBe(true);
    expect(dossier.allCuts).toHaveLength(cuts.length);
    expect(dossier.fabricationMembers.length).toBeGreaterThan(0);
    expect(dossier.validation.summary.openings).toBe(2);
    // Every physical member is accounted for exactly once in nesting.
    const physical = dossier.fabricationMembers.reduce((sum, member) => sum + member.qty, 0);
    expect(dossier.validation.summary.nestedPieces).toBe(physical);
  });
});

describe('regression: custom member isolation', () => {
  it('a custom left jamb on D-01 does not modify D-02', () => {
    const d01 = deriveDoor(opening({ memberOverrides: { 'left-jamb': { memberId: 'left-jamb', mode: 'custom', length: 2125 } } }));
    const d02 = deriveDoor(opening({ id: 'o2', tag: 'D-02' }));
    const m01 = deriveFabricationMembers(d01.config).find((member) => member.memberId === 'left-jamb')!;
    const m02 = deriveFabricationMembers(d02.config).find((member) => member.memberId === 'left-jamb')!;
    expect(m01.lengthMm).toBe(2125);
    expect(m02.lengthMm).toBe(2100);
    expect(m02.custom).toBe(false);
  });
});

describe('coverage across every typology', () => {
  const systems = [
    '100D-single',
    '100D-double',
    '100S-sliding-2p',
    '70S-sliding-2p',
    '70S-sliding-4p',
    '74-cgroove',
    'casement',
  ] as const;

  it.each(systems)('every cut item maps to a fabrication member (%s)', (system) => {
    const sample = opening({ system, width: 1200, height: 1500, quantity: 1 });
    const derived = deriveDoor(sample);
    const members = deriveFabricationMembers(sample);
    const memberQty = members.reduce((sum, member) => sum + member.qty, 0);
    const cutQty = derived.cutList.reduce((sum, cut) => sum + cut.qty, 0);
    expect(memberQty).toBe(cutQty);
    expect(members.length).toBeGreaterThan(0);
  });

  it.each(systems)('nesting never overfills a stock bar (%s)', (system) => {
    const sample = opening({ system, width: 1200, height: 1500, quantity: 2 });
    const derived = deriveDoor(sample);
    const nesting = nestProjectCuts(expandOpeningCuts([derived]));
    for (const profile of nesting.resultsByProfile) {
      for (const bar of profile.bars) {
        const cutSum = bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
        const kerf = Math.max(0, bar.cuts.length - 1) * profile.bladeKerfMm;
        expect(cutSum + kerf).toBeLessThanOrEqual(profile.stockLengthMm + 0.6);
        expect(bar.remainingOffcutMm).toBeGreaterThanOrEqual(-0.6);
      }
    }
  });
});
