import type { CutItem, NestedBar, NestingStrategy, ProfileNestingResult, ProjectNestingSummary } from './types';
import { PROFILE_WEIGHTS } from './door-model';

export const DEFAULT_STOCK_LEN_MM = 6000.0;
export const DEFAULT_BLADE_KERF_MM = 3.5;
export const USABLE_OFFCUT_MIN_MM = 500.0;

interface NestPiece {
  cutId: string;
  openingTag: string;
  description: string;
  lengthMm: number;
  angleL: number;
  angleR: number;
}

/**
 * 1D bin-packing heuristics for aluminium bar nesting.
 * - first-fit decreasing: classic FFD, opens a new bar as soon as the current one
 *   cannot host the next (largest-first) piece.
 * - best-fit decreasing: tries every already-opened bar (i.e. every remaining
 *   offcut) first and places the piece into the bar that leaves the least slack,
 *   only opening a fresh stock bar when no offcut can absorb it. This is the
 *   "reuse offcuts before cutting new stock" behaviour and minimizes scrap.
 */
export function nestSingleProfile(
  profileCode: string,
  pieces: NestPiece[],
  stockLengthMm = DEFAULT_STOCK_LEN_MM,
  bladeKerfMm = DEFAULT_BLADE_KERF_MM,
  strategy: NestingStrategy = 'best-fit'
): ProfileNestingResult {
  const spec = PROFILE_WEIGHTS[profileCode] || { name: 'Aluminium Section', kgM: 1.0 };
  const sorted = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm || a.cutId.localeCompare(b.cutId));
  const bars: NestedBar[] = [];

  const kerfBefore = (bar: NestedBar) => (bar.cuts.length === 0 ? 0 : bladeKerfMm);

  for (const piece of sorted) {
    let bestBar: NestedBar | null = null;
    let bestSlack = Infinity;

    for (const bar of bars) {
      const slack = stockLengthMm - bar.usedLengthMm - kerfBefore(bar) - piece.lengthMm;
      if (slack < 0) continue;
      if (strategy === 'best-fit') {
        if (slack < bestSlack) {
          bestSlack = slack;
          bestBar = bar;
        }
      } else {
        bestBar = bar;
        break;
      }
    }

    if (bestBar) {
      const kerf = kerfBefore(bestBar);
      bestBar.cuts.push({
        cutId: piece.cutId,
        openingTag: piece.openingTag,
        pieceDescription: piece.description,
        lengthMm: piece.lengthMm,
        angleL: piece.angleL,
        angleR: piece.angleR,
      });
      bestBar.usedLengthMm += kerf + piece.lengthMm;
    } else {
      bars.push({
        barIndex: bars.length + 1,
        profileCode,
        profileDescription: spec.name,
        stockLengthMm,
        usedLengthMm: piece.lengthMm,
        remainingOffcutMm: stockLengthMm - piece.lengthMm,
        isReusableOffcut: stockLengthMm - piece.lengthMm >= USABLE_OFFCUT_MIN_MM,
        kerfWasteMm: 0,
        efficiencyPercent: Number(((piece.lengthMm / stockLengthMm) * 100).toFixed(1)),
        cuts: [
          {
            cutId: piece.cutId,
            openingTag: piece.openingTag,
            pieceDescription: piece.description,
            lengthMm: piece.lengthMm,
            angleL: piece.angleL,
            angleR: piece.angleR,
          },
        ],
      });
    }
  }

  let totalNetMm = 0;
  let totalKerfMm = 0;
  let totalScrapMm = 0;
  let totalReusableMm = 0;

  for (const bar of bars) {
    const cutsSum = bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
    const kerfSum = Math.max(0, bar.cuts.length - 1) * bladeKerfMm;
    const offcut = Math.max(0, stockLengthMm - (cutsSum + kerfSum));

    bar.usedLengthMm = Number((cutsSum + kerfSum).toFixed(1));
    bar.remainingOffcutMm = Number(offcut.toFixed(1));
    bar.kerfWasteMm = Number(kerfSum.toFixed(1));
    bar.isReusableOffcut = offcut >= USABLE_OFFCUT_MIN_MM;
    bar.efficiencyPercent = Number(((cutsSum / stockLengthMm) * 100).toFixed(1));

    totalNetMm += cutsSum;
    totalKerfMm += kerfSum;
    if (bar.isReusableOffcut) {
      totalReusableMm += offcut;
    } else {
      totalScrapMm += offcut;
    }
  }

  const totalStockMm = bars.length * stockLengthMm;
  const overallYieldPercent = totalStockMm > 0 ? Number(((totalNetMm / totalStockMm) * 100).toFixed(1)) : 100;
  const totalScrapWastePercent = Number((100 - overallYieldPercent).toFixed(1));
  const totalWeightKg = Number(((totalNetMm / 1000) * spec.kgM).toFixed(2));

  return {
    profileCode,
    profileDescription: spec.name,
    unitWeightKgM: spec.kgM,
    stockLengthMm,
    bladeKerfMm,
    totalStockBars: bars.length,
    totalNetLengthM: Number((totalNetMm / 1000).toFixed(2)),
    totalStockLengthM: Number((totalStockMm / 1000).toFixed(2)),
    totalWeightKg,
    overallYieldPercent,
    totalScrapWastePercent,
    totalReusableOffcutsM: Number((totalReusableMm / 1000).toFixed(2)),
    bars,
  };
}

