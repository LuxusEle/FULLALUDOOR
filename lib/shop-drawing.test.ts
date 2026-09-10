import { describe, expect, it } from 'vitest';
import {
  SHEET_FORMATS,
  STANDARD_SCALES,
  buildElevationLayout,
  buildShopDrawing,
  deriveDrawingStatus,
  estimateTextWidth,
  renderShopDrawingSvg,
  type DrawingPrimitive,
  type ShopDrawing,
} from './shop-drawing';
import type { OpeningItem, ProjectMetadata } from './types';

const project: ProjectMetadata = {
  id: 'p1',
  projectName: 'Riverside Residence',
  clientName: 'A. Perera',
  projectNumber: 'FA-2026-014',
  date: '2026-03-12',
  currency: 'LKR',
  taxRatePercent: 8,
  contractorName: 'Alu Door Pro',
};

function opening(overrides: Partial<OpeningItem> = {}): OpeningItem {
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
    ...overrides,
  };
}

const dimTexts = (drawing: ShopDrawing): DrawingPrimitive[] =>
  drawing.primitives.filter(
    (primitive) =>
      primitive.kind === 'text' && primitive.layer === 'dimension' && primitive.rotate === undefined
  );

describe('shop drawing elevation geometry', () => {
  it('derives a proportional single swing leaf from the live opening', () => {
    const layout = buildElevationLayout(opening());
    expect(layout.width).toBe(900);
    expect(layout.height).toBe(2100);
    expect(layout.frame.face).toBe(45);
    expect(layout.panels).toHaveLength(1);
    expect(layout.panels[0].width).toBeGreaterThan(700);
    expect(layout.panels[0].width).toBeLessThan(900);
    expect(layout.panels[0].glass.length).toBe(2);
    expect(layout.swing?.hingeSide).toBe('left');
  });

  it('swaps handing when the opening handing changes', () => {
    const layout = buildElevationLayout(opening({ hingeSide: 'right' }));
    expect(layout.swing?.hingeSide).toBe('right');
  });

  it('derives two leaves for a double swing door', () => {
    const layout = buildElevationLayout(opening({ system: '100D-double', width: 1800 }));
    expect(layout.panels).toHaveLength(2);
    expect(layout.members.some((member) => member.profile === '100D-102')).toBe(true);
  });

  it('derives sliding panels and slide direction', () => {
    const layout = buildElevationLayout(opening({ system: '70S-sliding-2p', width: 2000, hingeSide: 'right' }));
    expect(layout.panels).toHaveLength(2);
    expect(layout.slide?.direction).toBe('right');
    expect(layout.slide?.activePanelIds.length).toBe(2);
  });

  it('marks outer panels fixed on a 4-panel OXXO slider', () => {
    const layout = buildElevationLayout(opening({ system: '70S-sliding-4p', width: 3200, height: 2200 }));
    expect(layout.panels).toHaveLength(4);
    expect(layout.slide?.fixedPanelIds).toEqual(['D-01-P1', 'D-01-P4']);
  });
});

describe('dimension chains', () => {
  it('emits overall width and height chains', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [opening()] });
    const overallH = drawing.dimensions.find((chain) => chain.id === 'h-overall');
    const overallV = drawing.dimensions.find((chain) => chain.id === 'v-overall');
    expect(overallH?.segments[0]).toMatchObject({ start: 0, end: 900, label: '900' });
    expect(overallV?.segments[0]).toMatchObject({ start: 0, end: 2100, label: '2100' });
  });

  it('emits intermediate module and glass chains', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [opening()] });
    const moduleChain = drawing.dimensions.find((chain) => chain.id === 'h-module');
    const glass = drawing.dimensions.find((chain) => chain.id === 'h-glass');
    const verticalGlass = drawing.dimensions.find((chain) => chain.id === 'v-glass');
    expect(moduleChain?.segments.some((segment) => segment.kind === 'component')).toBe(true);
    expect(glass?.segments.length).toBeGreaterThan(0);
    expect(verticalGlass?.segments.length).toBe(2);
  });

  it('avoids overlapping dimension labels on the same row', () => {
    const drawing = buildShopDrawing({ project, opening: opening({ system: '70S-sliding-4p', width: 3200 }), openings: [] });
    const texts = dimTexts(drawing);
    const rows = new Map<number, DrawingPrimitive[]>();
    for (const text of texts) {
      if (text.kind !== 'text') continue;
      const key = Math.round(text.y * 10);
      rows.set(key, [...(rows.get(key) ?? []), text]);
    }
    for (const row of rows.values()) {
      const intervals = row
        .filter((text): text is Extract<DrawingPrimitive, { kind: 'text' }> => text.kind === 'text')
        .map((text) => {
          const width = estimateTextWidth(text.text, text.size);
          return { left: text.x - width / 2, right: text.x + width / 2 };
        })
        .sort((a, b) => a.left - b.left);
      for (let index = 1; index < intervals.length; index += 1) {
        expect(intervals[index].left).toBeGreaterThanOrEqual(intervals[index - 1].right - 0.01);
      }
    }
  });

  it('keeps all geometry inside the sheet (no clipping)', () => {
    const drawing = buildShopDrawing({ project, opening: opening({ system: '70S-sliding-4p', width: 3200 }), openings: [] });
    for (const primitive of drawing.primitives) {
      if (primitive.kind === 'line') {
        expect(primitive.x1).toBeGreaterThanOrEqual(-0.01);
        expect(primitive.x2).toBeLessThanOrEqual(drawing.viewBox.width + 0.01);
        expect(primitive.y1).toBeGreaterThanOrEqual(-0.01);
        expect(primitive.y2).toBeLessThanOrEqual(drawing.viewBox.height + 0.01);
      }
      if (primitive.kind === 'rect') {
        expect(primitive.x).toBeGreaterThanOrEqual(-0.01);
        expect(primitive.y).toBeGreaterThanOrEqual(-0.01);
        expect(primitive.x + primitive.width).toBeLessThanOrEqual(drawing.viewBox.width + 0.01);
        expect(primitive.y + primitive.height).toBeLessThanOrEqual(drawing.viewBox.height + 0.01);
      }
    }
  });
});

