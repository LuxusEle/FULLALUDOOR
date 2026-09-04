// Mathematical isometric/axonometric 3D projection generator for aluminum extrusion bars

export interface MachiningFeature {
  type: 'drill' | 'weep' | 'mortise' | 'roller' | 'notch';
  label: string;
  xMm: number; // Distance from left cut end in mm
  size?: string;
  diameter?: number;
  face?: 'top' | 'front' | 'side';
}

export interface Bar3DProps {
  profileCode: string;
  description: string;
  lengthMm: number;
  angleLeft: number; // 90 or 45
  angleRight: number; // 90 or 45
  widthMm?: number; // Cross section width
  heightMm?: number; // Cross section height
  machining?: MachiningFeature[];
}

// Standard profile dimensions database for bar modeling
export const PROFILE_DIMENSIONS: Record<string, { w: number; h: number; wall: number; category: string }> = {
  '70S-1001-1': { w: 69.8, h: 32.0, wall: 1.3, category: '2-Track Head' },
  '70S-1101-1': { w: 69.8, h: 30.0, wall: 1.4, category: '2-Track Sill' },
  '70S-1201-1': { w: 72.8, h: 25.0, wall: 1.3, category: '2-Track Jamb' },
  '70S-1401':   { w: 27.9, h: 32.0, wall: 1.2, category: 'Top Sash Rail' },
  '70S-1501':   { w: 21.9, h: 56.1, wall: 1.4, category: 'Bottom Sash Rail' },
  '70S-1601':   { w: 29.9, h: 32.0, wall: 1.3, category: 'Interlock Stile' },
  '70S-1701':   { w: 29.9, h: 26.0, wall: 1.2, category: 'Lock Stile' },
  '70S-3002':   { w: 14.0, h: 12.0, wall: 1.1, category: 'Glazing Bead' },
  '100D-3105':  { w: 99.9, h: 45.0, wall: 1.8, category: 'Outer Frame' },
  '100D-101':   { w: 66.0, h: 44.5, wall: 2.0, category: 'Hinge Stile' },
  '100D-102':   { w: 70.0, h: 44.5, wall: 2.0, category: 'Meeting Stile' },
  '100D-103':   { w: 70.0, h: 44.5, wall: 2.0, category: 'Lock Stile' },
  '100D-201':   { w: 80.0, h: 44.5, wall: 2.0, category: 'Top Rail' },
  '100D-301':   { w: 100.0, h: 44.5, wall: 2.0, category: 'Mid Rail' },
  '100D-401':   { w: 120.0, h: 44.5, wall: 2.2, category: 'Bottom Rail' },
  '100D-501':   { w: 18.0, h: 16.0, wall: 1.2, category: 'Glazing Bead' },
};

/**
 * Returns default machining operations for standard door/window bars
 */
