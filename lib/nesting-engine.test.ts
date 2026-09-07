import { describe, expect, it } from 'vitest';
import type { CutItem } from './types';
import {
  DEFAULT_BLADE_KERF_MM,
  DEFAULT_STOCK_LEN_MM,
  USABLE_OFFCUT_MIN_MM,
  nestProjectCuts,
  nestSingleProfile,
} from './nesting-engine';

const piece = (cutId: string, lengthMm: number, overrides: Partial<{ openingTag: string; description: string; angleL: number; angleR: number }> = {}) => ({
  cutId,
  openingTag: overrides.openingTag ?? 'D-01',
  description: overrides.description ?? 'Jamb',
  lengthMm,
  angleL: overrides.angleL ?? 90,
  angleR: overrides.angleR ?? 90,
});

const cut = (id: string, profile: string, qty: number, length: number): CutItem => ({
  id,
  openingTag: 'D-01',
  profile,
  description: 'Cut item',
  qty,
  length,
  ends: 'Square',
  angleLeft: 90,
  angleRight: 90,
  group: 'Outer Frame',
  unitWeightKgM: 1.0,
  totalWeightKg: Number(((length / 1000) * qty).toFixed(2)),
});

describe('1D nesting engine — stock bar math', () => {
  it('exposes standard fabrication constants', () => {
    expect(DEFAULT_STOCK_LEN_MM).toBe(6000);
    expect(DEFAULT_BLADE_KERF_MM).toBe(3.5);
    expect(USABLE_OFFCUT_MIN_MM).toBe(500);
  });

  it('defaults to 6000 mm stock and 3.5 mm blade kerf', () => {
    const result = nestSingleProfile('100D-3105', [piece('c1', 6000)]);
    expect(result.stockLengthMm).toBe(DEFAULT_STOCK_LEN_MM);
    expect(result.bladeKerfMm).toBe(DEFAULT_BLADE_KERF_MM);
    expect(result.totalStockBars).toBe(1);
  });

  it('fits three pieces on one 6000 mm bar with kerf deducted between cuts only', () => {
    const result = nestSingleProfile('100D-3105', [
      piece('c1', 2100),
      piece('c2', 2100),
      piece('c3', 900),
    ]);
    expect(result.totalStockBars).toBe(1);
    expect(result.bars[0].cuts.length).toBe(3);
    expect(result.bars[0].usedLengthMm).toBeCloseTo(2100 + 3.5 + 2100 + 3.5 + 900, 1);
    expect(result.bars[0].kerfWasteMm).toBeCloseTo(3.5 * 2, 1);
    expect(result.bars[0].remainingOffcutMm).toBeCloseTo(6000 - 5107, 1);
    expect(result.bars[0].isReusableOffcut).toBe(true);
    expect(result.overallYieldPercent).toBeCloseTo(((2100 + 2100 + 900) / 6000) * 100, 1);
  });

  it('opens a new 6000 mm bar when the running total exceeds stock length', () => {
    const result = nestSingleProfile('100D-3105', [piece('c1', 3500), piece('c2', 3500)]);
    expect(result.totalStockBars).toBe(2);
    expect(result.bars[0].cuts.length).toBe(1);
    expect(result.bars[1].cuts.length).toBe(1);
    expect(result.bars[0].remainingOffcutMm).toBeCloseTo(2500, 1);
    expect(result.bars[1].remainingOffcutMm).toBeCloseTo(2500, 1);
  });

  it('respects a custom stock length', () => {
    const result = nestSingleProfile('100D-3105', [piece('c1', 2100), piece('c2', 2100)], 4000, 3.5);
    expect(result.stockLengthMm).toBe(4000);
    // 2100 + 3.5 + 2100 = 4203.5 > 4000 -> must split onto two bars
    expect(result.totalStockBars).toBe(2);
  });

  it('treats an offcut of exactly 500 mm as reusable', () => {
    const result = nestSingleProfile('100D-3105', [piece('c1', 5500)]);
    expect(result.bars[0].remainingOffcutMm).toBeCloseTo(500, 1);
    expect(result.bars[0].isReusableOffcut).toBe(true);
  });

  it('classifies offcuts below 500 mm as scrap', () => {
    const result = nestSingleProfile('100D-3105', [piece('c1', 5700)]);
    expect(result.bars[0].remainingOffcutMm).toBeCloseTo(300, 1);
    expect(result.bars[0].isReusableOffcut).toBe(false);
    expect(result.totalReusableOffcutsM).toBeCloseTo(0, 2);
  });

  it('returns an empty result for an empty piece list without dividing by zero', () => {
    const result = nestSingleProfile('100D-3105', []);
    expect(result.totalStockBars).toBe(0);
    expect(result.totalNetLengthM).toBe(0);
    expect(result.totalStockLengthM).toBe(0);
    expect(result.overallYieldPercent).toBe(100);
  });

  it('keeps every nested piece within the stock bar it is assigned to', () => {
    const lengths = Array.from({ length: 12 }, (_, index) => 2100 + (index % 3) * 250);
    const result = nestSingleProfile('100D-3105', lengths.map((length, index) => piece(`c${index}`, length)));
    for (const bar of result.bars) {
      const total = bar.cuts.reduce((sum, cutPiece) => sum + cutPiece.lengthMm, 0);
      expect(total).toBeLessThanOrEqual(bar.stockLengthMm);
      expect(bar.efficiencyPercent).toBeGreaterThan(0);
      expect(bar.efficiencyPercent).toBeLessThanOrEqual(100);
    }
    expect(result.totalStockBars).toBeGreaterThan(1);
  });

  it('aggregates project cuts across multiple profiles and multiplies quantities', () => {
    const cuts: CutItem[] = [
      cut('100D-J', '100D-3105', 2, 2100),
      cut('70S-R', '70S-1401', 1, 2000),
    ];
    const summary = nestProjectCuts(cuts);
    expect(summary.resultsByProfile).toHaveLength(2);
    const frame = summary.resultsByProfile.find((result) => result.profileCode === '100D-3105');
    expect(frame).toBeDefined();
    expect(frame!.bars[0].cuts).toHaveLength(2);
    expect(summary.totalBarsToPull).toBe(2);
    expect(summary.overallEfficiencyPercent).toBeGreaterThan(0);
    expect(summary.overallEfficiencyPercent).toBeLessThanOrEqual(100);
  });

  it('keeps project-level totals internally consistent', () => {
    const cuts: CutItem[] = [cut('J1', '100D-3105', 2, 2100), cut('J2', '70S-1401', 3, 1200)];
    const summary = nestProjectCuts(cuts);
    const sumBars = summary.resultsByProfile.reduce((sum, result) => sum + result.totalStockBars, 0);
    const sumNet = summary.resultsByProfile.reduce((sum, result) => sum + result.totalNetLengthM, 0);
    expect(summary.totalBarsToPull).toBe(sumBars);
    expect(summary.totalProfileLengthM).toBeCloseTo(sumNet, 2);
  });

  it('reports the requested strategy and full material-accounting metrics', () => {
    const cuts: CutItem[] = [
      cut('J1', '100D-3105', 2, 2100),
      cut('H1', '100D-3105', 1, 3200),
      cut('J2', '70S-1401', 2, 900),
    ];
    const optimized = nestProjectCuts(cuts, 6000, 3.5, { strategy: 'best-fit' });
    const kerfFromBars = optimized.resultsByProfile
      .flatMap((profile) => profile.bars)
      .reduce((sum, bar) => sum + bar.kerfWasteMm, 0);
    const reusableFromBars = optimized.resultsByProfile
      .flatMap((profile) => profile.bars)
      .filter((bar) => bar.isReusableOffcut).length;

    expect(optimized.strategy).toBe('best-fit');
    expect(optimized.totalKerfWasteM).toBeCloseTo(kerfFromBars / 1000, 2);
    expect(optimized.reusableOffcutCount).toBe(reusableFromBars);
    const accounted =
      optimized.totalProfileLengthM +
      optimized.totalKerfWasteM +
      optimized.totalReusableOffcutsM +
      optimized.totalScrapOffcutsM;
    expect(accounted).toBeCloseTo(optimized.totalStockLengthM, 1);
  });

  it('best-fit waste optimization never requires more stock than first-fit', () => {
    const lengths = [3350, 2650, 2150, 2050, 1800, 1700, 1450, 1200, 1100, 950, 850, 700, 600, 520, 500, 480, 420, 360];
    const cuts: CutItem[] = lengths.map((length, index) => cut(`O-${index}`, '100D-3105', 1, length));
    const firstFit = nestProjectCuts(cuts, 6000, 3.5, { strategy: 'first-fit' });
    const bestFit = nestProjectCuts(cuts, 6000, 3.5, { strategy: 'best-fit' });

    expect(firstFit.strategy).toBe('first-fit');
    expect(bestFit.totalBarsToPull).toBeLessThanOrEqual(firstFit.totalBarsToPull);
    expect(bestFit.overallEfficiencyPercent).toBeGreaterThanOrEqual(firstFit.overallEfficiencyPercent);
    expect(bestFit.totalScrapOffcutsM).toBeLessThanOrEqual(firstFit.totalScrapOffcutsM);
  });
});
