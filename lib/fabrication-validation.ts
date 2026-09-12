// Canonical fabrication reconciliation / pre-flight validation.
//
// The PDF exporter (and the workspace export gate) consume this so an
// inconsistent manufacturing document can never be produced silently. Every
// check compares data that was already derived — nothing is recalculated here.

import type { DerivedOpening, MasterBOMItem, ProjectNestingSummary } from './types';
import type { FabricationMember } from './member-model';

export interface FabricationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  openingTag?: string;
  memberId?: string;
}

export interface FabricationValidationSummary {
  openings: number;
  physicalMembers: number;
  cutEntries: number;
  nestedPieces: number;
  customMembers: number;
  reviews: number;
  bomReconciled: boolean;
  nestingReconciled: boolean;
}

export interface FabricationValidation {
  ok: boolean;
  issues: FabricationIssue[];
  summary: FabricationValidationSummary;
}

export interface FabricationValidationInput {
  openings: DerivedOpening[];
  fabricationMembers: FabricationMember[];
  nesting: ProjectNestingSummary;
  bom: MasterBOMItem[];
}

/** Display-rounding tolerance (mm / kg). */
const LENGTH_EPS = 0.6;
const WEIGHT_EPS = 0.6;

export function validateFabrication(input: FabricationValidationInput): FabricationValidation {
  const { openings, fabricationMembers, nesting, bom } = input;
  const issues: FabricationIssue[] = [];

  // 1. Geometry sanity
  for (const opening of openings) {
    if (!Number.isFinite(opening.config.width) || opening.config.width <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_OPENING_WIDTH',
        message: `${opening.config.tag}: opening width is not a valid positive number`,
        openingTag: opening.config.tag,
      });
    }
    if (!Number.isFinite(opening.config.height) || opening.config.height <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_OPENING_HEIGHT',
        message: `${opening.config.tag}: opening height is not a valid positive number`,
        openingTag: opening.config.tag,
      });
    }
  }
  for (const member of fabricationMembers) {
    if (!Number.isFinite(member.lengthMm) || member.lengthMm <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_MEMBER_LENGTH',
        message: `${member.displayId} (${member.name}) has an invalid cut length`,
        openingTag: member.openingTag,
        memberId: member.memberId,
      });
    }
    if (!Number.isFinite(member.standardLengthMm) || member.standardLengthMm <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_STANDARD_LENGTH',
        message: `${member.displayId} (${member.name}) has an invalid standard length`,
        openingTag: member.openingTag,
        memberId: member.memberId,
      });
    }
    if (!Number.isFinite(member.qty) || member.qty <= 0) {
      issues.push({
        severity: 'error',
        code: 'INVALID_QUANTITY',
        message: `${member.displayId} (${member.name}) has an invalid quantity`,
        openingTag: member.openingTag,
        memberId: member.memberId,
      });
    }
  }

  // 2. Nesting validity: cuts + kerf must fit the stock bar.
  for (const profile of nesting.resultsByProfile) {
    for (const bar of profile.bars) {
      const cutSum = bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
      const kerf = Math.max(0, bar.cuts.length - 1) * profile.bladeKerfMm;
      const used = cutSum + kerf;
      if (used > profile.stockLengthMm + LENGTH_EPS) {
        issues.push({
          severity: 'error',
          code: 'INVALID_NESTING',
          message: `${profile.profileCode} bar ${bar.barIndex}: cuts + kerf (${used.toFixed(1)} mm) exceed stock ${profile.stockLengthMm} mm`,
        });
      }
      if (bar.remainingOffcutMm < -LENGTH_EPS) {
        issues.push({
          severity: 'error',
          code: 'NEGATIVE_OFFCUT',
          message: `${profile.profileCode} bar ${bar.barIndex}: negative offcut ${bar.remainingOffcutMm.toFixed(1)} mm`,
        });
      }
    }
  }

  // 3. Cut list <-> nesting reconciliation (per profile).
  const cutByProfile = new Map<string, { length: number; count: number }>();
  for (const member of fabricationMembers) {
    const entry = cutByProfile.get(member.profile) ?? { length: 0, count: 0 };
    entry.length += member.lengthMm * member.qty;
    entry.count += member.qty;
    cutByProfile.set(member.profile, entry);
  }
  const nestedByProfile = new Map<string, { length: number; count: number }>();
  for (const profile of nesting.resultsByProfile) {
    let length = 0;
    let count = 0;
    for (const bar of profile.bars) {
      for (const cut of bar.cuts) {
        length += cut.lengthMm;
        count += 1;
      }
    }
    nestedByProfile.set(profile.profileCode, { length, count });
  }

  let nestingReconciled = true;
  for (const [profile, cut] of cutByProfile) {
    const nested = nestedByProfile.get(profile) ?? { length: 0, count: 0 };
    if (Math.abs(cut.length - nested.length) > LENGTH_EPS) {
      nestingReconciled = false;
      issues.push({
        severity: 'error',
        code: 'NESTING_LENGTH_MISMATCH',
        message: `${profile}: cut list ${cut.length.toFixed(1)} mm vs nesting ${nested.length.toFixed(1)} mm`,
      });
    }
    if (cut.count !== nested.count) {
      nestingReconciled = false;
      issues.push({
        severity: 'error',
        code: 'NESTING_QTY_MISMATCH',
        message: `${profile}: cut list ${cut.count} pcs vs nesting ${nested.count} pcs`,
      });
    }
  }
  for (const profile of nestedByProfile.keys()) {
    if (!cutByProfile.has(profile)) {
      nestingReconciled = false;
      issues.push({
        severity: 'error',
        code: 'NESTING_EXTRA_PROFILE',
        message: `${profile}: nesting contains members that are not in the cut list`,
      });
    }
  }

  const physicalMembers = fabricationMembers.reduce((sum, member) => sum + member.qty, 0);
  const nestedPieces = [...nestedByProfile.values()].reduce((sum, profile) => sum + profile.count, 0);
  if (physicalMembers !== nestedPieces) {
    nestingReconciled = false;
    issues.push({
      severity: 'error',
      code: 'MEMBER_COUNT_MISMATCH',
      message: `${physicalMembers} physical members vs ${nestedPieces} nested pieces`,
    });
  }

  // 4. Cut list <-> BOM reconciliation (per profile weight).
  const bomByProfile = new Map<string, number>();
  for (const item of bom) {
    if (item.category === 'Extrusions') bomByProfile.set(item.code, item.totalWeightKg ?? 0);
  }
  let bomReconciled = true;
  for (const profile of nesting.resultsByProfile) {
    const bomWeight = bomByProfile.get(profile.profileCode);
    if (bomWeight === undefined) {
      bomReconciled = false;
      issues.push({
        severity: 'error',
        code: 'BOM_MISSING_PROFILE',
        message: `${profile.profileCode} is missing from the BOM`,
      });
      continue;
    }
    if (Math.abs(bomWeight - profile.totalWeightKg) > WEIGHT_EPS) {
      bomReconciled = false;
      issues.push({
        severity: 'error',
        code: 'BOM_WEIGHT_MISMATCH',
        message: `${profile.profileCode}: BOM ${bomWeight.toFixed(2)} kg vs nesting ${profile.totalWeightKg.toFixed(2)} kg`,
      });
    }
  }

  const customMembers = fabricationMembers.filter((member) => member.custom).length;

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
    summary: {
      openings: openings.length,
      physicalMembers,
      cutEntries: fabricationMembers.length,
      nestedPieces,
      customMembers,
      reviews: customMembers,
      bomReconciled,
      nestingReconciled,
    },
  };
}
