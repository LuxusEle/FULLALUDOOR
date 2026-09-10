'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Grid3x3,
  Hand,
  Magnet,
  Maximize2,
  Minus,
  PanelsTopLeft,
  Plus,
  Printer,
  Ruler,
  Settings2,
  Tag,
} from 'lucide-react';
import type { OpeningItem, ProjectMetadata } from '../lib/types';
import {
  LINE_STYLES,
  buildShopDrawing,
  renderShopDrawingSvg,
  type DrawingLayer,
  type DrawingPrimitive,
  type DrawingStatus,
  type ScaleMode,
  type SheetOrientation,
  type SheetSize,
  type ShopDrawing,
} from '../lib/shop-drawing';

interface VectorCadDrawingsProps {
  opening: OpeningItem;
  theme?: 'dark' | 'light';
  project?: ProjectMetadata | null;
  openings?: OpeningItem[];
  onSelectOpening?: (id: string) => void;
  revision?: string;
  status?: DrawingStatus;
}

type CadView = 'sheet' | 'elevation' | 'details' | 'schedule';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VIEW_LAYERS: Record<CadView, DrawingLayer[] | null> = {
  sheet: null,
  elevation: ['border', 'header', 'elevation', 'glass', 'profile', 'annotation', 'section', 'dimension', 'grid'],
  details: ['border', 'header', 'detail', 'titleblock'],
  schedule: null,
};

function primitiveBounds(primitive: DrawingPrimitive): Bounds | null {
  switch (primitive.kind) {
    case 'line':
      return {
        minX: Math.min(primitive.x1, primitive.x2),
        minY: Math.min(primitive.y1, primitive.y2),
        maxX: Math.max(primitive.x1, primitive.x2),
        maxY: Math.max(primitive.y1, primitive.y2),
      };
    case 'rect':
      return {
        minX: primitive.x,
        minY: primitive.y,
        maxX: primitive.x + primitive.width,
        maxY: primitive.y + primitive.height,
      };
    case 'circle':
      return {
        minX: primitive.cx - primitive.r,
        minY: primitive.cy - primitive.r,
        maxX: primitive.cx + primitive.r,
        maxY: primitive.cy + primitive.r,
      };
    case 'polyline': {
      const points = primitive.points
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
        .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
      if (!points.length) return null;
      return {
        minX: Math.min(...points.map((point) => point[0])),
        minY: Math.min(...points.map((point) => point[1])),
        maxX: Math.max(...points.map((point) => point[0])),
        maxY: Math.max(...points.map((point) => point[1])),
      };
    }
    default:
      return null;
  }
}

function boundsFor(drawing: ShopDrawing, layers: DrawingLayer[] | null): Bounds | null {
  let bounds: Bounds | null = null;
  for (const primitive of drawing.primitives) {
    if (layers && !layers.includes(primitive.layer)) continue;
    const current = primitiveBounds(primitive);
    if (!current) continue;
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, current.minX),
          minY: Math.min(bounds.minY, current.minY),
          maxX: Math.max(bounds.maxX, current.maxX),
          maxY: Math.max(bounds.maxY, current.maxY),
        }
      : current;
  }
  return bounds;
}

