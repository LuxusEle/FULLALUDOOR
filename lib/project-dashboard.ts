// Project-scoped dashboard selectors.
//
// Every value here is derived from the CURRENT project's live data only
// (project metadata, openings, the derived fabrication model, the nesting
// summary and the manufacturing dossier). Nothing is read from the global
// project catalog and no value is hardcoded. This module does NOT re-implement
// nesting, BOM or quotation maths — it only aggregates results already produced
// by the existing engines.

import type {
  DerivedOpening,
  OpeningItem,
  ProjectMetadata,
  ProjectNestingSummary,
} from './types';
import { TYPOLOGY_LABELS } from './types';
import type { ManufacturingDossier } from './manufacturing-dossier';
import { deriveOpeningIssues, type ProjectIssue } from './project-catalog';

export type HealthState = 'READY' | 'IN PROGRESS' | 'REVIEW' | 'BLOCKED';
export type AuditLevel = 'PASS' | 'REVIEW' | 'FAIL';
export type MetricState = 'ok' | 'review' | 'na';

export interface ProjectMetric {
  key: string;
  label: string;
  value: string;
  unit?: string;
  state: MetricState;
  detail: string;
}

export interface ProjectOpeningRow {
  id: string;
  tag: string;
  name: string;
  system: string;
  systemLabel: string;
  width: number;
  height: number;
  quantity: number;
  finish: string;
  glass: string;
  location: string;
  status: 'READY' | 'REVIEW';
  issues: ProjectIssue[];
}

export interface DesignStatusModel {
  configured: number;
  total: number;
  incomplete: number;
  threeD: HealthState;
  cad: HealthState;
  profiles: HealthState;
  glass: HealthState;
  hardware: HealthState;
  profileReviewCount: number;
}

export interface FabricationStatusModel {
  cutPieces: number;
  profileCount: number;
  stockBars: number;
  yieldPercent: number;
  reusableOffcutM: number;
  scrapMm: number;
  kerfMm: number;
  weightKg: number;
  netCutLengthM: number;
  stockLengthM: number;
}

export interface AuditWarningModel {
  id: string;
  level: AuditLevel;
  title: string;
  detail: string;
  tag?: string;
}

export interface AuditSummaryModel {
  pass: number;
  review: number;
  fail: number;
  warnings: AuditWarningModel[];
}

export interface ReadinessItemModel {
  key: string;
  label: string;
  state: 'ready' | 'review' | 'blocked';
  detail: string;
}

export interface ReadinessModel {
  status: 'READY' | 'REQUIRES REVIEW' | 'BLOCKED';
  items: ReadinessItemModel[];
}

export interface MaterialSummaryModel {
  aluminium: {
    weightKg: number;
    profileCount: number;
    stockLengthM: number;
    netCutLengthM: number;
    wasteM: number;
    yieldPercent: number;
  };
  glass: { panelCount: number; areaM2: number; types: string[] };
  hardware: { itemCount: number; missingCount: number };
  gasket: { itemCount: number; unit: string } | null;
}

export interface CommercialLineModel {
  key: string;
  label: string;
  amount: number;
}

export interface CommercialSummaryModel {
  available: boolean;
  currency: string;
  lines: CommercialLineModel[];
  subtotal: number;
  taxAmount: number;
  taxRatePercent: number;
  grandTotal: number;
}

export interface HealthModel {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
}

export interface ProjectNoteModel {
  key: string;
  label: string;
  value: string;
}

export interface ProjectActivityModel {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  ts: number;
}

export interface ProjectDashboardModel {
  identity: {
    name: string;
    number: string;
    client: string;
    site: string;
    status: 'READY' | 'REQUIRES REVIEW' | 'BLOCKED';
    revision: string;
    lastUpdated: string | null;
  };
  summary: {
    contractor: string;
    currency: string;
    description: string;
  };
  metrics: ProjectMetric[];
  openings: ProjectOpeningRow[];
  design: DesignStatusModel;
  fabrication: FabricationStatusModel;
  audit: AuditSummaryModel;
  readiness: ReadinessModel;
  materials: MaterialSummaryModel;
  commercial: CommercialSummaryModel;
  health: HealthModel[];
  activity: ProjectActivityModel[];
  notes: ProjectNoteModel[];
  totals: {
    openings: number;
    totalQuantity: number;
    glazedAreaM2: number;
    totalWeightKg: number;
  };
}

