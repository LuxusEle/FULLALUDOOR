import { describe, it, expect } from 'vitest';
import {
  generateBarAxonometricSvg,
  getStandardMachining,
  PROFILE_DIMENSIONS,
} from './axonometric-bar';

describe('Axonometric Bar 3D Projection Engine', () => {
  it('has profile dimensions for major 70S and 100D profiles', () => {
    expect(PROFILE_DIMENSIONS['70S-1001-1']).toBeDefined();
    expect(PROFILE_DIMENSIONS['70S-1501'].h).toBe(56.1);
    expect(PROFILE_DIMENSIONS['100D-3105'].w).toBe(99.9);
  });

  it('generates standard machining operations for 70S sill', () => {
    const ops = getStandardMachining('70S-1101-1', 2000);
    expect(ops.length).toBeGreaterThanOrEqual(2);
    const weep = ops.find((o) => o.type === 'weep');
    expect(weep).toBeDefined();
    expect(weep?.label).toContain('Drainage Weep Slot');
  });

  it('generates standard machining for 70S bottom rail with roller pockets', () => {
    const ops = getStandardMachining('70S-1501', 940);
    const roller = ops.find((o) => o.type === 'roller');
    expect(roller).toBeDefined();
    expect(roller?.label).toContain('Roller Carriage Pocket');
  });

  it('generates valid SVG geometry for 90° square cut bar', () => {
    const res = generateBarAxonometricSvg({
      profileCode: '70S-1001-1',
      description: 'Head Track',
      lengthMm: 1800,
      angleLeft: 90,
      angleRight: 90,
    });

    expect(res.viewBox).toBe('0 0 380 220');
    expect(res.edges.length).toBeGreaterThan(5);
    expect(res.dimLine.text).toBe('L = 1800.0 mm');
  });

  it('handles 45° mitered cut bars correctly', () => {
    const res = generateBarAxonometricSvg({
      profileCode: '100D-3105',
      description: 'Outer Frame Head',
      lengthMm: 950,
      angleLeft: 45,
      angleRight: 45,
    });

    expect(res.dimLine.text).toBe('L = 950.0 mm');
    expect(res.frontPolygon).toBeDefined();
    expect(res.edges.length).toBeGreaterThan(5);
  });
});
