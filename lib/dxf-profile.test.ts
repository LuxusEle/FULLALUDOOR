import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDxfProfile } from './dxf-profile';

const profile = (id: string) =>
  parseDxfProfile(id, readFileSync(join(process.cwd(), 'public', 'profiles', 'alumex', `${id}.dxf`), 'utf8'));

describe('Alumex 100D DXF profiles', () => {
  it.each([
    ['100D-3105', 100.033, 45, 0],
    ['100D-101', 65.958, 45.029, 1],
    ['100D-103', 69.911, 45.057, 1],
    ['100D-201', 79.98, 42.211, 1],
    ['100D-301', 99.959, 42.217, 1],
    ['100D-401', 119.878, 42.243, 1],
  ])('%s has the catalog envelope and chambers', (id, a, b, holes) => {
    const p = profile(id);
    expect(Math.abs(Math.max(p.width, p.height) - Math.max(a, b))).toBeLessThan(0.3);
    expect(Math.abs(Math.min(p.width, p.height) - Math.min(a, b))).toBeLessThan(0.3);
    expect(p.holes.length).toBe(holes);
  });

  it('preserves curved DXF bulges as tessellated points', () =>
    expect(profile('100D-201').outer.points.length).toBeGreaterThan(20));
});

describe('Alumex 70S Sliding DXF profiles', () => {
  it.each([
    ['70S-1001-1', 69.82, 32.02, 0], // Top Track Head
    ['70S-1101-1', 69.81, 30.02, 0], // Bottom Track Sill
    ['70S-1201-1', 72.81, 25.01, 0], // Wall Upright Jamb
    ['70S-1401', 27.92, 32.0, 0], // Top Sash Rail
    ['70S-1501', 21.87, 56.34, 0], // Bottom Sash Rail (with inverted roller chamber)
    ['70S-1601', 29.92, 32.0, 1], // Interlock Stile
    ['70S-1701', 29.82, 26.0, 1], // Lock / Handle Stile
  ])('%s has the Alumex Advance catalog envelope', (id, a, b, holes) => {
    const p = profile(id);
    expect(Math.abs(Math.max(p.width, p.height) - Math.max(a, b))).toBeLessThan(0.3);
    expect(Math.abs(Math.min(p.width, p.height) - Math.min(a, b))).toBeLessThan(0.3);
    expect(p.holes.length).toBe(holes);
  });
});
