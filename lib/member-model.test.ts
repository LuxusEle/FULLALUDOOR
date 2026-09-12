import { describe, expect, it } from 'vitest';
import { applyMemberOverrides, deriveDoor, fabricationChecks } from './door-model';
import {
  buildMemberOverride,
  computeMemberImpact,
  customMemberCount,
  deriveMemberDefinitions,
  hasCustomOverrides,
  memberGeometryConflicts,
  memberHasEditableChange,
  resolveMemberCut,
  validateMemberValues,
} from './member-model';
import { memberSpecFor, memberSpecsFor } from './member-map';
import { nestProjectCuts } from './nesting-engine';
import { buildProjectBOM } from './bom-engine';
import { buildManufacturingDossier } from './manufacturing-dossier';
import { buildShopDrawing, renderShopDrawingSvg } from './shop-drawing';
import { encodeStoredProject } from './project-storage';
import type { MemberOverride, OpeningItem, ProjectMetadata } from './types';

const project: ProjectMetadata = {
  id: 'p-member',
  projectName: 'Member Override Test',
  clientName: 'Test Client',
  projectNumber: 'FA-2026-100',
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
    height: 2200,
    quantity: 1,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Ground Floor',
    hingeSide: 'left',
    ...overrides,
  };
}

const leftJamb = (length: number): Record<string, MemberOverride> => ({
  'left-jamb': { memberId: 'left-jamb', mode: 'custom', length },
});

describe('member identity & selection model', () => {
  it('derives stable member definitions with catalogue standard dimensions', () => {
    const definitions = deriveMemberDefinitions(opening());
    const left = definitions.find((definition) => definition.memberId === 'left-jamb');
    const right = definitions.find((definition) => definition.memberId === 'right-jamb');
    expect(left?.name).toBe('Left Jamb');
    expect(right?.name).toBe('Right Jamb');
    expect(left?.profile).toBe('100D-3105');
    expect(left?.standard.length).toBe(2200);
    expect(left?.mode).toBe('standard');
    expect(left?.editable).toContain('length');
  });

  it('reports the custom mode and current value after an override', () => {
    const definitions = deriveMemberDefinitions(opening({ memberOverrides: leftJamb(2215) }));
    const left = definitions.find((definition) => definition.memberId === 'left-jamb');
    const right = definitions.find((definition) => definition.memberId === 'right-jamb');
    expect(left?.mode).toBe('custom');
    expect(left?.current.length).toBe(2215);
    expect(right?.mode).toBe('standard');
    expect(right?.current.length).toBe(2200);
    expect(customMemberCount(opening({ memberOverrides: leftJamb(2215) }))).toBe(1);
    expect(hasCustomOverrides(opening())).toBe(false);
  });
});

describe('member-level override isolation', () => {
  it('changes only the overridden member length in the cut list', () => {
    const standard = deriveDoor(opening());
    const custom = deriveDoor(opening({ memberOverrides: leftJamb(2215) }));
    const leftCut = custom.cutList.find((cut) => cut.memberId === 'left-jamb');
    expect(leftCut?.length).toBe(2215);
    expect(leftCut?.custom).toBe(true);
    const standardFrameJamb = standard.cutList.find((cut) => cut.id === 'F-J');
    expect(standardFrameJamb?.qty).toBe(2);
    // The overridden cut splits into per-instance pieces: only the left instance
    // carries the memberId; the right instance stays at catalogue length.
    const rightCut = custom.cutList.find((cut) => cut.id === 'F-J:2');
    expect(rightCut?.length).toBe(2200);
    expect(rightCut?.custom).toBeFalsy();
  });

  it('does not leak an override from D-01 to D-02 or to another project', () => {
    const d01 = deriveDoor(opening({ memberOverrides: leftJamb(2215) }));
    const d02 = deriveDoor(opening({ id: 'o2', tag: 'D-02' }));
    const frameJamb = d02.cutList.find((cut) => cut.id === 'F-J');
    expect(frameJamb?.length).toBe(2200);
    expect(frameJamb?.qty).toBe(2);
    expect(d01.config.tag).toBe('D-01');
  });

  it('keeps left and right jamb overrides independent', () => {
    const overrides: Record<string, MemberOverride> = {
      ...leftJamb(2215),
      'right-jamb': { memberId: 'right-jamb', mode: 'custom', length: 2180 },
    };
    const custom = deriveDoor(opening({ memberOverrides: overrides }));
    expect(custom.cutList.find((cut) => cut.memberId === 'left-jamb')?.length).toBe(2215);
    expect(custom.cutList.find((cut) => cut.memberId === 'right-jamb')?.length).toBe(2180);
  });
});

