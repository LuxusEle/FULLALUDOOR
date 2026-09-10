// FullAluDoor architectural shop-drawing engine.
//
// Pure, deterministic and strongly typed. It consumes the SAME live project /
// opening state used by the rest of the application (lib/types + lib/door-model)
// and produces a printable architectural drawing sheet. No values are invented:
// every dimension, profile code, glass reference and note traces back to the
// opening, the deriveDoor fabrication model or the verified Alumex DXF data.

import type { CutItem, DerivedOpening, OpeningItem, ProjectMetadata, TypologyId } from './types';
import { deriveDoor, PROFILE_WEIGHTS } from './door-model';
import { deriveOpeningIssues } from './project-catalog';
import {
  DXF_100D_101,
  DXF_100D_102,
  DXF_100D_103,
  DXF_100D_201,
  DXF_100D_301,
  DXF_100D_3105,
  DXF_100D_401,
  DXF_100D_501,
  DXF_70S_1001_1,
  DXF_70S_1101_1,
  DXF_70S_1201_1,
  DXF_70S_1401,
  DXF_70S_1501,
  DXF_70S_1601,
  DXF_70S_1701,
} from './dxf-svg-paths';

export type SheetSize = 'A4' | 'A3';
export type SheetOrientation = 'portrait' | 'landscape';
export type DrawingStatus = 'DRAFT' | 'REQUIRES REVIEW';
export type ScaleMode = 'auto' | 'fit' | number;

export const STANDARD_SCALES = [10, 20, 25, 50, 100, 200] as const;

export const SHEET_FORMATS: Record<SheetSize, Record<SheetOrientation, { width: number; height: number }>> = {
  A4: { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } },
  A3: { portrait: { width: 297, height: 420 }, landscape: { width: 420, height: 297 } },
};

export type LineStyleKey =
  | 'outline'
  | 'secondary'
  | 'glass'
  | 'dimension'
  | 'extension'
  | 'centre'
  | 'hidden'
  | 'section'
  | 'detail'
  | 'grid'
  | 'thin'
  | 'paper'
  | 'title';

export interface LineStyle {
  width: number;
  dash?: string;
  color: string;
  opacity?: number;
}

export const LINE_STYLES: Record<LineStyleKey, LineStyle> = {
  outline: { width: 0.5, color: '#0b0b0b' },
  secondary: { width: 0.32, color: '#333333' },
  glass: { width: 0.25, color: '#1f4e79' },
  dimension: { width: 0.22, color: '#0b3d91' },
  extension: { width: 0.16, color: '#5b6472' },
  centre: { width: 0.2, color: '#b42318', dash: '4 1.4 1 1.4' },
  hidden: { width: 0.2, color: '#555555', dash: '1.6 1.1' },
  section: { width: 0.42, color: '#b42318' },
  detail: { width: 0.42, color: '#b42318' },
  grid: { width: 0.12, color: '#b9c0c9' },
  thin: { width: 0.14, color: '#666666' },
  paper: { width: 0.3, color: '#0b0b0b' },
  title: { width: 0.24, color: '#0b0b0b' },
};

export type DrawingLayer =
  | 'paper'
  | 'border'
  | 'header'
  | 'grid'
  | 'elevation'
  | 'glass'
  | 'profile'
  | 'annotation'
  | 'section'
  | 'dimension'
  | 'detail'
  | 'notes'
  | 'titleblock';

interface PrimitiveBase {
  layer: DrawingLayer;
  id?: string;
}

export type DrawingPrimitive = PrimitiveBase &
  (
    | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; style: LineStyleKey }
    | {
        kind: 'rect';
        x: number;
        y: number;
        width: number;
        height: number;
        style: LineStyleKey;
        fill?: string;
        fillOpacity?: number;
      }
    | { kind: 'polyline'; points: string; style: LineStyleKey; fill?: string; fillOpacity?: number }
    | { kind: 'path'; d: string; style: LineStyleKey; fill?: string }
    | { kind: 'circle'; cx: number; cy: number; r: number; style: LineStyleKey; fill?: string }
    | {
        kind: 'text';
        x: number;
        y: number;
        text: string;
        size: number;
        style: LineStyleKey;
        anchor?: 'start' | 'middle' | 'end';
        baseline?: 'auto' | 'middle' | 'hanging';
        weight?: number;
        rotate?: number;
        family?: 'mono' | 'sans';
      }
  );

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElevationGlass {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  thickness: number;
  description: string;
  qty: number;
}

export interface ElevationPanel {
  id: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  glass: ElevationGlass[];
}

export interface ElevationFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  face: number;
  innerX: number;
  innerY: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ElevationMember {
  id: string;
  axis: 'horizontal' | 'vertical';
  position: number;
  thickness: number;
  profile: string;
  label: string;
}

export interface SwingInfo {
  hingeSide: 'left' | 'right';
  openingAngle: number;
  hingeX: number;
  hingeY: number;
  leafWidth: number;
  leafHeight: number;
}

export interface SlideInfo {
  direction: 'left' | 'right';
  activePanelIds: string[];
  fixedPanelIds: string[];
}

export interface ElevationLayout {
  system: TypologyId;
  width: number;
  height: number;
  frame: ElevationFrame;
  panels: ElevationPanel[];
  members: ElevationMember[];
  swing?: SwingInfo;
  slide?: SlideInfo;
}

export interface DimensionSegment {
  id: string;
  start: number;
  end: number;
  label: string;
  kind: 'overall' | 'module' | 'glass' | 'frame' | 'component';
}

export interface DimensionChain {
  id: string;
  axis: 'horizontal' | 'vertical';
  level: number;
  segments: DimensionSegment[];
}

export interface ProfileReference {
  code: string;
  description: string;
  group: CutItem['group'];
  quantity: number;
  catalogue: string;
  cataloguePage: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'REQUIRES REVIEW';
  verifiedGeometry: boolean;
}

export interface GlassReference {
  id: string;
  width: number;
  height: number;
  thickness: number;
  description: string;
  qty: number;
  areaM2: number;
}

export interface HardwareReference {
  code: string;
  name: string;
  qty: number;
  unit: string;
  category: DerivedOpening['hardware'][number]['category'];
}

export interface DetailProfile {
  code: string;
  description: string;
  width: number;
  height: number;
  points: string;
  catalogue: string;
}

export interface DrawingDetail {
  id: string;
  section: string;
  title: string;
  available: boolean;
  reason?: string;
  missing: string[];
  profiles: DetailProfile[];
  notes: string[];
}

export interface TitleBlock {
  brand: string;
  project: string;
  client: string;
  drawing: string;
  opening: string;
  system: string;
  drawingNumber: string;
  revision: string;
  scale: string;
  units: string;
  date: string;
  status: DrawingStatus;
  sheet: string;
}

export interface ShopDrawing {
  project: ProjectMetadata | null;
  opening: OpeningItem;
  sheet: {
    size: SheetSize;
    orientation: SheetOrientation;
    width: number;
    height: number;
  };
  scale: {
    mode: ScaleMode;
    denominator: number;
    label: string;
    clamped: boolean;
  };
  title: string;
  subtitle: string;
  elevation: ElevationLayout;
  dimensions: DimensionChain[];
  details: DrawingDetail[];
  profileReferences: ProfileReference[];
  glassReferences: GlassReference[];
  hardwareReferences: HardwareReference[];
  notes: string[];
  revision: string;
  status: DrawingStatus;
  titleBlock: TitleBlock;
  primitives: DrawingPrimitive[];
  viewBox: { width: number; height: number };
}

const GLASS_LABELS: Record<OpeningItem['glass'], string> = {
  '6mm-clear': '6 mm Clear Toughened',
  '8mm-tinted': '8 mm Tinted',
  '10.38mm-laminated': '10.38 mm Laminated',
  '12mm-toughened': '12 mm Toughened',
  '24mm-dgu': '24 mm Double Glazed Unit',
};

const FINISH_LABELS: Record<OpeningItem['finish'], string> = {
  natural: 'Natural Anodized',
  black: 'Powder Coat Black',
  bronze: 'Powder Coat Bronze',
  white: 'Powder Coat White',
};

const SYSTEM_LABELS: Record<TypologyId, string> = {
  '100D-single': '100 mm Single Leaf Swing Door',
  '100D-double': '100 mm Double Leaf Swing Door',
  '100S-sliding-2p': '100 mm Advance 2-Panel Sliding',
  '70S-sliding-2p': '70S 2-Track 2-Panel Sliding',
  '70S-sliding-4p': '70S 2-Track 4-Panel Sliding',
  '74-cgroove': '74 mm C-Groove Slider',
  casement: 'Casement / Awning Window',
};

