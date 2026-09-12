import { z } from 'zod';
import type { CutItem, DerivedOpening, MemberOverride, OpeningItem, TypologyId } from './types';
import { TYPOLOGY_IDS } from './types';
import { memberSpecsFor, type MemberSpec } from './member-map';

export const memberOverrideSchema = z.object({
  memberId: z.string(),
  mode: z.enum(['standard', 'custom']),
  width: z.number().optional(),
  height: z.number().optional(),
  depth: z.number().optional(),
  length: z.number().optional(),
  wallThickness: z.number().optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  rotation: z.number().optional(),
});

export const doorConfigSchema = z.object({
  width: z.number().min(700).max(1400),
  height: z.number().min(1800).max(2800),
  hingeSide: z.enum(['left', 'right']).default('left'),
  openingAngle: z.number().min(0).max(110).default(8),
  finish: z.enum(['natural', 'black', 'bronze', 'white']).default('natural'),
  exploded: z.boolean().default(false),
  showGlass: z.boolean().default(true),
  system: z.enum(TYPOLOGY_IDS).default('100D-single'),
  tag: z.string().default('D-01'),
  quantity: z.number().min(1).default(1),
  glass: z.enum(['6mm-clear', '8mm-tinted', '10.38mm-laminated', '12mm-toughened', '24mm-dgu']).default('6mm-clear'),
  location: z.string().default('Ground Floor'),
  // Optional hardware/accessory toggles
  thresholdSeal: z.boolean().default(false),
  closer: z.boolean().default(false),
  weatherStrip: z.boolean().default(true),
  // Exploded view factor 0–100
  explodeFactor: z.number().min(0).max(100).default(0),
  // Per-member custom overrides (canonical CAD edits)
  memberOverrides: z.record(z.string(), memberOverrideSchema).optional(),
});

export type DoorConfig = z.infer<typeof doorConfigSchema>;

export const defaultDoorConfig: DoorConfig = {
  width: 900,
  height: 2100,
  hingeSide: 'left',
  openingAngle: 8,
  finish: 'natural',
  exploded: false,
  showGlass: true,
  system: '100D-single',
  tag: 'D-01',
  quantity: 1,
  glass: '6mm-clear',
  location: 'Ground Floor',
  thresholdSeal: false,
  closer: false,
  weatherStrip: true,
  explodeFactor: 0,
};

export const PROFILE_WEIGHTS: Record<string, { name: string; kgM: number; depth: number; face: number }> = {
  // 100 mm Series
  '100D-3105': { name: 'Outer Frame (Head/Jambs)', kgM: 1.38, depth: 45.0, face: 100.0 },
  '100D-101':  { name: 'Hinge Stile', kgM: 1.12, depth: 45.0, face: 66.0 },
  '100D-102':  { name: 'Meeting Stile (Double Door)', kgM: 1.15, depth: 45.0, face: 66.0 },
  '100D-103':  { name: 'Lock Stile', kgM: 1.18, depth: 45.0, face: 70.0 },
  '100D-201':  { name: 'Top Rail', kgM: 1.22, depth: 45.0, face: 80.0 },
  '100D-301':  { name: 'Mid Rail (Transom)', kgM: 1.45, depth: 45.0, face: 100.0 },
  '100D-401':  { name: 'Bottom Rail', kgM: 1.85, depth: 45.0, face: 120.0 },
  '100D-501':  { name: 'Snap Glazing Bead', kgM: 0.18, depth: 14.0, face: 16.0 },
  // 100 mm Advance Sliding Series (SD)
  'SD-1001':   { name: 'Outer Frame Top Track', kgM: 1.62, depth: 100.0, face: 88.0 },
  'SD-1101':   { name: 'Outer Frame Bottom Track', kgM: 1.72, depth: 100.0, face: 88.0 },
  'SD-1701':   { name: 'Outer Frame Side Jamb', kgM: 1.18, depth: 100.0, face: 48.0 },
  'SD-1501':   { name: 'Sash Frame (Top/Bottom/Side)', kgM: 1.06, depth: 48.0, face: 60.0 },
  'SD-1301':   { name: 'Sash Interlock Stile', kgM: 0.62, depth: 48.0, face: 40.0 },
  'SD-1302':   { name: 'Sash Interlock Stile', kgM: 0.62, depth: 48.0, face: 40.0 },
  'GL-108':    { name: 'Glazing Bead', kgM: 0.21, depth: 12.0, face: 15.0 },
  'GL-109':    { name: 'Glazing Bead', kgM: 0.21, depth: 12.0, face: 15.0 },
  // 70S Sliding Series
  '70S-1001-1': { name: '2-Track Frame Head', kgM: 0.94, depth: 32.0, face: 69.7 },
  '70S-1101-1': { name: '2-Track Frame Sill', kgM: 1.05, depth: 30.0, face: 69.7 },
  '70S-1201-1': { name: '2-Track Frame Jamb', kgM: 0.78, depth: 25.0, face: 72.7 },
  '70S-1401':   { name: 'Sliding Top Sash Rail', kgM: 0.46, depth: 31.7, face: 27.9 },
  '70S-1501':   { name: 'Sliding Bottom Sash Rail', kgM: 0.72, depth: 56.1, face: 21.9 },
  '70S-1701':   { name: 'Sliding Lock / Handle Stile', kgM: 0.433, depth: 26.0, face: 29.9 },
  '70S-1601':   { name: 'Sliding Interlock Stile', kgM: 0.495, depth: 32.0, face: 29.9 },
  '70S-3002':   { name: '70S Glazing Bead', kgM: 0.16, depth: 12.0, face: 14.0 },
  // 74 mm C-Groove Series
  'ESD-1001':   { name: '74 mm Perimeter Frame', kgM: 0.88, depth: 46.2, face: 74.0 },
  'ESD-1501':   { name: '74 mm Sash Stile', kgM: 0.52, depth: 32.0, face: 38.0 },
  'ESD-1502':   { name: '74 mm Interlock Stile', kgM: 0.58, depth: 32.0, face: 42.0 },
  // Casement / Awning
  'ALU-02':     { name: 'Casement Outer Frame', kgM: 0.68, depth: 38.0, face: 45.0 },
  'ALU-07':     { name: 'Casement Vent Sash', kgM: 0.74, depth: 38.0, face: 48.0 },
};