const FINISH_LABELS: Record<OpeningItem['finish'], string> = {
  natural: 'Natural Anodized',
  black: 'Powder Coat Black',
  bronze: 'Powder Coat Bronze',
  white: 'Powder Coat White',
};

const GLASS_LABELS: Record<OpeningItem['glass'], string> = {
  '6mm-clear': '6 mm Clear Toughened',
  '8mm-tinted': '8 mm Tinted',
  '10.38mm-laminated': '10.38 mm Laminated',
  '12mm-toughened': '12 mm Toughened',
  '24mm-dgu': '24 mm Double Glazed Unit',
};

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function metric(key: string, label: string, value: number, unit: string, detail: string, available = true): ProjectMetric {
  if (!available) {
    return { key, label, value: 'N/A', state: 'na', detail: 'No data available' };
  }
  return { key, label, value: String(round(value, 2)), unit, state: 'ok', detail };
}

export interface ProjectDashboardInput {
  project: ProjectMetadata;
  openings: OpeningItem[];
  derivedOpenings: DerivedOpening[];
  nesting: ProjectNestingSummary;
  dossier: ManufacturingDossier;
  activities?: Array<{ id: string; kind: string; title: string; projectName: string | null; detail?: string; ts: number }>;
  lastUpdated?: string | null;
}

