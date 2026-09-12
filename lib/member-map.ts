// Shared, dependency-free map between the canonical member identities used by
// the 2D CAD member workspace and the cut-list items produced by lib/door-model.
//
// This module is deliberately free of any door-model import so that both
// lib/door-model.ts (which applies the overrides) and lib/member-model.ts
// (which describes the members for the UI) can share ONE definition. Keeping a
// single map guarantees a member edited in the CAD is the same member that
// flows into the cut list, nesting, BOM and audit.

import type { MemberEditableField, TypologyId } from './types';

export type MemberScope = 'instance' | 'group';
export type MemberAxis = 'horizontal' | 'vertical';
export type MemberCategory = 'Frame' | 'Sash' | 'Mullion' | 'Bead' | 'Track' | 'Other';

export interface MemberSpec {
  /** Stable id used as the key of OpeningItem.memberOverrides. */
  memberId: string;
  /** Human label shown in the CAD member list / workspace. */
  name: string;
  /** The cut-list item id this member maps to in the standard model. */
  cutId: string;
  scope: MemberScope;
  /** 1-based instance index within a multi-quantity cut (instance scope only). */
  instance: number;
  axis: MemberAxis;
  editable: MemberEditableField[];
  /** Short technical code used to build the member reference (e.g. LJ). */
  code: string;
  /** Technical member type (e.g. JAMB, RAIL, STILE). */
  type: string;
  /** Fabrication grouping used by the member list. */
  category: MemberCategory;
}

type RawMemberSpec = Omit<MemberSpec, 'code' | 'type' | 'category'>;

const FRAME_FIELDS: MemberEditableField[] = ['length', 'width', 'depth'];
const BEAD_FIELDS: MemberEditableField[] = ['length'];

function instance(
  memberId: string,
  name: string,
  cutId: string,
  instanceIndex: number,
  axis: MemberAxis,
  editable: MemberEditableField[] = FRAME_FIELDS
): RawMemberSpec {
  return { memberId, name, cutId, scope: 'instance', instance: instanceIndex, axis, editable };
}

function group(
  memberId: string,
  name: string,
  cutId: string,
  axis: MemberAxis,
  editable: MemberEditableField[] = BEAD_FIELDS
): RawMemberSpec {
  return { memberId, name, cutId, scope: 'group', instance: 1, axis, editable };
}

function repeated(
  base: string,
  label: string,
  cutId: string,
  count: number,
  axis: MemberAxis,
  editable: MemberEditableField[] = FRAME_FIELDS
): RawMemberSpec[] {
  return Array.from({ length: count }, (_, index) =>
    instance(count === 1 ? base : `${base}-${index + 1}`, count === 1 ? label : `${label} ${index + 1}`, cutId, index + 1, axis, editable)
  );
}

