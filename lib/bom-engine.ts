import type { CommercialQuote, DerivedOpening, MasterBOMItem, ProjectMetadata } from './types';
import type { ProjectNestingSummary } from './types';

export const DEFAULT_RATES = {
  extrusionPerKg: 4.80, // USD or currency equivalent per kg of raw aluminium
  powderCoatingPerKg: 1.20, // USD per kg powder coat finish
  glassClear6mmM2: 24.0, // USD per m²
  glassTinted8mmM2: 36.0,
  glassLaminatedM2: 52.0,
  glassToughened12mmM2: 65.0,
  glassDguM2: 85.0,
  laborPerOpening: 45.0, // USD assembly & machining labor
};

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
    const rate = g.thickness >= 12 ? rates.glassToughened12mmM2 : rates.glassClear6mmM2;
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

  const hardCosts: Record<string, number> = {
    'HNG-100': 12.5,
    'LCK-100': 28.0,
    'HND-280': 18.0,
    'CLT-100': 1.8,
    'ROD-M6': 2.4,
    'EPDM-01': 1.1,
    'SCR-ST': 0.15,
    '70S-1914': 6.5,
    '70S-LCK': 14.0,
    '70S-WPL': 0.8,
    '70S-EPDM': 1.2,
    'SCR-42': 0.12,
    'FLB-200': 9.5,
    'ESD-ROL': 5.5,
    'ESD-LCK': 8.0,
    'ESD-WPL': 0.8,
    'CAS-FS12': 11.0,
    'CAS-HND': 14.5,
    'CAS-EPDM': 1.2,
    'CAS-CLT': 1.5,
  };

  for (const [code, item] of hardwareMap.entries()) {
    const unitPrice = hardCosts[code] || 4.5;
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
    const unitPrice = Number(
      (
        op.totalAluWeightKg * (rates.extrusionPerKg + rates.powderCoatingPerKg) +
        op.glassPanels.reduce((s, g) => s + g.areaM2 * rates.glassClear6mmM2, 0) +
        rates.laborPerOpening +
        35
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
