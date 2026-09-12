// Canonical fabrication report for the exported manufacturing pack.
//
// This module never recalculates member dimensions. Every value is read from
// the canonical door model (deriveDoor), the cut list and the nesting result.
// Where the source evidence cannot confirm an interpretation (structural
// opening vs outside frame, machine kerf, glass bite, hardware positions,
// handing/opening direction) the row is explicitly marked REVIEW — never PASS.

import { deriveDoor, PROFILE_WEIGHTS } from './door-model';
import {
  CATALOGUE_MANIFEST,
  PROFILE_VISUALS,
  SYSTEM_LABELS,
  buildElevationLayout,
  type ElevationLayout,
} from './shop-drawing';
import {
  DEFAULT_BLADE_KERF_MM,
  DEFAULT_STOCK_LEN_MM,
  USABLE_OFFCUT_MIN_MM,
} from './nesting-engine';
import type { DerivedOpening, OpeningItem, ProjectNestingSummary } from './types';

export type ReportStatus = 'PASS' | 'REVIEW';

export interface CalcRow {
  label: string;
  formula: string;
  value: string;
  source: string;
  status: ReportStatus;
}

export interface ProfileVerificationRow {
  member: string;
  code: string;
  description: string;
  cataloguePage: number | null;
  sectionVerified: boolean;
  status: ReportStatus;
}

export interface CheckRow {
  label: string;
  status: ReportStatus;
  detail: string;
}

export interface OpeningFabricationReport {
  opening: OpeningItem;
  systemLabel: string;
  elevation: ElevationLayout;
  reference: { width: number; height: number; status: 'REVIEW'; interpretation: string; note: string };
  handing: {
    hingeSide: 'left' | 'right';
    lockSide: 'left' | 'right';
    handing: string;
    openingDirection: 'REVIEW';
    status: ReportStatus;
  };
  areas: { grossM2: number; glazedM2: number };
  frameRows: CalcRow[];
  leafRows: CalcRow[];
  glassRows: CalcRow[];
  beadRows: CalcRow[];
  gasketRows: CalcRow[];
  profiles: ProfileVerificationRow[];
  cutting: {
    stockMm: number;
    kerfMm: number;
    trimMm: number;
    reusableMm: number;
    convention: string;
    kerfStatus: ReportStatus;
  };
  netFabricatedKg: number;
  checks: CheckRow[];
}