describe('automatic drawing scale', () => {
  it('selects a standard scale that fits the sheet', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [], sheetSize: 'A3', orientation: 'landscape' });
    expect(STANDARD_SCALES).toContain(drawing.scale.denominator as (typeof STANDARD_SCALES)[number]);
    expect(drawing.scale.label.startsWith('1:')).toBe(true);
  });

  it('clamps an over-large manual scale to fit the sheet', () => {
    const drawing = buildShopDrawing({
      project,
      opening: opening({ width: 4500, height: 3500 }),
      openings: [],
      sheetSize: 'A4',
      orientation: 'portrait',
      scale: 10,
    });
    expect(drawing.scale.clamped).toBe(true);
    expect(drawing.scale.denominator).toBeGreaterThan(10);
  });

  it('supports fit-to-sheet mode', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [], scale: 'fit' });
    expect(drawing.scale.label).toBe('FIT');
  });
});

describe('sheet formats and title block', () => {
  it('sizes A4 portrait and A3 landscape correctly', () => {
    const a4 = buildShopDrawing({ project, opening: opening(), openings: [], sheetSize: 'A4', orientation: 'portrait' });
    const a3 = buildShopDrawing({ project, opening: opening(), openings: [], sheetSize: 'A3', orientation: 'landscape' });
    expect(a4.viewBox).toEqual({ width: SHEET_FORMATS.A4.portrait.width, height: SHEET_FORMATS.A4.portrait.height });
    expect(a3.viewBox).toEqual({ width: SHEET_FORMATS.A3.landscape.width, height: SHEET_FORMATS.A3.landscape.height });
  });

  it('populates the title block from live project and opening data', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [opening()] });
    expect(drawing.titleBlock.project).toBe('Riverside Residence');
    expect(drawing.titleBlock.client).toBe('A. Perera');
    expect(drawing.titleBlock.drawingNumber).toBe('FA-2026-014-D-01');
    expect(drawing.titleBlock.revision).toBe('FA-2026-014-20260312');
    expect(drawing.titleBlock.units).toBe('mm');
    expect(drawing.titleBlock.status).toBe('DRAFT');
  });

  it('numbers sheets for multi-opening projects', () => {
    const a = opening({ id: 'a', tag: 'D-01' });
    const b = opening({ id: 'b', tag: 'D-02' });
    const c = opening({ id: 'c', tag: 'W-01', system: 'casement' });
    const drawing = buildShopDrawing({ project, opening: b, openings: [a, b, c] });
    expect(drawing.titleBlock.sheet).toBe('2 / 3');
  });
});

describe('live-data status and references', () => {
  it('reports REQUIRES REVIEW when project data is missing', () => {
    expect(deriveDrawingStatus(null, opening())).toBe('REQUIRES REVIEW');
    expect(deriveDrawingStatus({ ...project, projectNumber: '' }, opening())).toBe('REQUIRES REVIEW');
    expect(deriveDrawingStatus(project, opening({ location: '' }))).toBe('REQUIRES REVIEW');
    expect(deriveDrawingStatus(project, opening({ width: 400 }))).toBe('REQUIRES REVIEW');
    expect(deriveDrawingStatus(project, opening())).toBe('DRAFT');
  });

  it('builds profile callouts from the live cut list with catalogue traceability', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [] });
    const frame = drawing.profileReferences.find((profile) => profile.code === '100D-3105');
    expect(frame?.verifiedGeometry).toBe(true);
    expect(frame?.cataloguePage).toBe(51);

    const sliding = buildShopDrawing({ project, opening: opening({ system: '100S-sliding-2p', width: 2400 }), openings: [] });
    const sd = sliding.profileReferences.find((profile) => profile.code === 'SD-1001');
    expect(sd?.confidence).toBe('REQUIRES REVIEW');
  });

  it('builds glass references from the derived model', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [] });
    expect(drawing.glassReferences).toHaveLength(2);
    expect(drawing.glassReferences[0].thickness).toBe(6);
  });

  it('renders verified details for 100D and REQUIRES REVIEW for unverified systems', () => {
    const door = buildShopDrawing({ project, opening: opening(), openings: [] });
    expect(door.details.find((detail) => detail.id === 'head')?.available).toBe(true);

    const slider = buildShopDrawing({ project, opening: opening({ system: '100S-sliding-2p', width: 2400 }), openings: [] });
    const head = slider.details.find((detail) => detail.id === 'head');
    expect(head?.available).toBe(false);
    expect(head?.missing).toContain('SD-1001');
  });
});

describe('SVG export', () => {
  it('generates a vector SVG sheet containing the live title and dimensions', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [opening()] });
    const svg = renderShopDrawingSvg(drawing);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('ARCHITECTURAL SHOP DRAWING');
    expect(svg).toContain('FA-2026-014-D-01');
    expect(svg).toContain('100D-3105');
    expect(svg).toContain('>900<');
  });

  it('is deterministic for export consistency', () => {
    const drawing = buildShopDrawing({ project, opening: opening(), openings: [opening()], generatedAt: '2026-03-12T00:00:00.000Z' });
    expect(renderShopDrawingSvg(drawing)).toBe(renderShopDrawingSvg(drawing));
  });
});
