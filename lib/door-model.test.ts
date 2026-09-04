import { describe, expect, it } from 'vitest';
import { defaultDoorConfig, deriveDoor, doorConfigSchema, fabricationChecks, jointClearanceReport } from './door-model';
import { nestSingleProfile, nestProjectCuts } from './nesting-engine';

describe('door fabrication model', () => {
  it('keeps rails between stile faces', () => {
    const d = deriveDoor(defaultDoorConfig);
    expect(d.railLeft).toBe(d.leafLeft + d.leftStileFace);
    expect(d.railRight).toBe(d.leafRight - d.rightStileFace);
    expect(d.clearWidth).toBeGreaterThan(0);
  });

  it('seats glass 12 mm into both side channels', () => {
    const d = deriveDoor(defaultDoorConfig);
    expect(d.railLeft - d.glassX0).toBe(12);
    expect(d.glassX1 - d.railRight).toBe(12);
  });

  it('rejects unsupported dimensions', () => {
    expect(() => doorConfigSchema.parse({ ...defaultDoorConfig, width: 500 })).toThrow();
  });

  it('leaves a controlled rail-body assembly gap', () => {
    const d = deriveDoor(defaultDoorConfig);
    expect(d.cutList.find((item) => item.id === 'R-T')?.length).toBeCloseTo(d.clearWidth - 1.2);
  });

  it('proves rail bodies do not enter either stile envelope', () => {
    const report = jointClearanceReport(defaultDoorConfig);
    expect(report.leftStileOverlap).toBe(0);
    expect(report.rightStileOverlap).toBe(0);
    expect(report.connectorPenetrationAllowed).toBe(true);
  });

  it('reports five invariants', () => {
    expect(fabricationChecks(defaultDoorConfig)).toHaveLength(5);
  });

  it('uses the true 66/70 mm stile face widths', () => {
    const d = deriveDoor(defaultDoorConfig);
    expect(d.leftStileFace).toBe(66);
    expect(d.rightStileFace).toBe(70);
    expect(d.railLeft).toBe(d.leafLeft + 66);
    expect(d.railRight).toBe(d.leafRight - 70);
  });

  it('swaps stile widths when handing changes', () => {
    const d = deriveDoor({ ...defaultDoorConfig, hingeSide: 'right' });
    expect(d.leftStileFace).toBe(70);
    expect(d.rightStileFace).toBe(66);
  });

  it('derives 100D double swing door with meeting stiles and 2 leaves', () => {
    const d = deriveDoor({ ...defaultDoorConfig, system: '100D-double', width: 1800, height: 2200 });
    expect(d.cutList.some((c) => c.profile === '100D-102')).toBe(true);
    expect(d.glassPanels.length).toBeGreaterThanOrEqual(2);
    expect(d.hardware.some((h) => h.code === 'FLB-200')).toBe(true);
  });

  it('derives 70S 2-track sliding door with top/bottom tracks and sashes', () => {
    const d = deriveDoor({ ...defaultDoorConfig, system: '70S-sliding-2p', width: 2000, height: 2100 });
    expect(d.cutList.some((c) => c.profile === '70S-1001-1')).toBe(true);
    expect(d.cutList.some((c) => c.profile === '70S-1101-1')).toBe(true);
    expect(d.cutList.some((c) => c.profile === '70S-1401')).toBe(true);
    expect(d.cutList.some((c) => c.profile === '70S-1501')).toBe(true);
    expect(d.hardware.some((h) => h.code === '70S-1914')).toBe(true);
  });
});

describe('1D linear bar nesting engine', () => {
  it('optimizes cutting pieces into standard 6000 mm bars with kerf deduction', () => {
    const pieces = [
      { cutId: 'c1', openingTag: 'D-01', description: 'Jamb', lengthMm: 2100, angleL: 90, angleR: 90 },
      { cutId: 'c2', openingTag: 'D-01', description: 'Jamb', lengthMm: 2100, angleL: 90, angleR: 90 },
      { cutId: 'c3', openingTag: 'D-01', description: 'Head', lengthMm: 900, angleL: 45, angleR: 45 },
    ];
    // 2100 + 3.5 + 2100 + 3.5 + 900 = 5107 mm <= 6000 mm -> fits in exactly 1 bar!
    const result = nestSingleProfile('100D-3105', pieces, 6000, 3.5);
    expect(result.totalStockBars).toBe(1);
    expect(result.bars[0].cuts.length).toBe(3);
    expect(result.bars[0].remainingOffcutMm).toBeCloseTo(6000 - 5107, 1);
    expect(result.bars[0].isReusableOffcut).toBe(true);
  });

  it('aggregates project cuts across multiple profiles', () => {
    const d1 = deriveDoor(defaultDoorConfig);
    const d2 = deriveDoor({ ...defaultDoorConfig, system: '70S-sliding-2p', width: 2000, height: 2100 });
    const summary = nestProjectCuts([...d1.cutList, ...d2.cutList]);
    expect(summary.totalBarsToPull).toBeGreaterThan(0);
    expect(summary.overallEfficiencyPercent).toBeGreaterThan(0);
    expect(summary.overallEfficiencyPercent).toBeLessThanOrEqual(100);
  });
});
