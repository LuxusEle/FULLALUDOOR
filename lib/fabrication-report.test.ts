import { describe, expect, it } from 'vitest';
import { deriveDoor } from './door-model';
import { nestProjectCuts } from './nesting-engine';
import { buildProjectBOM, generateCommercialQuote } from './bom-engine';
import {
  buildOpeningFabricationReport,
  projectNetWeightKg,
  projectPurchasedWeightKg,
} from './fabrication-report';
import type { OpeningItem, ProjectMetadata } from './types';

const project: ProjectMetadata = {
  id: 'p-d01',
  projectName: 'D-01 Fabrication',
  clientName: 'Test Client',
  projectNumber: 'FA-2026-300',
  date: '2026-09-12',
  currency: 'LKR',
  taxRatePercent: 8,
  contractorName: 'Test Fabricator',
};

function d01(overrides: Partial<OpeningItem> = {}): OpeningItem {
  return {
    id: 'o1',
    tag: 'D-01',
    name: 'Main Entrance',
    system: '100D-single',
    width: 900,
    height: 2100,
    quantity: 1,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Ground Floor',
    hingeSide: 'left',
    ...overrides,
  };
}

describe('D-01 100D single-leaf swing fabrication report', () => {
  it('marks the reference dimension interpretation as REVIEW, never assumed', () => {
    const report = buildOpeningFabricationReport(d01());
    expect(report.reference.status).toBe('REVIEW');
    expect(report.reference.interpretation).toMatch(/NOT CONFIRMED/i);
    expect(report.reference.note).toMatch(/REQUIRES REVIEW/i);
    expect(report.reference.width).toBe(900);
    expect(report.reference.height).toBe(2100);
  });

  it('reports handing from configuration and keeps opening direction under review', () => {
    const left = buildOpeningFabricationReport(d01({ hingeSide: 'left' }));
    expect(left.handing.hingeSide).toBe('left');
    expect(left.handing.lockSide).toBe('right');
    expect(left.handing.handing).toBe('LEFT HAND');
    expect(left.handing.openingDirection).toBe('REVIEW');

    const right = buildOpeningFabricationReport(d01({ hingeSide: 'right' }));
    expect(right.handing.hingeSide).toBe('right');
    expect(right.handing.lockSide).toBe('left');
    expect(right.handing.handing).toBe('RIGHT HAND');
  });

  it('separates gross opening area from actual glazed area', () => {
    const report = buildOpeningFabricationReport(d01());
    const gross = (900 * 2100) / 1_000_000;
    expect(report.areas.grossM2).toBeCloseTo(gross, 3);
    expect(report.areas.glazedM2).toBeGreaterThan(0);
    expect(report.areas.glazedM2).toBeLessThan(report.areas.grossM2);
  });

  it('uses only 100D swing-door profiles (no SD / GL / sliding references)', () => {
    const report = buildOpeningFabricationReport(d01());
    expect(report.profiles.length).toBeGreaterThan(0);
    for (const profile of report.profiles) {
      expect(profile.code.startsWith('100D-')).toBe(true);
      expect(profile.code.startsWith('SD-')).toBe(false);
      expect(profile.code.startsWith('GL-')).toBe(false);
      expect(profile.code.startsWith('70S-')).toBe(false);
      expect(profile.code.startsWith('ESD-')).toBe(false);
      expect(profile.code.startsWith('ALU-')).toBe(false);
    }
  });

  it('computes per-orientation bead lengths from the glass opening', () => {
    const derived = deriveDoor(d01());
    const report = buildOpeningFabricationReport(d01());
    const beadLength = (id: string) => derived.cutList.find((cut) => cut.id === id)?.length ?? 0;
    const horizontal = report.beadRows.find((row) => /horizontal/i.test(row.label));
    const vertical = report.beadRows.find((row) => /vertical/i.test(row.label));
    expect(horizontal?.value).toContain(`${beadLength('B-U')}`);
    expect(vertical?.value).toContain(`${beadLength('B-UV')}`);
    // Horizontal bead is the glass width, vertical is the glass height.
    expect(beadLength('B-U')).not.toBe(beadLength('B-UV'));
  });

  it('keeps every dimensional calculation under review', () => {
    const report = buildOpeningFabricationReport(d01());
    for (const row of [...report.frameRows, ...report.leafRows, ...report.glassRows, ...report.beadRows, ...report.gasketRows]) {
      expect(row.status).toBe('REVIEW');
    }
  });

  it('marks data-consistency checks as PASS and verification checks as REVIEW', () => {
    const report = buildOpeningFabricationReport(d01());
    const check = (label: string) => report.checks.find((row) => row.label === label);
    expect(check('Cut-list quantity reconciled')?.status).toBe('PASS');
    expect(check('Nesting reconciled')?.status).toBe('PASS');
    expect(check('BOM reconciled')?.status).toBe('PASS');
    expect(check('Purchased stock weight reconciled')?.status).toBe('PASS');
    expect(check('Reference dimension interpretation')?.status).toBe('REVIEW');
    expect(check('Glass calculation reconciled')?.status).toBe('REVIEW');
    expect(check('Kerf applied consistently')?.status).toBe('REVIEW');
  });

  it('produces a plan view with a swing indication derived from handing', () => {
    const report = buildOpeningFabricationReport(d01());
    expect(report.elevation.swing?.hingeSide).toBe('left');
    expect(report.elevation.swing?.leafWidth).toBeGreaterThan(0);
  });
});

describe('net fabricated vs purchased stock weight', () => {
  it('purchased stock weight is derived from complete 6 m bars and exceeds net fabricated weight', () => {
    const derived = deriveDoor(d01());
    const nesting = nestProjectCuts(derived.cutList);
    const purchased = projectPurchasedWeightKg(nesting);
    const net = projectNetWeightKg([derived]);

    // Net is the sum of actual cut members.
    expect(net).toBeGreaterThan(0);
    expect(net).toBeCloseTo(derived.totalAluWeightKg, 1);

    // Purchased = bars × 6.000 m × kg/m, therefore strictly greater than net.
    expect(purchased.purchasedStockKg).toBeGreaterThan(net);
    expect(purchased.stockBars).toBe(nesting.totalBarsToPull);
    expect(purchased.reusableOffcutKg + purchased.scrapKg).toBeGreaterThanOrEqual(0);
  });
});

describe('commercial summary reconciliation', () => {
  it('subtotal and grand total reconcile from the canonical quote', () => {
    const derived = [deriveDoor(d01())];
    const nesting = nestProjectCuts(derived[0].cutList);
    const bom = buildProjectBOM(derived, nesting);
    const quote = generateCommercialQuote(project, derived, bom);

    expect(quote.subtotal).toBeCloseTo(
      quote.materialCost + quote.glassCost + quote.hardwareCost + quote.laborAssemblyCost,
      1
    );
    expect(quote.grandTotal).toBeCloseTo(quote.subtotal + quote.taxAmount, 1);
    // Coating is a component of the material rate, so material ≥ coating.
    expect(quote.materialCost).toBeGreaterThanOrEqual(quote.powderCoatingCost);
  });
});