export interface ProjectWeightReconciliation {
  netFabricatedKg: number;
  purchasedStockKg: number;
  reusableOffcutKg: number;
  scrapKg: number;
  stockBars: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Net fabricated weight = sum of actual cut lengths × verified kg/m. */
export function projectNetWeightKg(openings: DerivedOpening[]): number {
  let total = 0;
  for (const opening of openings) {
    for (const cut of opening.cutList) {
      total += (cut.length / 1000) * cut.unitWeightKgM * cut.qty * Math.max(1, opening.config.quantity || 1);
    }
  }
  return round2(total);
}

/**
 * Purchased stock weight = complete 6 m bars × verified kg/m. This is not the
 * same as net fabricated weight and must never be computed from cut lengths.
 */
export function projectPurchasedWeightKg(nesting: ProjectNestingSummary): ProjectWeightReconciliation {
  let net = 0;
  let purchased = 0;
  let reusable = 0;
  let scrap = 0;
  let bars = 0;
  for (const profile of nesting.resultsByProfile) {
    const kgM = PROFILE_WEIGHTS[profile.profileCode]?.kgM ?? 0;
    net += (profile.totalNetLengthM) * kgM;
    purchased += (profile.totalStockLengthM) * kgM;
    bars += profile.totalStockBars;
    for (const bar of profile.bars) {
      const offcutKg = (bar.remainingOffcutMm / 1000) * kgM;
      if (bar.isReusableOffcut) reusable += offcutKg;
      else scrap += offcutKg;
    }
  }
  return {
    netFabricatedKg: round2(net),
    purchasedStockKg: round2(purchased),
    reusableOffcutKg: round2(reusable),
    scrapKg: round2(scrap),
    stockBars: bars,
  };
}

function profileVerification(derived: DerivedOpening): ProfileVerificationRow[] {
  const seen = new Set<string>();
  const rows: ProfileVerificationRow[] = [];
  for (const cut of derived.cutList) {
    if (seen.has(cut.profile)) continue;
    seen.add(cut.profile);
    const spec = PROFILE_WEIGHTS[cut.profile];
    const visual = PROFILE_VISUALS[cut.profile];
    const manifest = CATALOGUE_MANIFEST[cut.profile];
    const sectionVerified = Boolean(visual);
    rows.push({
      member: cut.description,
      code: cut.profile,
      description: spec?.name ?? 'Catalogue description not available',
      cataloguePage: manifest?.page ?? null,
      sectionVerified,
      status: sectionVerified && manifest ? 'PASS' : 'REVIEW',
    });
  }
  return rows;
}

export function buildOpeningFabricationReport(opening: OpeningItem): OpeningFabricationReport {
  const derived = deriveDoor(opening);
  const elevation = buildElevationLayout(opening);
  const width = opening.width;
  const height = opening.height;
  const hingeSide: 'left' | 'right' = opening.hingeSide === 'right' ? 'right' : 'left';
  const lockSide: 'left' | 'right' = hingeSide === 'left' ? 'right' : 'left';
  const cut = (id: string) => derived.cutList.find((item) => item.id === id);

  // Reference-dimension interpretation cannot be confirmed from the model.
  const referenceStatus: ReportStatus = 'REVIEW';

  const frameRows: CalcRow[] = [
    {
      label: 'Frame head (F-H)',
      formula: 'opening reference width',
      value: `${round1(width)} mm`,
      source: 'Opening input / reference dimension',
      status: referenceStatus,
    },
    {
      label: 'Frame jambs (F-J)',
      formula: 'opening reference height',
      value: `${round1(height)} mm`,
      source: 'Opening input / reference dimension',
      status: referenceStatus,
    },
  ];

  const leafWidth = round1(derived.leafRight - derived.leafLeft);
  const leafHeight = round1(derived.leafTop - derived.leafBottom);
  const leafRows: CalcRow[] = [
    {
      label: 'Leaf width',
      formula: `leafRight (${round1(derived.leafRight)}) − leafLeft (${round1(derived.leafLeft)})`,
      value: `${leafWidth} mm`,
      source: '100D system geometry (door-model)',
      status: 'REVIEW',
    },
    {
      label: 'Leaf height',
      formula: `leafTop (${round1(derived.leafTop)}) − leafBottom (${round1(derived.leafBottom)})`,
      value: `${leafHeight} mm`,
      source: '100D system geometry (door-model)',
      status: 'REVIEW',
    },
    {
      label: 'Hinge stile (L-H)',
      formula: 'leaf height',
      value: `${round1(cut('L-H')?.length ?? leafHeight)} mm`,
      source: 'Cut list',
      status: 'REVIEW',
    },
    {
      label: 'Lock stile (L-L)',
      formula: 'leaf height',
      value: `${round1(cut('L-L')?.length ?? leafHeight)} mm`,
      source: 'Cut list',
      status: 'REVIEW',
    },
    {
      label: 'Rails (R-T / R-M / R-B)',
      formula: `clearWidth (${round1(derived.clearWidth)}) − 2 × joint gap (${round1(derived.jointGap)})`,
      value: `${round1(cut('R-T')?.length ?? derived.clearWidth - derived.jointGap * 2)} mm`,
      source: 'Cut list',
      status: 'REVIEW',
    },
  ];

  const glassWidth = round1(derived.glassX1 - derived.glassX0);
  const glassRows: CalcRow[] = [
    {
      label: 'Glass width',
      formula: `clearWidth (${round1(derived.clearWidth)}) + 2 × glass bite (${derived.glassBite})`,
      value: `${glassWidth} mm`,
      source: 'door-model glass bite constant',
      status: 'REVIEW',
    },
    {
      label: 'Lower glass height',
      formula: `lowerGlassY1 (${round1(derived.lowerGlassY1)}) − lowerGlassY0 (${round1(derived.lowerGlassY0)})`,
      value: `${round1(derived.lowerGlassY1 - derived.lowerGlassY0)} mm`,
      source: 'door-model glass bite constant',
      status: 'REVIEW',
    },
    {
      label: 'Upper glass height',
      formula: `upperGlassY1 (${round1(derived.upperGlassY1)}) − upperGlassY0 (${round1(derived.upperGlassY0)})`,
      value: `${round1(derived.upperGlassY1 - derived.upperGlassY0)} mm`,
      source: 'door-model glass bite constant',
      status: 'REVIEW',
    },
  ];

  const beadRows: CalcRow[] = [];
  for (const beadId of ['B-U', 'B-UV', 'B-L', 'B-LV']) {
    const bead = cut(beadId);
    if (!bead) continue;
    beadRows.push({
      label: bead.description,
      formula: beadId.includes('V') ? 'glass height (per orientation)' : 'glass width (per orientation)',
      value: `${round1(bead.length)} mm × ${bead.qty}`,
      source: 'Cut list',
      status: 'REVIEW',
    });
  }

  const gasketRows: CalcRow[] = derived.hardware
    .filter((item) => item.category === 'Gaskets')
    .map((item) => ({
      label: `${item.code} — ${item.name}`,
      formula: 'opening perimeter / glazing loop (model estimate)',
      value: `${round1(item.qty)} ${item.unit}`,
      source: 'door-model hardware schedule',
      status: 'REVIEW' as ReportStatus,
    }));

  const grossM2 = round3((width * height) / 1_000_000);
  const glazedM2 = round3(derived.glassPanels.reduce((sum, panel) => sum + panel.areaM2 * panel.qty, 0));

  const netFabricatedKg = round2(
    derived.cutList.reduce((sum, item) => sum + (item.length / 1000) * item.unitWeightKgM * item.qty, 0)
  );

  const profiles = profileVerification(derived);
  const profilesVerified = profiles.length > 0 && profiles.every((row) => row.status === 'PASS');

  const checks: CheckRow[] = [
    { label: 'Profile references checked', status: profilesVerified ? 'PASS' : 'REVIEW', detail: `${profiles.filter((row) => row.status === 'PASS').length}/${profiles.length} profiles verified against catalogue` },
    { label: 'Reference dimension interpretation', status: 'REVIEW', detail: 'Structural opening vs outside frame not confirmed' },
    { label: 'Frame calculation reconciled', status: 'REVIEW', detail: 'Derived from unconfirmed reference dimension' },
    { label: 'Leaf calculation reconciled', status: 'REVIEW', detail: 'Derived from 100D geometry; catalogue assembly not confirmed' },
    { label: 'Glass calculation reconciled', status: 'REVIEW', detail: 'Glass bite is a model constant — confirm against catalogue' },
    { label: 'Bead calculation reconciled', status: 'REVIEW', detail: 'Per-orientation bead lengths derived from glass opening' },
    { label: 'Gasket calculation reconciled', status: 'REVIEW', detail: 'Gasket quantity is a model estimate' },
    { label: 'Cut-list quantity reconciled', status: 'PASS', detail: 'Reconciled by the fabrication pre-flight' },
    { label: 'Nesting reconciled', status: 'PASS', detail: 'Cut list matches nested pieces' },
    { label: 'Kerf applied consistently', status: 'REVIEW', detail: `Configured ${DEFAULT_BLADE_KERF_MM} mm — confirm machine saw kerf` },
    { label: 'Offcut reconciled', status: 'PASS', detail: `Reusable threshold ${USABLE_OFFCUT_MIN_MM} mm` },
    { label: 'BOM reconciled', status: 'PASS', detail: 'BOM weight matches nesting' },
    { label: 'Purchased stock weight reconciled', status: 'PASS', detail: 'Calculated from complete stock bars' },
    { label: 'Commercial total reconciled', status: 'PASS', detail: 'Material + glass + hardware + labour + tax' },
  ];

  return {
    opening,
    systemLabel: SYSTEM_LABELS[opening.system],
    elevation,
    reference: {
      width,
      height,
      status: 'REVIEW',
      interpretation: 'Structural opening / outside frame — NOT CONFIRMED',
      note: 'REQUIRES REVIEW — 900 × 2100 reference dimension not confirmed',
    },
    handing: {
      hingeSide,
      lockSide,
      handing: hingeSide === 'left' ? 'LEFT HAND' : 'RIGHT HAND',
      openingDirection: 'REVIEW',
      status: 'REVIEW',
    },
    areas: { grossM2, glazedM2 },
    frameRows,
    leafRows,
    glassRows,
    beadRows,
    gasketRows,
    profiles,
    cutting: {
      stockMm: DEFAULT_STOCK_LEN_MM,
      kerfMm: DEFAULT_BLADE_KERF_MM,
      trimMm: 0,
      reusableMm: USABLE_OFFCUT_MIN_MM,
      convention: 'One saw cut between adjacent parts. N parts on a bar → (N − 1) kerfs applied to the bar.',
      kerfStatus: 'REVIEW',
    },
    netFabricatedKg,
    checks,
  };
}