describe('geometry and dimension propagation', () => {
  it('updates the drawn member geometry for a custom length', () => {
    const drawing = buildShopDrawing({
      project,
      opening: opening({ memberOverrides: leftJamb(2215) }),
      openings: [],
    });
    const jamb = drawing.elevation.selectableMembers?.find((member) => member.id === 'left-jamb');
    expect(jamb?.custom).toBe(true);
    expect(jamb?.height).toBe(2215);
    const customChain = drawing.dimensions.find((chain) =>
      chain.segments.some((segment) => segment.id === 'v-custom-left-jamb')
    );
    expect(customChain?.segments.find((segment) => segment.id === 'v-custom-left-jamb')?.label).toBe('2215');
    expect(renderShopDrawingSvg(drawing)).toContain('2215');
  });

  it('recalculates the glass opening when a stile section width changes', () => {
    const standard = deriveDoor(opening());
    const custom = deriveDoor(
      opening({ memberOverrides: { 'hinge-stile': { memberId: 'hinge-stile', mode: 'custom', width: 80 } } })
    );
    expect(custom.leftStileFace).toBe(80);
    expect(custom.clearWidth).toBeCloseTo(standard.clearWidth - 14, 5);
    const glass = custom.glassPanels[0];
    const standardGlass = standard.glassPanels[0];
    expect(glass.width).toBeLessThan(standardGlass.width);
  });
});

describe('downstream fabrication propagation', () => {
  it('propagates a custom length into nesting, stock and material totals', () => {
    const standard = deriveDoor(opening());
    const custom = deriveDoor(opening({ memberOverrides: leftJamb(2215) }));
    const standardNesting = nestProjectCuts(standard.cutList);
    const customNesting = nestProjectCuts(custom.cutList);
    expect(customNesting.totalProfileLengthM).not.toBe(standardNesting.totalProfileLengthM);
    expect(customNesting.totalAluWeightKg).not.toBe(standardNesting.totalAluWeightKg);
  });

  it('propagates a custom length into the BOM extrusion quantities', () => {
    const standard = deriveDoor(opening());
    const custom = deriveDoor(opening({ memberOverrides: leftJamb(2215) }));
    const standardBom = buildProjectBOM([standard], nestProjectCuts(standard.cutList));
    const customBom = buildProjectBOM([custom], nestProjectCuts(custom.cutList));
    const standardWeight = standardBom.find((item) => item.code === '100D-3105')?.totalWeightKg ?? 0;
    const customWeight = customBom.find((item) => item.code === '100D-3105')?.totalWeightKg ?? 0;
    expect(customWeight).toBeGreaterThan(standardWeight);
  });

  it('surfaces custom overrides in the fabrication audit as review required', () => {
    const checks = fabricationChecks(opening({ memberOverrides: leftJamb(2215) }));
    expect(checks.some((check) => check.value === 'REVIEW REQUIRED')).toBe(true);
    expect(checks.some((check) => check.value === 'NOT VERIFIED')).toBe(true);
    expect(fabricationChecks(opening())).toHaveLength(5);
  });
});