function customOverride(
  overrides: Record<string, MemberOverride> | undefined,
  memberId: string
): MemberOverride | undefined {
  const override = overrides?.[memberId];
  return override && override.mode === 'custom' ? override : undefined;
}

function applyCutOverride(cut: CutItem, override: MemberOverride, spec: MemberSpec): CutItem {
  const length =
    typeof override.length === 'number' && Number.isFinite(override.length) ? override.length : cut.length;
  const weight = PROFILE_WEIGHTS[cut.profile] || { kgM: 1.0 };
  return {
    ...cut,
    length: Number(length.toFixed(1)),
    totalWeightKg: Number(((length / 1000) * weight.kgM * cut.qty).toFixed(2)),
    memberId: spec.memberId,
    custom: true,
  };
}

/**
 * Applies member-level overrides to the standard cut list. Only the targeted
 * member changes; multi-quantity cuts are split into per-instance pieces so a
 * Left Jamb override never touches the Right Jamb.
 */
export function applyMemberOverrides(
  system: TypologyId,
  cutList: CutItem[],
  overrides: Record<string, MemberOverride> | undefined
): CutItem[] {
  if (!overrides || Object.keys(overrides).length === 0) return cutList;
  const specs = memberSpecsFor(system);
  if (!specs.length) return cutList;
  const byCut = new Map<string, MemberSpec[]>();
  for (const spec of specs) {
    const list = byCut.get(spec.cutId) ?? [];
    list.push(spec);
    byCut.set(spec.cutId, list);
  }

  const out: CutItem[] = [];
  for (const cut of cutList) {
    const specsForCut = byCut.get(cut.id);
    if (!specsForCut || specsForCut.length === 0) {
      out.push(cut);
      continue;
    }

    const groupSpec = specsForCut.find((spec) => spec.scope === 'group');
    const groupOverride = groupSpec ? customOverride(overrides, groupSpec.memberId) : undefined;
    if (groupSpec && groupOverride) {
      out.push(applyCutOverride(cut, groupOverride, groupSpec));
      continue;
    }

    const instanceSpecs = specsForCut.filter((spec) => spec.scope === 'instance');
    const anyInstanceOverride = instanceSpecs.some((spec) => customOverride(overrides, spec.memberId));
    if (!anyInstanceOverride) {
      out.push(cut);
      continue;
    }

    if (cut.qty <= 1) {
      const spec = instanceSpecs[0];
      const override = spec ? customOverride(overrides, spec.memberId) : undefined;
      out.push(spec && override ? applyCutOverride(cut, override, spec) : cut);
      continue;
    }

    for (let index = 1; index <= cut.qty; index += 1) {
      const spec = instanceSpecs.find((candidate) => candidate.instance === index);
      const override = spec ? customOverride(overrides, spec.memberId) : undefined;
      const instance: CutItem = { ...cut, id: `${cut.id}:${index}`, qty: 1 };
      out.push(spec && override ? applyCutOverride(instance, override, spec) : instance);
    }
  }
  return out;
}