export function buildProjectDashboard(input: ProjectDashboardInput): ProjectDashboardModel {
  const { project, openings, derivedOpenings, nesting, dossier } = input;
  const activity = input.activities ?? [];

  const totalQuantity = openings.reduce((sum, opening) => sum + (opening.quantity || 0), 0);
  const glassAreaM2 = derivedOpenings.reduce(
    (sum, opening) =>
      sum + opening.glassPanels.reduce((panelSum, panel) => panelSum + panel.areaM2 * panel.qty, 0) * opening.config.quantity,
    0
  );
  const totalWeightKg = dossier.totals.totalWeightKg;
  const hasOpenings = openings.length > 0;

  // -- Openings --------------------------------------------------------------
  const openingRows: ProjectOpeningRow[] = openings.map((opening) => {
    const issues = deriveOpeningIssues(opening);
    return {
      id: opening.id,
      tag: opening.tag,
      name: opening.name,
      system: opening.system,
      systemLabel: TYPOLOGY_LABELS[opening.system],
      width: opening.width,
      height: opening.height,
      quantity: opening.quantity,
      finish: FINISH_LABELS[opening.finish],
      glass: GLASS_LABELS[opening.glass],
      location: opening.location,
      status: issues.some((issue) => issue.severity !== 'info') ? 'REVIEW' : 'READY',
      issues,
    };
  });

  // -- Design status ---------------------------------------------------------
  const incomplete = openings.filter((opening) => deriveOpeningIssues(opening).length > 0).length;
  const criticalGeometry = openings.some((opening) =>
    deriveOpeningIssues(opening).some((issue) => issue.severity === 'critical')
  );
  const profileReviewCount = dossier.profiles.filter((profile) => profile.confidence === 'REQUIRES REVIEW').length;
  const projectInfoReady = Boolean(project.projectNumber?.trim()) && Boolean(project.clientName?.trim());
  const glassReady = hasOpenings && dossier.glass.length > 0;
  const hardwareReady = hasOpenings && dossier.hardware.length > 0;

  const design: DesignStatusModel = {
    configured: openings.length - incomplete,
    total: openings.length,
    incomplete,
    threeD: !hasOpenings ? 'IN PROGRESS' : criticalGeometry ? 'REVIEW' : 'READY',
    cad: !hasOpenings ? 'IN PROGRESS' : projectInfoReady && !criticalGeometry ? 'READY' : 'REVIEW',
    profiles: dossier.profiles.length === 0 ? 'REVIEW' : profileReviewCount > 0 ? 'REVIEW' : 'READY',
    glass: glassReady ? 'READY' : 'REVIEW',
    hardware: hardwareReady ? 'READY' : 'REVIEW',
    profileReviewCount,
  };

  // -- Fabrication -----------------------------------------------------------
  const stockLengthM = nesting.totalStockLengthM;
  const netCutLengthM = nesting.totalProfileLengthM;
  const fabrication: FabricationStatusModel = {
    cutPieces: dossier.totals.cutPieces,
    profileCount: dossier.profiles.length,
    stockBars: nesting.totalBarsToPull,
    yieldPercent: nesting.overallEfficiencyPercent,
    reusableOffcutM: nesting.totalReusableOffcutsM,
    scrapMm: dossier.totals.totalScrapMm,
    kerfMm: dossier.totals.totalKerfMm,
    weightKg: totalWeightKg,
    netCutLengthM,
    stockLengthM,
  };

  // -- Audit -----------------------------------------------------------------
  let auditPass = 0;
  let auditReview = 0;
  const warnings: AuditWarningModel[] = [];
  dossier.checks.forEach((check, index) => {
    if (check.status === 'PASS') {
      auditPass += 1;
      return;
    }
    auditReview += 1;
    warnings.push({
      id: `check-${index}`,
      level: 'REVIEW',
      title: `${check.openingTag} — ${check.label}`,
      detail: `${check.detail} (${check.value})`,
      tag: check.openingTag,
    });
  });
  for (const issue of dossier.openings.flatMap((opening) => deriveOpeningIssues(opening.config))) {
    warnings.push({
      id: `issue-${issue.code}-${issue.tag ?? ''}`,
      level: issue.severity === 'critical' ? 'FAIL' : 'REVIEW',
      title: issue.title,
      detail: issue.detail,
      tag: issue.tag,
    });
  }
  const audit: AuditSummaryModel = {
    pass: auditPass,
    review: auditReview,
    fail: warnings.filter((warning) => warning.level === 'FAIL').length,
    warnings,
  };

  // -- Readiness -------------------------------------------------------------
  const readinessItems: ReadinessItemModel[] = [
    { key: 'info', label: 'Project information', state: projectInfoReady ? 'ready' : 'review', detail: projectInfoReady ? 'Project number and client set' : 'Project number or client missing' },
    { key: 'schedule', label: 'Opening schedule', state: hasOpenings ? 'ready' : 'blocked', detail: hasOpenings ? `${openings.length} opening${openings.length === 1 ? '' : 's'}` : 'No openings scheduled' },
    { key: 'geometry', label: 'Geometry', state: criticalGeometry ? 'review' : 'ready', detail: criticalGeometry ? 'Dimension outside fabricable envelope' : 'All sizes within range' },
    { key: 'profiles', label: 'Profile mapping', state: profileReviewCount > 0 ? 'review' : 'ready', detail: profileReviewCount > 0 ? `${profileReviewCount} profile reference${profileReviewCount === 1 ? '' : 's'} need review` : 'All profile references resolved' },
    { key: 'glass', label: 'Glass schedule', state: glassReady ? 'ready' : 'review', detail: glassReady ? `${dossier.glass.length} glass line${dossier.glass.length === 1 ? '' : 's'}` : 'No glass panels derived' },
    { key: 'hardware', label: 'Hardware', state: hardwareReady ? 'ready' : 'review', detail: hardwareReady ? `${dossier.hardware.length} hardware line${dossier.hardware.length === 1 ? '' : 's'}` : 'No hardware items derived' },
    { key: 'bom', label: 'BOM', state: dossier.bom.length > 0 ? 'ready' : 'review', detail: dossier.bom.length > 0 ? `${dossier.bom.length} BOM lines` : 'No BOM lines' },
    { key: 'audit', label: 'Fabrication audit', state: audit.review === 0 && audit.fail === 0 ? 'ready' : 'review', detail: audit.review + audit.fail === 0 ? 'No open findings' : `${audit.review + audit.fail} finding${audit.review + audit.fail === 1 ? '' : 's'} open` },
  ];
  const allReady = readinessItems.every((item) => item.state === 'ready');
  readinessItems.push({
    key: 'release',
    label: 'Manufacturing release',
    state: !hasOpenings ? 'blocked' : allReady ? 'ready' : 'review',
    detail: !hasOpenings ? 'Nothing to release' : allReady ? 'Ready for release' : 'Resolve open items first',
  });
  const readinessStatus: ReadinessModel['status'] = readinessItems.some((item) => item.state === 'blocked')
    ? 'BLOCKED'
    : readinessItems.some((item) => item.state === 'review')
      ? 'REQUIRES REVIEW'
      : 'READY';
  const readiness: ReadinessModel = { status: readinessStatus, items: readinessItems };

  // -- Materials -------------------------------------------------------------
  const gasketBom = dossier.bom.filter((line) => line.category === 'Gaskets & Seals');
  const gasketCount = dossier.hardware
    .filter((item) => item.category === 'Gaskets')
    .reduce((sum, item) => sum + item.qty * item.openingQuantity, 0);
  const glassTypes = [...new Set(dossier.glass.map((panel) => panel.description))];
  const materials: MaterialSummaryModel = {
    aluminium: {
      weightKg: round(totalWeightKg, 2),
      profileCount: dossier.profiles.length,
      stockLengthM: round(stockLengthM, 2),
      netCutLengthM: round(netCutLengthM, 2),
      wasteM: round(Math.max(0, stockLengthM - netCutLengthM), 2),
      yieldPercent: round(nesting.overallEfficiencyPercent, 1),
    },
    glass: {
      panelCount: dossier.totals.glassPanels,
      areaM2: round(glassAreaM2, 2),
      types: glassTypes.length ? glassTypes : ['No glass data'],
    },
    hardware: {
      itemCount: dossier.hardware.reduce((sum, item) => sum + item.qty * item.openingQuantity, 0),
      missingCount: hardwareReady ? 0 : openings.length,
    },
    gasket: gasketCount > 0 || gasketBom.length > 0 ? { itemCount: round(gasketCount, 1), unit: 'm / items' } : null,
  };

  // -- Commercial ------------------------------------------------------------
  // The quote engine reports extrusions with coating already included and
  // hardware with gaskets included. Split those out for display so the lines
  // still sum exactly to the engine subtotal without double counting.
  const gasketCost = gasketBom.reduce((sum, line) => sum + line.totalCost, 0);
  const aluminiumNet = round(Math.max(0, dossier.quote.materialCost - dossier.quote.powderCoatingCost), 2);
  const hardwareNet = round(Math.max(0, dossier.quote.hardwareCost - gasketCost), 2);
  const lineTotal =
    aluminiumNet + dossier.quote.powderCoatingCost + dossier.quote.glassCost + hardwareNet + round(gasketCost, 2) + dossier.quote.laborAssemblyCost;
  const otherCost = round(Math.max(0, dossier.quote.subtotal - lineTotal), 2);
  const commercial: CommercialSummaryModel = {
    available: dossier.bom.length > 0 && dossier.quote.subtotal > 0,
    currency: project.currency,
    lines: [
      { key: 'aluminium', label: 'Aluminium', amount: aluminiumNet },
      { key: 'coating', label: 'Coating', amount: dossier.quote.powderCoatingCost },
      { key: 'glass', label: 'Glass', amount: dossier.quote.glassCost },
      { key: 'hardware', label: 'Hardware', amount: hardwareNet },
      { key: 'gasket', label: 'Gasket & seals', amount: round(gasketCost, 2) },
      { key: 'labour', label: 'Labour', amount: dossier.quote.laborAssemblyCost },
      { key: 'other', label: 'Other', amount: otherCost },
    ],
    subtotal: dossier.quote.subtotal,
    taxAmount: dossier.quote.taxAmount,
    taxRatePercent: project.taxRatePercent,
    grandTotal: dossier.quote.grandTotal,
  };

  // -- Health ----------------------------------------------------------------
  const health: HealthModel[] = [
    {
      key: 'design',
      label: 'Design',
      state: !hasOpenings ? 'IN PROGRESS' : criticalGeometry ? 'BLOCKED' : incomplete > 0 ? 'REVIEW' : 'READY',
      detail: `${openings.length - incomplete}/${openings.length} openings configured`,
    },
    {
      key: 'fabrication',
      label: 'Fabrication',
      state: !hasOpenings ? 'IN PROGRESS' : audit.review + audit.fail > 0 ? 'REVIEW' : 'READY',
      detail: `${audit.review + audit.fail} open finding${audit.review + audit.fail === 1 ? '' : 's'}`,
    },
    {
      key: 'materials',
      label: 'Materials',
      state: profileReviewCount > 0 || !glassReady || !hardwareReady ? 'REVIEW' : 'READY',
      detail: `${dossier.profiles.length} profiles · ${dossier.totals.glassPanels} glass panels`,
    },
    {
      key: 'commercial',
      label: 'Commercial',
      state: commercial.available ? 'READY' : 'REVIEW',
      detail: commercial.available ? `${project.currency} ${round(commercial.grandTotal, 2)}` : 'Quotation not available',
    },
    {
      key: 'documentation',
      label: 'Documentation',
      state: projectInfoReady ? 'READY' : 'REVIEW',
      detail: projectInfoReady ? 'Project references complete' : 'Project references incomplete',
    },
  ];

  // -- Notes -----------------------------------------------------------------
  const notes: ProjectNoteModel[] = [];
  const pushNote = (key: string, label: string, value: string | undefined) => {
    if (value && value.trim().length > 0) notes.push({ key, label, value: value.trim() });
  };
  pushNote('notes', 'Project notes', project.notes);
  pushNote('description', 'Description', project.description);
  pushNote('site', 'Site address', project.siteAddress);
  pushNote('staff', 'Assigned staff', project.assignedStaff);
  pushNote('target', 'Target completion', project.targetCompletionDate);
  pushNote('company', 'Company', project.company);
  pushNote('contact', 'Client contact', project.clientContact);
  pushNote('phone', 'Client phone', project.clientPhone);
  pushNote('email', 'Client email', project.clientEmail);
  openings.forEach((opening, index) => pushNote(`opening-${opening.id}-${index}`, `${opening.tag} notes`, opening.notes));

  // -- Metrics ---------------------------------------------------------------
  const metrics: ProjectMetric[] = [
    metric('openings', 'Openings', openings.length, '', `${totalQuantity} total quantity`, true),
    metric('quantity', 'Total quantity', totalQuantity, '', 'Scheduled units', true),
    metric('glazed-area', 'Glazed area', glassAreaM2, 'm²', 'Total glass area', hasOpenings),
    metric('aluminium', 'Aluminium', totalWeightKg, 'kg', 'Total extrusion weight', hasOpenings),
    metric('glass-panels', 'Glass panels', dossier.totals.glassPanels, '', 'Panels required', hasOpenings),
    metric('cut-pieces', 'Cut pieces', dossier.totals.cutPieces, '', 'Profile cuts', hasOpenings),
    metric('stock-bars', 'Stock bars', nesting.totalBarsToPull, '', '6 m bars to pull', hasOpenings),
    metric('yield', 'Material yield', nesting.overallEfficiencyPercent, '%', 'Nesting efficiency', hasOpenings),
  ];

  const projectActivity = activity
    .filter((item) => item.projectName === project.projectName)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map((item) => ({ id: item.id, kind: item.kind, title: item.title, detail: item.detail, ts: item.ts }));

  return {
    identity: {
      name: project.projectName,
      number: project.projectNumber,
      client: project.clientName,
      site: project.siteAddress ?? '',
      status: readinessStatus,
      revision: dossier.revision,
      lastUpdated: input.lastUpdated ?? null,
    },
    summary: {
      contractor: project.contractorName,
      currency: project.currency,
      description: project.description ?? '',
    },
    metrics,
    openings: openingRows,
    design,
    fabrication,
    audit,
    readiness,
    materials,
    commercial,
    health,
    activity: projectActivity,
    notes,
    totals: {
      openings: openings.length,
      totalQuantity,
      glazedAreaM2: round(glassAreaM2, 2),
      totalWeightKg: round(totalWeightKg, 2),
    },
  };
}