describe('validation', () => {
  const spec = memberSpecFor('100D-single', 'left-jamb')!;

  it('rejects negative, zero, NaN and Infinity values', () => {
    expect(validateMemberValues(spec, { length: -5 }).length).toBeGreaterThan(0);
    expect(validateMemberValues(spec, { length: 0 }).length).toBeGreaterThan(0);
    expect(validateMemberValues(spec, { length: Number.NaN }).length).toBeGreaterThan(0);
    expect(validateMemberValues(spec, { length: Number.POSITIVE_INFINITY }).length).toBeGreaterThan(0);
    expect(validateMemberValues(spec, { width: -1 }).length).toBeGreaterThan(0);
  });

  it('rejects out-of-range values but accepts a sane custom length', () => {
    expect(validateMemberValues(spec, { length: 50000 }).length).toBeGreaterThan(0);
    expect(validateMemberValues(spec, { length: 2215 })).toEqual([]);
  });

  it('flags geometry conflicts without blocking the edit', () => {
    const definition = deriveMemberDefinitions(opening()).find((item) => item.memberId === 'left-jamb')!;
    const conflicts = memberGeometryConflicts(opening(), definition, { length: 2215 });
    expect(conflicts.length).toBeGreaterThan(0);
    expect(memberGeometryConflicts(opening(), definition, { length: 2200 })).toEqual([]);
  });

  it('detects whether an edit actually differs from the catalogue standard', () => {
    const definition = deriveMemberDefinitions(opening()).find((item) => item.memberId === 'left-jamb')!;
    expect(memberHasEditableChange(definition, { length: 2200 })).toBe(false);
    expect(memberHasEditableChange(definition, { length: 2215 })).toBe(true);
  });

  it('builds a scoped override object from raw values', () => {
    const override = buildMemberOverride(spec, { length: 2215, width: 100 });
    expect(override).toEqual({ memberId: 'left-jamb', mode: 'custom', length: 2215, width: 100 });
  });
});

describe('persistence', () => {
  it('round-trips custom overrides through the stored project schema', () => {
    const doc = encodeStoredProject(project, [opening({ memberOverrides: leftJamb(2215) })]);
    expect(doc.openings[0].memberOverrides?.['left-jamb']?.length).toBe(2215);
    expect(doc.openings[0].memberOverrides?.['left-jamb']?.mode).toBe('custom');
  });

  it('re-derives identical downstream values after a reload', () => {
    const doc = encodeStoredProject(project, [opening({ memberOverrides: leftJamb(2215) })]);
    const reloaded = deriveDoor(doc.openings[0]);
    const direct = deriveDoor(opening({ memberOverrides: leftJamb(2215) }));
    expect(reloaded.cutList.find((cut) => cut.memberId === 'left-jamb')?.length).toBe(
      direct.cutList.find((cut) => cut.memberId === 'left-jamb')?.length
    );
  });
});

describe('end-to-end acceptance (D-01 left jamb 2200 → 2215)', () => {
  it('updates 2D, cut list, nesting, BOM, audit and dossier from one canonical edit', () => {
    const custom = opening({ memberOverrides: leftJamb(2215) });
    const derived = deriveDoor(custom);
    const nesting = nestProjectCuts(derived.cutList);
    const bom = buildProjectBOM([derived], nesting);
    const dossier = buildManufacturingDossier(project, [derived], nesting, '2026-09-12 10:00');

    // Cut list
    expect(derived.cutList.find((cut) => cut.memberId === 'left-jamb')?.length).toBe(2215);
    // 2D geometry
    const drawing = buildShopDrawing({ project, opening: custom, openings: [custom] });
    expect(drawing.elevation.selectableMembers?.find((member) => member.id === 'left-jamb')?.height).toBe(2215);
    // Audit + dossier
    expect(dossier.checks.some((check) => check.status === 'REVIEW')).toBe(true);
    expect(bom.some((item) => item.category === 'Extrusions')).toBe(true);
    expect(dossier.quote.grandTotal).toBeGreaterThan(0);
  });

  it('keeps the right jamb at its own value while the left is custom', () => {
    const custom = opening({
      memberOverrides: {
        ...leftJamb(2215),
        'right-jamb': { memberId: 'right-jamb', mode: 'custom', length: 2210 },
      },
    });
    const derived = deriveDoor(custom);
    expect(derived.cutList.find((cut) => cut.memberId === 'left-jamb')?.length).toBe(2215);
    expect(derived.cutList.find((cut) => cut.memberId === 'right-jamb')?.length).toBe(2210);
  });
});

describe('applyMemberOverrides direct contract', () => {
  it('returns the standard cut list untouched when there are no overrides', () => {
    const standard = deriveDoor(opening());
    const result = applyMemberOverrides('100D-single', standard.cutList, undefined);
    expect(result).toEqual(standard.cutList);
  });
});