export function deriveDoor(input: DoorConfig | OpeningItem): DerivedOpening & {
  frameFace: number;
  leafLeft: number;
  leafRight: number;
  leafBottom: number;
  leafTop: number;
  stileFace: number;
  leftStileFace: number;
  rightStileFace: number;
  hingeStileFace: number;
  lockStileFace: number;
  railLeft: number;
  railRight: number;
  jointGap: number;
  glassBite: number;
  bottomRail: number;
  topRail: number;
  midRail: number;
  midCenter: number;
  glassX0: number;
  glassX1: number;
  lowerGlassY0: number;
  lowerGlassY1: number;
  upperGlassY0: number;
  upperGlassY1: number;
  clearWidth: number;
  clearHeight: number;
  cutList: CutItem[];
} {
  const system: TypologyId = (input as { system?: TypologyId }).system || '100D-single';
  const tag = (input as { tag?: string }).tag || 'D-01';
  const width = input.width;
  const height = input.height;
  const hingeSide = input.hingeSide || 'left';

  const areaM2 = Number(((width * height) / 1_000_000).toFixed(3));
  const perimeterM = Number(((2 * (width + height)) / 1_000).toFixed(2));

  let cutList: CutItem[] = [];
  const glassPanels: DerivedOpening['glassPanels'] = [];
  const hardware: DerivedOpening['hardware'] = [];

  // Default geometry outputs
  let frameFace = 45;
  const clearance = 4;
  const leafLeft = frameFace + clearance;
  const leafRight = width - frameFace - clearance;
  const leafBottom = 8;
  const leafTop = height - frameFace - clearance;

  const hingeStileFace = 66;
  const lockStileFace = 70;
  const memberOverrides = (input as OpeningItem).memberOverrides;
  const widthOverride = (memberId: string) => {
    const override = customOverride(memberOverrides, memberId);
    return override && typeof override.width === 'number' ? override.width : undefined;
  };
  let leftStileFace = hingeSide === 'left' ? hingeStileFace : lockStileFace;
  let rightStileFace = hingeSide === 'left' ? lockStileFace : hingeStileFace;
  const hingeWidth = widthOverride('hinge-stile');
  const lockWidth = widthOverride('lock-stile');
  if (hingeSide === 'left') {
    if (hingeWidth !== undefined) leftStileFace = hingeWidth;
    if (lockWidth !== undefined) rightStileFace = lockWidth;
  } else {
    if (hingeWidth !== undefined) rightStileFace = hingeWidth;
    if (lockWidth !== undefined) leftStileFace = lockWidth;
  }
  const stileFace = Math.max(leftStileFace, rightStileFace);
  const railLeft = leafLeft + leftStileFace;
  const railRight = leafRight - rightStileFace;
  const jointGap = 0.6;
  const glassBite = 12;
  const bottomRail = 120;
  const topRail = 80;
  const midRail = 100;

  const midCenter = leafBottom + (leafTop - leafBottom) * 0.46;
  const glassX0 = railLeft - glassBite;
  const glassX1 = railRight + glassBite;
  const lowerGlassY0 = leafBottom + bottomRail - glassBite;
  const lowerGlassY1 = midCenter - midRail / 2 + glassBite;
  const upperGlassY0 = midCenter + midRail / 2 - glassBite;
  const upperGlassY1 = leafTop - topRail + glassBite;
  const clearWidth = railRight - railLeft;
  const clearHeight = leafTop - leafBottom;

  const makeCut = (
    id: string,
    profile: string,
    description: string,
    qty: number,
    length: number,
    ends: string,
    angleLeft: number,
    angleRight: number,
    group: CutItem['group']
  ): CutItem => {
    const spec = PROFILE_WEIGHTS[profile] || { kgM: 1.0 };
    const totWt = Number(((length / 1000) * spec.kgM * qty).toFixed(2));
    return {
      id,
      openingTag: tag,
      profile,
      description,
      qty,
      length: Number(length.toFixed(1)),
      ends,
      angleLeft,
      angleRight,
      group,
      unitWeightKgM: spec.kgM,
      totalWeightKg: totWt,
    };
  };

  // --- TYPOLOGY BRANCHES ---
  if (system === '100D-single') {
    cutList = [
      makeCut('F-J', '100D-3105', 'Outer frame jamb', 2, height, 'Top 45° / bottom square', 45, 90, 'Outer Frame'),
      makeCut('F-H', '100D-3105', 'Outer frame head', 1, width, '45° / 45° miter', 45, 45, 'Outer Frame'),
      makeCut('L-H', '100D-101', 'Hinge stile', 1, leafTop - leafBottom, 'Square + hinge drill', 90, 90, 'Sash / Leaf'),
      makeCut('L-L', '100D-103', 'Lock stile', 1, leafTop - leafBottom, 'Square + lock prep', 90, 90, 'Sash / Leaf'),
      makeCut('R-T', '100D-201', 'Top rail', 1, clearWidth - jointGap * 2, 'Square / cleat prep', 90, 90, 'Sash / Leaf'),
      makeCut('R-M', '100D-301', 'Mid rail', 1, clearWidth - jointGap * 2, 'Square / cleat prep', 90, 90, 'Sash / Leaf'),
      makeCut('R-B', '100D-401', 'Bottom rail', 1, clearWidth - jointGap * 2, 'Square / cleat prep', 90, 90, 'Sash / Leaf'),
      makeCut('B-U', '100D-501', 'Upper glazing bead', 4, (clearWidth + (upperGlassY1 - upperGlassY0)) / 2, 'Miter 45°', 45, 45, 'Glazing Bead'),
      makeCut('B-L', '100D-501', 'Lower glazing bead', 4, (clearWidth + (lowerGlassY1 - lowerGlassY0)) / 2, 'Miter 45°', 45, 45, 'Glazing Bead'),
    ];

    const gw = glassX1 - glassX0;
    const ghLower = lowerGlassY1 - lowerGlassY0;
    const ghUpper = upperGlassY1 - upperGlassY0;
    glassPanels.push(
      { id: `${tag}-G1`, width: gw, height: ghLower, areaM2: Number(((gw * ghLower) / 1e6).toFixed(3)), thickness: 6, description: 'Lower 6mm Toughened Glass', qty: 1 },
      { id: `${tag}-G2`, width: gw, height: ghUpper, areaM2: Number(((gw * ghUpper) / 1e6).toFixed(3)), thickness: 6, description: 'Upper 6mm Toughened Glass', qty: 1 }
    );

    hardware.push(
      { code: 'HNG-100', name: 'Heavy Duty 3-Barrel Hinge', qty: 3, unit: 'pcs', category: 'Hinges' },
      { code: 'LCK-100', name: 'Euro Profile Mortise Lock & Cylinder', qty: 1, unit: 'set', category: 'Locks' },
      { code: 'HND-280', name: 'Architectural D-Pull Handle 300mm', qty: 1, unit: 'pair', category: 'Fasteners' },
      { code: 'CLT-100', name: 'Die-cast Internal Angle Cleats', qty: 6, unit: 'pcs', category: 'Cleats' },
      { code: 'ROD-M6',  name: 'M6 Threaded Tie Rod with Brass Nuts', qty: 3, unit: 'pcs', category: 'Cleats' },
      { code: 'EPDM-01', name: 'Wedge EPDM Glazing Gasket', qty: Number((perimeterM * 2.2).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: 'SCR-ST',  name: 'Stainless Steel Assembly Screws 4.2x38', qty: 24, unit: 'pcs', category: 'Fasteners' }
    );
  } else if (system === '100D-double') {
    const meetingClearance = 6;
    const eachLeafW = (width - 2 * frameFace - 2 * clearance - meetingClearance) / 2;
    const eachRailLen = eachLeafW - leftStileFace - rightStileFace - jointGap * 2;

    cutList = [
      makeCut('F-J', '100D-3105', 'Outer frame jamb', 2, height, 'Top 45° / bottom square', 45, 90, 'Outer Frame'),
      makeCut('F-H', '100D-3105', 'Outer frame head', 1, width, '45° / 45° miter', 45, 45, 'Outer Frame'),
      makeCut('L-H', '100D-101', 'Hinge stiles', 2, leafTop - leafBottom, 'Square / hinge prep', 90, 90, 'Sash / Leaf'),
      makeCut('L-M', '100D-102', 'Meeting stiles (rebated)', 2, leafTop - leafBottom, 'Square / flush bolt prep', 90, 90, 'Sash / Leaf'),
      makeCut('R-T', '100D-201', 'Top rails', 2, eachRailLen, 'Square / cleat prep', 90, 90, 'Sash / Leaf'),
      makeCut('R-M', '100D-301', 'Mid rails', 2, eachRailLen, 'Square / cleat prep', 90, 90, 'Sash / Leaf'),
      makeCut('R-B', '100D-401', 'Bottom rails', 2, eachRailLen, 'Square / cleat prep', 90, 90, 'Sash / Leaf'),
      makeCut('B-D', '100D-501', 'Glazing beads', 16, eachRailLen, '45° miter', 45, 45, 'Glazing Bead'),
    ];

    const gw = eachRailLen + 2 * glassBite;
    const ghLower = lowerGlassY1 - lowerGlassY0;
    const ghUpper = upperGlassY1 - upperGlassY0;
    glassPanels.push(
      { id: `${tag}-GL1`, width: gw, height: ghLower, areaM2: Number(((gw * ghLower) / 1e6).toFixed(3)), thickness: 6, description: 'Active Leaf Lower Glass', qty: 2 },
      { id: `${tag}-GU1`, width: gw, height: ghUpper, areaM2: Number(((gw * ghUpper) / 1e6).toFixed(3)), thickness: 6, description: 'Active Leaf Upper Glass', qty: 2 }
    );

    hardware.push(
      { code: 'HNG-100', name: 'Heavy Duty 3-Barrel Hinge', qty: 6, unit: 'pcs', category: 'Hinges' },
      { code: 'LCK-100', name: 'Euro Profile Double Door Lock Set', qty: 1, unit: 'set', category: 'Locks' },
      { code: 'FLB-200', name: 'Concealed Flush Bolts 200mm', qty: 2, unit: 'pcs', category: 'Locks' },
      { code: 'HND-280', name: 'Architectural D-Pull Handle Pair', qty: 2, unit: 'pair', category: 'Fasteners' },
      { code: 'CLT-100', name: 'Die-cast Internal Angle Cleats', qty: 12, unit: 'pcs', category: 'Cleats' },
      { code: 'ROD-M6',  name: 'M6 Threaded Tie Rod with Brass Nuts', qty: 6, unit: 'pcs', category: 'Cleats' },
      { code: 'EPDM-01', name: 'Wedge EPDM Glazing Gasket', qty: Number((perimeterM * 3.6).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: 'SCR-ST',  name: 'Stainless Steel Assembly Screws', qty: 48, unit: 'pcs', category: 'Fasteners' }
    );
  } else if (system === '100S-sliding-2p') {
    const interlockOverlap = 36;
    const leafW = (width + interlockOverlap) / 2;
    const leafH = height - 24;
    const sashStileFace = 40;
    const sashRailLen = leafW - sashStileFace * 2;
    const gw = sashRailLen - 24;
    const gh = leafH - 92;

    cutList = [
      makeCut('100S-FH', 'SD-1001', 'Outer frame top track', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('100S-FS', 'SD-1101', 'Outer frame bottom track / sill', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('100S-FJ', 'SD-1701', 'Outer frame side jambs', 2, height, '90° square', 90, 90, 'Outer Frame'),
      makeCut('100S-RT', 'SD-1501', 'Sash top rails', 2, sashRailLen, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('100S-RB', 'SD-1501', 'Sash bottom rails', 2, sashRailLen, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('100S-SS', 'SD-1501', 'Sash side stiles (jamb side)', 2, leafH, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('100S-IL', 'SD-1301', 'Sash interlock stile (leaf 1)', 1, leafH, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('100S-IR', 'SD-1302', 'Sash interlock stile (leaf 2)', 1, leafH, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('100S-B1', 'GL-108', 'Top glazing beads', 4, gw, '90° square', 90, 90, 'Glazing Bead'),
      makeCut('100S-B2', 'GL-109', 'Bottom glazing beads', 4, gw, '90° square', 90, 90, 'Glazing Bead'),
    ];

    glassPanels.push({
      id: `${tag}-GSD`,
      width: gw,
      height: gh,
      areaM2: Number(((gw * gh * 2) / 1e6).toFixed(3)),
      thickness: 6,
      description: '6mm Clear Tempered Glass (2 sliding sashes)',
      qty: 2,
    });

    hardware.push(
      { code: '100S-ROL', name: 'Heavy-Duty Sash Roller Carriages (100 mm Series)', qty: 4, unit: 'pcs', category: 'Rollers' },
      { code: '100S-LCK', name: 'Sliding Hook-Lock Handle Set', qty: 1, unit: 'set', category: 'Locks' },
      { code: '100S-WPL', name: 'Continuous Wool-Pile Weatherstrip', qty: Number((((leafW + leafH) * 4) / 1000).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: '100S-EPDM', name: 'U-Channel Glass Gasket (6mm)', qty: Number((((gw + gh) * 4) / 1000).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: 'SCR-42', name: 'Assembly Self-Tapping Screws 4.2x38', qty: 24, unit: 'pcs', category: 'Fasteners' }
    );
  } else if (system === '70S-sliding-2p') {
    frameFace = 32;
    const overlap = 28;
    const leafW = (width + overlap) / 2;
    const leafH = height - 28; // enters top track 16mm, clears sill 12mm
    const railCut = leafW - 60; // between 30mm stiles

    cutList = [
      makeCut('70S-FH', '70S-1001-1', '2-Track frame head', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('70S-FS', '70S-1101-1', '2-Track frame sill with track', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('70S-FJ', '70S-1201-1', '2-Track frame jambs', 2, height, '90° square', 90, 90, 'Outer Frame'),
      makeCut('70S-RT', '70S-1401',   'Sliding top sash rail', 2, railCut, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('70S-RB', '70S-1501',   'Sliding bottom sash rail', 2, railCut, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('70S-SL', '70S-1701',   'Handle / lock sash stile', 2, leafH, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('70S-SI', '70S-1601',   'Interlock meeting stile', 2, leafH, '90° square', 90, 90, 'Sash / Leaf'),
    ];

    const gw = leafW - 40;
    const gh = leafH - 68;
    glassPanels.push({
      id: `${tag}-G1`,
      width: gw,
      height: gh,
      areaM2: Number(((gw * gh * 2) / 1e6).toFixed(3)),
      thickness: 6,
      description: '6mm Clear Tempered Glass (2 panels)',
      qty: 2,
    });

    hardware.push(
      { code: '70S-1914', name: 'Adjustable Brass V-Groove Rollers', qty: 4, unit: 'pcs', category: 'Rollers' },
      { code: '70S-LCK',  name: 'Flush Mount Sliding Hook Lock', qty: 2, unit: 'set', category: 'Locks' },
      { code: '70S-WPL',  name: 'Wool Pile Weatherstrip Gasket', qty: Number((leafH * 4 / 1000 + leafW * 4 / 1000).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: '70S-EPDM', name: 'U-Channel Glass Gasket (6mm)', qty: Number(((gw + gh) * 4 / 1000).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: 'SCR-42',   name: 'Assembly Self-Tapping Screws 4.2x38', qty: 16, unit: 'pcs', category: 'Fasteners' }
    );
  } else if (system === '70S-sliding-4p') {
    frameFace = 32;
    const overlap = 56;
    const leafW = (width + overlap) / 4;
    const leafH = height - 28;
    const railCut = leafW - 60;

    cutList = [
      makeCut('70S-FH', '70S-1001-1', '2-Track frame head', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('70S-FS', '70S-1101-1', '2-Track frame sill with track', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('70S-FJ', '70S-1201-1', '2-Track frame jambs', 2, height, '90° square', 90, 90, 'Outer Frame'),
      makeCut('70S-RT', '70S-1401',   'Sliding top sash rail', 4, railCut, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('70S-RB', '70S-1501',   'Sliding bottom sash rail', 4, railCut, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('70S-SL', '70S-1701',   'Meeting & lock sash stiles', 4, leafH, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('70S-SI', '70S-1601',   'Interlock meeting stiles', 4, leafH, '90° square', 90, 90, 'Sash / Leaf'),
    ];

    const gw = leafW - 40;
    const gh = leafH - 68;
    glassPanels.push({
      id: `${tag}-G4P`,
      width: gw,
      height: gh,
      areaM2: Number(((gw * gh * 4) / 1e6).toFixed(3)),
      thickness: 6,
      description: '6mm Clear Tempered Glass (4 panels)',
      qty: 4,
    });

    hardware.push(
      { code: '70S-1914', name: 'Adjustable Brass V-Groove Rollers', qty: 8, unit: 'pcs', category: 'Rollers' },
      { code: '70S-LCK',  name: 'Central Double Hook Deadlock & Strike', qty: 1, unit: 'set', category: 'Locks' },
      { code: '70S-WPL',  name: 'Wool Pile Weatherstrip Gasket', qty: Number((leafH * 8 / 1000 + leafW * 8 / 1000).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: '70S-EPDM', name: 'U-Channel Glass Gasket (6mm)', qty: Number(((gw + gh) * 8 / 1000).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: 'SCR-42',   name: 'Assembly Self-Tapping Screws', qty: 32, unit: 'pcs', category: 'Fasteners' }
    );
  } else if (system === '74-cgroove') {
    frameFace = 74;
    const frameClearance = 62;
    const sashH = height - 2 * frameClearance;
    const clearW = width - 2 * frameClearance;
    const sashW = (clearW + 50) / 2;

    cutList = [
      makeCut('ESD-FH', 'ESD-1001', '74 mm Frame head', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('ESD-FS', 'ESD-1001', '74 mm Frame sill', 1, width, '90° square', 90, 90, 'Outer Frame'),
      makeCut('ESD-FJ', 'ESD-1001', '74 mm Frame jambs', 2, height, '90° square', 90, 90, 'Outer Frame'),
      makeCut('ESD-ST', 'ESD-1501', 'Sash top rails', 2, sashW, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('ESD-SB', 'ESD-1501', 'Sash bottom rails', 2, sashW, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('ESD-SS', 'ESD-1501', 'Sash stiles (handle)', 2, sashH, '90° square', 90, 90, 'Sash / Leaf'),
      makeCut('ESD-SI', 'ESD-1502', 'Sash interlock stiles', 2, sashH, '90° square', 90, 90, 'Sash / Leaf'),
    ];

    const gw = sashW - 54;
    const gh = sashH - 54;
    glassPanels.push({
      id: `${tag}-GESD`,
      width: gw,
      height: gh,
      areaM2: Number(((gw * gh * 2) / 1e6).toFixed(3)),
      thickness: 6,
      description: '6mm Clear Glass (74mm Slider)',
      qty: 2,
    });

    hardware.push(
      { code: 'ESD-ROL', name: 'Heavy Duty C-Groove Steel Rollers', qty: 4, unit: 'pcs', category: 'Rollers' },
      { code: 'ESD-LCK', name: 'Recessed Finger Pull Latch', qty: 2, unit: 'pcs', category: 'Locks' },
      { code: 'ESD-WPL', name: 'Wool Pile Sealant Gasket', qty: 14, unit: 'm', category: 'Gaskets' },
      { code: 'SCR-42',  name: 'Fastener Screws 4.2x38', qty: 16, unit: 'pcs', category: 'Fasteners' }
    );
  } else {
    // Casement / Awning window (ALU-02 & ALU-07)
    frameFace = 45;
    const sashOverlap = 8;
    const sashW = width - 2 * frameFace + 2 * sashOverlap;
    const sashH = height - 2 * frameFace + 2 * sashOverlap;

    cutList = [
      makeCut('ALU-FH', 'ALU-02', 'Casement frame head', 1, width, '45° miter', 45, 45, 'Outer Frame'),
      makeCut('ALU-FS', 'ALU-02', 'Casement frame sill', 1, width, '45° miter', 45, 45, 'Outer Frame'),
      makeCut('ALU-FJ', 'ALU-02', 'Casement frame jambs', 2, height, '45° miter', 45, 45, 'Outer Frame'),
      makeCut('ALU-SH', 'ALU-07', 'Sash top/bottom rails', 2, sashW, '45° miter', 45, 45, 'Sash / Leaf'),
      makeCut('ALU-SV', 'ALU-07', 'Sash side stiles', 2, sashH, '45° miter', 45, 45, 'Sash / Leaf'),
    ];

    const gw = sashW - 76;
    const gh = sashH - 76;
    glassPanels.push({
      id: `${tag}-GCAS`,
      width: gw,
      height: gh,
      areaM2: Number(((gw * gh) / 1e6).toFixed(3)),
      thickness: 6,
      description: '6mm Clear Toughened Glass',
      qty: 1,
    });

    hardware.push(
      { code: 'CAS-FS12', name: 'Stainless Steel 12-Inch Friction Stay Pair', qty: 1, unit: 'pair', category: 'Hinges' },
      { code: 'CAS-HND',  name: 'Multi-Point Locking Espagnolette Handle', qty: 1, unit: 'set', category: 'Locks' },
      { code: 'CAS-EPDM', name: 'Acoustic Dual EPDM Gasket', qty: Number((perimeterM * 2).toFixed(1)), unit: 'm', category: 'Gaskets' },
      { code: 'CAS-CLT',  name: 'Corner Assembly Miter Cleats', qty: 8, unit: 'pcs', category: 'Cleats' }
    );
  }

  cutList = applyMemberOverrides(system, cutList, memberOverrides);

  const totalAluWeightKg = Number(
    cutList.reduce((acc, cut) => acc + cut.totalWeightKg, 0).toFixed(2)
  );

  const fullOpening: OpeningItem = {
    id: (input as OpeningItem).id || tag,
    tag,
    name: (input as OpeningItem).name || `${system.toUpperCase()} Assembly`,
    system,
    width,
    height,
    quantity: (input as OpeningItem).quantity || 1,
    finish: (input as OpeningItem).finish || 'natural',
    glass: (input as OpeningItem).glass || '6mm-clear',
    location: (input as OpeningItem).location || 'Ground Floor',
    hingeSide,
    memberOverrides,
  };

  return {
    config: fullOpening,
    frameFace,
    leafLeft,
    leafRight,
    leafBottom,
    leafTop,
    stileFace,
    leftStileFace,
    rightStileFace,
    hingeStileFace,
    lockStileFace,
    railLeft,
    railRight,
    jointGap,
    glassBite,
    bottomRail,
    topRail,
    midRail,
    midCenter,
    glassX0,
    glassX1,
    lowerGlassY0,
    lowerGlassY1,
    upperGlassY0,
    upperGlassY1,
    clearWidth,
    clearHeight,
    leafWidth: leafRight - leafLeft,
    leafHeight: leafTop - leafBottom,
    cutList,
    glassPanels,
    hardware,
    areaM2,
    perimeterM,
    totalAluWeightKg,
  };
}

export function fabricationChecks(config: DoorConfig | OpeningItem) {
  const d = deriveDoor(config);
  const checks = [
    { label: 'Frame corner joints', detail: 'True 45° miters or mechanical butt joints', value: 'NO OVERLAP' },
    { label: 'Rail / stile joints', detail: `Square body, ${d.jointGap.toFixed(1)} mm assembly clearance`, value: 'NO PASS-THROUGH' },
    { label: 'Shaped joint insert', detail: 'Angle tenon + threaded tie enters hollow chamber', value: 'CATALOG DETAIL' },
    { label: 'Glass engagement', detail: `${d.glassBite} mm glass bite depth with EPDM seating`, value: `${d.glassBite} MM` },
    { label: 'Hinge / roller datum', detail: 'Coaxial hardware alignment along travel axis', value: 'ALIGNED' },
  ];
  const overrides = (config as OpeningItem).memberOverrides;
  const customCount = overrides
    ? Object.values(overrides).filter((override) => override.mode === 'custom').length
    : 0;
  if (customCount > 0) {
    checks.push({
      label: 'Custom profile override',
      detail: `${customCount} member${customCount === 1 ? '' : 's'} overridden from catalogue standard`,
      value: 'REVIEW REQUIRED',
    });
    checks.push({
      label: 'Custom dimension verification',
      detail: 'Custom geometry is not automatically fabrication approved',
      value: 'NOT VERIFIED',
    });
  }
  return checks;
}

export function jointClearanceReport(config: DoorConfig) {
  const d = deriveDoor(config);
  const railStart = d.railLeft + d.jointGap;
  const railEnd = d.railRight - d.jointGap;
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return {
    railStart,
    railEnd,
    leftStileOverlap: overlap(railStart, railEnd, d.leafLeft, d.railLeft),
    rightStileOverlap: overlap(railStart, railEnd, d.railRight, d.leafRight),
    assemblyGap: d.jointGap,
    connectorPenetrationAllowed: true,
  };
}
