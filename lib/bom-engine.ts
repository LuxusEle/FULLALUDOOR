import type { CommercialQuote, DerivedOpening, MasterBOMItem, ProjectMetadata } from './types';
import type { ProjectNestingSummary } from './types';

// Sri Lanka market rate card (Sri Lankan Rupees — LKR).
// Approximate retail/fabricator costs used for the Master Procurement BOM and
// the per-opening quote. Values are a sensible market benchmark and can be
// refined here; they are applied identically whichever currency code the
// project displays.
export const DEFAULT_RATES = {
  extrusionPerKg: 1650.0, // LKR per kg of anodized Alumex-type extrusion
  powderCoatingPerKg: 450.0, // LKR per kg powder coat finish
  glassClear6mmM2: 4200.0, // LKR per m² 6 mm clear toughened
  glassTinted8mmM2: 6500.0,
  glassLaminatedM2: 9800.0,
  glassToughened12mmM2: 11000.0,
  glassDguM2: 14500.0,
  laborPerOpening: 12000.0, // LKR assembly & machining labour per opening
  miscPerOpening: 2000.0, // LKR ancillaries / consumables per opening
};

export const HARDWARE_COSTS_LKR: Record<string, number> = {
  'HNG-100': 3800.0, // hinge set
  'LCK-100': 8500.0, // multi-point lock
  'HND-280': 5400.0, // door handle
  'CLT-100': 550.0, // aluminium cleat / corner bracket
  'ROD-M6': 700.0, // M6 tie rod
  'EPDM-01': 350.0, // EPDM seal (per m)
  'SCR-ST': 45.0, // stainless screw
  '70S-1914': 2000.0, // 70S brass v-groove roller
  '70S-LCK': 4500.0, // 70S sliding lock
  '70S-WPL': 250.0, // wool pile (per m)
  '70S-EPDM': 380.0, // 70S EPDM (per m)
  '100S-ROL': 2200.0, // 100S heavy roller
  '100S-LCK': 4800.0, // 100S lock
  '100S-WPL': 250.0,
  '100S-EPDM': 380.0,
  'SCR-42': 35.0, // 4.2×38 screw
  'FLB-200': 2900.0, // floor bolt
  'ESD-ROL': 1700.0, // espag roller
  'ESD-LCK': 2400.0,
  'ESD-WPL': 250.0,
  'CAS-FS12': 3300.0, // casement fitch fastener
  'CAS-HND': 4300.0, // casement handle
  'CAS-EPDM': 380.0,
  'CAS-CLT': 450.0,
};

/** Sri Lanka glass rate keyed by thickness + description (LKR/m²). */
export function glassRateFor(
  thickness: number,
  description: string,
  rates = DEFAULT_RATES
): number {
  const label = description.toLowerCase();
  if (thickness >= 20 || label.includes('dgu') || label.includes('double glaz')) {
    return rates.glassDguM2;
  }
  if (label.includes('laminat')) return rates.glassLaminatedM2;
  if (thickness >= 12) return rates.glassToughened12mmM2;
  if (thickness >= 8 && label.includes('tint')) return rates.glassTinted8mmM2;
  return rates.glassClear6mmM2;
}