describe('member technical metadata & workspace helpers', () => {
  it('exposes technical code, type, category and reference for each member', () => {
    const left = deriveMemberDefinitions(opening()).find((item) => item.memberId === 'left-jamb');
    expect(left?.code).toBe('LJ');
    expect(left?.type).toBe('JAMB');
    expect(left?.category).toBe('Frame');
    expect(left?.displayId).toBe('D-01-LJ-01');
  });

  it('groups members into fabrication categories', () => {
    const categories = new Set(memberSpecsFor('100D-single').map((spec) => spec.category));
    expect(categories.has('Frame')).toBe(true);
    expect(categories.has('Sash')).toBe(true);
    expect(categories.has('Bead')).toBe(true);
  });

  it('resolves the live cut item including angles for cut information', () => {
    const standardCut = resolveMemberCut(opening(), 'head');
    expect(standardCut?.profile).toBe('100D-3105');
    expect(standardCut?.angleLeft).toBe(45);
    expect(standardCut?.angleRight).toBe(45);

    const customCut = resolveMemberCut(opening({ memberOverrides: leftJamb(2215) }), 'left-jamb');
    expect(customCut?.length).toBe(2215);
    expect(customCut?.custom).toBe(true);
  });

  it('reports live downstream impact from real geometry deltas', () => {
    const definition = deriveMemberDefinitions(opening()).find((item) => item.memberId === 'left-jamb')!;
    const impact = computeMemberImpact(opening(), definition, { length: 2215 });
    expect(impact.cutList).toBe(true);
    expect(impact.nesting).toBe(true);
    expect(impact.bom).toBe(true);
    expect(impact.audit).toBe(true);
    expect(impact.pdf).toBe(true);
    expect(impact.threeD).toBe('updated');
  });

  it('marks 3D as review for systems without 3D member propagation', () => {
    const slider = opening({ system: '70S-sliding-2p', width: 2000, height: 2100 });
    const definition = deriveMemberDefinitions(slider).find((item) => item.memberId === 'left-jamb')!;
    const impact = computeMemberImpact(slider, definition, { length: 2110 });
    expect(impact.threeD).toBe('review');
    expect(impact.cutList).toBe(true);
  });

  it('detects a glass-opening change from a stile section override', () => {
    const definition = deriveMemberDefinitions(opening()).find((item) => item.memberId === 'hinge-stile')!;
    const impact = computeMemberImpact(opening(), definition, { width: 80 });
    expect(impact.glass).toBe(true);
    expect(impact.quotation).toBe(true);
  });
  it('derives a selectable region for glazing beads from the glass geometry', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [] });
    const boxes = drawing.elevation.selectableMembers ?? [];
    const upper = boxes.find((box) => box.id === 'upper-bead');
    const lower = boxes.find((box) => box.id === 'lower-bead');
    expect(upper).toBeDefined();
    expect(lower).toBeDefined();
    expect(upper!.width).toBeGreaterThan(0);
    expect(upper!.height).toBeGreaterThan(0);
    // Upper bead tracks the top glass, lower bead the bottom glass.
    expect(upper!.y).toBeLessThan(lower!.y);
  });
});

describe('realistic D-01 acceptance across the canonical pipeline', () => {
  it('keeps left jamb, head and stile overrides independent and consistent', () => {
    const overrides: Record<string, MemberOverride> = {
      'left-jamb': { memberId: 'left-jamb', mode: 'custom', length: 2125 },
      head: { memberId: 'head', mode: 'custom', length: 1210 },
      'hinge-stile': { memberId: 'hinge-stile', mode: 'custom', width: 72 },
    };
    const custom = opening({ memberOverrides: overrides });
    const derived = deriveDoor(custom);
    expect(derived.cutList.find((cut) => cut.memberId === 'left-jamb')?.length).toBe(2125);
    expect(derived.cutList.find((cut) => cut.memberId === 'head')?.length).toBe(1210);
    expect(derived.leftStileFace).toBe(72);

    const standard = deriveDoor(opening());
    expect(standard.cutList.find((cut) => cut.memberId === 'left-jamb')).toBeUndefined();
    expect(standard.cutList.find((cut) => cut.id === 'F-J')?.length).toBe(2200);

    // Persistence round-trip preserves every override and re-derives identically.
    const doc = encodeStoredProject(project, [custom]);
    const reloaded = deriveDoor(doc.openings[0]);
    expect(reloaded.cutList.find((cut) => cut.memberId === 'left-jamb')?.length).toBe(2125);
    expect(reloaded.cutList.find((cut) => cut.memberId === 'head')?.length).toBe(1210);
    expect(reloaded.leftStileFace).toBe(72);
  });
});
