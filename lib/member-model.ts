// Canonical member model for the FullAluDoor 2D CAD member editor.
//
// The member list and the CUSTOM BAR / PROFILE EDITOR are driven entirely from
// this module, which in turn derives the catalogue standard from the existing
// lib/door-model deriveDoor() engine. Nothing here invents manufacturer data:
// profile codes, weights and section dimensions come from PROFILE_WEIGHTS, and
// any member without verified catalogue geometry is reported as such.

import { deriveDoor, PROFILE_WEIGHTS } from './door-model';
import { memberSpecFor, memberSpecsFor, type MemberCategory, type MemberSpec } from './member-map';
import type {
  CutItem,
  MemberEditableField,
  MemberOverride,
  OpeningItem,
} from './types';

export interface MemberDimensions {
  length: number;
  width?: number;
  depth?: number;
}

export interface MemberDefinition {
  memberId: string;
  /** Technical reference, e.g. D-01-LJ-01. */
  displayId: string;
  name: string;
  /** Short technical code, e.g. LJ. */
  code: string;
  /** Technical member type, e.g. JAMB, RAIL. */
  type: string;
  /** Fabrication grouping used by the member list. */
  category: MemberCategory;
  profile: string;
  profileName: string;
  group: CutItem['group'];
  axis: 'horizontal' | 'vertical';
  quantity: number;
  editable: MemberEditableField[];
  mode: 'standard' | 'custom';
  standard: MemberDimensions;
  current: MemberDimensions & {
    wallThickness?: number;
    offsetX?: number;
    offsetY?: number;
    rotation?: number;
  };
}

export function stripMemberOverrides(opening: OpeningItem): OpeningItem {
  if (!opening.memberOverrides) return opening;
  const { memberOverrides: _ignored, ...rest } = opening;
  void _ignored;
  return rest;
}

export function hasCustomOverrides(opening: OpeningItem): boolean {
  const overrides = opening.memberOverrides;
  if (!overrides) return false;
  return Object.values(overrides).some((override) => override.mode === 'custom');
}

export function customMemberCount(opening: OpeningItem): number {
  const overrides = opening.memberOverrides;
  if (!overrides) return 0;
  return Object.values(overrides).filter((override) => override.mode === 'custom').length;
}

export function customOverrideFor(opening: OpeningItem, memberId: string): MemberOverride | null {
  const override = opening.memberOverrides?.[memberId];
  return override && override.mode === 'custom' ? override : null;
}

export function deriveMemberDefinitions(opening: OpeningItem): MemberDefinition[] {
  const specs = memberSpecsFor(opening.system);
  if (!specs.length) return [];
  // Standard baseline: always derive from the catalogue geometry (overrides
  // stripped) so STANDARD vs CUSTOM is always comparable.
  const standard = deriveDoor(stripMemberOverrides(opening));
  const cutById = new Map(standard.cutList.map((cut) => [cut.id, cut]));

  const definitions: MemberDefinition[] = [];
  for (const spec of specs) {
    const cut = cutById.get(spec.cutId);
    if (!cut) continue;
    const weight = PROFILE_WEIGHTS[cut.profile];
    const standardDims: MemberDimensions = {
      length: cut.length,
      width: weight?.face,
      depth: weight?.depth,
    };
    const override = customOverrideFor(opening, spec.memberId);
    const mode: MemberDefinition['mode'] = override ? 'custom' : 'standard';
    const current = override
      ? {
          length: override.length ?? standardDims.length,
          width: override.width ?? standardDims.width,
          depth: override.depth ?? standardDims.depth,
          wallThickness: override.wallThickness,
          offsetX: override.offsetX,
          offsetY: override.offsetY,
          rotation: override.rotation,
        }
      : { ...standardDims };
    definitions.push({
      memberId: spec.memberId,
      displayId: `${opening.tag}-${spec.code}-01`,
      name: spec.name,
      code: spec.code,
      type: spec.type,
      category: spec.category,
      profile: cut.profile,
      profileName: weight?.name ?? cut.description,
      group: cut.group,
      axis: spec.axis,
      quantity: spec.scope === 'group' ? cut.qty : 1,
      editable: spec.editable,
      mode,
      standard: standardDims,
      current,
    });
  }
  return definitions;
}

/**
 * Returns the live cut-list item for a member. Overridden instances carry their
 * own cut (with memberId); standard members fall back to the catalogue cut.
 */
export function resolveMemberCut(opening: OpeningItem, memberId: string): CutItem | undefined {
  const spec = memberSpecFor(opening.system, memberId);
  if (!spec) return undefined;
  const derived = deriveDoor(opening);
  const direct = derived.cutList.find((cut) => cut.memberId === memberId);
  if (direct) return direct;
  const base = derived.cutList.find((cut) => cut.id === spec.cutId);
  if (base) return base;
  return derived.cutList.find((cut) => cut.id.startsWith(`${spec.cutId}:`));
}

export interface MemberImpact {
  cutList: boolean;
  nesting: boolean;
  stock: boolean;
  yield: boolean;
  weight: boolean;
  bom: boolean;
  glass: boolean;
  quotation: boolean;
  audit: boolean;
  pdf: boolean;
  threeD: 'updated' | 'review';
}

/**
 * Dependency-aware live impact for the selected member. Derived from real
 * geometry deltas (never hardcoded per-member logic) so the UI only claims a
 * downstream system changed when the canonical model actually changed.
 */
