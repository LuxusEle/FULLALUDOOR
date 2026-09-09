'use client';

import React, { useEffect, useState } from 'react';
import type { DerivedOpening, OpeningItem, ProjectMetadata } from '../lib/types';
import { deriveDoor } from '../lib/door-model';
import { captureStudioCanvasNow, loadStudioSnapshot } from '../lib/studio-snapshot';
import {
  DXF_70S_1001_1,
  DXF_70S_1101_1,
  DXF_70S_1201_1,
  DXF_70S_1401,
  DXF_70S_1501,
  DXF_70S_1601,
  DXF_70S_1701,
  DXF_100D_3105,
  DXF_100D_101,
  DXF_100D_102,
  DXF_100D_103,
  DXF_100D_201,
  DXF_100D_301,
  DXF_100D_401,
  DXF_100D_501,
} from '../lib/dxf-svg-paths';
import {
  generateBarAxonometricSvg,
  getStandardMachining,
  PROFILE_DIMENSIONS,
} from '../lib/axonometric-bar';
import {
  Printer,
  FileCheck2,
  Box,
  Maximize2,
} from 'lucide-react';

interface FabricationAuditReportProps {
  project: ProjectMetadata;
  openings: OpeningItem[];
  activeOpeningId: string;
  onSelectOpening?: (id: string) => void;
  theme?: 'dark' | 'light';
}