function CadPrimitive({ primitive }: { primitive: DrawingPrimitive }) {
  const line = LINE_STYLES[primitive.style];
  const stroke = {
    stroke: line.color,
    strokeWidth: line.width,
    strokeDasharray: line.dash,
    strokeOpacity: line.opacity,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  switch (primitive.kind) {
    case 'line':
      return <line x1={primitive.x1} y1={primitive.y1} x2={primitive.x2} y2={primitive.y2} {...stroke} />;
    case 'rect':
      return (
        <rect
          x={primitive.x}
          y={primitive.y}
          width={primitive.width}
          height={primitive.height}
          fill={primitive.fill ?? 'none'}
          fillOpacity={primitive.fillOpacity}
          {...stroke}
        />
      );
    case 'polyline':
      return (
        <polygon
          points={primitive.points}
          fill={primitive.fill ?? 'none'}
          fillOpacity={primitive.fillOpacity}
          {...stroke}
        />
      );
    case 'path':
      return <path d={primitive.d} fill={primitive.fill ?? 'none'} {...stroke} />;
    case 'circle':
      return <circle cx={primitive.cx} cy={primitive.cy} r={primitive.r} fill={primitive.fill ?? 'none'} {...stroke} />;
    case 'text':
      return (
        <text
          x={primitive.x}
          y={primitive.y}
          fontSize={primitive.size}
          fontWeight={primitive.weight ?? 400}
          fontFamily={primitive.family === 'mono' ? "'JetBrains Mono', ui-monospace, monospace" : "'Inter', sans-serif"}
          fill={line.color}
          textAnchor={primitive.anchor ?? 'start'}
          dominantBaseline={primitive.baseline ?? 'auto'}
          transform={primitive.rotate ? `rotate(${primitive.rotate} ${primitive.x} ${primitive.y})` : undefined}
        >
          {primitive.text}
        </text>
      );
    default:
      return null;
  }
}

function openPrintWindow(drawings: ShopDrawing[]): void {
  if (!drawings.length) return;
  const sheet = drawings[0].sheet;
  const body = drawings
    .map((drawing) => `<section class="cad-page">${renderShopDrawingSvg(drawing)}</section>`)
    .join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(
    `<!doctype html><html><head><title>${drawings[0].titleBlock.drawingNumber}</title><style>@page{size:${sheet.width}mm ${sheet.height}mm;margin:0}html,body{margin:0;padding:0;background:#fff}.cad-page{page-break-after:always;break-after:page}.cad-page:last-child{page-break-after:auto;break-after:auto}svg{display:block;width:${sheet.width}mm;height:${sheet.height}mm}</style></head><body>${body}</body></html>`
  );
  win.document.close();
  win.focus();
  win.print();
}

export default function VectorCadDrawings({
  opening,
  theme = 'dark',
  project = null,
  openings = [],
  onSelectOpening,
  revision,
  status,
}: VectorCadDrawingsProps) {
  const [view, setView] = useState<CadView>('sheet');
  const [sheetSize, setSheetSize] = useState<SheetSize>('A3');
  const [orientation, setOrientation] = useState<SheetOrientation>('landscape');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');
  const [showSettings, setShowSettings] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [panMode, setPanMode] = useState(true);
  const [snap, setSnap] = useState(false);
  const [visibility, setVisibility] = useState({
    dimensions: true,
    profileLabels: true,
    glassLabels: true,
    sectionMarkers: true,
    grid: false,
    details: true,
    annotations: true,
  });
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const drawing = useMemo(
    () =>
      buildShopDrawing({
        project,
        opening,
        openings,
        sheetSize,
        orientation,
        scale: scaleMode,
        visibility,
      }),
    [project, opening, openings, sheetSize, orientation, scaleMode, visibility]
  );

  const effectiveStatus = status ?? drawing.status;
  const effectiveRevision = revision ?? drawing.revision;

  const baseView = useMemo<ViewBox>(() => {
    const bounds = boundsFor(drawing, VIEW_LAYERS[view]);
    if (!bounds || view === 'sheet' || view === 'schedule') {
      return { x: 0, y: 0, width: drawing.viewBox.width, height: drawing.viewBox.height };
    }
    const pad = view === 'details' ? 4 : 14;
    return {
      x: bounds.minX - pad,
      y: bounds.minY - pad,
      width: Math.max(20, bounds.maxX - bounds.minX + pad * 2),
      height: Math.max(20, bounds.maxY - bounds.minY + pad * 2),
    };
  }, [drawing, view]);

  const viewBox = useMemo<ViewBox>(() => {
    const centerX = center?.x ?? baseView.x + baseView.width / 2;
    const centerY = center?.y ?? baseView.y + baseView.height / 2;
    return {
      x: centerX - baseView.width / (2 * zoom),
      y: centerY - baseView.height / (2 * zoom),
      width: baseView.width / zoom,
      height: baseView.height / zoom,
    };
  }, [baseView, center, zoom]);

  useEffect(() => {
    setZoom(1);
    setCenter(null);
  }, [view, sheetSize, orientation]);

  const layerFilter = VIEW_LAYERS[view];
  const visiblePrimitives = useMemo(
    () => drawing.primitives.filter((primitive) => !layerFilter || layerFilter.includes(primitive.layer)),
    [drawing, layerFilter]
  );

  const openingIndex = openings.findIndex((item) => item.id === opening.id);
  const canNavigate = openings.length > 1 && openingIndex >= 0;

  const goTo = useCallback(
    (offset: number) => {
      if (!onSelectOpening || !canNavigate) return;
      const next = (openingIndex + offset + openings.length) % openings.length;
      onSelectOpening(openings[next].id);
    },
    [canNavigate, onSelectOpening, openingIndex, openings]
  );

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!panMode) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { x: event.clientX, y: event.clientY, cx: viewBox.x + viewBox.width / 2, cy: viewBox.y + viewBox.height / 2 };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = ((event.clientX - drag.x) / rect.width) * viewBox.width;
    const dy = ((event.clientY - drag.y) / rect.height) * viewBox.height;
    const snapTo = (value: number) => (snap ? Math.round(value / 5) * 5 : value);
    setCenter({ x: snapTo(drag.cx - dx), y: snapTo(drag.cy - dy) });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const toggle = (key: keyof typeof visibility) => setVisibility((current) => ({ ...current, [key]: !current[key] }));

  const downloadSvg = () => {
    const blob = new Blob([renderShopDrawingSvg(drawing)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${drawing.titleBlock.drawingNumber}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cad-workspace" data-cad-theme={theme}>
      <div className="cad-toolbar no-print">
        <div className="cad-toolbar-group">
          <span className="cad-toolbar-label">
            <Tag size={13} /> OPENING
          </span>
          {openings.length > 1 && onSelectOpening ? (
            <select
              className="cad-select"
              value={opening.id}
              onChange={(event) => onSelectOpening(event.target.value)}
            >
              {openings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.tag} — {item.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="cad-chip">{opening.tag}</span>
          )}
          <button className="cad-icon-btn" onClick={() => goTo(-1)} disabled={!canNavigate} aria-label="Previous opening">
            <ChevronLeft size={15} />
          </button>
          <button className="cad-icon-btn" onClick={() => goTo(1)} disabled={!canNavigate} aria-label="Next opening">
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="cad-toolbar-group cad-view-tabs">
          {(
            [
              ['sheet', 'SHEET'],
              ['elevation', 'ELEVATION'],
              ['details', 'SECTIONS'],
              ['schedule', 'SCHEDULE'],
            ] as Array<[CadView, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              className={`cad-tab ${view === key ? 'active' : ''}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="cad-toolbar-group">
          <button className="cad-icon-btn" onClick={() => setZoom((value) => Math.max(0.4, value / 1.25))} aria-label="Zoom out">
            <Minus size={15} />
          </button>
          <span className="cad-zoom mono">{Math.round(zoom * 100)}%</span>
          <button className="cad-icon-btn" onClick={() => setZoom((value) => Math.min(8, value * 1.25))} aria-label="Zoom in">
            <Plus size={15} />
          </button>
          <button
            className="cad-icon-btn"
            onClick={() => {
              setZoom(1);
              setCenter(null);
            }}
            aria-label="Fit to sheet"
          >
            <Maximize2 size={15} />
          </button>
          <button
            className={`cad-icon-btn ${visibility.dimensions ? 'active' : ''}`}
            onClick={() => toggle('dimensions')}
            aria-label="Dimensions"
            title="Dimensions"
          >
            <Ruler size={15} />
          </button>
          <button
            className={`cad-icon-btn ${visibility.grid ? 'active' : ''}`}
            onClick={() => toggle('grid')}
            aria-label="Grid"
            title="Grid"
          >
            <Grid3x3 size={15} />
          </button>
          <button
            className={`cad-icon-btn ${panMode ? 'active' : ''}`}
            onClick={() => setPanMode((value) => !value)}
            aria-label="Pan"
            title="Pan"
          >
            <Hand size={15} />
          </button>
          <button
            className={`cad-icon-btn ${snap ? 'active' : ''}`}
            onClick={() => setSnap((value) => !value)}
            aria-label="Snap"
            title="Snap to grid"
          >
            <Magnet size={15} />
          </button>
          <button
            className={`cad-icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings((value) => !value)}
            aria-label="Drawing settings"
            title="Drawing settings"
          >
            <Settings2 size={15} />
          </button>
          {openings.length > 1 && (
            <button
              className="cad-action-btn"
              title="Generate every opening sheet in this project"
              onClick={() =>
                openPrintWindow(
                  openings.map((item) =>
                    buildShopDrawing({
                      project,
                      opening: item,
                      openings,
                      sheetSize,
                      orientation,
                      scale: scaleMode,
                      visibility,
                    })
                  )
                )
              }
            >
              <PanelsTopLeft size={14} /> ALL SHEETS
            </button>
          )}
          <button className="cad-action-btn" onClick={() => openPrintWindow([drawing])}>
            <Printer size={14} /> PRINT
          </button>
          <button className="cad-action-btn primary" onClick={() => openPrintWindow([drawing])}>
            <Download size={14} /> EXPORT PDF
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="cad-settings-bar no-print">
          <label className="cad-field">
            <span>SHEET</span>
            <select className="cad-select" value={sheetSize} onChange={(event) => setSheetSize(event.target.value as SheetSize)}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
          </label>
          <label className="cad-field">
            <span>ORIENTATION</span>
            <select
              className="cad-select"
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as SheetOrientation)}
            >
              <option value="landscape">LANDSCAPE</option>
              <option value="portrait">PORTRAIT</option>
            </select>
          </label>
          <label className="cad-field">
            <span>SCALE</span>
            <select
              className="cad-select"
              value={String(scaleMode)}
              onChange={(event) => {
                const value = event.target.value;
                setScaleMode(value === 'auto' || value === 'fit' ? (value as ScaleMode) : Number(value));
              }}
            >
              <option value="auto">AUTO</option>
              <option value="fit">FIT TO SHEET</option>
              <option value="10">1:10</option>
              <option value="20">1:20</option>
              <option value="25">1:25</option>
              <option value="50">1:50</option>
            </select>
          </label>
          {(
            [
              ['dimensions', 'DIMENSIONS'],
              ['profileLabels', 'PROFILE LABELS'],
              ['glassLabels', 'GLASS LABELS'],
              ['sectionMarkers', 'SECTION MARKERS'],
              ['details', 'DETAILS'],
              ['annotations', 'HANDING / SLIDE'],
              ['grid', 'GRID'],
            ] as Array<[keyof typeof visibility, string]>
          ).map(([key, label]) => (
            <button key={key} className={`cad-toggle ${visibility[key] ? 'active' : ''}`} onClick={() => toggle(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="cad-body">
        <main className="cad-canvas">
          {view === 'schedule' ? (
            <SchedulePanel drawing={drawing} />
          ) : (
            <div className="cad-sheet-scroll">
              <svg
                ref={svgRef}
                className="cad-sheet"
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <rect
                  x={viewBox.x}
                  y={viewBox.y}
                  width={viewBox.width}
                  height={viewBox.height}
                  fill="#ffffff"
                  onPointerDown={(event) => event.preventDefault()}
                />
                {visiblePrimitives.map((primitive, index) => (
                  <CadPrimitive key={primitive.id ?? `${primitive.kind}-${index}`} primitive={primitive} />
                ))}
              </svg>
            </div>
          )}
        </main>

        <aside className="cad-info no-print">
          <div className={`cad-status ${effectiveStatus === 'DRAFT' ? 'ok' : 'review'}`}>
            <span>STATUS</span>
            <strong>{effectiveStatus}</strong>
            <small>REV {effectiveRevision}</small>
          </div>
          {drawing.details.some((detail) => !detail.available) && (
            <div className="cad-review">
              <strong>REQUIRES REVIEW</strong>
              <ul>
                {drawing.details
                  .filter((detail) => !detail.available)
                  .map((detail) => (
                    <li key={detail.id}>
                      {detail.section} — {detail.missing.join(', ') || detail.title}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <InfoSection title="GLASS SCHEDULE">
            <table className="cad-mini-table">
              <thead>
                <tr>
                  <th>REF</th>
                  <th>W×H</th>
                  <th>THK</th>
                </tr>
              </thead>
              <tbody>
                {drawing.glassReferences.map((panel) => (
                  <tr key={panel.id}>
                    <td className="mono">{panel.id}</td>
                    <td className="mono">
                      {panel.width}×{panel.height}
                    </td>
                    <td className="mono">{panel.thickness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InfoSection>
          <InfoSection title="PROFILE SCHEDULE">
            <table className="cad-mini-table">
              <thead>
                <tr>
                  <th>CODE</th>
                  <th>QTY</th>
                  <th>CATALOGUE</th>
                </tr>
              </thead>
              <tbody>
                {drawing.profileReferences.map((profile) => (
                  <tr key={profile.code}>
                    <td className="mono">{profile.code}</td>
                    <td className="mono">{profile.quantity}</td>
                    <td className={profile.confidence === 'REQUIRES REVIEW' ? 'review-text' : ''}>
                      {profile.catalogue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InfoSection>
          <InfoSection title="HARDWARE SCHEDULE">
            <table className="cad-mini-table">
              <thead>
                <tr>
                  <th>CODE</th>
                  <th>QTY</th>
                  <th>UNIT</th>
                </tr>
              </thead>
              <tbody>
                {drawing.hardwareReferences.map((item) => (
                  <tr key={item.code}>
                    <td className="mono">{item.code}</td>
                    <td className="mono">{item.qty}</td>
                    <td>{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InfoSection>
          <InfoSection title="NOTES">
            <ul className="cad-note-list">
              {drawing.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </InfoSection>
        </aside>
      </div>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cad-info-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function SchedulePanel({ drawing }: { drawing: ShopDrawing }) {
  return (
    <div className="cad-schedule">
      <h2>{drawing.titleBlock.drawingNumber}</h2>
      <p>
        {drawing.titleBlock.system} — {drawing.elevation.width} × {drawing.elevation.height} mm — SCALE{' '}
        {drawing.titleBlock.scale}
      </p>
      <table className="cad-mini-table wide">
        <thead>
          <tr>
            <th>ITEM</th>
            <th>DESCRIPTION</th>
            <th>QTY</th>
            <th>UNIT</th>
            <th>REFERENCE</th>
          </tr>
        </thead>
        <tbody>
          {drawing.profileReferences.map((profile) => (
            <tr key={`p-${profile.code}`}>
              <td className="mono">{profile.code}</td>
              <td>{profile.description}</td>
              <td className="mono">{profile.quantity}</td>
              <td>length</td>
              <td className={profile.confidence === 'REQUIRES REVIEW' ? 'review-text' : ''}>{profile.catalogue}</td>
            </tr>
          ))}
          {drawing.glassReferences.map((panel) => (
            <tr key={`g-${panel.id}`}>
              <td className="mono">{panel.id}</td>
              <td>{panel.description}</td>
              <td className="mono">{panel.qty}</td>
              <td>panel</td>
              <td className="mono">
                {panel.width}×{panel.height} mm
              </td>
            </tr>
          ))}
          {drawing.hardwareReferences.map((item) => (
            <tr key={`h-${item.code}`}>
              <td className="mono">{item.code}</td>
              <td>{item.name}</td>
              <td className="mono">{item.qty}</td>
              <td>{item.unit}</td>
              <td>{item.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cad-schedule-footer">
        <span>
          <PanelsTopLeft size={13} /> {drawing.details.filter((detail) => detail.available).length} verified details
        </span>
        <span>{drawing.details.filter((detail) => !detail.available).length} require review</span>
      </div>
    </div>
  );
}