export function buildProjectBOM(
  openings: DerivedOpening[],
  nesting: ProjectNestingSummary,
  rates = DEFAULT_RATES
): MasterBOMItem[] {
  const bom: MasterBOMItem[] = [];

  // 1. Extrusion Items (from nesting)
  for (const prof of nesting.resultsByProfile) {
    const profCost = Number((prof.totalWeightKg * (rates.extrusionPerKg + rates.powderCoatingPerKg)).toFixed(2));
    bom.push({
      category: 'Extrusions',
      code: prof.profileCode,
      description: `${prof.profileDescription} (${prof.totalStockBars} × 6.0m bars)`,
      quantity: prof.totalStockBars,
      unit: 'bars',
      unitWeightKg: Number(((prof.totalWeightKg / prof.totalStockBars)).toFixed(2)),
      totalWeightKg: prof.totalWeightKg,
      unitCost: Number((profCost / prof.totalStockBars).toFixed(2)),
      totalCost: profCost,
    });
  }

  // 2. Glass Items
  const glassGroups = new Map<string, { desc: string; qty: number; areaM2: number; thickness: number }>();
  for (const op of openings) {
    for (const g of op.glassPanels) {
      const key = `${g.thickness}mm-${g.description}`;
      const existing = glassGroups.get(key) || { desc: g.description, qty: 0, areaM2: 0, thickness: g.thickness };
      existing.qty += g.qty * op.config.quantity;
      existing.areaM2 += g.areaM2 * op.config.quantity;
      glassGroups.set(key, existing);
    }
  }

  for (const [_key, g] of glassGroups.entries()) {
    const rate = glassRateFor(g.thickness, g.desc, rates);
    const cost = Number((g.areaM2 * rate).toFixed(2));
    bom.push({
      category: 'Glass',
      code: `GLS-${g.thickness}MM`,
      description: `${g.desc} (${Number(g.areaM2.toFixed(2))} m²)`,
      quantity: g.qty,
      unit: 'panels',
      unitCost: Number((cost / Math.max(1, g.qty)).toFixed(2)),
      totalCost: cost,
    });
  }

  // 3. Hardware Items
  const hardwareMap = new Map<string, { name: string; qty: number; unit: string; category: MasterBOMItem['category'] }>();
  for (const op of openings) {
    for (const h of op.hardware) {
      const existing = hardwareMap.get(h.code) || {
        name: h.name,
        qty: 0,
        unit: h.unit,
        category: h.category === 'Gaskets' ? 'Gaskets & Seals' : 'Hardware',
      };
      existing.qty += h.qty * op.config.quantity;
      hardwareMap.set(h.code, existing);
    }
  }

  for (const [code, item] of hardwareMap.entries()) {
    const unitPrice = HARDWARE_COSTS_LKR[code] || 1200;
    const tot = Number((item.qty * unitPrice).toFixed(2));
    bom.push({
      category: item.category,
      code,
      description: item.name,
      quantity: Number(item.qty.toFixed(item.unit === 'm' ? 1 : 0)),
      unit: item.unit,
      unitCost: unitPrice,
      totalCost: tot,
    });
  }

  return bom;
}

export function generateCommercialQuote(
  project: ProjectMetadata,
  openings: DerivedOpening[],
  bom: MasterBOMItem[],
  rates = DEFAULT_RATES
): CommercialQuote {
  let materialCost = 0;
  let glassCost = 0;
  let hardwareCost = 0;
  let powderCoatingCost = 0;

  for (const b of bom) {
    if (b.category === 'Extrusions') {
      materialCost += b.totalCost;
      powderCoatingCost += (b.totalWeightKg || 0) * rates.powderCoatingPerKg;
    } else if (b.category === 'Glass') {
      glassCost += b.totalCost;
    } else {
      hardwareCost += b.totalCost;
    }
  }

  const laborAssemblyCost = openings.reduce((acc, o) => acc + o.config.quantity * rates.laborPerOpening, 0);

  const items = openings.map((op) => {
    const glassAreaCost = op.glassPanels.reduce(
      (sum, panel) => sum + panel.areaM2 * glassRateFor(panel.thickness, panel.description, rates),
      0
    );
    const unitPrice = Number(
      (
        op.totalAluWeightKg * (rates.extrusionPerKg + rates.powderCoatingPerKg) +
        glassAreaCost +
        rates.laborPerOpening +
        rates.miscPerOpening
      ).toFixed(2)
    );
    return {
      tag: op.config.tag,
      systemName: op.config.name,
      width: op.config.width,
      height: op.config.height,
      qty: op.config.quantity,
      unitPrice,
      totalPrice: Number((unitPrice * op.config.quantity).toFixed(2)),
      glassSpec: op.config.glass,
      finish: op.config.finish,
      areaM2: op.areaM2,
    };
  });

  const subtotal = Number((materialCost + glassCost + hardwareCost + laborAssemblyCost).toFixed(2));
  const taxAmount = Number(((subtotal * project.taxRatePercent) / 100).toFixed(2));
  const grandTotal = Number((subtotal + taxAmount).toFixed(2));

  return {
    project,
    items,
    materialCost: Number(materialCost.toFixed(2)),
    laborAssemblyCost: Number(laborAssemblyCost.toFixed(2)),
    glassCost: Number(glassCost.toFixed(2)),
    hardwareCost: Number(hardwareCost.toFixed(2)),
    powderCoatingCost: Number(powderCoatingCost.toFixed(2)),
    subtotal,
    taxAmount,
    grandTotal,
  };
}
