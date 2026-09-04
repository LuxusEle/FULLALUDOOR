'use client';

import React, { useState } from 'react';
import { BarChart3, Printer, Scissors, Tag, Check, Download, AlertTriangle, QrCode } from 'lucide-react';
import type { ProjectNestingSummary, ProfileNestingResult, NestedBar } from '../lib/types';

interface NestingViewProps {
  nesting: ProjectNestingSummary;
  theme?: 'dark' | 'light';
}

const PIECE_COLORS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#7c3aed', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#4f46e5', // indigo
];

export default function NestingView({ nesting, theme = 'dark' }: NestingViewProps) {
  const [activeTab, setActiveTab] = useState<'strips' | 'labels'>('strips');
  const [selectedProfile, setSelectedProfile] = useState<string>('all');

  const filteredResults =
    selectedProfile === 'all'
      ? nesting.resultsByProfile
      : nesting.resultsByProfile.filter((r) => r.profileCode === selectedProfile);

  const printLabels = () => {
    window.print();
  };

  const exportNestingCsv = () => {
    const rows = [
      ['Bar Index', 'Profile', 'Description', 'Stock mm', 'Used mm', 'Offcut mm', 'Type', 'Efficiency %', 'Cut Pieces'],
    ];

    for (const prof of nesting.resultsByProfile) {
      for (const bar of prof.bars) {
        const piecesStr = bar.cuts.map((c) => `${c.openingTag}:${c.pieceDescription} (${c.lengthMm}mm)`).join(' | ');
        rows.push([
          String(bar.barIndex),
          prof.profileCode,
          `"${prof.profileDescription}"`,
          String(bar.stockLengthMm),
          String(bar.usedLengthMm),
          String(bar.remainingOffcutMm),
          bar.isReusableOffcut ? 'REUSABLE' : 'SCRAP',
          String(bar.efficiencyPercent),
          `"${piecesStr}"`,
        ]);
      }
    }

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-cutting-plan-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="nesting-wrapper">
      {/* Top Banner KPI Cards */}
      <div className="nesting-kpi-row card">
        <div className="kpi-metric">
          <span className="kpi-num">{nesting.totalBarsToPull}</span>
          <span className="kpi-lbl">Total 6.0m Stock Bars</span>
        </div>
        <div className="kpi-metric">
          <span className="kpi-num">{nesting.totalProfileLengthM} m</span>
          <span className="kpi-lbl">Net Profile Needed</span>
        </div>
        <div className="kpi-metric">
          <span className="kpi-num" style={{ color: nesting.overallEfficiencyPercent >= 85 ? 'var(--green)' : 'var(--amber)' }}>
            {nesting.overallEfficiencyPercent}%
          </span>
          <span className="kpi-lbl">Overall Bar Yield</span>
        </div>
        <div className="kpi-metric">
          <span className="kpi-num">{nesting.totalReusableOffcutsM} m</span>
          <span className="kpi-lbl">Reusable Offcuts (≥500mm)</span>
        </div>
        <div className="kpi-metric">
          <span className="kpi-num" style={{ color: '#ef4444' }}>{nesting.totalScrapOffcutsM} m</span>
          <span className="kpi-lbl">Scrap Waste</span>
        </div>
      </div>

      {/* View Switcher & Toolbar */}
      <div className="nesting-toolbar">
        <div className="nav-pill-group">
          <button
            className={`btn-pill ${activeTab === 'strips' ? 'active' : ''}`}
            onClick={() => setActiveTab('strips')}
          >
            <BarChart3 size={14} /> 1D Visual Bar Cutting Plans
          </button>
          <button
            className={`btn-pill ${activeTab === 'labels' ? 'active' : ''}`}
            onClick={() => setActiveTab('labels')}
          >
            <Tag size={14} /> Workshop Barcode / QR Labels
          </button>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-profile" className="lbl-small">Filter Profile:</label>
          <select
            id="filter-profile"
            className="select"
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
          >
            <option value="all">All Extrusion Profiles ({nesting.resultsByProfile.length})</option>
            {nesting.resultsByProfile.map((p) => (
              <option key={p.profileCode} value={p.profileCode}>
                {p.profileCode} — {p.profileDescription} ({p.totalStockBars} bars)
              </option>
            ))}
          </select>
          <button className="btn" onClick={exportNestingCsv} title="Export CSV Cutting Data">
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={printLabels} title="Print Cut Plan / Labels">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. VISUAL 1D BAR LAYOUT STRIPS                                            */}
      {/* ========================================================================= */}
      {activeTab === 'strips' && (
        <div className="strips-container">
          {filteredResults.map((prof) => (
            <div key={prof.profileCode} className="profile-nest-card card">
              <div className="profile-nest-header">
                <div>
                  <h3 className="profile-code">{prof.profileCode} — {prof.profileDescription}</h3>
                  <div className="profile-sub-specs">
                    <span>Linear Wt: <b>{prof.unitWeightKgM} kg/m</b></span>
                    <span>Total Wt: <b>{prof.totalWeightKg} kg</b></span>
                    <span>Required Bars: <b>{prof.totalStockBars} × 6,000 mm</b></span>
                    <span>Saw Kerf: <b>{prof.bladeKerfMm} mm</b></span>
                  </div>
                </div>
                <div className="profile-yield-badge">
                  <span>YIELD</span>
                  <strong>{prof.overallYieldPercent}%</strong>
                </div>
              </div>

              {/* Individual 6,000mm Bar Layouts */}
              <div className="bars-list">
                {prof.bars.map((bar) => {
                  let colorIndex = 0;
                  return (
                    <div key={bar.barIndex} className="bar-row">
                      <div className="bar-meta-header">
                        <span className="bar-tag">BAR #{bar.barIndex} (6,000 mm)</span>
                        <div className="bar-stats">
                          <span>Net Cuts: <b>{bar.usedLengthMm - bar.kerfWasteMm} mm</b></span>
                          <span>Kerf: <b>{bar.kerfWasteMm} mm</b></span>
                          <span className={bar.isReusableOffcut ? 'text-green' : 'text-amber'}>
                            Rem: <b>{bar.remainingOffcutMm} mm</b> ({bar.isReusableOffcut ? 'Reusable' : 'Scrap'})
                          </span>
                          <span>Efficiency: <b>{bar.efficiencyPercent}%</b></span>
                        </div>
                      </div>

                      {/* Visual 6,000mm Linear Bar */}
                      <div className="bar-strip-visual">
                        {bar.cuts.map((cut, cIdx) => {
                          const widthPct = (cut.lengthMm / bar.stockLengthMm) * 100;
                          const bg = PIECE_COLORS[cIdx % PIECE_COLORS.length];
                          return (
                            <div
                              key={cIdx}
                              className="bar-cut-piece"
                              style={{ width: `${widthPct}%`, backgroundColor: bg }}
                              title={`[${cut.openingTag}] ${cut.pieceDescription} - ${cut.lengthMm} mm (Ends: ${cut.angleL}° / ${cut.angleR}°)`}
                            >
                              <span className="piece-tag">{cut.openingTag}</span>
                              <span className="piece-len">{cut.lengthMm} mm</span>
                              <span className="piece-angles">{cut.angleL}°/{cut.angleR}°</span>
                            </div>
                          );
                        })}

                        {/* Remainder Offcut */}
                        {bar.remainingOffcutMm > 0 && (
                          <div
                            className={`bar-offcut-piece ${bar.isReusableOffcut ? 'reusable' : 'scrap'}`}
                            style={{ width: `${(bar.remainingOffcutMm / bar.stockLengthMm) * 100}%` }}
                            title={`${bar.remainingOffcutMm} mm (${bar.isReusableOffcut ? 'Reusable Offcut ≥500mm' : 'Scrap Waste'})`}
                          >
                            <span>{bar.remainingOffcutMm} mm</span>
                            <small>{bar.isReusableOffcut ? 'OFFCUT' : 'SCRAP'}</small>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PRINTABLE WORKSHOP BARCODE / QR CUTTING LABELS                         */}
      {/* ========================================================================= */}
      {activeTab === 'labels' && (
        <div className="labels-grid printable-labels-sheet">
          {filteredResults.flatMap((prof) =>
            prof.bars.flatMap((bar) =>
              bar.cuts.map((cut, cIdx) => (
                <div key={`${prof.profileCode}-${bar.barIndex}-${cIdx}`} className="workshop-label-card">
                  <div className="label-topbar">
                    <span className="label-unit-tag">{cut.openingTag}</span>
                    <span className="label-bar-ref">BAR #{bar.barIndex} / {prof.totalStockBars}</span>
                  </div>

                  <div className="label-main">
                    <div className="label-piece-info">
                      <div className="label-part-name">{cut.pieceDescription}</div>
                      <div className="label-profile-code">{prof.profileCode}</div>
                      <div className="label-cut-length">
                        <strong>{cut.lengthMm}</strong> <span className="unit">MM</span>
                      </div>
                      <div className="label-ends">
                        <span>L: <b>{cut.angleL}°</b></span>
                        <span>R: <b>{cut.angleR}°</b></span>
                      </div>
                    </div>

                    {/* QR Code / Barcode Simulation */}
                    <div className="label-barcode-box">
                      <QrCode size={52} color="#0f172a" />
                      <span className="barcode-num">{cut.cutId}</span>
                    </div>
                  </div>

                  <div className="label-footer">
                    <span>ALU DOOR PRO — FABRICATION STAMP</span>
                    <span>PASS QC</span>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      )}
    </div>
  );
}