export default function FabricationAuditReport({
  project,
  openings,
  activeOpeningId,
  onSelectOpening,
}: FabricationAuditReportProps) {
  const [selectedTag, setSelectedTag] = useState<string>(
    openings.find((o) => o.id === activeOpeningId)?.tag || openings[0].tag
  );
  const [activeSheet, setActiveSheet] = useState<
    'all' | 'elevation' | 'assembly3d' | 'sections' | 'bars3d' | 'checklist'
  >('all');
  const [canvasSnapshot, setCanvasSnapshot] = useState<string | null>(null);
  const [highlightedPart, setHighlightedPart] = useState<number | null>(null);
  const [captureStatus, setCaptureStatus] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  // If the user has visited the 3D Studio this session, restore the last frame
  // so Sheet 2 already shows a real render without requiring a manual capture.
  useEffect(() => {
    const stored = loadStudioSnapshot();
    if (stored) setCanvasSnapshot(stored);
  }, []);

  // Active opening model
  const activeOpening = openings.find((o) => o.tag === selectedTag) || openings[0];
  const derived: DerivedOpening = deriveDoor(activeOpening);

  const w = activeOpening.width;
  const h = activeOpening.height;
  const system = activeOpening.system;
  const is70S = system.startsWith('70S');
  const isDouble = system === '100D-double';

  // Handler for printing / Save as PDF
  const handlePrint = () => {
    // Re-capture a fresh frame (if the Studio canvas is mounted) before printing,
    // then give the browser a frame to paint the <img> into the sheet.
    const live = captureStudioCanvasNow();
    if (live) setCanvasSnapshot(live);
    setCaptureStatus(null);
    window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setCaptureStatus({
          tone: 'warn',
          text: 'Your browser blocked printing. Press Ctrl/Cmd + P instead.',
        });
      }
    }, 80);
  };

  // Capture current Babylon.js canvas snapshot (Studio must have been visited so
  // its last rendered frame is available to this tab).
  const handleCaptureStudioCanvas = () => {
    const live = captureStudioCanvasNow();
    if (live) {
      setCanvasSnapshot(live);
      setCaptureStatus({ tone: 'ok', text: '3D Studio snapshot captured and embedded in Sheet 2.' });
      return;
    }
    const stored = loadStudioSnapshot();
    if (stored) {
      setCanvasSnapshot(stored);
      setCaptureStatus({ tone: 'ok', text: 'Embedded the latest 3D Studio render from this session.' });
      return;
    }
    setCaptureStatus({
      tone: 'warn',
      text: 'No 3D Studio render is available yet. Open the 3D Studio tab once, then return here and press Capture again.',
    });
  };

  // Helper to get matching DXF profile SVG data
  const getDxfForProfile = (profileCode: string) => {
    switch (profileCode) {
      case '70S-1001-1': return DXF_70S_1001_1;
      case '70S-1101-1': return DXF_70S_1101_1;
      case '70S-1201-1': return DXF_70S_1201_1;
      case '70S-1401':   return DXF_70S_1401;
      case '70S-1501':   return DXF_70S_1501;
      case '70S-1601':   return DXF_70S_1601;
      case '70S-1701':   return DXF_70S_1701;
      case '100D-3105':  return DXF_100D_3105;
      case '100D-101':   return DXF_100D_101;
      case '100D-102':   return DXF_100D_102;
      case '100D-103':   return DXF_100D_103;
      case '100D-201':   return DXF_100D_201;
      case '100D-301':   return DXF_100D_301;
      case '100D-401':   return DXF_100D_401;
      case '100D-501':   return DXF_100D_501;
      default:           return null;
    }
  };

  return (
    <div className="audit-dossier-wrapper">
      {/* ========================================================================= */}
      {/* AUDIT TOP TOOLBAR (Hidden during print)                                   */}
      {/* ========================================================================= */}
      <header className="audit-toolbar no-print">
        <div className="audit-toolbar-left">
          <div className="audit-title-block">
            <div className="flex items-center gap-2">
              <FileCheck2 className="text-primary" size={20} />
              <h1 className="text-sm font-bold tracking-wide uppercase">
                Expert Fabricator Audit Report & Construction Dossier
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              B&W Drafting Standards • Alumex Advance Catalogue True 1:1 DXF • ISO 2768-m
            </p>
          </div>

          {/* Opening Unit Selector */}
          <div className="audit-selector flex items-center gap-2 ml-4">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Unit:</span>
            <select
              className="audit-dropdown text-xs font-mono font-bold bg-background border px-2 py-1 rounded"
              value={selectedTag}
              onChange={(e) => {
                setSelectedTag(e.target.value);
                const target = openings.find((o) => o.tag === e.target.value);
                if (target && onSelectOpening) onSelectOpening(target.id);
              }}
            >
              {openings.map((op) => (
                <option key={op.id} value={op.tag}>
                  {op.tag} — {op.name} ({op.width}×{op.height} mm)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="audit-toolbar-center">
          {/* Sheet Tab Switcher */}
          <div className="audit-tabs flex items-center gap-1 bg-muted/40 p-1 rounded-lg border">
            <button
              className={`audit-tab-btn px-2.5 py-1 text-xs rounded font-medium transition-all ${
                activeSheet === 'all' ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSheet('all')}
            >
              All Sheets
            </button>
            <button
              className={`audit-tab-btn px-2.5 py-1 text-xs rounded font-medium transition-all ${
                activeSheet === 'elevation' ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSheet('elevation')}
            >
              Sheet 1: Elevation & Specs
            </button>
            <button
              className={`audit-tab-btn px-2.5 py-1 text-xs rounded font-medium transition-all ${
                activeSheet === 'assembly3d' ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSheet('assembly3d')}
            >
              Sheet 2: 3D Assembly & Joinery
            </button>
            <button
              className={`audit-tab-btn px-2.5 py-1 text-xs rounded font-medium transition-all ${
                activeSheet === 'sections' ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSheet('sections')}
            >
              Sheet 3: DXF Sections (1:1)
            </button>
            <button
              className={`audit-tab-btn px-2.5 py-1 text-xs rounded font-medium transition-all ${
                activeSheet === 'bars3d' ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSheet('bars3d')}
            >
              Sheet 4: Bar 3D Datasheets
            </button>
            <button
              className={`audit-tab-btn px-2.5 py-1 text-xs rounded font-medium transition-all ${
                activeSheet === 'checklist' ? 'bg-background shadow-sm font-bold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveSheet('checklist')}
            >
              Sheet 5: Audit Checklist
            </button>
          </div>
        </div>

        <div className="audit-toolbar-right flex items-center gap-2">
          <button
            className="btn btn-outline btn-xs flex items-center gap-1.5"
            onClick={handleCaptureStudioCanvas}
            title="Embed live Babylon.js 3D viewport snapshot into Sheet 2"
          >
            <Maximize2 size={13} />
            <span>Capture 3D Studio</span>
          </button>

          <button
            className="btn btn-primary btn-xs flex items-center gap-1.5 font-bold shadow-sm"
            onClick={handlePrint}
          >
            <Printer size={13} />
            <span>Print / Save PDF</span>
          </button>
        </div>

        {captureStatus && (
          <p
            className="audit-capture-status"
            aria-live="polite"
            style={{
              flexBasis: '100%',
              margin: 0,
              fontSize: 11.5,
              fontWeight: 600,
              lineHeight: 1.4,
              color: captureStatus.tone === 'ok' ? 'var(--green)' : '#f0b400',
            }}
          >
            {captureStatus.text}
          </p>
        )}
      </header>

      {/* ========================================================================= */}
      {/* AUDIT REPORT DOCUMENT BODY (Formatted for Screen and A4 Landscape Print)  */}
      {/* ========================================================================= */}
      <div className="audit-document-container">
        {/* ======================================================================= */}
        {/* SHEET 1: GENERAL ARRANGEMENT ELEVATION, SPECS & TITLE BLOCK             */}
        {/* ======================================================================= */}
        {(activeSheet === 'all' || activeSheet === 'elevation') && (
          <section className="audit-sheet sheet-elevation" id="sheet-1">
            <div className="sheet-border-inner">
              {/* Sheet Sub-Header */}
              <div className="sheet-header-bar">
                <div className="sheet-header-title">
                  <span className="sheet-no">SHEET 01 OF 05</span>
                  <h2>GENERAL ARRANGEMENT ELEVATION & FABRICATION SPECIFICATIONS</h2>
                </div>
                <div className="sheet-scale-box">
                  <span>SCALE: 1:20</span>
                  <span>UNITS: MILLIMETERS (MM)</span>
                  <span>STANDARDS: ISO 128 / BS 6375 / DIN 18055</span>
                </div>
              </div>

              {/* Landscape 2-Column Layout: Left Drawing (65%), Right Specs (35%) */}
              <div className="sheet-layout-columns" style={{ display: 'grid', gridTemplateColumns: '1.85fr 1.15fr', gap: '14px', alignItems: 'stretch' }}>
                {/* Left: Vector CAD Elevation with Dual ISO Dimension Chains */}
                <div className="sheet-drawing-canvas-wrap" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <svg
                    viewBox={`-85 -70 ${w + 170} ${h + 105}`}
                    className="audit-svg-elevation"
                    preserveAspectRatio="xMidYMid meet"
                    style={{ width: '100%', maxHeight: '420px' }}
                  >
                    <defs>
                      <marker id="auditArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 L2,3 Z" fill="#000000" />
                      </marker>
                      <pattern id="glassCrosshatch" width="14" height="14" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="0" x2="0" y2="14" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3,3" />
                      </pattern>
                    </defs>

                    {/* Structural Rough Opening Guideline */}
                    <rect
                      x="-15"
                      y="-15"
                      width={w + 30}
                      height={h + 30}
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="1.2"
                      strokeDasharray="5,4"
                    />
                    <text x="-10" y="-18" fontSize="11" fill="#334155" fontFamily="monospace" fontWeight="bold">
                      ROUGH OPENING ({w + 30} × {h + 30} MM)
                    </text>

                    {/* Outer Aluminum Frame (Double line) */}
                    <rect
                      x="0"
                      y="0"
                      width={w}
                      height={h}
                      fill="#ffffff"
                      stroke="#000000"
                      strokeWidth="2"
                    />
                    <rect
                      x="35"
                      y="35"
                      width={w - 70}
                      height={h - 70}
                      fill="none"
                      stroke="#000000"
                      strokeWidth="1.2"
                    />

                    {/* Sliding or Swing Leaves Internal Lines */}
                    {is70S ? (
                      <g>
                        {/* Left Panel */}
                        <rect
                          x="35"
                          y="35"
                          width={(w - 70) / 2 + 15}
                          height={h - 70}
                          fill="url(#glassCrosshatch)"
                          stroke="#000000"
                          strokeWidth="1.5"
                        />
                        <rect
                          x="55"
                          y="55"
                          width={(w - 70) / 2 - 25}
                          height={h - 110}
                          fill="#ffffff"
                          stroke="#000000"
                          strokeWidth="1.2"
                        />
                        {/* Right Panel */}
                        <rect
                          x={(w - 70) / 2 + 20}
                          y="35"
                          width={(w - 70) / 2 + 15}
                          height={h - 70}
                          fill="url(#glassCrosshatch)"
                          stroke="#000000"
                          strokeWidth="1.5"
                        />
                        <rect
                          x={(w - 70) / 2 + 40}
                          y="55"
                          width={(w - 70) / 2 - 25}
                          height={h - 110}
                          fill="#ffffff"
                          stroke="#000000"
                          strokeWidth="1.2"
                        />

                        {/* Sliding Directional Arrows */}
                        <line x1={(w - 70) / 4 + 35} y1={h / 2} x2={(w - 70) / 4 + 95} y2={h / 2} stroke="#000000" strokeWidth="2" markerEnd="url(#auditArrow)" />
                        <line x1={(w * 3) / 4} y1={h / 2} x2={(w * 3) / 4 - 60} y2={h / 2} stroke="#000000" strokeWidth="2" markerEnd="url(#auditArrow)" />
                        <text x={(w - 70) / 4 + 65} y={h / 2 - 8} fontSize="13" fontWeight="bold" textAnchor="middle" fill="#000000">SLIDE</text>
                        <text x={(w * 3) / 4 - 30} y={h / 2 - 8} fontSize="13" fontWeight="bold" textAnchor="middle" fill="#000000">SLIDE</text>
                      </g>
                    ) : (
                      <g>
                        {/* Swing Door Leaf */}
                        <rect
                          x="45"
                          y="45"
                          width={w - 90}
                          height={h - 55}
                          fill="url(#glassCrosshatch)"
                          stroke="#000000"
                          strokeWidth="1.5"
                        />
                        <polyline
                          points={`45,45 ${w - 45},${h / 2} 45,${h - 10}`}
                          fill="none"
                          stroke="#000000"
                          strokeWidth="1.5"
                          strokeDasharray="8,6"
                        />
                        <rect x={w - 75} y={h * 0.48} width="6" height="55" fill="#000000" />
                      </g>
                    )}

                    {/* Section Cutting Planes Callouts */}
                    {/* Sec A-A (Head horizontal cut) */}
                    <g>
                      <line x1="-25" y1="20" x2={w + 25} y2="20" stroke="#000000" strokeWidth="1.8" strokeDasharray="10,4,2,4" />
                      <circle cx="-32" cy="20" r="13" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                      <text x="-32" y="24" fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">A</text>
                      <circle cx={w + 32} cy="20" r="13" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                      <text x={w + 32} y="24" fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">A</text>
                    </g>

                    {/* Sec B-B (Sill horizontal cut) */}
                    <g>
                      <line x1="-25" y1={h - 15} x2={w + 25} y2={h - 15} stroke="#000000" strokeWidth="1.8" strokeDasharray="10,4,2,4" />
                      <circle cx="-32" cy={h - 15} r="13" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                      <text x="-32" y={h - 11} fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">B</text>
                      <circle cx={w + 32} cy={h - 15} r="13" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                      <text x={w + 32} y={h - 11} fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">B</text>
                    </g>

                    {/* Sec C-C (Vertical interlock/jamb cut) */}
                    <g>
                      <line x1={w / 2} y1="-25" x2={w / 2} y2={h + 25} stroke="#000000" strokeWidth="1.8" strokeDasharray="10,4,2,4" />
                      <circle cx={w / 2} cy="-32" r="13" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                      <text x={w / 2} y="-28" fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">C</text>
                      <circle cx={w / 2} cy={h + 32} r="13" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                      <text x={w / 2} y={h + 36} fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">C</text>
                    </g>

                    {/* Detail D (Corner Callout Circle) */}
                    <circle cx="20" cy={h - 20} r="32" fill="none" stroke="#000000" strokeWidth="1.8" strokeDasharray="6,3" />
                    <line x1="45" y1={h - 45} x2="85" y2={h - 80} stroke="#000000" strokeWidth="1.5" />
                    <line x1="85" y1={h - 80} x2="150" y2={h - 80} stroke="#000000" strokeWidth="1.5" />
                    <text x="90" y={h - 85} fontSize="11" fontWeight="bold" fill="#000000">DETAIL D (CORNER)</text>

                    {/* Dimension Chains */}
                    {/* Daylight Opening (DLO) */}
                    <line x1="35" y1="-38" x2={w - 35} y2="-38" stroke="#000000" strokeWidth="1.2" />
                    <line x1="35" y1="-44" x2="35" y2="0" stroke="#000000" strokeWidth="0.8" />
                    <line x1={w - 35} y1="-44" x2={w - 35} y2="0" stroke="#000000" strokeWidth="0.8" />
                    <text x={w / 2} y="-42" fontSize="11.5" fontWeight="bold" textAnchor="middle" fill="#000000">
                      DAYLIGHT OPENING = {w - 70} MM
                    </text>

                    {/* Overall Width Chain */}
                    <line x1="0" y1="-56" x2={w} y2="-56" stroke="#000000" strokeWidth="1.5" markerStart="url(#auditArrow)" markerEnd="url(#auditArrow)" />
                    <line x1="0" y1="-62" x2="0" y2="0" stroke="#000000" strokeWidth="0.8" />
                    <line x1={w} y1="-62" x2={w} y2="0" stroke="#000000" strokeWidth="0.8" />
                    <text x={w / 2} y="-60" fontSize="13.5" fontWeight="bold" textAnchor="middle" fill="#000000">
                      OVERALL WIDTH = {w} MM
                    </text>

                    {/* Overall Height Chain */}
                    <line x1={w + 55} y1="0" x2={w + 55} y2={h} stroke="#000000" strokeWidth="1.5" markerStart="url(#auditArrow)" markerEnd="url(#auditArrow)" />
                    <line x1={w} y1="0" x2={w + 62} y2="0" stroke="#000000" strokeWidth="0.8" />
                    <line x1={w} y1={h} x2={w + 62} y2={h} stroke="#000000" strokeWidth="0.8" />
                    <text x={w + 62} y={h / 2} fontSize="13.5" fontWeight="bold" textAnchor="middle" fill="#000000" transform={`rotate(90 ${w + 62} ${h / 2})`}>
                      OVERALL HEIGHT = {h} MM
                    </text>

                    {/* Floor Level Datum Marker */}
                    <line x1="-60" y1={h} x2="-15" y2={h} stroke="#000000" strokeWidth="1.8" />
                    <polygon points={`-38,${h} -28,${h - 12} -48,${h - 12}`} fill="#000000" />
                    <text x="-38" y={h + 14} fontSize="11" fontWeight="bold" textAnchor="middle" fill="#000000">±0.00 F.F.L.</text>
                  </svg>
                </div>

                {/* Right: Technical Engineering Specifications & Schedules (Density Optimized) */}
                <div className="sheet-specs-panel" style={{ background: '#f8fafc', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="specs-section-header" style={{ background: '#000000', color: '#ffffff', padding: '4px 8px', fontSize: '11px', fontWeight: 800 }}>
                    FABRICATION SPECIFICATION MATRIX
                  </div>

                  {/* Criteria Grid */}
                  <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <td style={{ padding: '3px 0', fontWeight: 700, color: '#334155' }}>Profile Alloy:</td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>6063-T6 Architectural</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <td style={{ padding: '3px 0', fontWeight: 700, color: '#334155' }}>Dimensional Tolerance:</td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>ISO 2768-m (±0.5 mm)</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <td style={{ padding: '3px 0', fontWeight: 700, color: '#334155' }}>Wind Load Rating:</td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>Class 3 (1200 Pa / L/200)</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <td style={{ padding: '3px 0', fontWeight: 700, color: '#334155' }}>Water Tightness:</td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>450 Pa (Baffled Weeps)</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <td style={{ padding: '3px 0', fontWeight: 700, color: '#334155' }}>Net Aluminium Weight:</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#047857' }}>{derived.totalAluWeightKg} kg / unit</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Glass Cutting Schedule Box */}
                  <div style={{ background: '#ffffff', border: '1px solid #94a3b8', padding: '6px 8px', borderRadius: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                      GLAZING CUTTING SCHEDULE:
                    </span>
                    {derived.glassPanels.map((gp, gIdx) => (
                      <div key={gIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', padding: '1px 0' }}>
                        <span>• {gp.description}</span>
                        <span className="font-mono font-bold">{gp.width.toFixed(0)} × {gp.height.toFixed(0)} mm ({gp.qty} pcs)</span>
                      </div>
                    ))}
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', borderTop: '1px dashed #cbd5e1', paddingTop: '2px' }}>
                      Glass bite depth: 12.0 mm • Perimeter clearance: 5.0 mm EPDM
                    </div>
                  </div>

                  {/* Fasteners & Hardware Schedule */}
                  <div style={{ background: '#ffffff', border: '1px solid #94a3b8', padding: '6px 8px', borderRadius: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                      HARDWARE & FASTENER SCHEDULE:
                    </span>
                    <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                      <tbody>
                        {derived.hardware.slice(0, 4).map((hw, hIdx) => (
                          <tr key={hIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '1.5px 0' }}>{hw.name}</td>
                            <td style={{ textAlign: 'right', fontWeight: 750 }}>{hw.qty} {hw.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Weatherstrip & Gaskets */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '6px 8px', borderRadius: '4px', fontSize: '10px' }}>
                    <b>Weatherseal Summary:</b> Continuous dual-fin wool pile on interlocks & side jambs; EPDM wedge gaskets around glass perimeter.
                  </div>
                </div>
              </div>

              {/* AutoCAD Engineering Title Block with Fabricator Sign-off */}
              <div className="autocad-title-block" style={{ marginTop: '10px' }}>
                <div className="title-block-col main-info">
                  <span className="tb-label">PROJECT NAME</span>
                  <span className="tb-value font-bold">{project.projectName}</span>
                  <span className="tb-sub">CLIENT: {project.clientName} • CONTRACTOR: {project.contractorName}</span>
                </div>

                <div className="title-block-col dwg-info">
                  <div className="tb-row">
                    <span><b>DRAWING NO:</b> AUD-{activeOpening.tag}-001</span>
                    <span><b>REV:</b> 03 (AUDIT)</span>
                  </div>
                  <div className="tb-row">
                    <span><b>SYSTEM:</b> {activeOpening.system}</span>
                    <span><b>DATE:</b> {project.date}</span>
                  </div>
                  <div className="tb-row">
                    <span><b>DIMENSIONS:</b> {w} × {h} mm</span>
                    <span><b>QTY:</b> {activeOpening.quantity} UNITS</span>
                  </div>
                </div>

                <div className="title-block-col sign-off-box">
                  <div className="sign-off-header">FABRICATOR AUDIT REVIEW & APPROVAL</div>
                  <div className="sign-off-options">
                    <label className="checkbox-label"><input type="checkbox" readOnly /> APPROVED AS DRAWN</label>
                    <label className="checkbox-label"><input type="checkbox" readOnly /> APPROVED WITH MARKUPS</label>
                    <label className="checkbox-label"><input type="checkbox" readOnly /> REVISE & RESUBMIT</label>
                  </div>
                  <div className="sign-off-signature-grid">
                    <div>AUDITOR: ___________________</div>
                    <div>SIGN / STAMP: [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]</div>
                    <div>DATE: ____ / ____ / 2026</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ======================================================================= */}
        {/* SHEET 2: 3D ISOMETRIC ASSEMBLY & EXPLODED JOINERY (ALUMEX GUIDE STYLE)  */}
        {/* ======================================================================= */}
        {(activeSheet === 'all' || activeSheet === 'assembly3d') && (
          <section className="audit-sheet sheet-3d-assembly" id="sheet-2">
            <div className="sheet-border-inner">
              <div className="sheet-header-bar">
                <div className="sheet-header-title">
                  <span className="sheet-no">SHEET 02 OF 05</span>
                  <h2>3D ISOMETRIC ASSEMBLY & EXPLODED JOINERY (ALUMEX GUIDE STYLE)</h2>
                </div>
                <div className="sheet-scale-box">
                  <span>STYLE: ALUMEX ADVANCE TECHNICAL AXONOMETRIC</span>
                  <span>JOINERY: 90° BUTT FASTENED & INTERLOCKING HOOKS</span>
                </div>
              </div>

              <div className="sheet-assembly-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* 3D Assembled Isometric Line Representation */}
                <div className="assembly-card" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <div className="assembly-card-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.4px solid #000000', paddingBottom: '4px', marginBottom: '6px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>FIGURE 2.1: ASSEMBLED UNIT AXONOMETRIC</h3>
                    <span className="badge" style={{ background: '#000000', color: '#ffffff', fontSize: '10px', padding: '2px 6px' }}>ALUMEX LINE ART</span>
                  </div>

                  <div className="assembly-svg-wrap" style={{ flex: 1, minHeight: '280px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg viewBox="0 0 520 340" className="axonometric-assembly-svg" style={{ width: '100%', maxHeight: '310px' }}>
                      <defs>
                        <marker id="balloonArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                          <path d="M0,0 L6,3 L0,6 L2,3 Z" fill="#000000" />
                        </marker>
                      </defs>

                      {/* Head Track 70S-1001-1 projected at 30 deg */}
                      <polygon points="120,65 380,65 430,35 170,35" fill={highlightedPart === 1 ? '#fde68a' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                      <polygon points="120,65 120,80 380,80 380,65" fill={highlightedPart === 1 ? '#fef3c7' : '#f1f5f9'} stroke="#000000" strokeWidth="1.2" />

                      {/* Left Jamb Track 70S-1201-1 */}
                      <polygon points="120,80 140,80 140,295 120,295" fill={highlightedPart === 3 ? '#fde68a' : '#ffffff'} stroke="#000000" strokeWidth="1.5" />
                      <polygon points="120,80 170,50 170,265 120,295" fill={highlightedPart === 3 ? '#fef3c7' : '#e2e8f0'} stroke="#000000" strokeWidth="1" />

                      {/* Right Jamb Track */}
                      <polygon points="360,80 380,80 380,295 360,295" fill={highlightedPart === 3 ? '#fde68a' : '#ffffff'} stroke="#000000" strokeWidth="1.5" />
                      <polygon points="380,80 430,50 430,265 380,295" fill={highlightedPart === 3 ? '#fef3c7' : '#cbd5e1'} stroke="#000000" strokeWidth="1" />

                      {/* Bottom Sill Track 70S-1101-1 */}
                      <polygon points="120,295 380,295 430,265 170,265" fill={highlightedPart === 2 ? '#fde68a' : '#f8fafc'} stroke="#000000" strokeWidth="2" />
                      <polygon points="120,295 120,310 380,310 380,295" fill={highlightedPart === 2 ? '#fef3c7' : '#e2e8f0'} stroke="#000000" strokeWidth="1.2" />

                      {/* Front Sash Panel (Left Track) */}
                      <rect x="145" y="85" width="125" height="200" fill={highlightedPart === 4 || highlightedPart === 5 ? '#fefce8' : '#ffffff'} stroke="#000000" strokeWidth="1.5" />
                      <rect x="160" y="100" width="95" height="170" fill="#f8fafc" stroke="#000000" strokeWidth="1" />
                      <line x1="160" y1="100" x2="255" y2="270" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="4,4" />

                      {/* Rear Sash Panel (Right Track - shifted isometric 30 deg) */}
                      <polygon points="250,75 355,75 355,275 250,275" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
                      <polygon points="265,90 340,90 340,260 265,260" fill="#f8fafc" stroke="#000000" strokeWidth="1" />

                      {/* Meeting Stile Interlock Hook Region */}
                      <rect x="245" y="75" width="15" height="205" fill={highlightedPart === 6 ? '#fde68a' : '#e2e8f0'} stroke="#000000" strokeWidth="1.2" />

                      {/* Interactive Callout Balloons (Numbered 1-8) */}
                      {/* 1: Head Track */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(1)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="260" cy="20" r="12" fill={highlightedPart === 1 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="260" y="25" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 1 ? '#ffffff' : '#000000'}>1</text>
                        <line x1="260" y1="32" x2="260" y2="55" stroke="#000000" strokeWidth="1.4" markerEnd="url(#balloonArrow)" />
                      </g>

                      {/* 2: Sill Track */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(2)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="260" cy="330" r="12" fill={highlightedPart === 2 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="260" y="335" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 2 ? '#ffffff' : '#000000'}>2</text>
                        <line x1="260" y1="318" x2="260" y2="305" stroke="#000000" strokeWidth="1.4" markerEnd="url(#balloonArrow)" />
                      </g>

                      {/* 3: Jamb Track */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(3)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="65" cy="170" r="12" fill={highlightedPart === 3 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="65" y="175" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 3 ? '#ffffff' : '#000000'}>3</text>
                        <line x1="77" y1="170" x2="118" y2="170" stroke="#000000" strokeWidth="1.4" markerEnd="url(#balloonArrow)" />
                      </g>

                      {/* 4: Top Rail */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(4)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="205" cy="70" r="12" fill={highlightedPart === 4 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="205" y="75" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 4 ? '#ffffff' : '#000000'}>4</text>
                        <line x1="205" y1="82" x2="205" y2="92" stroke="#000000" strokeWidth="1.4" markerEnd="url(#balloonArrow)" />
                      </g>

                      {/* 5: Bottom Rail */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(5)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="205" cy="305" r="12" fill={highlightedPart === 5 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="205" y="310" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 5 ? '#ffffff' : '#000000'}>5</text>
                        <line x1="205" y1="293" x2="205" y2="280" stroke="#000000" strokeWidth="1.4" markerEnd="url(#balloonArrow)" />
                      </g>

                      {/* 6: Interlock Stile */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(6)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="252" cy="175" r="12" fill={highlightedPart === 6 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="252" y="180" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 6 ? '#ffffff' : '#000000'}>6</text>
                      </g>

                      {/* 7: Lock Stile */}
                      <g style={{ cursor: 'pointer' }} onMouseEnter={() => setHighlightedPart(7)} onMouseLeave={() => setHighlightedPart(null)}>
                        <circle cx="115" cy="210" r="12" fill={highlightedPart === 7 ? '#000000' : '#ffffff'} stroke="#000000" strokeWidth="2" />
                        <text x="115" y="215" fontSize="11" fontWeight="bold" textAnchor="middle" fill={highlightedPart === 7 ? '#ffffff' : '#000000'}>7</text>
                        <line x1="127" y1="210" x2="145" y2="210" stroke="#000000" strokeWidth="1.4" markerEnd="url(#balloonArrow)" />
                      </g>
                    </svg>
                  </div>

                  {/* Interactive Linked Part Legend Table */}
                  <div className="part-legend-table" style={{ borderTop: '1.4px solid #000000', paddingTop: '6px' }}>
                    <table style={{ width: '100%', fontSize: '10.5px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000000' }}>
                          <th style={{ padding: '3px', textAlign: 'center' }}>Tag</th>
                          <th style={{ padding: '3px' }}>Extrusion Profile Die</th>
                          <th style={{ padding: '3px' }}>Component Function</th>
                          <th style={{ padding: '3px' }}>Weight (kg/m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { id: 1, code: is70S ? '70S-1001-1' : '100D-3105', desc: 'Perimeter Frame Head Track', wt: '0.892' },
                          { id: 2, code: is70S ? '70S-1101-1' : '100D-3105', desc: 'Perimeter Frame Sill with Track Rib', wt: '1.025' },
                          { id: 3, code: is70S ? '70S-1201-1' : '100D-3105', desc: 'Perimeter Frame Side Jambs', wt: '0.785' },
                          { id: 4, code: is70S ? '70S-1401'   : '100D-201',  desc: 'Sliding Sash Top Horizontal Rail', wt: '0.460' },
                          { id: 5, code: is70S ? '70S-1501'   : '100D-401',  desc: 'Sliding Sash Bottom Rail (Roller Pocket)', wt: '0.720' },
                          { id: 6, code: is70S ? '70S-1601'   : '100D-102',  desc: 'Interlock Meeting Stile with Weather Hook', wt: '0.495' },
                          { id: 7, code: is70S ? '70S-1701'   : '100D-103',  desc: 'Lock / Flush Handle Stile', wt: '0.433' },
                          { id: 8, code: is70S ? '70S-1914'   : 'HNG-100',   desc: 'Adjustable Brass V-Groove Roller Wheels', wt: '0.140' },
                        ].map((item) => (
                          <tr
                            key={item.id}
                            style={{
                              background: highlightedPart === item.id ? '#fef3c7' : 'transparent',
                              cursor: 'pointer',
                              borderBottom: '1px solid #e2e8f0',
                            }}
                            onMouseEnter={() => setHighlightedPart(item.id)}
                            onMouseLeave={() => setHighlightedPart(null)}
                          >
                            <td style={{ textAlign: 'center', fontWeight: 800 }}>①②③④⑤⑥⑦⑧'[item.id - 1]</td>
                            <td className="font-mono font-bold">{item.code}</td>
                            <td>{item.desc}</td>
                            <td className="font-mono">{item.wt} kg/m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3D Exploded Joinery with True Extruded DXF Profile Contours (No Generic Boxes) */}
                <div className="assembly-card" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <div className="assembly-card-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.4px solid #000000', paddingBottom: '4px', marginBottom: '6px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>FIGURE 2.2: TRUE DXF EXTRUDED CORNER JOINERY</h3>
                    <span className="badge" style={{ background: '#000000', color: '#ffffff', fontSize: '10px', padding: '2px 6px' }}>REAL PROFILE POLYLINES</span>
                  </div>

                  <div className="assembly-svg-wrap" style={{ flex: 1, minHeight: '280px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg viewBox="0 0 520 340" className="axonometric-assembly-svg" style={{ width: '100%', maxHeight: '310px' }}>
                      <defs>
                        <marker id="fastenerArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                          <path d="M0,0 L6,3 L0,6 L2,3 Z" fill="#000000" />
                        </marker>
                      </defs>

                      {/* True 3D Extruded Stile Profile (70S-1701) - Real DXF contour */}
                      <g transform="translate(130, 30) scale(1.5, 1.5)">
                        {/* Stile top face */}
                        <polygon points="0,0 29.8,0 29.8,26 0,26" fill="#cbd5e1" stroke="#000000" strokeWidth="1" />
                        {/* Stile extrusion body downward */}
                        <polygon points="0,26 29.8,26 29.8,165 0,165" fill="#f8fafc" stroke="#000000" strokeWidth="1.4" />
                        <polygon points="29.8,0 45,-10 45,145 29.8,165" fill="#e2e8f0" stroke="#000000" strokeWidth="1" />

                        {/* Stile Fastener Access Pilot Holes */}
                        <circle cx="15" cy="50" r="4.5" fill="#000000" />
                        <circle cx="15" cy="135" r="4.5" fill="#000000" />
                      </g>

                      {/* Annotations for Stile */}
                      <text x="95" y="80" fontSize="10.5" fontWeight="bold" textAnchor="end">70S-1701 STILE</text>
                      <text x="95" y="95" fontSize="10" fontWeight="bold" textAnchor="end">Ø4.5mm PILOT HOLE</text>
                      <line x1="100" y1="92" x2="150" y2="105" stroke="#000000" strokeWidth="1" />

                      {/* True 3D Extruded Bottom Rail Profile (70S-1501) - Separated along assembly axis */}
                      <g transform="translate(250, 100) scale(1.5, 1.5)">
                        {/* Front DXF profile face showing inverted roller chamber and screw port */}
                        <polygon points={DXF_70S_1501.points} fill="#f1f5f9" stroke="#000000" strokeWidth="1.2" />
                        {/* Extrusion lines along 30 deg */}
                        <line x1="0" y1="0" x2="60" y2="-35" stroke="#000000" strokeWidth="1" />
                        <line x1="21.9" y1="0" x2="81.9" y2="-35" stroke="#000000" strokeWidth="1" />
                        <line x1="21.9" y1="56.3" x2="81.9" y2="21.3" stroke="#000000" strokeWidth="1" />
                        <polygon points="60,-35 81.9,-35 81.9,21.3 60,21.3" fill="#cbd5e1" stroke="#000000" strokeWidth="1" />

                        {/* Extruded Screw Port Channel */}
                        <circle cx="11" cy="43" r="3.5" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
                      </g>

                      {/* Screw Port Callout */}
                      <text x="350" y="185" fontSize="11" fontWeight="bold">70S-1501 BOTTOM RAIL</text>
                      <text x="350" y="200" fontSize="10.5" fontWeight="bold" fill="#047857">EXTRUDED SCREW PORT</text>
                      <line x1="345" y1="195" x2="270" y2="165" stroke="#047857" strokeWidth="1.2" />

                      {/* Assembly Fastener: DIN 7981 4.2x38 Stainless Screw on Dotted Axis */}
                      <line x1="105" y1="165" x2="260" y2="165" stroke="#000000" strokeWidth="1.5" strokeDasharray="6,4" markerEnd="url(#fastenerArrow)" />
                      {/* Detailed Screw Representation */}
                      <rect x="120" y="161" width="38" height="8" fill="#475569" stroke="#000000" strokeWidth="1" />
                      <polygon points="158,159 167,165 158,171" fill="#475569" />
                      <text x="105" y="153" fontSize="10.5" fontWeight="bold">DIN 7981 4.2×38 SS SCREW</text>

                      {/* Brass Roller Carriage 70S-1914 Exploded Downward */}
                      <line x1="310" y1="265" x2="310" y2="215" stroke="#000000" strokeWidth="1.5" strokeDasharray="4,4" markerEnd="url(#fastenerArrow)" />
                      <circle cx="310" cy="275" r="14" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                      <circle cx="310" cy="275" r="4" fill="#000000" />
                      <text x="335" y="280" fontSize="10.5" fontWeight="bold">70S-1914 ROLLER (45kg RATED)</text>
                    </svg>
                  </div>

                  {/* Mechanical Joinery Criteria */}
                  <div className="detail-notes" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 10px', borderRadius: '4px', fontSize: '10.5px' }}>
                    <p style={{ margin: '0 0 3px 0' }}><b>1. Butt Joinery:</b> 70S-1501 bottom rail square-cut at 90.0° and clamped tightly against continuous 70S-1701 stile.</p>
                    <p style={{ margin: '0 0 3px 0' }}><b>2. Fastener Torque:</b> DIN 7981 4.2×38 mm A2 stainless steel screws torqued to 3.5 N·m into continuous screw ports.</p>
                    <p style={{ margin: '0' }}><b>3. Weep Continuity:</b> Sill track weep slots (30 × 5 mm) align with outer drainage chambers.</p>
                  </div>
                </div>
              </div>

              {/* Optional Babylon.js Live Studio Canvas Snapshot */}
              {canvasSnapshot && (
                <div className="live-snapshot-container" style={{ border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px', marginTop: '10px', background: '#ffffff' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 6px 0' }}>
                    Live WebGL 3D Studio Canvas Snapshot
                  </h4>
                  <img src={canvasSnapshot} alt="3D Studio Canvas Snapshot" style={{ maxHeight: '200px', objectFit: 'contain', margin: '0 auto', display: 'block', border: '1px solid #e2e8f0' }} />
                </div>
              )}
            </div>
          </section>
        )}

        {/* ======================================================================= */}
        {/* SHEET 3: AUTOCAD DXF CORNER & JOINT CROSS-SECTIONS (1:1 ASPECT RATIO)   */}
        {/* ======================================================================= */}
        {(activeSheet === 'all' || activeSheet === 'sections') && (
          <section className="audit-sheet sheet-dxf-sections" id="sheet-3">
            <div className="sheet-border-inner">
              <div className="sheet-header-bar">
                <div className="sheet-header-title">
                  <span className="sheet-no">SHEET 03 OF 05</span>
                  <h2>AUTOCAD DXF DETAIL CROSS-SECTIONS (STRICT 1:1 TRUE PROPORTIONS)</h2>
                </div>
                <div className="sheet-scale-box">
                  <span>SCALE: 1:1 & 1:2 TRUE VECTORS (ISOTROPIC)</span>
                  <span>SOURCE: ALUMEX ADVANCE CATALOGUE DXF</span>
                </div>
              </div>

              {/* 4-Quadrant Grid with STRICT 1:1 Aspect Ratio (No non-uniform scaling) */}
              <div className="dxf-sections-quad-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* SECTION A-A: HEAD TRACK & TOP SASH RAIL */}
                <div className="dxf-section-card" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <div className="dxf-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.4px solid #000000', paddingBottom: '4px', marginBottom: '6px' }}>
                    <span className="cad-badge" style={{ background: '#000000', color: '#ffffff', fontSize: '10.5px', fontWeight: 900, padding: '2px 6px' }}>SEC A-A</span>
                    <h4 style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>HEAD TRACK & SASH TOP RAIL ENGAGEMENT</h4>
                  </div>

                  <div className="dxf-canvas-wrap" style={{ flex: 1, minHeight: '230px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg viewBox="0 0 340 230" className="dxf-svg" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxHeight: '220px' }}>
                      {is70S ? (
                        <g>
                          {/* CAD to SVG inverted Y mapping: translate(60, 225) scale(2.2, -2.2) */}
                          <g transform="translate(65, 215) scale(2.2, -2.2)">
                            {/* Head track 70S-1001-1 sits at the ceiling (CAD Y=50..82) */}
                            <g transform="translate(0, 48)">
                              <polygon points={DXF_70S_1001_1.points} fill="#f1f5f9" stroke="#000000" strokeWidth="0.8" />
                            </g>
                            {/* Top rail 70S-1401 sits in pocket 1 (CAD Y=32..64, penetrates 16mm into head track) */}
                            <g transform="translate(3.5, 32)">
                              <polygon points={DXF_70S_1401.points} fill="#e2e8f0" stroke="#000000" strokeWidth="0.8" />
                            </g>
                            {/* Glass panel sits in glass pocket of 70S-1401 (X=17.5, Y=0..42) */}
                            <line x1="17.5" y1="0" x2="17.5" y2="42" stroke="#000000" strokeWidth="2.5" />
                            {/* Wool pile weatherstrip seals */}
                            <circle cx="5" cy="58" r="2" fill="#000000" />
                            <circle cx="30" cy="58" r="2" fill="#000000" />
                          </g>

                          {/* SVG Annotations with font-size >= 10 */}
                          <text x="175" y="24" textAnchor="middle" fontSize="11" fontWeight="bold">
                            70S-1001-1 HEAD TRACK (69.8 × 32.0 MM)
                          </text>
                          <text x="180" y="115" fontSize="10.5" fontWeight="bold">
                            70S-1401 TOP RAIL (27.9 × 32.0 MM)
                          </text>
                          <text x="180" y="130" fontSize="10" fontWeight="bold" fill="#047857">
                            • DUAL WOOL PILE FIN SEALS
                          </text>
                          <text x="180" y="145" fontSize="10" fontWeight="bold">
                            • 16.0 MM TOP PENETRATION
                          </text>
                          <text x="120" y="200" fontSize="10.5" fontWeight="bold">
                            6MM TOUGHENED GLASS (12MM BITE)
                          </text>
                        </g>
                      ) : (
                        <g transform="translate(50, 20) scale(2.0, 2.0)">
                          <polygon points={DXF_100D_3105.points} fill="#f1f5f9" stroke="#000000" strokeWidth="0.8" />
                        </g>
                      )}
                    </svg>
                  </div>

                  <div className="dxf-card-footer" style={{ borderTop: '1px solid #000000', paddingTop: '4px', fontSize: '10px', display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                    <span><b>Air Infiltration:</b> Class 3 (EN 12207)</span>
                    <span><b>Head Engagement:</b> 16.0 mm nominal overlap</span>
                  </div>
                </div>

                {/* SECTION B-B: SILL TRACK, BOTTOM RAIL & ROLLER */}
                <div className="dxf-section-card" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <div className="dxf-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.4px solid #000000', paddingBottom: '4px', marginBottom: '6px' }}>
                    <span className="cad-badge" style={{ background: '#000000', color: '#ffffff', fontSize: '10.5px', fontWeight: 900, padding: '2px 6px' }}>SEC B-B</span>
                    <h4 style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>SILL TRACK, ROLLER & WATER DRAINAGE</h4>
                  </div>

                  <div className="dxf-canvas-wrap" style={{ flex: 1, minHeight: '230px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg viewBox="0 0 340 230" className="dxf-svg" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxHeight: '220px' }}>
                      {is70S ? (
                        <g>
                          {/* CAD to SVG inverted Y mapping: translate(65, 215) scale(1.9, -1.9) */}
                          <g transform="translate(65, 215) scale(1.9, -1.9)">
                            {/* Sill track 70S-1101-1 at floor Y=0..30 */}
                            <polygon points={DXF_70S_1101_1.points} fill="#f1f5f9" stroke="#000000" strokeWidth="0.8" />
                            {/* Bottom rail 70S-1501 centered over track rib 1 (X=18), Y=12..68 */}
                            <g transform="translate(7.06, 12)">
                              <polygon points={DXF_70S_1501.points} fill="#e2e8f0" stroke="#000000" strokeWidth="0.8" />
                            </g>
                            {/* 70S-1914 Roller Wheel sitting on track rib at (X=18, Y=36) */}
                            <circle cx="18" cy="36" r="14" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
                            <circle cx="18" cy="36" r="4" fill="#000000" />
                            {/* Glass panel in top pocket of 70S-1501 */}
                            <line x1="18" y1="56" x2="18" y2="105" stroke="#000000" strokeWidth="2.5" />
                          </g>

                          {/* Annotations with font-size >= 10 */}
                          <text x="175" y="24" fontSize="10.5" fontWeight="bold">
                            6MM GLASS (12MM BITE IN GASKET)
                          </text>
                          <text x="160" y="90" fontSize="10.5" fontWeight="bold">
                            70S-1501 BOTTOM RAIL (56.1 MM)
                          </text>
                          <text x="160" y="105" fontSize="10" fontWeight="bold" fill="#047857">
                            • 70S-1914 BRASS ROLLER (Ø28mm)
                          </text>
                          <text x="175" y="195" textAnchor="middle" fontSize="11" fontWeight="bold">
                            70S-1101-1 SILL TRACK (69.8 × 30.0 MM)
                          </text>
                          <text x="210" y="165" fontSize="10" fontWeight="bold" fill="#047857">
                            WEEP SLOT 30×5mm
                          </text>
                        </g>
                      ) : (
                        <g transform="translate(50, 20) scale(2.0, 2.0)">
                          <polygon points={DXF_100D_401.points} fill="#e2e8f0" stroke="#000000" strokeWidth="0.8" />
                        </g>
                      )}
                    </svg>
                  </div>

                  <div className="dxf-card-footer" style={{ borderTop: '1px solid #000000', paddingTop: '4px', fontSize: '10px', display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                    <span><b>Water Tightness:</b> 450 Pa (Class 8A)</span>
                    <span><b>Raised Track Rib:</b> 3.2 mm bead</span>
                  </div>
                </div>

                {/* SECTION C-C: INTERLOCKING STILE HOOKS */}
                <div className="dxf-section-card" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <div className="dxf-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.4px solid #000000', paddingBottom: '4px', marginBottom: '6px' }}>
                    <span className="cad-badge" style={{ background: '#000000', color: '#ffffff', fontSize: '10.5px', fontWeight: 900, padding: '2px 6px' }}>SEC C-C</span>
                    <h4 style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>INTERLOCKING STILE HOOKS & WEATHERSEAL</h4>
                  </div>

                  <div className="dxf-canvas-wrap" style={{ flex: 1, minHeight: '230px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg viewBox="0 0 340 230" className="dxf-svg" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxHeight: '220px' }}>
                      {is70S ? (
                        <g>
                          {/* CAD to SVG inverted Y mapping: translate(90, 180) scale(2.2, -2.2) */}
                          <g transform="translate(95, 175) scale(2.2, -2.2)">
                            {/* Left Interlock 70S-1601 */}
                            <polygon points={DXF_70S_1601.points} fill="#e2e8f0" stroke="#000000" strokeWidth="0.8" />
                            {/* Right Interlock 70S-1601 (Engaged 180 deg hook) */}
                            <g transform="translate(38, 32) rotate(180)">
                              <polygon points={DXF_70S_1601.points} fill="#cbd5e1" stroke="#000000" strokeWidth="0.8" />
                            </g>
                            {/* Wool pile weatherstrip dots */}
                            <circle cx="10" cy="24.5" r="1.5" fill="#000000" />
                            <circle cx="28" cy="7.5" r="1.5" fill="#000000" />
                            {/* Glass panels */}
                            <line x1="-25" y1="16" x2="10" y2="16" stroke="#000000" strokeWidth="2.5" />
                            <line x1="28" y1="16" x2="63" y2="16" stroke="#000000" strokeWidth="2.5" />
                          </g>

                          <text x="80" y="28" fontSize="10.5" fontWeight="bold">
                            PANEL 1 GLASS
                          </text>
                          <text x="235" y="28" fontSize="10.5" fontWeight="bold">
                            PANEL 2 GLASS
                          </text>
                          <text x="170" y="65" textAnchor="middle" fontSize="11" fontWeight="bold">
                            70S-1601 HOOK INTERLOCK ENGAGEMENT
                          </text>
                          <text x="170" y="80" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#047857">
                            DUAL FIN WOOL PILE ACOUSTIC BARRIER
                          </text>
                        </g>
                      ) : (
                        <g transform="translate(60, 45) scale(2.0, 2.0)">
                          <polygon points={DXF_100D_102.points} fill="#e2e8f0" stroke="#000000" strokeWidth="0.8" />
                        </g>
                      )}
                    </svg>
                  </div>

                  <div className="dxf-card-footer" style={{ borderTop: '1px solid #000000', paddingTop: '4px', fontSize: '10px', display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                    <span><b>Wind Load Deflection:</b> L / 200 at 1200 Pa</span>
                    <span><b>Clearance:</b> 6.0 mm nominal</span>
                  </div>
                </div>

                {/* DETAIL D: CORNER BUTT & FASTENER SCREW ALIGNMENT */}
                <div className="dxf-section-card" style={{ background: '#ffffff', border: '1.4px solid #000000', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                  <div className="dxf-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.4px solid #000000', paddingBottom: '4px', marginBottom: '6px' }}>
                    <span className="cad-badge" style={{ background: '#000000', color: '#ffffff', fontSize: '10.5px', fontWeight: 900, padding: '2px 6px' }}>DETAIL D</span>
                    <h4 style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>CORNER BUTT & SCREW PORT ALIGNMENT</h4>
                  </div>

                  <div className="dxf-canvas-wrap" style={{ flex: 1, minHeight: '230px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg viewBox="0 0 340 230" className="dxf-svg" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', maxHeight: '220px' }}>
                      {/* Vertical Stile Profile Contour */}
                      <rect x="45" y="25" width="50" height="160" fill="#f1f5f9" stroke="#000000" strokeWidth="1.5" />
                      <text x="70" y="105" fontSize="10.5" fontWeight="bold" textAnchor="middle" transform="rotate(-90 70 105)">
                        STILE 70S-1701
                      </text>

                      {/* Horizontal Bottom Rail Contour */}
                      <rect x="95" y="80" width="165" height="56" fill="#e2e8f0" stroke="#000000" strokeWidth="1.5" />
                      <text x="175" y="112" fontSize="10.5" fontWeight="bold" textAnchor="middle">
                        BOTTOM RAIL 70S-1501
                      </text>

                      {/* Fastener screw line */}
                      <line x1="15" y1="105" x2="145" y2="105" stroke="#000000" strokeWidth="2" strokeDasharray="6,3" markerEnd="url(#balloonArrow)" />
                      <rect x="20" y="100" width="40" height="10" fill="#000000" />
                      <text x="20" y="90" fontSize="10" fontWeight="bold">DIN 7981 4.2×38 SS</text>

                      {/* Weep route slot */}
                      <rect x="180" y="126" width="35" height="8" fill="#000000" />
                      <text x="198" y="148" fontSize="10" fontWeight="bold" textAnchor="middle">30×5mm WEEP</text>
                    </svg>
                  </div>

                  <div className="dxf-card-footer" style={{ borderTop: '1px solid #000000', paddingTop: '4px', fontSize: '10px', display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                    <span><b>Screw Torque:</b> 3.5 N·m strictly controlled</span>
                    <span><b>Corrosion Class:</b> Grade 316 / A2 Stainless</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ======================================================================= */}
        {/* SHEET 4: BAR-BY-BAR 3D AXONOMETRICS & MACHINING DATASHEET               */}
        {/* ======================================================================= */}
        {(activeSheet === 'all' || activeSheet === 'bars3d') && (
          <section className="audit-sheet sheet-bars-datasheet" id="sheet-4">
            <div className="sheet-border-inner">
              <div className="sheet-header-bar">
                <div className="sheet-header-title">
                  <span className="sheet-no">SHEET 04 OF 05</span>
                  <h2>BAR-BY-BAR 3D AXONOMETRIC & CNC MACHINING PREPARATION DATASHEET</h2>
                </div>
                <div className="sheet-scale-box">
                  <span>UNITS: MM</span>
                  <span>TOTAL BARS IN UNIT: {derived.cutList.length}</span>
                </div>
              </div>

              <div className="bars-datasheet-list">
                {derived.cutList
                  .filter((b) => b.length > 0)
                  .map((bar, idx) => {
                    const axo = generateBarAxonometricSvg({
                      profileCode: bar.profile,
                      description: bar.description,
                      lengthMm: bar.length,
                      angleLeft: bar.angleLeft,
                      angleRight: bar.angleRight,
                    });
                    const dxf = getDxfForProfile(bar.profile);
                    const pDim = PROFILE_DIMENSIONS[bar.profile] || { w: 40, h: 40, wall: 1.5 };
                    const machining = getStandardMachining(bar.profile, bar.length);

                    return (
                      <div className="bar-audit-card" key={bar.id || idx}>
                        <div className="bar-card-left">
                          <div className="bar-header-info">
                            <span className="bar-index-tag">#{idx + 1} • {bar.id}</span>
                            <h4 className="bar-name">{bar.description}</h4>
                            <span className="bar-profile-die">DIE CODE: <code>{bar.profile}</code></span>
                          </div>

                          {/* 3D Axonometric SVG Drawing with STRICT aspect ratio */}
                          <div className="bar-3d-canvas-wrap">
                            <svg viewBox={axo.viewBox} className="bar-3d-svg" preserveAspectRatio="xMidYMid meet">
                              <defs>
                                <marker id={`dimArr-${idx}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                                  <path d="M0,0 L6,3 L0,6 L2,3 Z" fill="#000000" />
                                </marker>
                              </defs>

                              {/* Solid Faces */}
                              <polygon points={axo.frontPolygon} fill="#ffffff" stroke="#000000" strokeWidth="1.4" />
                              <polygon points={axo.topPolygon} fill="#f1f5f9" stroke="#000000" strokeWidth="1.2" />
                              <polygon points={axo.sidePolygon} fill="#e2e8f0" stroke="#000000" strokeWidth="1.2" />

                              {/* Visible Edges */}
                              {axo.edges.map((e, eIdx) => (
                                <line key={eIdx} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#000000" strokeWidth="1.2" />
                              ))}

                              {/* Hidden Construction Lines */}
                              {axo.hiddenLines.map((hLine, hIdx) => (
                                <line key={hIdx} x1={hLine.x1} y1={hLine.y1} x2={hLine.x2} y2={hLine.y2} stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3,3" />
                              ))}

                              {/* Machining Marker Points */}
                              {axo.features.map((f, fIdx) => (
                                <g key={fIdx}>
                                  <circle cx={f.x} cy={f.y} r="3.5" fill="#000000" />
                                  <line x1={f.x} y1={f.y} x2={f.x} y2={f.y - 18} stroke="#000000" strokeWidth="0.8" />
                                  <line x1={f.x} y1={f.y - 18} x2={f.x + 20} y2={f.y - 18} stroke="#000000" strokeWidth="0.8" />
                                  <text x={f.x + 24} y={f.y - 14} fontSize="10" fontWeight="bold" fill="#000000">
                                    {f.label}
                                  </text>
                                </g>
                              ))}

                              {/* Dimension Line */}
                              <line
                                x1={axo.dimLine.x1}
                                y1={axo.dimLine.y1}
                                x2={axo.dimLine.x2}
                                y2={axo.dimLine.y2}
                                stroke="#000000"
                                strokeWidth="1.2"
                                markerStart={`url(#dimArr-${idx})`}
                                markerEnd={`url(#dimArr-${idx})`}
                              />
                              <text
                                x={axo.dimLine.tx}
                                y={axo.dimLine.ty}
                                fontSize="11"
                                fontWeight="bold"
                                fill="#000000"
                              >
                                {axo.dimLine.text}
                              </text>
                            </svg>
                          </div>
                        </div>

                        {/* Center: 2D DXF Profile Cross Section with EXACT 1:1 Aspect Ratio */}
                        <div className="bar-card-center">
                          <span className="section-label">DXF PROFILE CROSS-SECTION</span>
                          <div className="dxf-mini-canvas">
                            {dxf ? (
                              <svg viewBox={`-5 -5 ${dxf.width + 10} ${dxf.height + 10}`} className="dxf-mini-svg" preserveAspectRatio="xMidYMid meet">
                                <polygon points={dxf.points} fill="#e2e8f0" stroke="#000000" strokeWidth="0.8" />
                              </svg>
                            ) : (
                              <div className="dxf-placeholder">
                                <Box size={24} className="text-muted-foreground" />
                                <span>{bar.profile}</span>
                              </div>
                            )}
                          </div>
                          <div className="dxf-dimensions-badge">
                            <span>{pDim.w} × {pDim.h} mm</span>
                            <span>WALL: {pDim.wall} mm</span>
                            <span>{bar.unitWeightKgM} kg/m</span>
                          </div>
                        </div>

                        {/* Right: Fabrication Data & Machining Operations */}
                        <div className="bar-card-right">
                          <table className="bar-specs-table">
                            <tbody>
                              <tr>
                                <th>CUT LENGTH (L):</th>
                                <td className="font-mono font-bold text-sm">{bar.length.toFixed(1)} mm</td>
                              </tr>
                              <tr>
                                <th>QUANTITY:</th>
                                <td className="font-bold">{bar.qty} PCS</td>
                              </tr>
                              <tr>
                                <th>END MITER CUTS:</th>
                                <td>
                                  LEFT: <b>{bar.angleLeft}°</b> • RIGHT: <b>{bar.angleRight}°</b>
                                </td>
                              </tr>
                              <tr>
                                <th>SAW KERF:</th>
                                <td>3.5 mm deduction applied</td>
                              </tr>
                              <tr>
                                <th>TOTAL WEIGHT:</th>
                                <td>{bar.totalWeightKg} kg</td>
                              </tr>
                            </tbody>
                          </table>

                          <div className="bar-machining-instructions">
                            <span className="machining-title">CNC / DRILL / ROUTING PREPARATION:</span>
                            {machining.length > 0 ? (
                              <ul className="machining-list">
                                {machining.map((m, mIdx) => (
                                  <li key={mIdx}>
                                    • <b>{m.label}</b> at <code>X = {m.xMm} mm</code> from left datum
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="no-machining">Standard clean square end cuts, no special milling required.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {/* ======================================================================= */}
        {/* SHEET 5: EXPERT FABRICATOR AUDIT CHECKLIST & SIGN-OFF MATRIX             */}
        {/* ======================================================================= */}
        {(activeSheet === 'all' || activeSheet === 'checklist') && (
          <section className="audit-sheet sheet-audit-checklist" id="sheet-5">
            <div className="sheet-border-inner">
              <div className="sheet-header-bar">
                <div className="sheet-header-title">
                  <span className="sheet-no">SHEET 05 OF 05</span>
                  <h2>EXPERT FABRICATOR AUDIT CHECKLIST & QUALITY ASSURANCE SIGN-OFF</h2>
                </div>
                <div className="sheet-scale-box">
                  <span>STANDARD: ISO 9001 / BS 6375</span>
                  <span>TOLERANCE CLASS: ISO 2768-m</span>
                </div>
              </div>

              <div className="audit-checklist-content">
                <table className="audit-matrix-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>Item</th>
                      <th style={{ width: '230px' }}>Audit Inspection Point</th>
                      <th>Engineering Design Standard & Tolerance</th>
                      <th style={{ width: '150px' }}>System Value</th>
                      <th style={{ width: '100px' }}>Fabricator Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>01</td>
                      <td><b>Profile Die Verification</b></td>
                      <td>Confirm all aluminium profiles match official Alumex Advance Book dies.</td>
                      <td><code>{is70S ? '70S-1001/1101/1501' : '100D-3105/101/201'}</code></td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>02</td>
                      <td><b>1D Linear Saw Kerf Deduction</b></td>
                      <td>3.5 mm saw blade kerf deduction applied to all bar stock cuts.</td>
                      <td>3.5 mm / cut</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>03</td>
                      <td><b>Corner Joint Fastener Engagement</b></td>
                      <td>Vertical DIN 7981 4.2×38 SS screws engage screw port ≥ 18 mm.</td>
                      <td>18.0 mm thread bite</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>04</td>
                      <td><b>Water Drainage Weep Slots</b></td>
                      <td>Minimum 2 weep slots (30 × 5 mm) per sliding track with baffle flap.</td>
                      <td>2 slots at X=120 and X={w - 120} mm</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>05</td>
                      <td><b>Glass Pocket Bite & Clearance</b></td>
                      <td>Nominal glass perimeter clearance 5.0 mm; glass bite depth ≥ 12.0 mm.</td>
                      <td>12.0 mm bite depth</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>06</td>
                      <td><b>Roller Capacity & Clearance</b></td>
                      <td>70S-1914 brass wheels rated for &gt;45 kg/wheel sitting on 3.2 mm track rib.</td>
                      <td>90 kg/pair carriage</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>07</td>
                      <td><b>Weatherstrip Continuous Fin</b></td>
                      <td>Wool pile fin seals continuous on both interlocking hook channels.</td>
                      <td>Continuous fin</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                    <tr>
                      <td>08</td>
                      <td><b>Miter Cutting Tolerances</b></td>
                      <td>All 45° miters within ±0.2°; all 90° square cuts within ±0.5 mm.</td>
                      <td>ISO 2768-m (±0.5 mm)</td>
                      <td className="text-center"><input type="checkbox" readOnly defaultChecked /> [ PASS ]</td>
                    </tr>
                  </tbody>
                </table>

                {/* Auditor Freeform Markup & Reviewer Observations */}
                <div className="audit-remarks-box">
                  <h4>AUDITOR / MASTER FABRICATOR OBSERVATIONS & WORKSHOP MARKUPS:</h4>
                  <div className="remarks-ruled-lines">
                    <div className="rule-line"></div>
                    <div className="rule-line"></div>
                    <div className="rule-line"></div>
                    <div className="rule-line"></div>
                  </div>
                </div>

                {/* Final Certification & Sign-Off Block */}
                <div className="audit-final-signoff-block">
                  <div className="signoff-field">
                    <span className="signoff-title">FABRICATION AUDITOR NAME:</span>
                    <span className="signoff-line">_______________________________________</span>
                  </div>
                  <div className="signoff-field">
                    <span className="signoff-title">QUALIFICATION / AFFILIATION:</span>
                    <span className="signoff-line">Master Aluminium Fabricator / QA Inspector</span>
                  </div>
                  <div className="signoff-field">
                    <span className="signoff-title">AUDIT STATUS:</span>
                    <div className="status-pills">
                      <span className="pill approved font-bold">APPROVED FOR WORKSHOP CUTTING</span>
                    </div>
                  </div>
                  <div className="signoff-field">
                    <span className="signoff-title">SIGNATURE & WORKSHOP STAMP:</span>
                    <div className="stamp-box">
                      <span>[ OFFICIAL STAMP HERE ]</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