const PROFILE_VISUALS: Record<string, { points: string; width: number; height: number }> = {
  '70S-1001-1': DXF_70S_1001_1,
  '70S-1101-1': DXF_70S_1101_1,
  '70S-1201-1': DXF_70S_1201_1,
  '70S-1401': DXF_70S_1401,
  '70S-1501': DXF_70S_1501,
  '70S-1601': DXF_70S_1601,
  '70S-1701': DXF_70S_1701,
  '100D-3105': DXF_100D_3105,
  '100D-101': DXF_100D_101,
  '100D-102': DXF_100D_102,
  '100D-103': DXF_100D_103,
  '100D-201': DXF_100D_201,
  '100D-301': DXF_100D_301,
  '100D-401': DXF_100D_401,
  '100D-501': DXF_100D_501,
};

const CATALOGUE_MANIFEST: Record<string, { page: number; confidence: 'HIGH' | 'MEDIUM' }> = {
  '70S-1001-1': { page: 14, confidence: 'HIGH' },
  '70S-1101-1': { page: 14, confidence: 'HIGH' },
  '70S-1201-1': { page: 14, confidence: 'HIGH' },
  '70S-1401': { page: 14, confidence: 'HIGH' },
  '70S-1501': { page: 14, confidence: 'MEDIUM' },
  '70S-1601': { page: 15, confidence: 'HIGH' },
  '70S-1701': { page: 14, confidence: 'HIGH' },
  '100D-101': { page: 47, confidence: 'HIGH' },
  '100D-102': { page: 47, confidence: 'HIGH' },
  '100D-103': { page: 47, confidence: 'HIGH' },
  '100D-201': { page: 48, confidence: 'HIGH' },
  '100D-301': { page: 48, confidence: 'HIGH' },
  '100D-401': { page: 48, confidence: 'HIGH' },
  '100D-501': { page: 49, confidence: 'HIGH' },
  '100D-3105': { page: 51, confidence: 'MEDIUM' },
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function estimateTextWidth(text: string, size: number): number {
  return text.length * size * 0.62;
}

export function truncateText(text: string, size: number, maxWidth: number): string {
  if (estimateTextWidth(text, size) <= maxWidth) return text;
  const maxChars = Math.max(1, Math.floor(maxWidth / (size * 0.62)) - 1);
  return `${text.slice(0, maxChars).trimEnd()}…`;
}

export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Elevation geometry — derived from the live fabrication model
// ---------------------------------------------------------------------------

interface SlidingInset {
  side: number;
  top: number;
  bottom: number;
}

function slidingInset(system: TypologyId): SlidingInset {
  if (system.startsWith('70S')) return { side: 30, top: 28, bottom: 56 };
  if (system.startsWith('100S')) return { side: 40, top: 30, bottom: 60 };
  if (system === '74-cgroove') return { side: 38, top: 27, bottom: 27 };
  return { side: 32, top: 28, bottom: 40 };
}

function panelGlass(
  panelId: string,
  panel: { x: number; y: number; width: number; height: number },
  inset: SlidingInset,
  source: DerivedOpening['glassPanels'][number] | undefined,
  index: number
): ElevationGlass {
  const x = panel.x + inset.side;
  const y = panel.y + inset.top;
  const width = Math.max(0, panel.width - inset.side * 2);
  const height = Math.max(0, panel.height - inset.top - inset.bottom);
  return {
    id: `${panelId}-G${index + 1}`,
    x: round1(x),
    y: round1(y),
    width: round1(width),
    height: round1(height),
    thickness: source?.thickness ?? 6,
    description: source?.description ?? 'Glass',
    qty: 1,
  };
}

function slidingPanels(
  opening: OpeningItem,
  frameFace: number,
  clear: number,
  count: number,
  overlap: number,
  panelHeight: number,
  fixedIndices: number[]
): ElevationPanel[] {
  const pitch = (clear + (count - 1) * overlap) / count - overlap;
  const panelWidth = pitch + overlap;
  const inset = slidingInset(opening.system);
  const d = deriveDoor(opening);
  const source = d.glassPanels[0];
  const y = round1((opening.height - panelHeight) / 2);
  const panels: ElevationPanel[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = round1(frameFace + index * pitch);
    const base = { x, y, width: round1(panelWidth), height: round1(panelHeight) };
    panels.push({
      id: `${opening.tag}-P${index + 1}`,
      role: fixedIndices.includes(index) ? 'fixed' : 'sliding',
      ...base,
      active: !fixedIndices.includes(index),
      glass: [panelGlass(`${opening.tag}-P${index + 1}`, base, inset, source, index)],
    });
  }
  return panels;
}

function buildSwingSingle(opening: OpeningItem): ElevationLayout {
  const d = deriveDoor(opening);
  const H = opening.height;
  const frame: ElevationFrame = {
    x: 0,
    y: 0,
    width: opening.width,
    height: H,
    face: d.frameFace,
    innerX: d.frameFace,
    innerY: d.frameFace,
    innerWidth: opening.width - d.frameFace * 2,
    innerHeight: H - d.frameFace * 2,
  };
  const leafY = round1(H - d.leafTop);
  const lower = d.glassPanels[0];
  const upper = d.glassPanels[1];
  const glass: ElevationGlass[] = [
    {
      id: `${opening.tag}-GL`,
      x: round1(d.glassX0),
      y: round1(H - d.lowerGlassY1),
      width: round1(d.glassX1 - d.glassX0),
      height: round1(d.lowerGlassY1 - d.lowerGlassY0),
      thickness: lower?.thickness ?? 6,
      description: lower?.description ?? 'Lower glass',
      qty: 1,
    },
    {
      id: `${opening.tag}-GU`,
      x: round1(d.glassX0),
      y: round1(H - d.upperGlassY1),
      width: round1(d.glassX1 - d.glassX0),
      height: round1(d.upperGlassY1 - d.upperGlassY0),
      thickness: upper?.thickness ?? 6,
      description: upper?.description ?? 'Upper glass',
      qty: 1,
    },
  ];
  const hingeSide = opening.hingeSide ?? 'left';
  return {
    system: opening.system,
    width: opening.width,
    height: H,
    frame,
    panels: [
      {
        id: `${opening.tag}-LEAF`,
        role: 'leaf',
        x: round1(d.leafLeft),
        y: leafY,
        width: round1(d.leafWidth),
        height: round1(d.leafHeight),
        active: true,
        glass,
      },
    ],
    members: [
      { id: 'top-rail', axis: 'horizontal', position: leafY, thickness: d.topRail, profile: '100D-201', label: 'TOP RAIL' },
      {
        id: 'mid-rail',
        axis: 'horizontal',
        position: round1(H - (d.midCenter + d.midRail / 2)),
        thickness: d.midRail,
        profile: '100D-301',
        label: 'MID RAIL',
      },
      {
        id: 'bottom-rail',
        axis: 'horizontal',
        position: round1(H - d.leafBottom - d.bottomRail),
        thickness: d.bottomRail,
        profile: '100D-401',
        label: 'BOTTOM RAIL',
      },
      {
        id: 'hinge-stile',
        axis: 'vertical',
        position: hingeSide === 'left' ? d.leafLeft : round1(d.leafRight - d.rightStileFace),
        thickness: hingeSide === 'left' ? d.leftStileFace : d.rightStileFace,
        profile: '100D-101',
        label: 'HINGE STILE',
      },
      {
        id: 'lock-stile',
        axis: 'vertical',
        position: hingeSide === 'left' ? round1(d.leafRight - d.rightStileFace) : d.leafLeft,
        thickness: hingeSide === 'left' ? d.rightStileFace : d.leftStileFace,
        profile: '100D-103',
        label: 'LOCK STILE',
      },
    ],
    swing: {
      hingeSide,
      openingAngle: opening.openingAngle && opening.openingAngle >= 30 ? opening.openingAngle : 90,
      hingeX: hingeSide === 'left' ? round1(d.leafLeft) : round1(d.leafRight),
      hingeY: round1(H - d.leafBottom),
      leafWidth: round1(d.leafWidth),
      leafHeight: round1(d.leafHeight),
    },
  };
}

function buildSwingDouble(opening: OpeningItem): ElevationLayout {
  const d = deriveDoor(opening);
  const H = opening.height;
  const width = opening.width;
  const meetingClearance = 6;
  const leafWidth = (width - d.frameFace * 2 - 2 * 4 - meetingClearance) / 2;
  const leafLeft = d.frameFace + 4;
  const leafTop = H - d.leafTop;
  const frame: ElevationFrame = {
    x: 0,
    y: 0,
    width,
    height: H,
    face: d.frameFace,
    innerX: d.frameFace,
    innerY: d.frameFace,
    innerWidth: width - d.frameFace * 2,
    innerHeight: H - d.frameFace * 2,
  };
  const source = d.glassPanels[0];
  const makeGlass = (panelId: string, panelX: number): ElevationGlass[] => [
    {
      id: `${panelId}-GU`,
      x: round1(panelX + d.leftStileFace),
      y: round1(H - d.upperGlassY1),
      width: round1(leafWidth - d.leftStileFace - d.rightStileFace),
      height: round1(d.upperGlassY1 - d.upperGlassY0),
      thickness: source?.thickness ?? 6,
      description: source?.description ?? 'Glass',
      qty: 1,
    },
    {
      id: `${panelId}-GL`,
      x: round1(panelX + d.leftStileFace),
      y: round1(H - d.lowerGlassY1),
      width: round1(leafWidth - d.leftStileFace - d.rightStileFace),
      height: round1(d.lowerGlassY1 - d.lowerGlassY0),
      thickness: source?.thickness ?? 6,
      description: source?.description ?? 'Glass',
      qty: 1,
    },
  ];
  return {
    system: opening.system,
    width,
    height: H,
    frame,
    panels: [
      {
        id: `${opening.tag}-L1`,
        role: 'leaf',
        x: round1(leafLeft),
        y: round1(leafTop),
        width: round1(leafWidth),
        height: round1(d.leafHeight),
        active: true,
        glass: makeGlass(`${opening.tag}-L1`, leafLeft),
      },
      {
        id: `${opening.tag}-L2`,
        role: 'leaf',
        x: round1(width / 2 + meetingClearance / 2),
        y: round1(leafTop),
        width: round1(leafWidth),
        height: round1(d.leafHeight),
        active: true,
        glass: makeGlass(`${opening.tag}-L2`, width / 2 + meetingClearance / 2),
      },
    ],
    members: [
      { id: 'top-rail', axis: 'horizontal', position: round1(leafTop), thickness: d.topRail, profile: '100D-201', label: 'TOP RAIL' },
      {
        id: 'mid-rail',
        axis: 'horizontal',
        position: round1(H - (d.midCenter + d.midRail / 2)),
        thickness: d.midRail,
        profile: '100D-301',
        label: 'MID RAIL',
      },
      {
        id: 'bottom-rail',
        axis: 'horizontal',
        position: round1(H - d.leafBottom - d.bottomRail),
        thickness: d.bottomRail,
        profile: '100D-401',
        label: 'BOTTOM RAIL',
      },
      { id: 'meeting', axis: 'vertical', position: round1(width / 2), thickness: meetingClearance, profile: '100D-102', label: 'MEETING STILE' },
    ],
    swing: {
      hingeSide: 'left',
      openingAngle: 90,
      hingeX: round1(leafLeft),
      hingeY: round1(H - d.leafBottom),
      leafWidth: round1(leafWidth),
      leafHeight: round1(d.leafHeight),
    },
  };
}

function buildSliding(opening: OpeningItem): ElevationLayout {
  const d = deriveDoor(opening);
  const H = opening.height;
  const width = opening.width;
  const frame: ElevationFrame = {
    x: 0,
    y: 0,
    width,
    height: H,
    face: d.frameFace,
    innerX: d.frameFace,
    innerY: d.frameFace,
    innerWidth: width - d.frameFace * 2,
    innerHeight: H - d.frameFace * 2,
  };

  let count = 2;
  let overlap = 28;
  let panelHeight = H - 28;
  let fixed: number[] = [];
  if (opening.system === '70S-sliding-4p') {
    count = 4;
    overlap = 56;
    fixed = [0, 3];
  } else if (opening.system === '100S-sliding-2p') {
    overlap = 36;
    panelHeight = H - 24;
  } else if (opening.system === '74-cgroove') {
    overlap = 50;
    panelHeight = H - 2 * 62;
  } else if (opening.system === 'casement') {
    count = 1;
    overlap = 0;
    panelHeight = H - 2 * d.frameFace + 16;
  }

  const clear = width - d.frameFace * 2;
  const panels = slidingPanels(opening, d.frameFace, clear, count, overlap, panelHeight, fixed);
  const direction: 'left' | 'right' = opening.hingeSide === 'right' ? 'right' : 'left';
  const activePanelIds = panels.filter((panel) => panel.active).map((panel) => panel.id);
  const fixedPanelIds = panels.filter((panel) => !panel.active).map((panel) => panel.id);
  const slide = opening.system === 'casement' ? undefined : { direction, activePanelIds, fixedPanelIds };
  return {
    system: opening.system,
    width,
    height: H,
    frame,
    panels,
    members: [
      {
        id: 'head-track',
        axis: 'horizontal',
        position: 0,
        thickness: d.frameFace,
        profile: d.cutList.find((cut) => /head|top track/i.test(cut.description) && cut.group === 'Outer Frame')?.profile ?? '',
        label: 'HEAD TRACK',
      },
      {
        id: 'sill-track',
        axis: 'horizontal',
        position: round1(H - d.frameFace),
        thickness: d.frameFace,
        profile: d.cutList.find((cut) => /sill|bottom track/i.test(cut.description) && cut.group === 'Outer Frame')?.profile ?? '',
        label: 'SILL TRACK',
      },
    ],
    slide,
  };
}

export function buildElevationLayout(opening: OpeningItem): ElevationLayout {
  if (opening.system === '100D-single') return buildSwingSingle(opening);
  if (opening.system === '100D-double') return buildSwingDouble(opening);
  return buildSliding(opening);
}

// ---------------------------------------------------------------------------
// Dimension chains
// ---------------------------------------------------------------------------

function buildDimensionChains(elevation: ElevationLayout): DimensionChain[] {
  const H = elevation.height;
  const W = elevation.width;
  const f = elevation.frame.face;
  const horizontal: DimensionChain[] = [];
  const vertical: DimensionChain[] = [];

  horizontal.push({
    id: 'h-overall',
    axis: 'horizontal',
    level: 0,
    segments: [{ id: 'h-overall-seg', start: 0, end: W, label: `${W}`, kind: 'overall' }],
  });
  vertical.push({
    id: 'v-overall',
    axis: 'vertical',
    level: 0,
    segments: [{ id: 'v-overall-seg', start: 0, end: H, label: `${H}`, kind: 'overall' }],
  });

  const moduleSegments: DimensionSegment[] = [{ id: 'h-frame-l', start: 0, end: f, label: `${f}`, kind: 'frame' }];
  const glassSegments: DimensionSegment[] = [];
  const verticalModules: DimensionSegment[] = [
    { id: 'v-frame-head', start: 0, end: f, label: `${f}`, kind: 'frame' },
    { id: 'v-frame-sill', start: H - f, end: H, label: `${f}`, kind: 'frame' },
  ];
  const verticalGlass: DimensionSegment[] = [];

  if (elevation.swing && elevation.system === '100D-single') {
    const panel = elevation.panels[0];
    const verticalMembers = elevation.members.filter((member) => member.axis === 'vertical');
    const leftMember = verticalMembers.find((member) => Math.abs(member.position - panel.x) < 0.5);
    const rightMember = verticalMembers.find(
      (member) => Math.abs(member.position - (panel.x + panel.width - member.thickness)) < 0.5
    );
    const leftStile = leftMember?.thickness ?? 66;
    const rightStile = rightMember?.thickness ?? 70;
    moduleSegments.push(
      { id: 'h-stile-l', start: round1(panel.x), end: round1(panel.x + leftStile), label: `${leftStile}`, kind: 'component' },
      {
        id: 'h-glass',
        start: round1(panel.x + leftStile),
        end: round1(panel.x + panel.width - rightStile),
        label: `${round1(panel.width - leftStile - rightStile)}`,
        kind: 'glass',
      },
      {
        id: 'h-stile-r',
        start: round1(panel.x + panel.width - rightStile),
        end: round1(panel.x + panel.width),
        label: `${rightStile}`,
        kind: 'component',
      },
      { id: 'h-frame-r', start: round1(W - f), end: W, label: `${f}`, kind: 'frame' }
    );
    for (const glass of panel.glass) {
      glassSegments.push({ id: `h-${glass.id}`, start: glass.x, end: round1(glass.x + glass.width), label: `${round1(glass.width)}`, kind: 'glass' });
      verticalGlass.push({ id: `v-${glass.id}`, start: glass.y, end: round1(glass.y + glass.height), label: `${round1(glass.height)}`, kind: 'glass' });
    }
    for (const member of elevation.members) {
      if (member.axis === 'horizontal') {
        verticalModules.push({
          id: `v-${member.id}`,
          start: member.position,
          end: round1(member.position + member.thickness),
          label: `${round1(member.thickness)}`,
          kind: 'component',
        });
      }
    }
  } else if (elevation.system === '100D-double') {
    const panel = elevation.panels[0];
    moduleSegments.push(
      { id: 'h-leaf-1', start: round1(panel.x), end: round1(panel.x + panel.width), label: `${round1(panel.width)}`, kind: 'module' },
      {
        id: 'h-leaf-2',
        start: round1(elevation.panels[1].x),
        end: round1(elevation.panels[1].x + elevation.panels[1].width),
        label: `${round1(elevation.panels[1].width)}`,
        kind: 'module',
      },
      { id: 'h-frame-r', start: round1(W - f), end: W, label: `${f}`, kind: 'frame' }
    );
    for (const glass of panel.glass) {
      verticalGlass.push({ id: `v-${glass.id}`, start: glass.y, end: round1(glass.y + glass.height), label: `${round1(glass.height)}`, kind: 'glass' });
    }
    for (const member of elevation.members) {
      if (member.axis === 'horizontal') {
        verticalModules.push({
          id: `v-${member.id}`,
          start: member.position,
          end: round1(member.position + member.thickness),
          label: `${round1(member.thickness)}`,
          kind: 'component',
        });
      }
    }
  } else {
    const panels = elevation.panels;
    const pitch = panels.length > 1 ? round1(panels[1].x - panels[0].x) : panels[0]?.width ?? 0;
    if (panels.length === 1) {
      moduleSegments.push({
        id: 'h-sash',
        start: round1(panels[0].x),
        end: round1(panels[0].x + panels[0].width),
        label: `${round1(panels[0].width)}`,
        kind: 'module',
      });
    } else {
      for (let index = 0; index < panels.length - 1; index += 1) {
        moduleSegments.push({
          id: `h-pitch-${index + 1}`,
          start: round1(panels[index].x),
          end: round1(panels[index].x + pitch),
          label: `${pitch}`,
          kind: 'module',
        });
      }
      const last = panels[panels.length - 1];
      moduleSegments.push({
        id: 'h-panel-last',
        start: round1(last.x),
        end: round1(last.x + last.width),
        label: `${round1(last.width)}`,
        kind: 'module',
      });
    }
    moduleSegments.push({ id: 'h-frame-r', start: round1(W - f), end: W, label: `${f}`, kind: 'frame' });
    for (const panel of panels) {
      for (const glass of panel.glass) {
        glassSegments.push({ id: `h-${glass.id}`, start: glass.x, end: round1(glass.x + glass.width), label: `${round1(glass.width)}`, kind: 'glass' });
        if (panel === panels[0]) {
          verticalGlass.push({ id: `v-${glass.id}`, start: glass.y, end: round1(glass.y + glass.height), label: `${round1(glass.height)}`, kind: 'glass' });
        }
      }
    }
    const sash = panels[0];
    verticalModules.push(
      { id: 'v-sash-top', start: sash.y, end: round1(sash.y + (sash.height - sash.glass[0].height) / 2), label: `${round1((sash.height - sash.glass[0].height) / 2)}`, kind: 'component' },
      { id: 'v-sash-bottom', start: round1(sash.glass[0].y + sash.glass[0].height), end: round1(sash.y + sash.height), label: `${round1(sash.y + sash.height - sash.glass[0].y - sash.glass[0].height)}`, kind: 'component' }
    );
  }

  horizontal.push({ id: 'h-module', axis: 'horizontal', level: 1, segments: moduleSegments });
  if (glassSegments.length) horizontal.push({ id: 'h-glass', axis: 'horizontal', level: 2, segments: glassSegments });

  verticalModules.sort((a, b) => a.start - b.start);
  vertical.push({ id: 'v-module', axis: 'vertical', level: 1, segments: verticalModules });
  if (verticalGlass.length) {
    verticalGlass.sort((a, b) => a.start - b.start);
    vertical.push({ id: 'v-glass', axis: 'vertical', level: 2, segments: verticalGlass });
  }

  return [...horizontal, ...vertical];
}

// ---------------------------------------------------------------------------
// References, notes, status, title block
// ---------------------------------------------------------------------------

function buildProfileReferences(d: DerivedOpening): ProfileReference[] {
  const grouped = new Map<string, ProfileReference>();
  for (const cut of d.cutList) {
    const existing = grouped.get(cut.profile);
    const visual = PROFILE_VISUALS[cut.profile];
    const manifest = CATALOGUE_MANIFEST[cut.profile];
    const spec = PROFILE_WEIGHTS[cut.profile];
    if (existing) {
      existing.quantity += cut.qty;
      continue;
    }
    grouped.set(cut.profile, {
      code: cut.profile,
      description: spec?.name ?? cut.description,
      group: cut.group,
      quantity: cut.qty,
      catalogue: manifest
        ? `Alumex Advance Profile Book p.${manifest.page}`
        : 'Catalogue reference REQUIRES REVIEW',
      cataloguePage: manifest?.page ?? null,
      confidence: manifest?.confidence ?? 'REQUIRES REVIEW',
      verifiedGeometry: Boolean(visual),
    });
  }
  return [...grouped.values()];
}

function buildNotes(opening: OpeningItem, d: DerivedOpening, profiles: ProfileReference[]): string[] {
  const notes = [
    'ALL DIMENSIONS IN MILLIMETRES UNLESS NOTED. DO NOT SCALE FROM DRAWING.',
    `GLASS: ${GLASS_LABELS[opening.glass]} — VERIFY SIZES ON SITE BEFORE ORDERING.`,
    `FINISH: ${FINISH_LABELS[opening.finish].toUpperCase()}.`,
    'VERIFY ALL SITE DIMENSIONS AND SETTING-OUT BEFORE FABRICATION.',
  ];
  if (d.glassPanels.length) {
    notes.push(
      `GLASS PANELS: ${d.glassPanels
        .map((panel) => `${round1(panel.width)} × ${round1(panel.height)} (${panel.qty} no.)`)
        .join('; ')}.`
    );
  }
  const unverified = profiles.filter((profile) => profile.confidence === 'REQUIRES REVIEW');
  if (unverified.length) {
    notes.push(`CATALOGUE REVIEW REQUIRED FOR: ${unverified.map((profile) => profile.code).join(', ')}.`);
  }
  if (!opening.location || !opening.location.trim()) {
    notes.push('INSTALLATION LOCATION NOT SET — REQUIRES REVIEW.');
  }
  return notes;
}

export function deriveDrawingStatus(project: ProjectMetadata | null, opening: OpeningItem): DrawingStatus {
  if (!project) return 'REQUIRES REVIEW';
  if (!project.projectNumber || !project.projectNumber.trim()) return 'REQUIRES REVIEW';
  if (!project.clientName || !project.clientName.trim()) return 'REQUIRES REVIEW';
  const issues = deriveOpeningIssues(opening);
  if (issues.some((issue) => issue.severity === 'warning' || issue.severity === 'critical' || issue.severity === 'review')) {
    return 'REQUIRES REVIEW';
  }
  return 'DRAFT';
}

export function deriveRevision(project: ProjectMetadata | null): string {
  if (!project) return 'R0';
  const number = project.projectNumber && project.projectNumber.trim() ? project.projectNumber.trim() : 'PROJECT';
  const date = project.date ? project.date.replaceAll('-', '') : '';
  return date ? `${number}-${date}` : `${number}-R0`;
}

// ---------------------------------------------------------------------------
// Details — verified profile geometry only
// ---------------------------------------------------------------------------

function detailProfile(code: string): DetailProfile | null {
  const visual = PROFILE_VISUALS[code];
  if (!visual) return null;
  const manifest = CATALOGUE_MANIFEST[code];
  const spec = PROFILE_WEIGHTS[code];
  return {
    code,
    description: spec?.name ?? 'Profile',
    width: visual.width,
    height: visual.height,
    points: visual.points,
    catalogue: manifest ? `Alumex Advance p.${manifest.page}` : 'Catalogue reference REQUIRES REVIEW',
  };
}

function makeDetail(
  id: string,
  section: string,
  title: string,
  codes: string[],
  notes: string[]
): DrawingDetail {
  const unique = [...new Set(codes.filter(Boolean))];
  const profiles: DetailProfile[] = [];
  const missing: string[] = [];
  for (const code of unique) {
    const profile = detailProfile(code);
    if (profile) profiles.push(profile);
    else missing.push(code);
  }
  const available = profiles.length > 0 && missing.length === 0;
  return {
    id,
    section,
    title,
    available,
    reason: available ? undefined : 'Catalogue detail not available for the selected profiles.',
    missing,
    profiles,
    notes,
  };
}

function buildDetails(opening: OpeningItem): DrawingDetail[] {
  const d = deriveDoor(opening);
  const cuts = d.cutList;
  const findFrame = (pattern: RegExp) =>
    cuts.find((cut) => cut.group === 'Outer Frame' && pattern.test(cut.description))?.profile ?? '';
  const findSash = (pattern: RegExp) =>
    cuts.find((cut) => cut.group === 'Sash / Leaf' && pattern.test(cut.description))?.profile ?? '';
  const bead = cuts.find((cut) => cut.group === 'Glazing Bead')?.profile ?? '';

  const head = findFrame(/head|top track/i);
  const jamb = findFrame(/jamb/i);
  const sill = findFrame(/sill|bottom track|threshold/i);
  const stile = findSash(/stile/i);
  const topRail = findSash(/top rail|top sash rail|sash top|sash top\/bottom/i);
  const bottomRail = findSash(/bottom rail|bottom sash|sash top\/bottom/i);

  return [
    makeDetail('head', 'A-A', 'HEAD DETAIL — FRAME / SASH / GLASS', [head, topRail, bead], [
      'Verified Alumex profile geometry shown; confirm assembly against catalogue.',
    ]),
    makeDetail('jamb', 'B-B', 'JAMB DETAIL — FRAME / STILE / GLASS', [jamb, stile, bead], [
      'Verified Alumex profile geometry shown; confirm assembly against catalogue.',
    ]),
    makeDetail('sill', 'C-C', opening.system.startsWith('100D') ? 'THRESHOLD DETAIL — SILL / BOTTOM RAIL' : 'SILL DETAIL — TRACK / SASH / GLASS', [sill, bottomRail, bead], [
      'Provide continuous weather seal and drainage as per catalogue.',
    ]),
    makeDetail('corner', 'D-D', 'STILE / RAIL CORNER ASSEMBLY', [stile, topRail, bead], [
      'Corner joint detail to be confirmed against the selected Alumex system.',
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Sheet layout + primitives
// ---------------------------------------------------------------------------

interface SheetLayout {
  border: Rect;
  inner: Rect;
  header: Rect;
  draw: Rect;
  notes: Rect;
  details: Rect;
  titleBlock: Rect;
}

function layoutSheet(size: SheetSize, orientation: SheetOrientation): SheetLayout {
  const format = SHEET_FORMATS[size][orientation];
  const margin = 10;
  const border: Rect = { x: margin, y: margin, width: format.width - margin * 2, height: format.height - margin * 2 };
  const inner: Rect = { x: margin + 2, y: margin + 2, width: format.width - margin * 2 - 4, height: format.height - margin * 2 - 4 };
  const headerHeight = 20;
  const header: Rect = { x: inner.x, y: inner.y, width: inner.width, height: headerHeight };
  const titleBlockHeight = clamp(inner.height * 0.17, 26, 46);
  const titleBlock: Rect = { x: inner.x, y: inner.y + inner.height - titleBlockHeight, width: inner.width, height: titleBlockHeight };
  const detailsHeight = clamp(inner.height * 0.26, 38, 54);
  const details: Rect = { x: inner.x, y: titleBlock.y - detailsHeight - 2, width: inner.width, height: detailsHeight };
  const notesHeight = clamp(inner.height * 0.08, 11, 15);
  const notes: Rect = { x: inner.x, y: details.y - notesHeight - 2, width: inner.width, height: notesHeight };
  const draw: Rect = {
    x: inner.x + 1,
    y: header.y + header.height + 2,
    width: inner.width - 2,
    height: notes.y - (header.y + header.height + 2) - 2,
  };
  return { border, inner, header, draw, notes, details, titleBlock };
}

function chooseScale(
  mode: ScaleMode,
  geometryWidth: number,
  geometryHeight: number,
  availableWidth: number,
  availableHeight: number
): { denominator: number; label: string; clamped: boolean } {
  const fitScale = Math.min(availableWidth / geometryWidth, availableHeight / geometryHeight);
  const fitDenominator = 1 / fitScale;
  if (mode === 'fit') {
    return { denominator: round2(fitDenominator), label: `FIT`, clamped: false };
  }
  if (typeof mode === 'number') {
    const clamped = mode < fitDenominator;
    const denominator = clamped ? round2(fitDenominator) : mode;
    return { denominator, label: `1:${round2(denominator)}`, clamped };
  }
  const standard = STANDARD_SCALES.find((value) => value >= fitDenominator);
  const denominator = standard ?? round2(fitDenominator);
  return { denominator, label: `1:${round2(denominator)}`, clamped: false };
}

interface Transformer {
  s: number;
  ox: number;
  oy: number;
}

function makeTransformer(scaleDenominator: number, originX: number, originY: number): Transformer {
  const s = 1 / scaleDenominator;
  return { s, ox: originX, oy: originY };
}

function tx(t: Transformer, x: number): number {
  return round2(t.ox + x * t.s);
}

function ty(t: Transformer, y: number): number {
  return round2(t.oy + y * t.s);
}

function emitElevation(elevation: ElevationLayout, t: Transformer, options: Required<DrawingVisibility>): DrawingPrimitive[] {
  const primitives: DrawingPrimitive[] = [];
  const frame = elevation.frame;
  primitives.push({
    kind: 'rect',
    layer: 'elevation',
    x: tx(t, frame.x),
    y: ty(t, frame.y),
    width: round2(frame.width * t.s),
    height: round2(frame.height * t.s),
    style: 'outline',
  });
  primitives.push({
    kind: 'rect',
    layer: 'elevation',
    x: tx(t, frame.innerX),
    y: ty(t, frame.innerY),
    width: round2(frame.innerWidth * t.s),
    height: round2(frame.innerHeight * t.s),
    style: 'secondary',
  });

  for (const panel of elevation.panels) {
    primitives.push({
      kind: 'rect',
      layer: 'elevation',
      x: tx(t, panel.x),
      y: ty(t, panel.y),
      width: round2(panel.width * t.s),
      height: round2(panel.height * t.s),
      style: panel.active ? 'outline' : 'secondary',
      fill: '#ffffff',
      fillOpacity: 0.02,
    });
    for (const glass of panel.glass) {
      primitives.push({
        kind: 'rect',
        layer: 'glass',
        x: tx(t, glass.x),
        y: ty(t, glass.y),
        width: round2(glass.width * t.s),
        height: round2(glass.height * t.s),
        style: 'glass',
        fill: '#dbe9f7',
        fillOpacity: 0.55,
      });
      primitives.push({
        kind: 'line',
        layer: 'glass',
        x1: tx(t, glass.x),
        y1: ty(t, glass.y),
        x2: tx(t, glass.x + glass.width),
        y2: ty(t, glass.y + glass.height),
        style: 'glass',
      });
      if (options.glassLabels && glass.width * t.s > 18) {
        primitives.push({
          kind: 'text',
          layer: 'glass',
          x: tx(t, glass.x + glass.width / 2),
          y: ty(t, glass.y + glass.height / 2),
          text: `GLASS ${glass.thickness}`,
          size: 2,
          style: 'glass',
          anchor: 'middle',
          baseline: 'middle',
          family: 'mono',
        });
      }
    }
  }

  const primaryPanel = elevation.panels[0];
  for (const member of elevation.members) {
    const spansFrame = member.id.includes('track');
    if (member.axis === 'horizontal') {
      const x0 = spansFrame || !primaryPanel ? frame.x : primaryPanel.x;
      const width = spansFrame || !primaryPanel ? frame.width : primaryPanel.width;
      primitives.push({
        kind: 'rect',
        layer: 'profile',
        x: tx(t, x0),
        y: ty(t, member.position),
        width: round2(width * t.s),
        height: round2(member.thickness * t.s),
        style: 'hidden',
      });
      if (options.profileLabels && member.profile) {
        primitives.push({
          kind: 'text',
          layer: 'profile',
          x: tx(t, x0 + 2),
          y: ty(t, member.position - 1),
          text: member.profile,
          size: 1.9,
          style: 'dimension',
          anchor: 'start',
          baseline: 'auto',
          family: 'mono',
        });
      }
    } else {
      const y0 = primaryPanel ? primaryPanel.y : frame.y;
      const height = primaryPanel ? primaryPanel.height : frame.height;
      primitives.push({
        kind: 'rect',
        layer: 'profile',
        x: tx(t, member.position),
        y: ty(t, y0),
        width: round2(member.thickness * t.s),
        height: round2(height * t.s),
        style: 'hidden',
      });
      if (options.profileLabels && member.profile) {
        primitives.push({
          kind: 'text',
          layer: 'profile',
          x: tx(t, member.position + member.thickness / 2),
          y: ty(t, y0 + 2),
          text: member.profile,
          size: 1.9,
          style: 'dimension',
          anchor: 'middle',
          baseline: 'auto',
          family: 'mono',
          rotate: -90,
        });
      }
    }
  }

  if (elevation.swing && options.annotations) {
    const swing = elevation.swing;
    const hingeX = tx(t, swing.hingeX);
    const hingeY = ty(t, swing.hingeY);
    const leafW = swing.leafWidth * t.s;
    const leafH = swing.leafHeight * t.s;
    const sign = swing.hingeSide === 'left' ? 1 : -1;
    const endX = round2(hingeX + sign * leafW);
    const endY = round2(hingeY - leafH);
    primitives.push({ kind: 'line', layer: 'annotation', x1: hingeX, y1: hingeY, x2: endX, y2: hingeY, style: 'hidden' });
    primitives.push({ kind: 'line', layer: 'annotation', x1: hingeX, y1: hingeY, x2: endX, y2: endY, style: 'hidden' });
    primitives.push({
      kind: 'path',
      layer: 'annotation',
      d: `M ${endX} ${hingeY} A ${leafW} ${leafH} 0 0 ${sign > 0 ? 1 : 0} ${round2(hingeX)} ${endY}`,
      style: 'centre',
    });
    primitives.push({
      kind: 'text',
      layer: 'annotation',
      x: round2(hingeX + (endX - hingeX) / 2),
      y: round2(hingeY + 3),
      text: swing.hingeSide === 'left' ? 'LH' : 'RH',
      size: 2.4,
      style: 'section',
      anchor: 'middle',
      family: 'mono',
      weight: 700,
    });
  }

  if (elevation.slide && options.annotations) {
    const panel = elevation.panels[0];
    const y = ty(t, panel.y + panel.height / 2);
    const direction = elevation.slide.direction === 'left' ? -1 : 1;
    const cx = tx(t, panel.x + panel.width / 2);
    const len = Math.min(14, panel.width * t.s * 0.4);
    primitives.push({
      kind: 'line',
      layer: 'annotation',
      x1: round2(cx - (len / 2) * direction),
      y1: y,
      x2: round2(cx + (len / 2) * direction),
      y2: y,
      style: 'section',
    });
    primitives.push({
      kind: 'text',
      layer: 'annotation',
      x: cx,
      y: round2(y - 2),
      text: `SLIDE ${elevation.slide.direction.toUpperCase()}`,
      size: 2,
      style: 'section',
      anchor: 'middle',
      family: 'mono',
      weight: 700,
    });
  }

  return primitives;
}

function emitChain(
  chain: DimensionChain,
  t: Transformer,
  geometry: { x0: number; y0: number; x1: number; y1: number },
  chainCount: number,
  spacing: number
): DrawingPrimitive[] {
  const primitives: DrawingPrimitive[] = [];
  const offset = (chainCount - chain.level) * spacing + 3;
  const textSize = 2.1;
  const horizontal = chain.axis === 'horizontal';
  const usedRows: Array<Array<[number, number]>> = [];
  const placeRow = (center: number, width: number, forceSecond: boolean): number => {
    for (let row = forceSecond ? 1 : 0; row < 3; row += 1) {
      const list = usedRows[row] ?? [];
      const overlaps = list.some(([left, right]) => center - width / 2 < right + 0.6 && center + width / 2 > left - 0.6);
      if (!overlaps) {
        usedRows[row] = [...list, [center - width / 2, center + width / 2]];
        return row;
      }
    }
    return forceSecond ? 1 : 0;
  };

  for (const segment of chain.segments) {
    const lengthPaper = (segment.end - segment.start) * t.s;
    if (lengthPaper <= 0.01) continue;
    if (horizontal) {
      const x1 = tx(t, segment.start);
      const x2 = tx(t, segment.end);
      const dimY = round2(geometry.y1 + offset);
      primitives.push({ kind: 'line', layer: 'dimension', x1, y1: dimY, x2, y2: dimY, style: 'dimension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1, y1: geometry.y1, x2: x1, y2: round2(dimY + 1.4), style: 'extension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: x2, y1: geometry.y1, x2: x2, y2: round2(dimY + 1.4), style: 'extension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: round2(x1 - 1), y1: round2(dimY + 1), x2: round2(x1 + 1), y2: round2(dimY - 1), style: 'dimension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: round2(x2 - 1), y1: round2(dimY + 1), x2: round2(x2 + 1), y2: round2(dimY - 1), style: 'dimension' });
      const label = segment.label;
      const labelWidth = estimateTextWidth(label, textSize);
      const midX = (x1 + x2) / 2;
      const fits = labelWidth + 1.5 <= lengthPaper;
      const row = placeRow(midX, labelWidth, !fits);
      const textY = round2(dimY - 1 - row * textSize * 1.5);
      primitives.push({
        kind: 'text',
        layer: 'dimension',
        x: midX,
        y: textY,
        text: label,
        size: textSize,
        style: 'dimension',
        anchor: 'middle',
        family: 'mono',
      });
    } else {
      const y1 = ty(t, segment.start);
      const y2 = ty(t, segment.end);
      const dimX = round2(geometry.x0 - offset);
      primitives.push({ kind: 'line', layer: 'dimension', x1: dimX, y1, x2: dimX, y2, style: 'dimension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: geometry.x0, y1, x2: round2(dimX - 1.4), y2: y1, style: 'extension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: geometry.x0, y1: y2, x2: round2(dimX - 1.4), y2, style: 'extension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: round2(dimX - 1), y1: round2(y1 - 1), x2: round2(dimX + 1), y2: round2(y1 + 1), style: 'dimension' });
      primitives.push({ kind: 'line', layer: 'dimension', x1: round2(dimX - 1), y1: round2(y2 - 1), x2: round2(dimX + 1), y2: round2(y2 + 1), style: 'dimension' });
      const label = segment.label;
      const labelWidth = estimateTextWidth(label, textSize);
      const midY = (y1 + y2) / 2;
      const fits = labelWidth + 1.5 <= lengthPaper;
      const row = placeRow(midY, labelWidth, !fits);
      const textX = round2(dimX - 1.2 - row * textSize * 1.5);
      primitives.push({
        kind: 'text',
        layer: 'dimension',
        x: textX,
        y: midY,
        text: label,
        size: textSize,
        style: 'dimension',
        anchor: 'middle',
        baseline: 'middle',
        family: 'mono',
        rotate: -90,
      });
    }
  }
  return primitives;
}

export interface DrawingVisibility {
  dimensions: boolean;
  profileLabels: boolean;
  glassLabels: boolean;
  sectionMarkers: boolean;
  grid: boolean;
  details: boolean;
  annotations: boolean;
}

const DEFAULT_VISIBILITY: DrawingVisibility = {
  dimensions: true,
  profileLabels: true,
  glassLabels: true,
  sectionMarkers: true,
  grid: false,
  details: true,
  annotations: true,
};

function emitHeader(sheet: SheetLayout, drawing: Omit<ShopDrawing, 'primitives' | 'viewBox'>): DrawingPrimitive[] {
  const header = sheet.header;
  const primitives: DrawingPrimitive[] = [];
  primitives.push({ kind: 'rect', layer: 'header', x: header.x, y: header.y, width: header.width, height: header.height, style: 'outline' });
  primitives.push({ kind: 'line', layer: 'header', x1: header.x, y1: header.y + header.height, x2: header.x + header.width, y2: header.y + header.height, style: 'outline' });
  primitives.push({
    kind: 'text',
    layer: 'header',
    x: header.x + 3,
    y: header.y + 6.5,
    text: 'FULLALUDOOR',
    size: 4.2,
    style: 'title',
    weight: 800,
    family: 'sans',
  });
  primitives.push({
    kind: 'text',
    layer: 'header',
    x: header.x + 3,
    y: header.y + 10.6,
    text: 'ALUMINIUM FABRICATION DOCUMENTATION',
    size: 1.9,
    style: 'title',
    family: 'sans',
  });
  const titleSize = 4;
  primitives.push({
    kind: 'text',
    layer: 'header',
    x: header.x + header.width / 2,
    y: header.y + 8,
    text: truncateText(drawing.title, titleSize, header.width * 0.5),
    size: titleSize,
    style: 'title',
    anchor: 'middle',
    weight: 800,
    family: 'sans',
  });
  primitives.push({
    kind: 'text',
    layer: 'header',
    x: header.x + header.width / 2,
    y: header.y + 13.2,
    text: truncateText(drawing.subtitle, 2.3, header.width * 0.5),
    size: 2.3,
    style: 'title',
    anchor: 'middle',
    family: 'sans',
  });
  const meta = [
    `DWG ${drawing.titleBlock.drawingNumber}`,
    `OPENING ${drawing.opening.tag}`,
    `SCALE ${drawing.titleBlock.scale}`,
    `REV ${drawing.revision}`,
    drawing.titleBlock.status,
  ];
  const metaWidth = header.width * 0.42;
  primitives.push({
    kind: 'text',
    layer: 'header',
    x: header.x + header.width - 3,
    y: header.y + 6.5,
    text: truncateText(meta.slice(0, 2).join('   '), 2, metaWidth),
    size: 2,
    style: 'title',
    anchor: 'end',
    family: 'mono',
  });
  primitives.push({
    kind: 'text',
    layer: 'header',
    x: header.x + header.width - 3,
    y: header.y + 11,
    text: truncateText(meta.slice(2).join('   '), 2, metaWidth),
    size: 2,
    style: 'title',
    anchor: 'end',
    family: 'mono',
  });
  return primitives;
}

function emitTitleBlock(sheet: SheetLayout, drawing: Omit<ShopDrawing, 'primitives' | 'viewBox'>): DrawingPrimitive[] {
  const block = sheet.titleBlock;
  const primitives: DrawingPrimitive[] = [];
  primitives.push({ kind: 'rect', layer: 'titleblock', x: block.x, y: block.y, width: block.width, height: block.height, style: 'outline' });
  const fields: Array<[string, string]> = [
    ['PROJECT', drawing.titleBlock.project],
    ['CLIENT', drawing.titleBlock.client],
    ['DRAWING', drawing.titleBlock.drawing],
    ['OPENING', drawing.titleBlock.opening],
    ['SYSTEM', drawing.titleBlock.system],
    ['DRAWING No', drawing.titleBlock.drawingNumber],
    ['REVISION', drawing.titleBlock.revision],
    ['SCALE', drawing.titleBlock.scale],
    ['UNITS', drawing.titleBlock.units],
    ['DATE', drawing.titleBlock.date],
    ['STATUS', drawing.titleBlock.status],
    ['SHEET', drawing.titleBlock.sheet],
  ];
  const columns = 4;
  const rows = Math.ceil(fields.length / columns);
  const cellW = block.width / columns;
  const cellH = block.height / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const x = block.x + column * cellW;
      const y = block.y + row * cellH;
      primitives.push({ kind: 'rect', layer: 'titleblock', x, y, width: cellW, height: cellH, style: 'thin' });
      const field = fields[index];
      if (!field) continue;
      primitives.push({
        kind: 'text',
        layer: 'titleblock',
        x: x + 1.4,
        y: y + 2.4,
        text: field[0],
        size: 1.5,
        style: 'title',
        family: 'sans',
        weight: 700,
      });
      const valueSize = Math.min(2.4, cellH * 0.5);
      primitives.push({
        kind: 'text',
        layer: 'titleblock',
        x: x + 1.4,
        y: y + cellH - 1.4,
        text: truncateText(field[1] || '—', valueSize, cellW - 2.8),
        size: valueSize,
        style: 'title',
        family: 'mono',
        weight: field[0] === 'STATUS' ? 800 : 400,
      });
    }
  }
  return primitives;
}

function emitDetails(sheet: SheetLayout, details: DrawingDetail[]): DrawingPrimitive[] {
  const band = sheet.details;
  const primitives: DrawingPrimitive[] = [];
  primitives.push({ kind: 'rect', layer: 'detail', x: band.x, y: band.y, width: band.width, height: band.height, style: 'outline' });
  const visible = details.slice(0, 4);
  if (!visible.length) return primitives;
  const cellW = band.width / visible.length;
  for (let index = 0; index < visible.length; index += 1) {
    const detail = visible[index];
    const cellX = band.x + index * cellW;
    primitives.push({ kind: 'rect', layer: 'detail', x: cellX, y: band.y, width: cellW, height: band.height, style: 'thin' });
    primitives.push({
      kind: 'text',
      layer: 'detail',
      x: cellX + 2,
      y: band.y + 4,
      text: truncateText(`${detail.section}  ${detail.title}`, 2.1, cellW - 4),
      size: 2.1,
      style: 'title',
      weight: 700,
      family: 'sans',
    });
    if (!detail.available) {
      primitives.push({
        kind: 'rect',
        layer: 'detail',
        x: cellX + 3,
        y: band.y + 6,
        width: cellW - 6,
        height: band.height - 14,
        style: 'hidden',
        fill: '#fdecec',
        fillOpacity: 0.5,
      });
      primitives.push({
        kind: 'text',
        layer: 'detail',
        x: cellX + cellW / 2,
        y: band.y + band.height / 2,
        text: 'REQUIRES REVIEW',
        size: 2.8,
        style: 'section',
        anchor: 'middle',
        baseline: 'middle',
        weight: 800,
        family: 'sans',
      });
      primitives.push({
        kind: 'text',
        layer: 'detail',
        x: cellX + cellW / 2,
        y: band.y + band.height / 2 + 4,
        text: 'Catalogue detail not available',
        size: 1.9,
        style: 'section',
        anchor: 'middle',
        baseline: 'middle',
        family: 'sans',
      });
      if (detail.missing.length) {
        primitives.push({
          kind: 'text',
          layer: 'detail',
          x: cellX + cellW / 2,
          y: band.y + band.height / 2 + 7.5,
          text: detail.missing.join(', '),
          size: 1.7,
          style: 'section',
          anchor: 'middle',
          baseline: 'middle',
          family: 'mono',
        });
      }
      continue;
    }
    const viewport: Rect = { x: cellX + 3, y: band.y + 6, width: cellW - 6, height: band.height - 14 };
    emitDetailProfiles(viewport, detail, primitives);
  }
  return primitives;
}

function emitDetailProfiles(viewport: Rect, detail: DrawingDetail, primitives: DrawingPrimitive[]): void {
  const count = detail.profiles.length;
  const slotW = viewport.width / Math.max(1, count);
  for (let index = 0; index < count; index += 1) {
    const profile = detail.profiles[index];
    const slotX = viewport.x + index * slotW;
    const points = parsePolygon(profile.points);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const profileW = maxX - minX || 1;
    const profileH = maxY - minY || 1;
    const scale = Math.min((slotW - 8) / profileW, (viewport.height - 10) / profileH);
    const ox = slotX + (slotW - profileW * scale) / 2 - minX * scale;
    const oy = viewport.y + (viewport.height - profileH * scale) / 2 + minY * scale;
    const transformed = points
      .map((point) => `${round2(ox + point.x * scale)},${round2(oy - point.y * scale)}`)
      .join(' ');
    primitives.push({ kind: 'polyline', layer: 'detail', points: transformed, style: 'secondary', fill: '#eef1f5', fillOpacity: 0.8 });
    primitives.push({
      kind: 'text',
      layer: 'detail',
      x: slotX + slotW / 2,
      y: viewport.y + viewport.height + 1.4,
      text: profile.code,
      size: 1.9,
      style: 'title',
      anchor: 'middle',
      weight: 700,
      family: 'mono',
    });
    primitives.push({
      kind: 'text',
      layer: 'detail',
      x: slotX + slotW / 2,
      y: viewport.y + viewport.height + 4,
      text: `${round1(profileW)} × ${round1(profileH)}`,
      size: 1.6,
      style: 'title',
      anchor: 'middle',
      family: 'mono',
    });
  }
}

function parsePolygon(points: string): Array<{ x: number; y: number }> {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',');
      return { x: Number(x), y: Number(y) };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function emitGrid(rect: Rect): DrawingPrimitive[] {
  const primitives: DrawingPrimitive[] = [];
  for (let x = rect.x; x <= rect.x + rect.width; x += 10) {
    primitives.push({ kind: 'line', layer: 'grid', x1: x, y1: rect.y, x2: x, y2: rect.y + rect.height, style: 'grid' });
  }
  for (let y = rect.y; y <= rect.y + rect.height; y += 10) {
    primitives.push({ kind: 'line', layer: 'grid', x1: rect.x, y1: y, x2: rect.x + rect.width, y2: y, style: 'grid' });
  }
  return primitives;
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export interface ShopDrawingInput {
  project: ProjectMetadata | null;
  opening: OpeningItem;
  openings?: OpeningItem[];
  sheetSize?: SheetSize;
  orientation?: SheetOrientation;
  scale?: ScaleMode;
  visibility?: Partial<DrawingVisibility>;
  drawingNumber?: string;
  title?: string;
  subtitle?: string;
  generatedAt?: string;
}

export function buildShopDrawing(input: ShopDrawingInput): ShopDrawing {
  const {
    project,
    opening,
    openings = [],
    sheetSize = 'A3',
    orientation = 'landscape',
    scale = 'auto',
    generatedAt = new Date().toISOString(),
  } = input;
  const visibility: DrawingVisibility = { ...DEFAULT_VISIBILITY, ...input.visibility };

  const sheet = layoutSheet(sheetSize, orientation);
  const elevation = buildElevationLayout(opening);
  const chains = buildDimensionChains(elevation);
  const details = visibility.details ? buildDetails(opening) : [];
  const derived = deriveDoor(opening);
  const profileReferences = buildProfileReferences(derived);
  const glassReferences: GlassReference[] = derived.glassPanels.map((panel, index) => ({
    id: `${opening.tag}-G${index + 1}`,
    width: round1(panel.width),
    height: round1(panel.height),
    thickness: panel.thickness,
    description: panel.description,
    qty: panel.qty,
    areaM2: panel.areaM2,
  }));
  const hardwareReferences: HardwareReference[] = derived.hardware.map((item) => ({
    code: item.code,
    name: item.name,
    qty: item.qty,
    unit: item.unit,
    category: item.category,
  }));
  const notes = buildNotes(opening, derived, profileReferences);
  const status = deriveDrawingStatus(project, opening);
  const revision = deriveRevision(project);

  const horizontalChains = chains.filter((chain) => chain.axis === 'horizontal');
  const verticalChains = chains.filter((chain) => chain.axis === 'vertical');
  const spacing = 6.5;
  const leftReserve = visibility.dimensions ? verticalChains.length * spacing + 8 : 6;
  const bottomReserve = visibility.dimensions ? horizontalChains.length * spacing + 8 : 6;
  const availableWidth = sheet.draw.width - leftReserve - 8;
  const availableHeight = sheet.draw.height - 8 - bottomReserve;
  const chosen = chooseScale(scale, elevation.width, elevation.height, availableWidth, availableHeight);
  const drawScale = 1 / chosen.denominator;
  const originX = round2(sheet.draw.x + leftReserve + Math.max(0, (availableWidth - elevation.width * drawScale) / 2));
  const originY = round2(sheet.draw.y + 8 + Math.max(0, (availableHeight - elevation.height * drawScale) / 2));
  const transformer = makeTransformer(chosen.denominator, originX, originY);

  const drawingNumber =
    input.drawingNumber ??
    `${project?.projectNumber && project.projectNumber.trim() ? project.projectNumber.trim() : 'PROJECT'}-${opening.tag}`;
  const sheetIndex = openings.findIndex((item) => item.id === opening.id);
  const sheetNumber = `${sheetIndex >= 0 ? sheetIndex + 1 : 1} / ${Math.max(1, openings.length || 1)}`;

  const title = input.title ?? 'ARCHITECTURAL SHOP DRAWING';
  const subtitle = input.subtitle ?? 'ELEVATION & DIMENSION CHAINS';

  const titleBlock: TitleBlock = {
    brand: 'FULLALUDOOR',
    project: project?.projectName ?? 'PROJECT NOT SET',
    client: project?.clientName ?? 'CLIENT NOT SET',
    drawing: title,
    opening: `${opening.tag} — ${opening.name}`,
    system: SYSTEM_LABELS[opening.system],
    drawingNumber,
    revision,
    scale: chosen.label,
    units: 'mm',
    date: project?.date ?? generatedAt.slice(0, 10),
    status,
    sheet: sheetNumber,
  };

  const base: Omit<ShopDrawing, 'primitives' | 'viewBox'> = {
    project,
    opening,
    sheet: { size: sheetSize, orientation, width: SHEET_FORMATS[sheetSize][orientation].width, height: SHEET_FORMATS[sheetSize][orientation].height },
    scale: { mode: scale, denominator: chosen.denominator, label: chosen.label, clamped: chosen.clamped },
    title,
    subtitle,
    elevation,
    dimensions: chains,
    details,
    profileReferences,
    glassReferences,
    hardwareReferences,
    notes,
    revision,
    status,
    titleBlock,
  };

  const primitives: DrawingPrimitive[] = [];
  primitives.push({
    kind: 'rect',
    layer: 'paper',
    x: 0,
    y: 0,
    width: base.sheet.width,
    height: base.sheet.height,
    style: 'paper',
    fill: '#ffffff',
  });
  primitives.push({ kind: 'rect', layer: 'border', x: sheet.border.x, y: sheet.border.y, width: sheet.border.width, height: sheet.border.height, style: 'outline' });
  primitives.push({ kind: 'rect', layer: 'border', x: sheet.inner.x, y: sheet.inner.y, width: sheet.inner.width, height: sheet.inner.height, style: 'thin' });
  if (visibility.grid) primitives.push(...emitGrid(sheet.draw));
  primitives.push(...emitHeader(sheet, base));
  primitives.push(...emitElevation(elevation, transformer, visibility));
  if (visibility.dimensions) {
    const geometry = { x0: tx(transformer, 0), y0: ty(transformer, 0), x1: tx(transformer, elevation.width), y1: ty(transformer, elevation.height) };
    for (const chain of horizontalChains) primitives.push(...emitChain(chain, transformer, geometry, horizontalChains.length, spacing));
    for (const chain of verticalChains) primitives.push(...emitChain(chain, transformer, geometry, verticalChains.length, spacing));
  }
  if (visibility.sectionMarkers) {
    primitives.push({
      kind: 'text',
      layer: 'section',
      x: tx(transformer, elevation.width / 2),
      y: round2(ty(transformer, 0) - 3),
      text: 'A',
      size: 3,
      style: 'section',
      anchor: 'middle',
      weight: 800,
      family: 'mono',
    });
    primitives.push({
      kind: 'text',
      layer: 'section',
      x: tx(transformer, elevation.width / 2),
      y: round2(ty(transformer, elevation.height) + 3),
      text: 'A',
      size: 3,
      style: 'section',
      anchor: 'middle',
      weight: 800,
      family: 'mono',
    });
  }
  if (visibility.details) primitives.push(...emitDetails(sheet, details));
  primitives.push(...emitNotes(sheet, notes, profileReferences, glassReferences));
  primitives.push(...emitTitleBlock(sheet, base));

  return {
    ...base,
    primitives,
    viewBox: { width: base.sheet.width, height: base.sheet.height },
  };
}

function emitNotes(
  sheet: SheetLayout,
  notes: string[],
  profiles: ProfileReference[],
  glass: GlassReference[]
): DrawingPrimitive[] {
  const primitives: DrawingPrimitive[] = [];
  const x = sheet.notes.x + 2;
  let y = sheet.notes.y + 3;
  const lineHeight = 3.1;
  const maxY = sheet.notes.y + sheet.notes.height - 1;
  const schedule: string[] = [];
  if (profiles.length) {
    schedule.push(
      `PROFILE SCHEDULE: ${profiles
        .map((profile) => `${profile.code} ×${profile.quantity}${profile.confidence === 'REQUIRES REVIEW' ? ' (REVIEW)' : ''}`)
        .join('  ')}`
    );
  }
  if (glass.length) {
    schedule.push(
      `GLASS SCHEDULE: ${glass
        .map((panel) => `${panel.id} ${panel.width}×${panel.height} ${panel.thickness}mm ×${panel.qty}`)
        .join('  ')}`
    );
  }
  const all = [...notes, ...schedule];
  const maxWidth = sheet.notes.width - 4;
  const size = 1.8;
  for (const note of all) {
    for (const line of wrapText(note, size, maxWidth)) {
      if (y > maxY) return primitives;
      primitives.push({
        kind: 'text',
        layer: 'notes',
        x,
        y,
        text: line,
        size,
        style: 'title',
        family: 'mono',
      });
      y += lineHeight;
    }
  }
  return primitives;
}

// ---------------------------------------------------------------------------
// SVG string export (used by tests and vector PDF export)
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function styleAttrs(style: LineStyleKey): string {
  const line = LINE_STYLES[style];
  const parts = [`stroke="${line.color}"`, `stroke-width="${line.width}"`];
  if (line.dash) parts.push(`stroke-dasharray="${line.dash}"`);
  if (line.opacity !== undefined) parts.push(`stroke-opacity="${line.opacity}"`);
  return parts.join(' ');
}

export function primitiveToSvg(primitive: DrawingPrimitive): string {
  switch (primitive.kind) {
    case 'line':
      return `<line x1="${primitive.x1}" y1="${primitive.y1}" x2="${primitive.x2}" y2="${primitive.y2}" ${styleAttrs(primitive.style)} />`;
    case 'rect': {
      const fill = primitive.fill ?? 'none';
      const fillOpacity = primitive.fillOpacity !== undefined ? ` fill-opacity="${primitive.fillOpacity}"` : '';
      return `<rect x="${primitive.x}" y="${primitive.y}" width="${primitive.width}" height="${primitive.height}" fill="${fill}"${fillOpacity} ${styleAttrs(primitive.style)} />`;
    }
    case 'polyline': {
      const fill = primitive.fill ?? 'none';
      const fillOpacity = primitive.fillOpacity !== undefined ? ` fill-opacity="${primitive.fillOpacity}"` : '';
      return `<polygon points="${primitive.points}" fill="${fill}"${fillOpacity} ${styleAttrs(primitive.style)} />`;
    }
    case 'path': {
      const fill = primitive.fill ?? 'none';
      return `<path d="${primitive.d}" fill="${fill}" ${styleAttrs(primitive.style)} />`;
    }
    case 'circle':
      return `<circle cx="${primitive.cx}" cy="${primitive.cy}" r="${primitive.r}" fill="${primitive.fill ?? 'none'}" ${styleAttrs(primitive.style)} />`;
    case 'text': {
      const anchor = primitive.anchor ?? 'start';
      const baseline = primitive.baseline ?? 'auto';
      const weight = primitive.weight ?? 400;
      const rotate = primitive.rotate ? ` transform="rotate(${primitive.rotate} ${primitive.x} ${primitive.y})"` : '';
      const family = primitive.family === 'mono' ? 'monospace' : 'sans-serif';
      const line = LINE_STYLES[primitive.style];
      return `<text x="${primitive.x}" y="${primitive.y}" font-size="${primitive.size}" font-weight="${weight}" font-family="${family}" fill="${line.color}" text-anchor="${anchor}" dominant-baseline="${baseline}"${rotate}>${escapeXml(primitive.text)}</text>`;
    }
    default:
      return '';
  }
}

export function renderShopDrawingSvg(drawing: ShopDrawing): string {
  const body = drawing.primitives.map((primitive) => primitiveToSvg(primitive)).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.viewBox.width} ${drawing.viewBox.height}" width="${drawing.viewBox.width}mm" height="${drawing.viewBox.height}mm">`,
    `<rect x="0" y="0" width="${drawing.viewBox.width}" height="${drawing.viewBox.height}" fill="#ffffff" />`,
    body,
    '</svg>',
  ].join('\n');
}

export { SYSTEM_LABELS, GLASS_LABELS, FINISH_LABELS, PROFILE_VISUALS, CATALOGUE_MANIFEST };
