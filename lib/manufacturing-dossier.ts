import { buildProjectBOM, generateCommercialQuote } from './bom-engine';
import {
  DXF_100D_101,
  DXF_100D_102,
  DXF_100D_103,
  DXF_100D_201,
  DXF_100D_301,
  DXF_100D_3105,
  DXF_100D_401,
  DXF_100D_501,
  DXF_70S_1001_1,
  DXF_70S_1101_1,
  DXF_70S_1201_1,
  DXF_70S_1401,
  DXF_70S_1501,
  DXF_70S_1601,
  DXF_70S_1701,
} from './dxf-svg-paths';
import { fabricationChecks, PROFILE_WEIGHTS, expandOpeningCuts } from './door-model';
import { deriveFabricationMembers, type FabricationMember } from './member-model';
import { validateFabrication, type FabricationValidation } from './fabrication-validation';
import type { CutItem, DerivedOpening, ProjectMetadata, ProjectNestingSummary } from './types';

export interface DossierProfile {
  id: string;
  description: string;
  kgM: number | null;
  width: number | null;
  height: number | null;
  points: string | null;
  quantity: number;
  totalLengthMm: number;
  catalogueReference: string;
  sourcePage: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'REQUIRES REVIEW';
}

export interface DossierCheck {
  openingTag: string;
  label: string;
  detail: string;
  status: 'PASS' | 'WARNING' | 'REVIEW';
  value: string;
}

export interface ManufacturingDossier {
  project: ProjectMetadata;
  generatedAt: string;
  revision: string;
  openings: DerivedOpening[];
  allCuts: CutItem[];
  fabricationMembers: FabricationMember[];
  validation: FabricationValidation;
  profiles: DossierProfile[];
  nesting: ProjectNestingSummary;
  glass: Array<DerivedOpening['glassPanels'][number] & { openingTag: string; openingQuantity: number }>;
  hardware: Array<DerivedOpening['hardware'][number] & { openingTag: string; openingQuantity: number }>;
  checks: DossierCheck[];
  bom: ReturnType<typeof buildProjectBOM>;
  quote: ReturnType<typeof generateCommercialQuote>;
  totals: {
    cutPieces: number;
    glassPanels: number;
    totalKerfMm: number;
    totalCutLengthMm: number;
    totalReusableOffcutMm: number;
    totalScrapMm: number;
    totalWeightKg: number;
  };
}

const PROFILE_VISUALS: Record<string, { points: string; width: number; height: number }> = {
  '70S-1001-1': DXF_70S_1001_1,
  '70S-1101-1': DXF_70S_1101_1,
  '70S-1201-1': DXF_70S_1201_1,
  '70S-1401': DXF_70S_1401,
  '70S-1501': DXF_70S_1501,
  '70S-1601': DXF_70S_1601,
  '70S-1701': DXF_70S_1701,
  '100D-3105': DXF_100D_3105,
  '100D-101': DXF_100D_101,
  '100D-102': DXF_100D_102,
  '100D-103': DXF_100D_103,
  '100D-201': DXF_100D_201,
  '100D-301': DXF_100D_301,
  '100D-401': DXF_100D_401,
  '100D-501': DXF_100D_501,
};

const CATALOGUE_MANIFEST: Record<string, { sourcePage: number; confidence: 'HIGH' | 'MEDIUM' }> = {
  '70S-1001-1': { sourcePage: 14, confidence: 'HIGH' },
  '70S-1101-1': { sourcePage: 14, confidence: 'HIGH' },
  '70S-1201-1': { sourcePage: 14, confidence: 'HIGH' },
  '70S-1401': { sourcePage: 14, confidence: 'HIGH' },
  '70S-1501': { sourcePage: 14, confidence: 'MEDIUM' },
  '70S-1601': { sourcePage: 15, confidence: 'HIGH' },
  '70S-1701': { sourcePage: 14, confidence: 'HIGH' },
  '100D-101': { sourcePage: 47, confidence: 'HIGH' },
  '100D-102': { sourcePage: 47, confidence: 'HIGH' },
  '100D-103': { sourcePage: 47, confidence: 'HIGH' },
  '100D-201': { sourcePage: 48, confidence: 'HIGH' },
  '100D-301': { sourcePage: 48, confidence: 'HIGH' },
  '100D-401': { sourcePage: 48, confidence: 'HIGH' },
  '100D-501': { sourcePage: 49, confidence: 'HIGH' },
  '100D-3105': { sourcePage: 51, confidence: 'MEDIUM' },
};