const MEMBER_SPECS: Record<TypologyId, RawMemberSpec[]> = {
  '100D-single': [
    instance('left-jamb', 'Left Jamb', 'F-J', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', 'F-J', 2, 'vertical'),
    instance('head', 'Head', 'F-H', 1, 'horizontal'),
    instance('hinge-stile', 'Hinge Stile', 'L-H', 1, 'vertical'),
    instance('lock-stile', 'Lock Stile', 'L-L', 1, 'vertical'),
    instance('top-rail', 'Top Rail', 'R-T', 1, 'horizontal'),
    instance('mid-rail', 'Mid Rail / Transom', 'R-M', 1, 'horizontal'),
    instance('bottom-rail', 'Bottom Rail', 'R-B', 1, 'horizontal'),
    group('upper-bead', 'Upper Glazing Bead (Horizontal)', 'B-U', 'horizontal'),
    group('upper-bead-v', 'Upper Glazing Bead (Vertical)', 'B-UV', 'vertical'),
    group('lower-bead', 'Lower Glazing Bead (Horizontal)', 'B-L', 'horizontal'),
    group('lower-bead-v', 'Lower Glazing Bead (Vertical)', 'B-LV', 'vertical'),
  ],
  '100D-double': [
    instance('left-jamb', 'Left Jamb', 'F-J', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', 'F-J', 2, 'vertical'),
    instance('head', 'Head', 'F-H', 1, 'horizontal'),
    instance('hinge-stile-1', 'Hinge Stile 1', 'L-H', 1, 'vertical'),
    instance('hinge-stile-2', 'Hinge Stile 2', 'L-H', 2, 'vertical'),
    instance('meeting-stile-1', 'Meeting Stile 1', 'L-M', 1, 'vertical'),
    instance('meeting-stile-2', 'Meeting Stile 2', 'L-M', 2, 'vertical'),
    instance('top-rail-1', 'Top Rail 1', 'R-T', 1, 'horizontal'),
    instance('top-rail-2', 'Top Rail 2', 'R-T', 2, 'horizontal'),
    instance('mid-rail-1', 'Mid Rail 1', 'R-M', 1, 'horizontal'),
    instance('mid-rail-2', 'Mid Rail 2', 'R-M', 2, 'horizontal'),
    instance('bottom-rail-1', 'Bottom Rail 1', 'R-B', 1, 'horizontal'),
    instance('bottom-rail-2', 'Bottom Rail 2', 'R-B', 2, 'horizontal'),
    group('glazing-bead', 'Glazing Beads (Horizontal)', 'B-D', 'horizontal'),
    group('glazing-bead-v-lower', 'Glazing Beads (Vertical Lower)', 'B-DVL', 'vertical'),
    group('glazing-bead-v-upper', 'Glazing Beads (Vertical Upper)', 'B-DVU', 'vertical'),
  ],
  '100S-sliding-2p': [
    instance('head-track', 'Head Track', '100S-FH', 1, 'horizontal'),
    instance('sill-track', 'Sill Track', '100S-FS', 1, 'horizontal'),
    instance('left-jamb', 'Left Jamb', '100S-FJ', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', '100S-FJ', 2, 'vertical'),
    ...repeated('sash-top-rail', 'Sash Top Rail', '100S-RT', 2, 'horizontal'),
    ...repeated('sash-bottom-rail', 'Sash Bottom Rail', '100S-RB', 2, 'horizontal'),
    ...repeated('jamb-stile', 'Jamb Stile', '100S-SS', 2, 'vertical'),
    instance('interlock-left', 'Interlock Stile (Leaf 1)', '100S-IL', 1, 'vertical'),
    instance('interlock-right', 'Interlock Stile (Leaf 2)', '100S-IR', 1, 'vertical'),
    group('top-bead', 'Top Glazing Beads', '100S-B1', 'horizontal'),
    group('bottom-bead', 'Bottom Glazing Beads', '100S-B2', 'horizontal'),
  ],
  '70S-sliding-2p': [
    instance('head-track', 'Head Track', '70S-FH', 1, 'horizontal'),
    instance('sill-track', 'Sill Track', '70S-FS', 1, 'horizontal'),
    instance('left-jamb', 'Left Jamb', '70S-FJ', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', '70S-FJ', 2, 'vertical'),
    ...repeated('sash-top-rail', 'Sash Top Rail', '70S-RT', 2, 'horizontal'),
    ...repeated('sash-bottom-rail', 'Sash Bottom Rail', '70S-RB', 2, 'horizontal'),
    ...repeated('handle-stile', 'Handle / Lock Stile', '70S-SL', 2, 'vertical'),
    ...repeated('interlock-stile', 'Interlock Meeting Stile', '70S-SI', 2, 'vertical'),
  ],
  '70S-sliding-4p': [
    instance('head-track', 'Head Track', '70S-FH', 1, 'horizontal'),
    instance('sill-track', 'Sill Track', '70S-FS', 1, 'horizontal'),
    instance('left-jamb', 'Left Jamb', '70S-FJ', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', '70S-FJ', 2, 'vertical'),
    ...repeated('sash-top-rail', 'Sash Top Rail', '70S-RT', 4, 'horizontal'),
    ...repeated('sash-bottom-rail', 'Sash Bottom Rail', '70S-RB', 4, 'horizontal'),
    ...repeated('handle-stile', 'Handle / Lock Stile', '70S-SL', 4, 'vertical'),
    ...repeated('interlock-stile', 'Interlock Meeting Stile', '70S-SI', 4, 'vertical'),
  ],
  '74-cgroove': [
    instance('head-track', 'Head Track', 'ESD-FH', 1, 'horizontal'),
    instance('sill-track', 'Sill Track', 'ESD-FS', 1, 'horizontal'),
    instance('left-jamb', 'Left Jamb', 'ESD-FJ', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', 'ESD-FJ', 2, 'vertical'),
    ...repeated('sash-top-rail', 'Sash Top Rail', 'ESD-ST', 2, 'horizontal'),
    ...repeated('sash-bottom-rail', 'Sash Bottom Rail', 'ESD-SB', 2, 'horizontal'),
    ...repeated('sash-stile', 'Sash Stile', 'ESD-SS', 2, 'vertical'),
    ...repeated('interlock-stile', 'Interlock Stile', 'ESD-SI', 2, 'vertical'),
  ],
  casement: [
    instance('head', 'Head', 'ALU-FH', 1, 'horizontal'),
    instance('sill', 'Sill', 'ALU-FS', 1, 'horizontal'),
    instance('left-jamb', 'Left Jamb', 'ALU-FJ', 1, 'vertical'),
    instance('right-jamb', 'Right Jamb', 'ALU-FJ', 2, 'vertical'),
    ...repeated('sash-rail', 'Sash Rail', 'ALU-SH', 2, 'horizontal'),
    ...repeated('sash-stile', 'Sash Stile', 'ALU-SV', 2, 'vertical'),
  ],
};

const META: Record<string, { code: string; type: string; category: MemberCategory }> = {
  'left-jamb': { code: 'LJ', type: 'JAMB', category: 'Frame' },
  'right-jamb': { code: 'RJ', type: 'JAMB', category: 'Frame' },
  head: { code: 'HD', type: 'HEAD', category: 'Frame' },
  sill: { code: 'SL', type: 'SILL', category: 'Frame' },
  'head-track': { code: 'HT', type: 'TRACK', category: 'Track' },
  'sill-track': { code: 'ST', type: 'TRACK', category: 'Track' },
  'hinge-stile': { code: 'HS', type: 'STILE', category: 'Sash' },
  'lock-stile': { code: 'LS', type: 'STILE', category: 'Sash' },
  'meeting-stile': { code: 'MS', type: 'MEETING STILE', category: 'Sash' },
  'top-rail': { code: 'TR', type: 'RAIL', category: 'Sash' },
  'mid-rail': { code: 'MR', type: 'TRANSOM / RAIL', category: 'Sash' },
  'bottom-rail': { code: 'BR', type: 'RAIL', category: 'Sash' },
  'sash-top-rail': { code: 'SRT', type: 'SASH RAIL', category: 'Sash' },
  'sash-bottom-rail': { code: 'SBR', type: 'SASH RAIL', category: 'Sash' },
  'sash-rail': { code: 'SR', type: 'SASH RAIL', category: 'Sash' },
  'sash-stile': { code: 'SS', type: 'SASH STILE', category: 'Sash' },
  'jamb-stile': { code: 'JS', type: 'SASH STILE', category: 'Sash' },
  'handle-stile': { code: 'HSL', type: 'HANDLE STILE', category: 'Sash' },
  'interlock-stile': { code: 'IS', type: 'INTERLOCK STILE', category: 'Mullion' },
  'interlock-left': { code: 'IL', type: 'INTERLOCK STILE', category: 'Mullion' },
  'interlock-right': { code: 'IR', type: 'INTERLOCK STILE', category: 'Mullion' },
  'upper-bead': { code: 'UBH', type: 'GLAZING BEAD', category: 'Bead' },
  'upper-bead-v': { code: 'UBV', type: 'GLAZING BEAD', category: 'Bead' },
  'lower-bead': { code: 'LBH', type: 'GLAZING BEAD', category: 'Bead' },
  'lower-bead-v': { code: 'LBV', type: 'GLAZING BEAD', category: 'Bead' },
  'glazing-bead': { code: 'GBH', type: 'GLAZING BEAD', category: 'Bead' },
  'glazing-bead-v-lower': { code: 'GBVL', type: 'GLAZING BEAD', category: 'Bead' },
  'glazing-bead-v-upper': { code: 'GBVU', type: 'GLAZING BEAD', category: 'Bead' },
  'top-bead': { code: 'TB', type: 'GLAZING BEAD', category: 'Bead' },
  'bottom-bead': { code: 'BB', type: 'GLAZING BEAD', category: 'Bead' },
};

const CATEGORY_ORDER: MemberCategory[] = ['Frame', 'Track', 'Sash', 'Mullion', 'Bead', 'Other'];

export function memberCategoryOrder(category: MemberCategory): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function annotate(raw: RawMemberSpec): MemberSpec {
  const base = raw.memberId.replace(/-\d+$/, '');
  const meta = META[base] ?? { code: base.slice(0, 3).toUpperCase(), type: base.toUpperCase(), category: 'Other' as const };
  return { ...raw, ...meta };
}

const ANNOTATED = Object.fromEntries(
  Object.entries(MEMBER_SPECS).map(([system, specs]) => [system, specs.map(annotate)])
) as Record<TypologyId, MemberSpec[]>;

export function memberSpecsFor(system: TypologyId): MemberSpec[] {
  return ANNOTATED[system] ?? [];
}

export function memberSpecFor(system: TypologyId, memberId: string): MemberSpec | undefined {
  return memberSpecsFor(system).find((spec) => spec.memberId === memberId);
}