export function computeMemberImpact(
  opening: OpeningItem,
  definition: MemberDefinition,
  values?: Partial<MemberOverride>
): MemberImpact {
  const spec = memberSpecFor(opening.system, definition.memberId);
  const standardDerived = deriveDoor(stripMemberOverrides(opening));
  const proposedValues = values ?? definition.current;
  const proposedOverride = spec
    ? buildMemberOverride(spec, proposedValues)
    : { memberId: definition.memberId, mode: 'custom' as const, ...proposedValues };
  const proposedOpening: OpeningItem = {
    ...opening,
    memberOverrides: { ...opening.memberOverrides, [definition.memberId]: proposedOverride },
  };
  const proposedDerived = deriveDoor(proposedOpening);

  const lengthChanged = Math.abs((proposedValues.length ?? definition.current.length) - definition.standard.length) > 0.01;
  const widthChanged =
    proposedValues.width !== undefined &&
    definition.standard.width !== undefined &&
    Math.abs(proposedValues.width - definition.standard.width) > 0.01;
  const depthChanged =
    proposedValues.depth !== undefined &&
    definition.standard.depth !== undefined &&
    Math.abs(proposedValues.depth - definition.standard.depth) > 0.01;
  const sectionChanged = widthChanged || depthChanged;
  const custom = lengthChanged || sectionChanged;

  const glassChanged =
    JSON.stringify(proposedDerived.glassPanels.map((panel) => [panel.width, panel.height])) !==
    JSON.stringify(standardDerived.glassPanels.map((panel) => [panel.width, panel.height]));

  return {
    cutList: custom,
    nesting: custom && lengthChanged,
    stock: custom && lengthChanged,
    yield: custom && lengthChanged,
    weight: custom && (lengthChanged || sectionChanged),
    bom: custom && (lengthChanged || sectionChanged),
    glass: glassChanged,
    quotation: custom && (lengthChanged || sectionChanged || glassChanged),
    audit: custom,
    pdf: custom,
    threeD: opening.system === '100D-single' ? 'updated' : 'review',
  };
}

export function memberDefinition(opening: OpeningItem, memberId: string): MemberDefinition | undefined {
  return deriveMemberDefinitions(opening).find((definition) => definition.memberId === memberId);
}

const LIMITS: Record<MemberEditableField, { min: number; max: number }> = {
  length: { min: 20, max: 20000 },
  width: { min: 1, max: 1000 },
  height: { min: 1, max: 1000 },
  depth: { min: 1, max: 1000 },
  wallThickness: { min: 0.5, max: 50 },
  offsetX: { min: -5000, max: 5000 },
  offsetY: { min: -5000, max: 5000 },
  rotation: { min: -360, max: 360 },
};

/**
 * Validates the numeric values of a proposed override for a member. Rejects
 * negative/zero/NaN/Infinity and out-of-range values so broken geometry can
 * never be committed to the canonical model.
 */
export function validateMemberValues(
  spec: MemberSpec,
  values: Partial<MemberOverride>
): string[] {
  const errors: string[] = [];
  for (const field of spec.editable) {
    const value = values[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${field} must be a finite number.`);
      continue;
    }
    const limit = LIMITS[field];
    if (value <= 0 && field !== 'offsetX' && field !== 'offsetY' && field !== 'rotation') {
      errors.push(`${field} must be greater than zero.`);
      continue;
    }
    if (value < limit.min || value > limit.max) {
      errors.push(`${field} must be between ${limit.min} and ${limit.max} mm.`);
    }
  }
  return errors;
}

const PERIMETER_VERTICAL = /jamb$/;
const PERIMETER_HORIZONTAL = /^(head|sill|head-track|sill-track)$/;

/**
 * Non-blocking fabrication review signals. A custom length that no longer
 * matches the opening envelope is allowed (the user asked for it) but must be
 * surfaced for review — it is never silently treated as fabrication approved.
 */
export function memberGeometryConflicts(
  opening: OpeningItem,
  definition: MemberDefinition,
  values: Partial<MemberOverride>
): string[] {
  const conflicts: string[] = [];
  const length = values.length ?? definition.current.length;
  const expected =
    PERIMETER_VERTICAL.test(definition.memberId)
      ? opening.height
      : PERIMETER_HORIZONTAL.test(definition.memberId)
        ? opening.width
        : null;
  if (expected !== null && Math.abs(length - expected) > 1) {
    conflicts.push(
      `${definition.name} custom length ${length} mm differs from the opening envelope ${expected} mm. Review required.`
    );
  }
  const width = values.width;
  if (
    width !== undefined &&
    definition.group === 'Outer Frame' &&
    definition.standard.width !== undefined &&
    Math.abs(width - definition.standard.width) > 0.01
  ) {
    conflicts.push(
      `${definition.name} custom section width ${width} mm changes the frame face. Review required.`
    );
  }
  return conflicts;
}

export function buildMemberOverride(
  spec: MemberSpec,
  values: Partial<MemberOverride>
): MemberOverride {
  const override: MemberOverride = { memberId: spec.memberId, mode: 'custom' };
  for (const field of spec.editable) {
    const value = values[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      override[field] = value;
    }
  }
  return override;
}

export function memberHasEditableChange(
  definition: MemberDefinition,
  values: Partial<MemberOverride>
): boolean {
  for (const field of definition.editable) {
    const value = values[field];
    if (value === undefined) continue;
    const standard = definition.standard[field as keyof MemberDimensions];
    if (standard === undefined || Math.abs(value - standard) > 0.01) return true;
  }
  return false;
}

export type { MemberSpec };