export function getStandardMachining(profileCode: string, lengthMm: number): MachiningFeature[] {
  const ops: MachiningFeature[] = [];

  if (profileCode === '70S-1101-1') {
    // Sill track: Weep slots for drainage
    ops.push(
      { type: 'weep', label: 'Drainage Weep Slot 30×5mm', xMm: 120, size: '30×5mm', face: 'front' },
      { type: 'weep', label: 'Drainage Weep Slot 30×5mm', xMm: Math.round(lengthMm - 120), size: '30×5mm', face: 'front' },
      { type: 'drill', label: 'Frame Sub-fix Screw Ø5mm', xMm: 75, diameter: 5.0, face: 'top' },
      { type: 'drill', label: 'Frame Sub-fix Screw Ø5mm', xMm: Math.round(lengthMm - 75), diameter: 5.0, face: 'top' }
    );
  } else if (profileCode === '70S-1501') {
    // Bottom sash rail: Roller carriage pockets & vertical assembly screws
    ops.push(
      { type: 'roller', label: 'Roller Carriage Pocket 60×18mm', xMm: 65, size: '60×18mm', face: 'front' },
      { type: 'roller', label: 'Roller Carriage Pocket 60×18mm', xMm: Math.round(lengthMm - 65), size: '60×18mm', face: 'front' },
      { type: 'drill', label: 'Assembly Screw Pilot Ø4.2mm', xMm: 15, diameter: 4.2, face: 'side' },
      { type: 'drill', label: 'Assembly Screw Pilot Ø4.2mm', xMm: Math.round(lengthMm - 15), diameter: 4.2, face: 'side' }
    );
  } else if (profileCode === '70S-1701') {
    // Lock stile: Flush lock mortise pocket
    const lockY = Math.round(lengthMm * 0.48);
    ops.push(
      { type: 'mortise', label: 'Flush Hook Lock Pocket 160×16mm', xMm: lockY, size: '160×16mm', face: 'front' },
      { type: 'drill', label: 'Lock Escutcheon Fixing Ø4.5mm', xMm: lockY - 90, diameter: 4.5, face: 'front' },
      { type: 'drill', label: 'Lock Escutcheon Fixing Ø4.5mm', xMm: lockY + 90, diameter: 4.5, face: 'front' }
    );
  } else if (profileCode === '70S-1401') {
    // Top rail: Guide block & assembly screw
    ops.push(
      { type: 'drill', label: 'Assembly Screw Pilot Ø4.2mm', xMm: 15, diameter: 4.2, face: 'side' },
      { type: 'drill', label: 'Assembly Screw Pilot Ø4.2mm', xMm: Math.round(lengthMm - 15), diameter: 4.2, face: 'side' }
    );
  } else if (profileCode === '100D-3105') {
    // Frame Head / Jamb: Tie rod / corner cleat prep
    ops.push(
      { type: 'drill', label: 'Corner Cleat Crimping Pin Ø6mm', xMm: 45, diameter: 6.0, face: 'top' },
      { type: 'drill', label: 'Wall Fixing Anchor Hole Ø8mm', xMm: 150, diameter: 8.0, face: 'top' },
      { type: 'drill', label: 'Wall Fixing Anchor Hole Ø8mm', xMm: Math.round(lengthMm - 150), diameter: 8.0, face: 'top' }
    );
  } else if (profileCode === '100D-101') {
    // Hinge stile: 3 hinge mortises
    ops.push(
      { type: 'mortise', label: 'Top Hinge Mortise 120×25mm', xMm: 220, size: '120×25mm', face: 'front' },
      { type: 'mortise', label: 'Mid Hinge Mortise 120×25mm', xMm: Math.round(lengthMm * 0.5), size: '120×25mm', face: 'front' },
      { type: 'mortise', label: 'Bottom Hinge Mortise 120×25mm', xMm: Math.round(lengthMm - 260), size: '120×25mm', face: 'front' }
    );
  } else if (profileCode === '100D-103') {
    // Lock stile: Euro mortise lock box & strike
    const midY = Math.round(lengthMm * 0.48);
    ops.push(
      { type: 'mortise', label: 'Euro Mortise Lock Body 165×22mm', xMm: midY, size: '165×22mm', face: 'front' },
      { type: 'drill', label: 'Euro Profile Cylinder Cutout Ø17mm', xMm: midY - 45, diameter: 17.0, face: 'side' },
      { type: 'drill', label: 'Lever Handle Spindle Hole Ø18mm', xMm: midY + 45, diameter: 18.0, face: 'side' }
    );
  } else if (profileCode.startsWith('100D-2') || profileCode.startsWith('100D-3') || profileCode.startsWith('100D-4')) {
    // Rails: Internal tie-rod channel & corner cleats
    ops.push(
      { type: 'drill', label: 'M6 Steel Tie-Rod Bore Ø8mm', xMm: 20, diameter: 8.0, face: 'side' },
      { type: 'drill', label: 'M6 Steel Tie-Rod Bore Ø8mm', xMm: Math.round(lengthMm - 20), diameter: 8.0, face: 'side' },
      { type: 'notch', label: 'Internal Angle Cleat Pocket 35×20mm', xMm: 30, size: '35×20mm', face: 'top' }
    );
  }

  return ops;
}

/**
 * Calculates SVG polygon points and linework for textbook axonometric view of a cut bar
 */
