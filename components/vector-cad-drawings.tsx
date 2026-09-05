'use client';

import React, { useState } from 'react';
import type { DerivedOpening, OpeningItem } from '../lib/types';
import { deriveDoor } from '../lib/door-model';
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
  DXF_100D_201,
  DXF_100D_401,
  DXF_100D_501,
} from '../lib/dxf-svg-paths';

interface VectorCadDrawingsProps {
  opening: OpeningItem;
  theme?: 'dark' | 'light';
}

export default function VectorCadDrawings({ opening, theme = 'dark' }: VectorCadDrawingsProps) {
  const [activeDetail, setActiveDetail] = useState<'all' | 'elevation' | 'head' | 'sill' | 'jamb' | 'corner'>('all');
  const d = deriveDoor(opening);

  const w = opening.width;
  const h = opening.height;
  const system = opening.system;
  const is70S = system.startsWith('70S');
  const isDouble = system === '100D-double';

  const padding = 120;
  const vbWidth = w + padding * 2;
  const vbHeight = h + padding * 2;

  const strokeMain = theme === 'light' ? '#0f172a' : '#f8fafc';
  const strokeDim = theme === 'light' ? '#b45309' : '#38bdf8';
  const fillAlu = theme === 'light' ? '#e2e8f0' : '#1e293b';
  const fillGlass = theme === 'light' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.1)';
  const strokeGlass = '#0284c7';
  const fillHatch = theme === 'light' ? '#cbd5e1' : '#334155';

  return (
    <div className="cad-wrapper">
      {/* CAD Sub-navigation Toolbar */}
      <div className="cad-subnav">
        <div className="cad-tabs">
          <button
            className={`cad-tab-btn ${activeDetail === 'all' ? 'active' : ''}`}
            onClick={() => setActiveDetail('all')}
          >
            Full Drawing Sheet
          </button>
          <button
            className={`cad-tab-btn ${activeDetail === 'elevation' ? 'active' : ''}`}
            onClick={() => setActiveDetail('elevation')}
          >
            Elevation Blueprint
          </button>
          <button
            className={`cad-tab-btn ${activeDetail === 'head' ? 'active' : ''}`}
            onClick={() => setActiveDetail('head')}
          >
            Sec A-A ({is70S ? '70S Head Track' : '100D Head'})
          </button>
          <button
            className={`cad-tab-btn ${activeDetail === 'sill' ? 'active' : ''}`}
            onClick={() => setActiveDetail('sill')}
          >
            Sec B-B ({is70S ? '70S Sill & Roller' : '100D Threshold'})
          </button>
          <button
            className={`cad-tab-btn ${activeDetail === 'jamb' ? 'active' : ''}`}
            onClick={() => setActiveDetail('jamb')}
          >
            Sec C-C ({is70S ? '70S Interlock' : isDouble ? '100D Rebate' : '100D Jamb'})
          </button>
          <button
            className={`cad-tab-btn ${activeDetail === 'corner' ? 'active' : ''}`}
            onClick={() => setActiveDetail('corner')}
          >
            Detail D ({is70S ? '70S Roller Housing' : '100D Cleat'})
          </button>
        </div>

        <div className="cad-sheet-meta">
          <span className="badge badge-unit">{opening.tag}</span>
          <span>{opening.name}</span>
          <span className="mono">{w} × {h} mm</span>
        </div>
      </div>

      <div className="cad-sheet-content">
        {/* ========================================================================= */}
        {/* 1. ELEVATION BLUEPRINT WITH ISO/DIN DIMENSION CHAINS                     */}
        {/* ========================================================================= */}
        {(activeDetail === 'all' || activeDetail === 'elevation') && (
          <div className="cad-panel card">
            <div className="cad-panel-header">
              <span className="cad-title">ARCHITECTURAL SHOP DRAWING — ELEVATION & DIMENSION CHAINS</span>
              <span className="cad-scale">SCALE 1:20 (DIMENSIONS IN MM)</span>
            </div>

            <div className="svg-container">
              <svg
                viewBox={`-${padding} -${padding + 40} ${vbWidth} ${vbHeight + 40}`}
                className="cad-svg"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <pattern id="cadHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="0" y2="8" stroke={fillHatch} strokeWidth="1" />
                  </pattern>
                  <marker id="dimArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 L2,3 Z" fill={strokeDim} />
                  </marker>
                </defs>

                {/* Ground Level Datum */}
                <line x1="-60" y1={h} x2={w + 60} y2={h} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6,4" />
                <text x="-50" y={h - 6} fill="#64748b" fontSize="18" fontWeight="bold">F.F.L. ±0.000</text>

                {/* Outer Wall Boundary */}
                <rect x="-10" y="-10" width={w + 20} height={h + 10} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,4" />

                {/* Outer Frame Aluminium */}
                <rect x="0" y="0" width={w} height={h} fill={fillAlu} stroke={strokeMain} strokeWidth="2.5" />
                <rect x={d.frameFace} y={d.frameFace} width={w - 2 * d.frameFace} height={h - d.frameFace} fill={theme === 'light' ? '#f8fafc' : '#0f172a'} stroke={strokeMain} strokeWidth="2" />

                {/* 100D Single Swing Elevation */}
                {system === '100D-single' && (
                  <g id="elev-100d-single">
                    <rect x={d.leafLeft} y={d.leafBottom} width={d.leafWidth} height={d.leafHeight} fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                    <rect x={d.railLeft} y={d.leafBottom + d.bottomRail} width={d.clearWidth} height={d.midCenter - d.midRail / 2 - (d.leafBottom + d.bottomRail)} fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                    <rect x={d.railLeft} y={d.midCenter + d.midRail / 2} width={d.clearWidth} height={d.leafTop - d.topRail - (d.midCenter + d.midRail / 2)} fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                    <rect x={d.railLeft} y={d.midCenter - d.midRail / 2} width={d.clearWidth} height={d.midRail} fill={fillHatch} stroke={strokeMain} strokeWidth="1.5" />
                    <path d={`M ${d.leafLeft} ${d.leafBottom + 20} L ${d.leafRight} ${(d.leafBottom + d.leafTop) / 2} L ${d.leafLeft} ${d.leafTop - 20}`} fill="none" stroke={strokeDim} strokeWidth="1.5" strokeDasharray="8,6" />
                    <rect x={d.leafRight - 35} y={d.midCenter - 140} width="16" height="280" fill="#0f172a" stroke="#f8fafc" strokeWidth="1" rx="4" />
                  </g>
                )}

                {/* 100D Double Swing Elevation */}
                {system === '100D-double' && (
                  <g id="elev-100d-double">
                    {/* Left Active Leaf */}
                    <rect x={d.frameFace + 4} y={d.leafBottom} width={(w - 2 * d.frameFace - 14) / 2} height={d.leafHeight} fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                    {/* Right Passive Leaf */}
                    <rect x={w / 2 + 3} y={d.leafBottom} width={(w - 2 * d.frameFace - 14) / 2} height={d.leafHeight} fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                    {/* Meeting Stile Overlap Line */}
                    <line x1={w / 2} y1={d.leafBottom} x2={w / 2} y2={d.leafTop} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
                    <text x={w / 2} y={d.leafBottom + 40} textAnchor="middle" fill="#ef4444" fontSize="14" fontWeight="bold">100D-102 REBATE</text>
                  </g>
                )}

                {/* 70S 2-Track Sliding Elevation */}
                {is70S && (
                  <g id="elev-70s-sliding">
                    {/* Panel 1 (Left Track) */}
                    <rect x={d.frameFace} y={d.frameFace + 14} width={(w - 2 * d.frameFace + 28) / 2} height={h - 2 * d.frameFace - 28} fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                    {/* Panel 1 Glass */}
                    <rect x={d.frameFace + 28} y={d.frameFace + 42} width={(w - 2 * d.frameFace + 28) / 2 - 56} height={h - 2 * d.frameFace - 84} fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />

                    {/* Panel 2 (Right Track) */}
                    <rect x={w / 2 - 14} y={d.frameFace + 14} width={(w - 2 * d.frameFace + 28) / 2} height={h - 2 * d.frameFace - 28} fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                    {/* Panel 2 Glass */}
                    <rect x={w / 2 + 14} y={d.frameFace + 42} width={(w - 2 * d.frameFace + 28) / 2 - 56} height={h - 2 * d.frameFace - 84} fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />

                    {/* Interlock Zone Highlight (70S-1601) */}
                    <rect x={w / 2 - 14} y={d.frameFace + 14} width="28" height={h - 2 * d.frameFace - 28} fill="rgba(234, 88, 12, 0.15)" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="4,2" />
                    <text x={w / 2} y={d.frameFace + 50} textAnchor="middle" fill="#ea580c" fontSize="14" fontWeight="bold">70S-1601 INTERLOCK</text>

                    {/* Sliding Motion Direction Arrows */}
                    <line x1={w / 4 - 50} y1={h / 2} x2={w / 4 + 50} y2={h / 2} stroke={strokeDim} strokeWidth="3" markerEnd="url(#dimArrow)" />
                    <line x1={(3 * w) / 4 + 50} y1={h / 2} x2={(3 * w) / 4 - 50} y2={h / 2} stroke={strokeDim} strokeWidth="3" markerEnd="url(#dimArrow)" />
                  </g>
                )}

                {/* Section Cut Callouts */}
                <line x1="-30" y1="22" x2={w + 30} y2="22" stroke="#dc2626" strokeWidth="2" strokeDasharray="10,5,2,5" />
                <circle cx="-30" cy="22" r="14" fill="#dc2626" /><text x="-30" y="27" fill="white" fontSize="14" fontWeight="bold" textAnchor="middle">A</text>
                <circle cx={w + 30} cy="22" r="14" fill="#dc2626" /><text x={w + 30} y="27" fill="white" fontSize="14" fontWeight="bold" textAnchor="middle">A</text>

                <line x1={w / 2} y1="-30" x2={w / 2} y2={h + 30} stroke="#b45309" strokeWidth="2" strokeDasharray="10,5,2,5" />
                <circle cx={w / 2} cy="-30" r="14" fill="#b45309" /><text x={w / 2} y="-25" fill="white" fontSize="14" fontWeight="bold" textAnchor="middle">B</text>
                <circle cx={w / 2} cy={h + 30} r="14" fill="#b45309" /><text x={w / 2} y={h + 35} fill="white" fontSize="14" fontWeight="bold" textAnchor="middle">B</text>

                <circle cx={d.frameFace} cy={d.frameFace} r="45" fill="none" stroke="#d97706" strokeWidth="2.5" strokeDasharray="6,4" />
                <text x={d.frameFace + 35} y={d.frameFace - 10} fill="#d97706" fontSize="16" fontWeight="800">DETAIL D</text>

                {/* Dimensions */}
                <line x1="0" y1="-50" x2={w} y2="-50" stroke={strokeDim} strokeWidth="1.5" />
                <line x1="0" y1="-65" x2="0" y2="0" stroke={strokeDim} strokeWidth="1" />
                <line x1={w} y1="-65" x2={w} y2="0" stroke={strokeDim} strokeWidth="1" />
                <text x={w / 2} y="-58" fill={strokeDim} fontSize="20" fontWeight="bold" textAnchor="middle">OVERALL WIDTH {w} MM</text>

                <line x1={w + 50} y1="0" x2={w + 50} y2={h} stroke={strokeDim} strokeWidth="1.5" />
                <line x1={w} y1="0" x2={w + 65} y2="0" stroke={strokeDim} strokeWidth="1" />
                <line x1={w} y1={h} x2={w + 65} y2={h} stroke={strokeDim} strokeWidth="1" />
                <text x={w + 62} y={h / 2} fill={strokeDim} fontSize="20" fontWeight="bold" textAnchor="middle" transform={`rotate(90 ${w + 62} ${h / 2})`}>OVERALL HEIGHT {h} MM</text>
              </svg>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. DYNAMIC TRUE DXF VECTOR CROSS-SECTIONS (100D vs 70S)                   */}
        {/* ========================================================================= */}
        <div className="cad-details-grid">
          {/* SECTION A-A: HEAD / TOP TRACK */}
          {(activeDetail === 'all' || activeDetail === 'head') && (
            <div className="cad-detail-card card">
              <div className="card-header">
                <span className="cad-detail-badge">SECTION A-A</span>
                <h4>{is70S ? '70S 2-Track Frame Head & Top Rail Track' : '100 mm Frame Head & Top Rail Joint'}</h4>
              </div>

              {is70S ? (
                /* 70S EXACT DXF VECTORS (Inverted Y for CAD Cartesian Alignment) */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* 70S-1001-1 Top Track Frame (ceiling base at Y=88, legs hang down) */}
                  <g transform="translate(45, 88) scale(2.4, -2.4)">
                    <polygon points={DXF_70S_1001_1.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="160" y="24" textAnchor="middle" fontSize="11" fontWeight="bold" fill={strokeMain}>
                    70S-1001-1 HEAD (69.8 × 32.0 mm)
                  </text>

                  {/* 70S-1401 Top Sash Rail entering front guide pocket */}
                  <g transform="translate(50, 152) scale(2.4, -2.4)">
                    <polygon points={DXF_70S_1401.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="145" y="145" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    70S-1401 TOP RAIL
                  </text>

                  {/* 6mm Glass extending DOWNWARDS from top rail pocket */}
                  <rect x="74" y="152" width="6" height="58" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="86" y="190" fontSize="10" fontWeight="bold" fill={strokeGlass}>6mm GLASS</text>

                  {/* Wool Pile Fin Seal */}
                  <text x="175" y="96" fontSize="9" fontWeight="bold" fill="#059669">WOOL PILE GASKET</text>
                  <line x1="170" y1="92" x2="115" y2="92" stroke="#059669" strokeWidth="1.5" />
                  <circle cx="115" cy="92" r="3" fill="#059669" />
                </svg>
              ) : (
                /* 100D EXACT DXF VECTORS: True Vertical Top Rail Rotation & Frame Rebate */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* Soffit / Ceiling Line */}
                  <line x1="20" y1="14" x2="280" y2="14" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6,4" />
                  <text x="25" y="11" fill="#64748b" fontSize="9" fontWeight="bold">SOFFIT / CEILING LEVEL</text>

                  {/* 100D-3105 Frame Head: Base at ceiling, 12mm rebate steps down on interior (right) */}
                  <g transform="translate(40, 15) scale(1.55, 1.55)">
                    <polygon points={DXF_100D_3105.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="110" y="32" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D-3105 FRAME HEAD (100 × 45 mm)
                  </text>

                  {/* Continuous Wool Felt in Frame Rebate Groove */}
                  <rect x="138" y="58" width="8" height="6" fill="#059669" stroke="#047857" strokeWidth="0.8" rx="1" />
                  <text x="180" y="64" fontSize="9" fontWeight="bold" fill="#059669">WOOL FELT SEAL</text>
                  <line x1="175" y1="61" x2="148" y2="61" stroke="#059669" strokeWidth="1" />

                  {/* 100D-201 Top Rail: Rotated 90° standing vertically (80mm tall, 42.2mm thick) */}
                  {/* Top face at Y=70.4 (3mm clearance below rebate), glazing pocket facing DOWN at Y=194 */}
                  <g transform="translate(182.9, 70.4) rotate(90) scale(1.55, 1.55)">
                    <polygon points={DXF_100D_201.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="110" y="130" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D-201 TOP RAIL (80 × 45 mm)
                  </text>

                  {/* 100D-501 Glazing Bead: Snapped into bottom interior pocket */}
                  <g transform="translate(160.0, 171.0) scale(1.55, 1.55)">
                    <polygon points={DXF_100D_501.points} fill="#d97706" stroke="#b45309" strokeWidth="0.8" />
                  </g>
                  <text x="210" y="186" fontSize="9" fontWeight="bold" fill="#d97706">100D-501 BEAD</text>
                  <line x1="205" y1="183" x2="185" y2="183" stroke="#d97706" strokeWidth="1" />

                  {/* 6mm Glass Pane extending DOWNWARDS into sash leaf */}
                  <rect x="140" y="172" width="8" height="46" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="100" y="208" fontSize="10" fontWeight="bold" fill={strokeGlass}>6mm GLASS</text>
                </svg>
              )}

              <div className="detail-notes">
                <span><b>Profile Standard:</b> Alumex Advance Catalogue (Group 08)</span>
                <span><b>Rebate Clearance:</b> 3.0 mm operating gap</span>
                <span><b>Sealing:</b> Continuous wool felt weatherstrip fin</span>
              </div>
            </div>
          )}

          {/* SECTION B-B: SILL / BOTTOM RAIL */}
          {(activeDetail === 'all' || activeDetail === 'sill') && (
            <div className="cad-detail-card card">
              <div className="card-header">
                <span className="cad-detail-badge">SECTION B-B</span>
                <h4>{is70S ? '70S 2-Track Sill & Roller Wheel Track' : '100 mm Sill & Floor Sweep Detail'}</h4>
              </div>

              {is70S ? (
                /* 70S EXACT DXF VECTORS (Inverted Y for CAD Cartesian Alignment) */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* Glass Panel extending DOWN into bottom rail pocket */}
                  <rect x="74" y="10" width="6" height="52" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="86" y="32" fontSize="10" fontWeight="bold" fill={strokeGlass}>6mm GLASS</text>

                  {/* 70S-1501 Bottom Sash Rail covering roller */}
                  <g transform="translate(50, 148) scale(2.4, -2.4)">
                    <polygon points={DXF_70S_1501.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="145" y="80" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    70S-1501 BOTTOM RAIL (56.3 mm)
                  </text>

                  {/* 70S-1914 Roller Wheel inside chamber */}
                  <circle cx="86" cy="115" r="11" fill="#d97706" stroke="#b45309" strokeWidth="2" />
                  <circle cx="86" cy="115" r="3.5" fill="white" />
                  <text x="110" y="118" fontSize="9" fontWeight="bold" fill="#d97706">70S-1914 BRASS ROLLER</text>

                  {/* 70S-1101-1 Bottom Track Sill on floor with raised ribs pointing UP */}
                  <g transform="translate(45, 195) scale(2.4, -2.4)">
                    <polygon points={DXF_70S_1101_1.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="160" y="210" textAnchor="middle" fontSize="11" fontWeight="bold" fill={strokeMain}>
                    70S-1101-1 SILL (69.8 × 30.0 mm)
                  </text>

                  {/* Weep Drainage Arrow */}
                  <path d="M 175 178 L 205 178 L 205 192" fill="none" stroke="#059669" strokeWidth="2" markerEnd="url(#dimArrow)" />
                  <text x="210" y="188" fontSize="8" fontWeight="bold" fill="#059669">WEEP DRAIN</text>
                </svg>
              ) : (
                /* 100D EXACT DXF VECTORS: True Vertical Bottom Rail (120mm) & Floor Sweep */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* 6mm Glass extending UPWARDS from bottom rail pocket */}
                  <rect x="156" y="8" width="8" height="42" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="110" y="28" fontSize="10" fontWeight="bold" fill={strokeGlass}>6mm GLASS</text>

                  {/* 100D-401 Bottom Rail: Rotated 90° standing vertically (120mm tall, 42.2mm thick) */}
                  {/* Glazing pocket points UP at Y=35, 30mm skirt legs point DOWN to floor at Y=173 */}
                  <g transform="translate(183.5, 35.0) rotate(90) scale(1.15, 1.15)">
                    <polygon points={DXF_100D_401.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="75" y="105" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D-401 BOTTOM RAIL
                  </text>
                  <text x="75" y="120" textAnchor="middle" fontSize="9" fill="#64748b">
                    (120 × 45 mm EXTRUSION)
                  </text>

                  {/* 100D-501 Glazing Bead: Snapped into top interior pocket */}
                  <g transform="translate(135.0, 53.3) scale(1.15, -1.15)">
                    <polygon points={DXF_100D_501.points} fill="#d97706" stroke="#b45309" strokeWidth="0.8" />
                  </g>
                  <text x="200" y="48" fontSize="9" fontWeight="bold" fill="#d97706">100D-501 BEAD</text>

                  {/* F.F.L. Ground Datum Line */}
                  <line x1="20" y1="184" x2="280" y2="184" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6,4" />
                  <text x="25" y="180" fontSize="10" fontWeight="bold" fill="#64748b">F.F.L. ±0.000</text>

                  {/* TH-002 Low-Profile Saddle Threshold & Draft Sweep */}
                  <rect x="115" y="182" width="85" height="5" fill="#475569" stroke="#1e293b" strokeWidth="1" rx="1" />
                  <rect x="145" y="171" width="25" height="11" fill="#059669" stroke="#047857" strokeWidth="1" />
                  <text x="175" y="204" fontSize="9" fontWeight="bold" fill="#047857">TH-002 THRESHOLD & SWEEP</text>
                </svg>
              )}

              <div className="detail-notes">
                <span><b>Threshold:</b> {is70S ? 'Baffled weep slots with deflector caps' : 'Low-profile barrier-free saddle TH-002'}</span>
                <span><b>Undercut Clearance:</b> {is70S ? 'Roller Capacity: 90 kg per pair' : '6.0 mm bottom sweep gap'}</span>
                <span><b>Sealing:</b> {is70S ? 'Continuous dual fin pile' : 'Dual nylon bristle sweep in rail cavity'}</span>
              </div>
            </div>
          )}

          {/* SECTION C-C: JAMB & STILE REBATE */}
          {(activeDetail === 'all' || activeDetail === 'jamb') && (
            <div className="cad-detail-card card">
              <div className="card-header">
                <span className="cad-detail-badge">SECTION C-C</span>
                <h4>{is70S ? '70S-1601 Interlock & 70S-1701 Lock Stile' : isDouble ? '100D-102 Meeting Stile Rebate' : '100D Jamb & Hinge Stile'}</h4>
              </div>

              {is70S ? (
                /* 70S EXACT DXF VECTORS (Inverted Y for Hook Interlock Alignment) */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* Left Interlock Stile 70S-1601 */}
                  <g transform="translate(125, 142) scale(2.2, -2.2)">
                    <polygon points={DXF_70S_1601.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="90" y="32" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ea580c">
                    70S-1601 INTERLOCK
                  </text>

                  {/* Right Interlock Stile (mirrored/inverted for hook engagement) */}
                  <g transform="translate(195, 78) scale(-2.2, 2.2)">
                    <polygon points={DXF_70S_1601.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>

                  {/* Wool pile weatherstrip between hooks */}
                  <circle cx="118" cy="85" r="4" fill="#059669" />
                  <circle cx="148" cy="85" r="4" fill="#059669" />
                  <text x="160" y="165" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#059669">
                    WOOL PILE ACOUSTIC SEAL
                  </text>
                </svg>
              ) : isDouble ? (
                /* 100D-102 DOUBLE DOOR MEETING STILES: Overlapping Rebates & Outward Glass Pockets */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* Left Active Stile: Glass pocket points LEFT, curved rebated nose points RIGHT */}
                  <g transform="translate(156.0, 55.0) scale(-1.35, 1.35)">
                    <polygon points={DXF_100D_102.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="100" y="42" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    ACTIVE LEAF STILE
                  </text>

                  {/* Left Glass Pane extending into left door leaf */}
                  <rect x="22" y="72" width="40" height="12" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="35" y="66" fontSize="9" fontWeight="bold" fill={strokeGlass}>GLASS</text>

                  {/* Right Passive Stile: Rotated 180° so rebated nose overlaps left, glass pocket points RIGHT */}
                  <g transform="translate(164.0, 115.7) scale(1.35, -1.35)">
                    <polygon points={DXF_100D_102.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="220" y="42" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    PASSIVE LEAF STILE
                  </text>

                  {/* Right Glass Pane extending into right door leaf */}
                  <rect x="258" y="72" width="40" height="12" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="268" y="66" fontSize="9" fontWeight="bold" fill={strokeGlass}>GLASS</text>

                  {/* Overlapping Weatherstrip Seal in Meeting Gap */}
                  <line x1="160" y1="50" x2="160" y2="120" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,2" />
                  <rect x="157" y="74" width="6" height="12" fill="#059669" stroke="#047857" strokeWidth="1" rx="1" />
                  <text x="160" y="145" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ef4444">
                    100D-102 REBATED MEETING STILES
                  </text>
                  <text x="160" y="160" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#059669">
                    6.0 mm REBATED GAP WITH WOOL FELT
                  </text>
                </svg>
              ) : (
                /* 100D SINGLE DOOR JAMB & BUTT HINGE STILE */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* Frame Jamb 100D-3105 on wall */}
                  <g transform="translate(30, 55) scale(1.35, 1.35)">
                    <polygon points={DXF_100D_3105.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="80" y="42" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D-3105 JAMB
                  </text>

                  {/* Hinge Stile 100D-101: 4mm outer rebate receives butt hinge, glass pocket points RIGHT */}
                  <g transform="translate(268.9, 55.0) scale(-1.35, 1.35)">
                    <polygon points={DXF_100D_101.points} fill={fillAlu} stroke={strokeMain} strokeWidth="0.8" />
                  </g>
                  <text x="220" y="42" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D-101 HINGE STILE
                  </text>

                  {/* Glass Pane extending into leaf */}
                  <rect x="268" y="72" width="38" height="12" fill={fillGlass} stroke={strokeGlass} strokeWidth="1.5" />
                  <text x="274" y="66" fontSize="9" fontWeight="bold" fill={strokeGlass}>GLASS</text>

                  {/* Butt Hinge mortised into 4mm rebate */}
                  <circle cx="172" cy="78" r="9" fill="#0f172a" stroke="#f8fafc" strokeWidth="1.5" />
                  <circle cx="172" cy="78" r="3" fill="#ef4444" />
                  <text x="172" y="145" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ef4444">
                    100 mm BUTT HINGE (Ø13mm PIN)
                  </text>
                  <text x="172" y="160" textAnchor="middle" fontSize="9" fill="#64748b">
                    MORTISED INTO 4mm STILE REBATE
                  </text>
                </svg>
              )}

              <div className="detail-notes">
                <span><b>Engagement:</b> Continuous stepped rebate with wool felt</span>
                <span><b>Hinge Standard:</b> 100 mm stainless steel butt hinge (3 per leaf)</span>
              </div>
            </div>
          )}

          {/* DETAIL D: CORNER JOINERY / TIE-ROD ASSEMBLY */}
          {(activeDetail === 'all' || activeDetail === 'corner') && (
            <div className="cad-detail-card card">
              <div className="card-header">
                <span className="cad-detail-badge">DETAIL D</span>
                <h4>{is70S ? '70S Sash Corner Assembly & Roller Carriage Access' : '100 mm 90° Butt Joint & M6 Tie-Rod Assembly'}</h4>
              </div>

              {is70S ? (
                /* 70S SASH CORNER & ROLLER ACCESS */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* 90 Degree Square Butt Joint */}
                  <rect x="40" y="40" width="30" height="130" fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                  <rect x="40" y="140" width="160" height="40" fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                  <line x1="40" y1="140" x2="70" y2="140" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,2" />
                  <text x="80" y="130" fontSize="10" fontWeight="bold" fill="#ef4444">90° BUTT JOINT</text>

                  {/* Vertical S.T. Assembly Screw Port */}
                  <line x1="55" y1="60" x2="55" y2="160" stroke="#dc2626" strokeWidth="3" markerEnd="url(#dimArrow)" />
                  <text x="65" y="90" fontSize="9" fontWeight="bold" fill="#dc2626">4.2×38mm S.T. SCREW</text>

                  {/* Roller Carriage Access Hole */}
                  <circle cx="120" cy="160" r="12" fill="#d97706" stroke="#b45309" strokeWidth="1.5" />
                  <text x="140" y="164" fontSize="10" fontWeight="bold" fill="#d97706">ROLLER HOUSING</text>
                </svg>
              ) : (
                /* 100D TRUE ALUMEX 90° SQUARE BUTT JOINT WITH INTERNAL ANGLE CLEAT & M6 TIE-ROD */
                <svg viewBox="0 0 320 220" className="detail-svg">
                  {/* Continuous Vertical Stile (100D-101 / 100D-103) */}
                  <rect x="35" y="25" width="45" height="170" fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                  <text x="57" y="180" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D STILE
                  </text>

                  {/* Horizontal Rail (100D-201 / 100D-401) with 90° Square Cut end */}
                  <rect x="80" y="55" width="180" height="90" fill={fillAlu} stroke={strokeMain} strokeWidth="2" />
                  <text x="170" y="75" textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeMain}>
                    100D RAIL (90° SQUARE BUTT)
                  </text>

                  {/* 90° Square Butt Joint Seam */}
                  <line x1="80" y1="55" x2="80" y2="145" stroke="#ef4444" strokeWidth="2.5" />
                  <text x="88" y="50" fontSize="10" fontWeight="bold" fill="#ef4444">90° SQUARE BUTT</text>

                  {/* Heavy-Duty Internal Angle Cleat (35×35×3mm) */}
                  <polygon points="76,68 80,68 80,105 115,105 115,109 76,109" fill="#475569" stroke="#1e293b" strokeWidth="1.2" />
                  <text x="122" y="108" fontSize="9" fontWeight="bold" fill="#475569">INTERNAL ANGLE CLEAT</text>

                  {/* Machine Screws into Stile Spline */}
                  <line x1="50" y1="78" x2="80" y2="78" stroke="#b45309" strokeWidth="2" />
                  <circle cx="50" cy="78" r="3" fill="#b45309" />
                  <line x1="50" y1="98" x2="80" y2="98" stroke="#b45309" strokeWidth="2" />
                  <circle cx="50" cy="98" r="3" fill="#b45309" />

                  {/* Continuous M6 High-Tensile Threaded Tie-Rod passing through rail & stile */}
                  <line x1="20" y1="125" x2="255" y2="125" stroke="#ea580c" strokeWidth="4" />
                  <line x1="20" y1="125" x2="255" y2="125" stroke="#fde047" strokeWidth="1.5" />
                  <text x="145" y="138" fontSize="10" fontWeight="bold" fill="#ea580c">M6 THREADED TIE-ROD</text>

                  {/* M6 Hex Nut & Spring Washer clamping against outside face of stile */}
                  <rect x="25" y="117" width="8" height="16" fill="#b45309" stroke="#78350f" strokeWidth="1.2" rx="1" />
                  <text x="29" y="110" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#b45309">M6 NUT</text>

                  {/* Compression Force Indicator Arrows */}
                  <path d="M 12 125 L 22 125" stroke="#dc2626" strokeWidth="2" markerEnd="url(#dimArrow)" />
                  <path d="M 268 125 L 258 125" stroke="#dc2626" strokeWidth="2" markerEnd="url(#dimArrow)" />
                </svg>
              )}

              <div className="detail-notes">
                <span><b>Joint Assembly:</b> 90° Square Butt with M6 Tie-Rod Compression</span>
                <span><b>Fasteners:</b> High-tensile threaded rod + M6 hex nut + lock washer</span>
                <span><b>Internal Cleat:</b> 35×35×3 mm heavy-duty structural angle</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