export interface NestProjectOptions {
  strategy?: NestingStrategy;
}

export function nestProjectCuts(
  allCuts: CutItem[],
  stockLengthMm = DEFAULT_STOCK_LEN_MM,
  bladeKerfMm = DEFAULT_BLADE_KERF_MM,
  options: NestProjectOptions = {}
): ProjectNestingSummary {
  const strategy: NestingStrategy = options.strategy ?? 'best-fit';

  const groups = new Map<string, NestPiece[]>();
  for (const cut of allCuts) {
    if (cut.length <= 0) continue;
    if (!groups.has(cut.profile)) {
      groups.set(cut.profile, []);
    }
    for (let q = 0; q < cut.qty; q++) {
      groups.get(cut.profile)!.push({
        cutId: `${cut.id}-${q + 1}`,
        openingTag: cut.openingTag,
        description: cut.description,
        lengthMm: cut.length,
        angleL: cut.angleLeft,
        angleR: cut.angleRight,
      });
    }
  }

  const resultsByProfile: ProfileNestingResult[] = [];
  let totalBarsToPull = 0;
  let totalProfileLengthM = 0;
  let totalStockLengthM = 0;
  let totalAluWeightKg = 0;
  let totalReusableOffcutsM = 0;
  let totalKerfWasteM = 0;
  let reusableOffcutCount = 0;

  for (const [code, pieces] of groups.entries()) {
    const result = nestSingleProfile(code, pieces, stockLengthMm, bladeKerfMm, strategy);
    resultsByProfile.push(result);
    totalBarsToPull += result.totalStockBars;
    totalProfileLengthM += result.totalNetLengthM;
    totalStockLengthM += result.totalStockLengthM;
    totalAluWeightKg += result.totalWeightKg;
    totalReusableOffcutsM += result.totalReusableOffcutsM;

    for (const bar of result.bars) {
      totalKerfWasteM += bar.kerfWasteMm / 1000;
      if (bar.isReusableOffcut) {
        reusableOffcutCount += 1;
      }
    }
  }

  const totalScrapOffcutsM = Number(
    Math.max(0, totalStockLengthM - totalProfileLengthM - totalReusableOffcutsM - totalKerfWasteM).toFixed(2)
  );
  const overallEfficiencyPercent =
    totalStockLengthM > 0
      ? Number(((totalProfileLengthM / totalStockLengthM) * 100).toFixed(1))
      : 100;

  return {
    resultsByProfile,
    strategy,
    totalBarsToPull,
    totalProfileLengthM: Number(totalProfileLengthM.toFixed(2)),
    totalStockLengthM: Number(totalStockLengthM.toFixed(2)),
    totalAluWeightKg: Number(totalAluWeightKg.toFixed(2)),
    overallEfficiencyPercent,
    totalReusableOffcutsM: Number(totalReusableOffcutsM.toFixed(2)),
    totalScrapOffcutsM,
    totalKerfWasteM: Number(totalKerfWasteM.toFixed(2)),
    reusableOffcutCount,
  };
}

// Kept for backwards-compatibility callers that may want the raw first-fit mode.
export const nestProjectCutsFirstFit = (
  allCuts: CutItem[],
  stockLengthMm = DEFAULT_STOCK_LEN_MM,
  bladeKerfMm = DEFAULT_BLADE_KERF_MM
): ProjectNestingSummary =>
  nestProjectCuts(allCuts, stockLengthMm, bladeKerfMm, { strategy: 'first-fit' });