export function generateBarAxonometricSvg(props: Bar3DProps): {
  viewBox: string;
  frontPolygon: string;
  topPolygon: string;
  sidePolygon: string;
  endCutPolygon: string;
  hiddenLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  edges: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  features: Array<{ x: number; y: number; label: string; type: string }>;
  dimLine: { x1: number; y1: number; x2: number; y2: number; text: string; tx: number; ty: number };
} {
  const profileDim = PROFILE_DIMENSIONS[props.profileCode] || { w: 40, h: 40, wall: 1.5 };
  const w = props.widthMm || profileDim.w;
  const h = props.heightMm || profileDim.h;

  // Exact isotropic aspect-ratio scaling (strictly uniform, no non-uniform stretching)
  const maxDim = Math.max(w, h, 1);
  const uniformScale = 56 / maxDim;
  const pW = w * uniformScale;
  const pH = h * uniformScale;

  // Isometric axis vectors (30 degrees: cos(30)=0.866, sin(30)=0.5)
  const isoCos = 0.866;
  const isoSin = 0.5;
  const drawLength = 220; // Visual length of extrusion on canvas
  const vecX = drawLength * isoCos;
  const vecY = -drawLength * isoSin;

  // Front face origin (bottom-left)
  const originX = 70;
  const originY = 160;

  // Miter offsets
  const leftMiterOffset = props.angleLeft === 45 ? pW * 0.7 : 0;
  const rightMiterOffset = props.angleRight === 45 ? pW * 0.7 : 0;

  // Key vertices of front face
  // 0: bottom-left, 1: bottom-right, 2: top-right, 3: top-left
  const f0 = { x: originX, y: originY };
  const f1 = { x: originX + pW, y: originY };
  const f2 = { x: originX + pW, y: originY - pH };
  const f3 = { x: originX, y: originY - pH };

  // If left miter, adjust front face vertices
  if (props.angleLeft === 45) {
    f1.x += leftMiterOffset * isoCos;
    f1.y -= leftMiterOffset * isoSin;
    f2.x += leftMiterOffset * isoCos;
    f2.y -= leftMiterOffset * isoSin;
  }

  // Key vertices of back face (extruded along isometric vector)
  const b0 = { x: f0.x + vecX, y: f0.y + vecY };
  const b1 = { x: f1.x + vecX, y: f1.y + vecY };
  const b2 = { x: f2.x + vecX, y: f2.y + vecY };
  const b3 = { x: f3.x + vecX, y: f3.y + vecY };

  // If right miter, adjust back face vertices
  if (props.angleRight === 45) {
    b1.x -= rightMiterOffset * isoCos;
    b1.y += rightMiterOffset * isoSin;
    b2.x -= rightMiterOffset * isoCos;
    b2.y += rightMiterOffset * isoSin;
  }

  const frontPolygon = `${f0.x},${f0.y} ${f1.x},${f1.y} ${f2.x},${f2.y} ${f3.x},${f3.y}`;
  const topPolygon = `${f3.x},${f3.y} ${f2.x},${f2.y} ${b2.x},${b2.y} ${b3.x},${b3.y}`;
  const sidePolygon = `${f1.x},${f1.y} ${b1.x},${b1.y} ${b2.x},${b2.y} ${f2.x},${f2.y}`;
  const endCutPolygon = `${b0.x},${b0.y} ${b1.x},${b1.y} ${b2.x},${b2.y} ${b3.x},${b3.y}`;

  // Visible silhouette edges
  const edges = [
    // Front face outline
    { x1: f0.x, y1: f0.y, x2: f1.x, y2: f1.y },
    { x1: f1.x, y1: f1.y, x2: f2.x, y2: f2.y },
    { x1: f2.x, y1: f2.y, x2: f3.x, y2: f3.y },
    { x1: f3.x, y1: f3.y, x2: f0.x, y2: f0.y },
    // Extrusion ridge lines
    { x1: f3.x, y1: f3.y, x2: b3.x, y2: b3.y },
    { x1: f2.x, y1: f2.y, x2: b2.x, y2: b2.y },
    { x1: f1.x, y1: f1.y, x2: b1.x, y2: b1.y },
    // Far end visible lines
    { x1: b3.x, y1: b3.y, x2: b2.x, y2: b2.y },
    { x1: b2.x, y1: b2.y, x2: b1.x, y2: b1.y },
  ];

  // Hidden construction lines (dotted)
  const hiddenLines = [
    { x1: f0.x, y1: f0.y, x2: b0.x, y2: b0.y },
    { x1: b0.x, y1: b0.y, x2: b3.x, y2: b3.y },
    { x1: b0.x, y1: b0.y, x2: b1.x, y2: b1.y },
  ];

  // Project machining features along the bar length
  const machiningOps = props.machining && props.machining.length > 0
    ? props.machining
    : getStandardMachining(props.profileCode, props.lengthMm);

  const features = machiningOps.map((op) => {
    const fraction = Math.min(Math.max(op.xMm / props.lengthMm, 0.08), 0.92);
    // Point on top face
    const topX = f3.x + (b3.x - f3.x) * fraction + pW * 0.45;
    const topY = f3.y + (b3.y - f3.y) * fraction + 8;
    return {
      x: Math.round(topX),
      y: Math.round(topY),
      label: op.label,
      type: op.type,
    };
  });

  // Dimension line parallel to extrusion vector
  const dimOffset = 36;
  const dxNorm = isoSin; // Perpendicular to isometric axis
  const dyNorm = isoCos;
  const dX1 = f0.x - dimOffset * dxNorm;
  const dY1 = f0.y - dimOffset * dyNorm;
  const dX2 = b0.x - dimOffset * dxNorm;
  const dY2 = b0.y - dimOffset * dyNorm;
  const tX = (dX1 + dX2) / 2 - 15;
  const tY = (dY1 + dY2) / 2 - 12;

  const dimLine = {
    x1: Math.round(dX1),
    y1: Math.round(dY1),
    x2: Math.round(dX2),
    y2: Math.round(dY2),
    text: `L = ${props.lengthMm.toFixed(1)} mm`,
    tx: Math.round(tX),
    ty: Math.round(tY),
  };

  return {
    viewBox: '0 0 380 220',
    frontPolygon,
    topPolygon,
    sidePolygon,
    endCutPolygon,
    hiddenLines,
    edges,
    features,
    dimLine,
  };
}