export function buildManufacturingDossier(
  project: ProjectMetadata,
  openings: DerivedOpening[],
  nesting: ProjectNestingSummary,
  generatedAt = new Date().toLocaleString()
): ManufacturingDossier {
  const allCuts = expandOpeningCuts(openings);
  const fabricationMembers: FabricationMember[] = openings.flatMap((opening) => {
    const units = Math.max(1, Math.round(opening.config.quantity || 1));
    return deriveFabricationMembers(opening.config).map((member) => ({ ...member, qty: member.qty * units }));
  });
  const profileMap = new Map<string, DossierProfile>();

  for (const cut of allCuts) {
    const existing = profileMap.get(cut.profile);
    const spec = PROFILE_WEIGHTS[cut.profile];
    const visual = PROFILE_VISUALS[cut.profile];
    const catalogue = CATALOGUE_MANIFEST[cut.profile];
    if (existing) {
      existing.quantity += cut.qty;
      existing.totalLengthMm += cut.length * cut.qty;
    } else {
      profileMap.set(cut.profile, {
        id: cut.profile,
        description: spec?.name || 'Profile description not available',
        kgM: spec?.kgM ?? null,
        width: visual?.width ?? spec?.face ?? null,
        height: visual?.height ?? spec?.depth ?? null,
        points: visual?.points ?? null,
        quantity: cut.qty,
        totalLengthMm: cut.length * cut.qty,
        catalogueReference: catalogue
          ? `Alumex Advance Profile Book / catalogue page ${catalogue.sourcePage}`
          : 'Alumex Advance Profile Book / reference REQUIRES REVIEW',
        sourcePage: catalogue?.sourcePage ?? null,
        confidence: catalogue?.confidence ?? 'REQUIRES REVIEW',
      });
    }
  }

  const glass = openings.flatMap((opening) => opening.glassPanels.map((panel) => ({
    ...panel,
    openingTag: opening.config.tag,
    openingQuantity: opening.config.quantity,
  })));
  const hardware = openings.flatMap((opening) => opening.hardware.map((item) => ({
    ...item,
    openingTag: opening.config.tag,
    openingQuantity: opening.config.quantity,
  })));
  const checks = openings.flatMap((opening) => fabricationChecks(opening.config).map((check) => ({
    openingTag: opening.config.tag,
    label: check.label,
    detail: check.detail,
    status: check.value === 'NO OVERLAP' || check.value === 'NO PASS-THROUGH' || check.value === 'ALIGNED' ? 'PASS' as const : 'REVIEW' as const,
    value: check.value,
  })));
  const bom = buildProjectBOM(openings, nesting);
  const quote = generateCommercialQuote(project, openings, bom);
  const validation = validateFabrication({ openings, fabricationMembers, nesting, bom });
  const totalKerfMm = nesting.resultsByProfile.reduce((sum, profile) => sum + profile.bars.reduce((barSum, bar) => barSum + bar.kerfWasteMm, 0), 0);
  const totalReusableOffcutMm = nesting.totalReusableOffcutsM * 1000;
  const totalScrapMm = nesting.totalScrapOffcutsM * 1000;

  return {
    project,
    generatedAt,
    revision: `${project.projectNumber || 'PROJECT'}-${project.date.replaceAll('-', '')}`,
    openings,
    allCuts,
    fabricationMembers,
    validation,
    profiles: [...profileMap.values()],
    nesting,
    glass,
    hardware,
    checks,
    bom,
    quote,
    totals: {
      cutPieces: allCuts.reduce((sum, cut) => sum + cut.qty, 0),
      glassPanels: glass.reduce((sum, panel) => sum + panel.qty * panel.openingQuantity, 0),
      totalKerfMm: Number(totalKerfMm.toFixed(1)),
      totalCutLengthMm: Number((nesting.totalProfileLengthM * 1000).toFixed(1)),
      totalReusableOffcutMm: Number(totalReusableOffcutMm.toFixed(1)),
      totalScrapMm: Number(totalScrapMm.toFixed(1)),
      totalWeightKg: openings.reduce((sum, opening) => sum + opening.totalAluWeightKg * opening.config.quantity, 0),
    },
  };
}
