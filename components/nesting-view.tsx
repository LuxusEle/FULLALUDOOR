'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  ChevronDown,
  ChevronUp,
  FileDown,
  PackageCheck,
  Printer,
  Recycle,
  Ruler,
  Scissors,
  Sparkles,
  Tag,
} from 'lucide-react';
import type { CutItem, NestedBar, ProjectNestingSummary, ProfileNestingResult } from '../lib/types';
import {
  DEFAULT_BLADE_KERF_MM,
  DEFAULT_STOCK_LEN_MM,
  nestProjectCuts,
} from '../lib/nesting-engine';

interface NestingViewProps {
  nesting: ProjectNestingSummary;
  cuts: CutItem[];
  theme?: 'dark' | 'light';
}

const PIECE_COLORS = [
  '#10b981',
  '#f59e0b',
  '#0ea5e9',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#84cc16',
  '#e11d48',
  '#6366f1',
];

function colorFor(pieceLabel: string): string {
  let hash = 0;
  for (let i = 0; i < pieceLabel.length; i += 1) {
    hash = (hash * 31 + pieceLabel.charCodeAt(i)) >>> 0;
  }
  return PIECE_COLORS[hash % PIECE_COLORS.length];
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(0) : '0';
}

export default function NestingView({ cuts }: NestingViewProps) {
  const [activeTab, setActiveTab] = useState<'strips' | 'labels'>('strips');
  const [selectedProfile, setSelectedProfile] = useState<string>('all');
  const [optimizeOn, setOptimizeOn] = useState(true);
  const [expandedBar, setExpandedBar] = useState<string | null>(null);

  const firstFit = useMemo(
    () => nestProjectCuts(cuts, DEFAULT_STOCK_LEN_MM, DEFAULT_BLADE_KERF_MM, { strategy: 'first-fit' }),
    [cuts]
  );
  const bestFit = useMemo(
    () => nestProjectCuts(cuts, DEFAULT_STOCK_LEN_MM, DEFAULT_BLADE_KERF_MM, { strategy: 'best-fit' }),
    [cuts]
  );

  const summary = optimizeOn ? bestFit : firstFit;
  const fallbackSummary = optimizeOn ? firstFit : bestFit;

  const filteredResults: ProfileNestingResult[] =
    selectedProfile === 'all'
      ? summary.resultsByProfile
      : summary.resultsByProfile.filter((result) => result.profileCode === selectedProfile);

  const barsSaved = Math.max(0, firstFit.totalBarsToPull - bestFit.totalBarsToPull);
  const scrapSavedMm = Math.max(0, firstFit.totalScrapOffcutsM - bestFit.totalScrapOffcutsM) * 1000;
  const yieldGain = Math.max(0, bestFit.overallEfficiencyPercent - firstFit.overallEfficiencyPercent);

  const totalScrapMm = summary.totalScrapOffcutsM * 1000;
  const totalReusableMm = summary.totalReusableOffcutsM * 1000;
  const totalKerfMm = summary.totalKerfWasteM * 1000;
  const totalNetMm = summary.totalProfileLengthM * 1000;

  const toggleBar = (key: string) => {
    setExpandedBar((current) => (current === key ? null : key));
  };

  const printLabels = () => {
    window.print();
  };

  const exportCuttingPlanCsv = () => {
    const rows: string[][] = [];
    rows.push([
      'Bar #',
      'Profile',
      'Profile Description',
      'Step',
      'Piece ID',
      'Opening Tag',
      'Piece',
      'Length (mm)',
      'Left (deg)',
      'Right (deg)',
      'Cumulative End (mm)',
      'Remarks',
    ]);

    for (const profile of summary.resultsByProfile) {
      for (const bar of profile.bars) {
        const meta = [
          String(bar.barIndex),
          profile.profileCode,
          `"${profile.profileDescription}"`,
        ];
        let pos = 0;
        bar.cuts.forEach((cut, stepIndex) => {
          const kerf = stepIndex === 0 ? 0 : profile.bladeKerfMm;
          pos += kerf;
          rows.push([
            ...meta,
            String(stepIndex + 1),
            cut.cutId,
            cut.openingTag,
            `"${cut.pieceDescription}"`,
            String(cut.lengthMm),
            String(cut.angleL),
            String(cut.angleR),
            String(Math.round(pos + cut.lengthMm)),
            stepIndex === bar.cuts.length - 1
              ? bar.isReusableOffcut
                ? `Offcut ${bar.remainingOffcutMm}mm REUSABLE`
                : `Offcut ${bar.remainingOffcutMm}mm SCRAP`
              : `Kerf ${profile.bladeKerfMm}mm after cut`,
          ]);
          pos += cut.lengthMm;
        });
      }
    }

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutting-plan-${summary.strategy === 'best-fit' ? 'optimized' : 'standard'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="nesting-wrapper">
      {/* ============================================================ */}
      {/* Optimize Waste toggle strip */}
      {/* ============================================================ */}
      <div className="opt-toggle-strip">
        <div className="opt-toggle-copy">
          <span className="opt-badge">
            <Sparkles size={13} /> WASTE OPTIMIZATION
          </span>
          <h2>Optimize Waste — Minimize Scrap</h2>
          <p>
            Best-Fit Decreasing packing: pieces are cut largest-first and every already-cut bar&apos;s
            offcut (≥500&nbsp;mm) is offered to the next piece before a fresh 6.0&nbsp;m stock bar is opened.
          </p>
          {optimizeOn && (barsSaved > 0 || scrapSavedMm > 0 || yieldGain > 0) && (
            <div className="opt-savings">
              {barsSaved > 0 && <span className="opt-save-chip good"><PackageCheck size={12} /> −{barsSaved} stock bar{barsSaved > 1 ? 's' : ''} saved</span>}
              {scrapSavedMm > 0 && <span className="opt-save-chip good"><Recycle size={12} /> −{fmt(scrapSavedMm)} mm scrap</span>}
              {yieldGain > 0 && <span className="opt-save-chip good"><Ruler size={12} /> +{yieldGain.toFixed(1)}% yield</span>}
            </div>
          )}
          {optimizeOn && barsSaved === 0 && scrapSavedMm === 0 && (
            <div className="opt-savings">
              <span className="opt-save-chip neutral"><PackageCheck size={12} /> Layout already optimal — no trade-off found</span>
            </div>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optimizeOn}
          className={`opt-switch ${optimizeOn ? 'on' : ''}`}
          onClick={() => setOptimizeOn((value) => !value)}
          title={optimizeOn ? 'Switch to standard first-fit nesting' : 'Enable best-fit waste optimization'}
        >
          <span className="opt-switch-label">{optimizeOn ? 'ON' : 'OFF'}</span>
          <span className="opt-knob" />
        </button>
      </div>

      {/* ============================================================ */}
      {/* Material accounting summary cards */}
      {/* ============================================================ */}
      <div className="opt-kpi-row">
        <div className="opt-kpi-card bars">
          <span className="opt-kpi-icon"><PackageCheck size={16} /></span>
          <div>
            <span className="opt-kpi-lbl">STOCK BARS REQUIRED</span>
            <strong>{summary.totalBarsToPull}</strong>
            <small>{summary.strategy === 'best-fit' ? 'best-fit nesting' : 'first-fit nesting'}</small>
          </div>
        </div>
        <div className="opt-kpi-card yield">
          <span className="opt-kpi-icon"><BarChart3 size={16} /></span>
          <div>
            <span className="opt-kpi-lbl">MATERIAL YIELD</span>
            <strong>{summary.overallEfficiencyPercent}%</strong>
            <small>of stock turned into parts</small>
          </div>
        </div>
        <div className="opt-kpi-card scrap">
          <span className="opt-kpi-icon"><Ban size={16} /></span>
          <div>
            <span className="opt-kpi-lbl">TOTAL SCRAP WASTE</span>
            <strong>{fmt(totalScrapMm)} mm</strong>
            <small>+ {fmt(totalKerfMm)} mm saw kerf</small>
          </div>
        </div>
        <div className="opt-kpi-card offcut">
          <span className="opt-kpi-icon"><Recycle size={16} /></span>
          <div>
            <span className="opt-kpi-lbl">REUSABLE OFFCUT BANK</span>
            <strong>{fmt(totalReusableMm)} mm</strong>
            <small>{summary.reusableOffcutCount} offcut bar{summary.reusableOffcutCount === 1 ? '' : 's'} ≥ 500 mm</small>
          </div>
        </div>
        <div className="opt-kpi-card net">
          <span className="opt-kpi-icon"><Ruler size={16} /></span>
          <div>
            <span className="opt-kpi-lbl">NET PROFILE CUT</span>
            <strong>{fmt(totalNetMm)} mm</strong>
            <small>{summary.totalStockLengthM.toFixed(1)} m stock purchased</small>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Toolbar */}
      {/* ============================================================ */}
      <div className="nesting-toolbar">
        <div className="nav-pill-group">
          <button
            type="button"
            className={`btn-pill ${activeTab === 'strips' ? 'active' : ''}`}
            onClick={() => setActiveTab('strips')}
          >
            <BarChart3 size={14} /> 1D Visual Bar Cutting Plans
          </button>
          <button
            type="button"
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
            onChange={(event) => setSelectedProfile(event.target.value)}
          >
            <option value="all">All Extrusion Profiles ({summary.resultsByProfile.length})</option>
            {summary.resultsByProfile.map((profile) => (
              <option key={profile.profileCode} value={profile.profileCode}>
                {profile.profileCode} — {profile.profileDescription} ({profile.totalStockBars} bars)
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={exportCuttingPlanCsv} title="Export workshop cutting plan (CSV)">
            <FileDown size={14} /> Export Cutting Plan
          </button>
          <button type="button" className="btn btn-primary" onClick={printLabels} title="Print Cut Plan / Labels">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Visual strips tab */}
      {/* ============================================================ */}
      {activeTab === 'strips' && (
        <div className="strips-container">
          <SegLegend summary={summary} fallback={fallbackSummary} optimizeOn={optimizeOn} />

          {filteredResults.map((profile) => (
            <div key={profile.profileCode} className="profile-nest-card card">
              <div className="profile-nest-header">
                <div>
                  <h3 className="profile-code">{profile.profileCode} — {profile.profileDescription}</h3>
                  <div className="profile-sub-specs">
                    <span>Linear Wt: <b>{profile.unitWeightKgM} kg/m</b></span>
                    <span>Total Wt: <b>{profile.totalWeightKg} kg</b></span>
                    <span>Required Bars: <b>{profile.totalStockBars} × {fmt(profile.stockLengthMm)} mm</b></span>
                    <span>Saw Kerf: <b>{profile.bladeKerfMm} mm</b></span>
                  </div>
                </div>
                <div className="profile-yield-badge">
                  <span>YIELD</span>
                  <strong>{profile.overallYieldPercent}%</strong>
                </div>
              </div>

              <div className="bars-list">
                {profile.bars.map((bar) => (
                  <BarPlan
                    key={bar.barIndex}
                    profile={profile}
                    bar={bar}
                    expanded={expandedBar === `${profile.profileCode}::${bar.barIndex}`}
                    onToggle={() => toggleBar(`${profile.profileCode}::${bar.barIndex}`)}
                  />
                ))}
              </div>
            </div>
          ))}

          {filteredResults.length === 0 && (
            <div className="empty-nesting-state">
              <Scissors size={22} />
              <span>No cut items available for this profile.</span>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* Printable barcode / QR cutting labels */}
      {/* ============================================================ */}
      {activeTab === 'labels' && (
        <div className="labels-grid printable-labels-sheet">
          {filteredResults.flatMap((profile) =>
            profile.bars.flatMap((bar) =>
              bar.cuts.map((cut, index) => (
                <div key={`${profile.profileCode}-${bar.barIndex}-${index}`} className="workshop-label-card">
                  <div className="label-topbar">
                    <span className="label-unit-tag">{cut.openingTag}</span>
                    <span className="label-bar-ref">BAR #{bar.barIndex} / {profile.totalStockBars}</span>
                  </div>

                  <div className="label-main">
                    <div className="label-piece-info">
                      <div className="label-part-name">{cut.pieceDescription}</div>
                      <div className="label-profile-code">{profile.profileCode}</div>
                      <div className="label-cut-length">
                        <strong>{cut.lengthMm}</strong> <span className="unit">MM</span>
                      </div>
                      <div className="label-ends">
                        <span>L: <b>{cut.angleL}°</b></span>
                        <span>R: <b>{cut.angleR}°</b></span>
                      </div>
                    </div>

                    <div className="label-barcode-box">
                      <Tag size={40} color="#0f172a" />
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

/* ------------------------------------------------------------------ */

function SegLegend({ summary, fallback, optimizeOn }: { summary: ProjectNestingSummary; fallback: ProjectNestingSummary; optimizeOn: boolean }) {
  const barsDelta = optimizeOn ? summary.totalBarsToPull - fallback.totalBarsToPull : 0;
  return (
    <div className="seg-legend-row">
      <div className="legend-items">
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#10b981' }} /> Cut pieces</span>
        <span className="legend-item"><span className="legend-swatch kerf" /> Saw kerf gap</span>
        <span className="legend-item"><span className="legend-swatch reusable" /> Reusable offcut ≥500 mm</span>
        <span className="legend-item"><span className="legend-swatch scrap" /> Scrap waste</span>
      </div>
      {barsDelta !== 0 && (
        <span className="opt-save-chip warn">
          <AlertTriangle size={12} /> standard layout would need {Math.abs(barsDelta)} more bar{barsDelta === -1 ? '' : 's'}
        </span>
      )}
      {optimizeOn && barsDelta === 0 && (
        <span className="opt-save-chip neutral"><PackageCheck size={12} /> Best-fit equals first-fit here</span>
      )}
    </div>
  );
}

function BarPlan({
  profile,
  bar,
  expanded,
  onToggle,
}: {
  profile: ProfileNestingResult;
  bar: NestedBar;
  expanded: boolean;
  onToggle: () => void;
}) {
  const kerfPerCut = profile.bladeKerfMm;

  return (
    <div className={`bar-row ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="bar-plan-header"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Bar #${bar.barIndex} cutting sequence — ${bar.cuts.length} steps, ${bar.remainingOffcutMm} mm offcut`}
      >
        <div className="bar-meta-header">
          <span className="bar-tag">BAR #{bar.barIndex} · 6,000 mm</span>
          <div className="bar-stats">
            <span>Steps: <b>{bar.cuts.length}</b></span>
            <span>Net Cuts: <b>{fmt(bar.usedLengthMm - bar.kerfWasteMm)} mm</b></span>
            <span>Kerf: <b>{bar.kerfWasteMm} mm</b></span>
            <span className={bar.isReusableOffcut ? 'text-green' : 'text-amber'}>
              Offcut: <b>{bar.remainingOffcutMm} mm</b> ({bar.isReusableOffcut ? 'Reusable' : 'Scrap'})
            </span>
            <span>Efficiency: <b>{bar.efficiencyPercent}%</b></span>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>

      <div className="bar-strip-visual">
        {bar.cuts.map((cut, index) => {
          const color = colorFor(`${cut.openingTag}|${cut.pieceDescription}`);
          return (
            <div key={cut.cutId} className="bar-cut-piece" style={{ width: `${(cut.lengthMm / bar.stockLengthMm) * 100}%`, backgroundColor: color }}>
              <span className="piece-step">{index + 1}</span>
              <span className="piece-tag">{cut.openingTag}</span>
              <span className="piece-len">{cut.lengthMm} mm</span>
              <span className="piece-angles">{cut.angleL}°/{cut.angleR}°</span>
            </div>
          );
        })}
        {bar.remainingOffcutMm > 0 && (
          <div
            className={`bar-offcut-piece ${bar.isReusableOffcut ? 'reusable' : 'scrap'}`}
            style={{ width: `${(bar.remainingOffcutMm / bar.stockLengthMm) * 100}%` }}
            title={`${bar.remainingOffcutMm} mm offcut (${bar.isReusableOffcut ? 'reusable' : 'scrap'})`}
          >
            <span>{bar.remainingOffcutMm} mm</span>
            <small>{bar.isReusableOffcut ? 'OFFCUT' : 'SCRAP'}</small>
          </div>
        )}
      </div>

      {expanded && (
        <div className="bar-expand">
          <table className="operator-step-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Piece</th>
                <th>Opening</th>
                <th>Length</th>
                <th>L°</th>
                <th>R°</th>
                <th>Cut from</th>
                <th>Position after</th>
              </tr>
            </thead>
            <tbody>
              {bar.cuts.map((cut, index) => {
                const start = index === 0 ? 0 : bar.cuts.slice(0, index).reduce((sum, item) => sum + item.lengthMm + kerfPerCut, 0);
                const end = start + (index === 0 ? cut.lengthMm : kerfPerCut + cut.lengthMm);
                return (
                  <tr key={cut.cutId}>
                    <td className="mono">{index + 1}</td>
                    <td>{cut.pieceDescription}</td>
                    <td><span className="tag-mini">{cut.openingTag}</span></td>
                    <td className="mono">{cut.lengthMm} mm</td>
                    <td className="mono">{cut.angleL}°</td>
                    <td className="mono">{cut.angleR}°</td>
                    <td className="mono">{fmt(start)} mm</td>
                    <td className="mono">{fmt(end)} mm</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="bar-notes">
            <span>Left of bar face at <b className="mono">0 mm</b>. Blade kerf <b className="mono">{kerfPerCut} mm</b> is removed after every cut except the last.</span>
            <span className={bar.isReusableOffcut ? 'text-green' : 'text-amber'}>
              {bar.isReusableOffcut
                ? `Return ${bar.remainingOffcutMm} mm offcut to the reusable rack (≥ 500 mm).`
                : `${bar.remainingOffcutMm} mm offcut → scrap bin (below 500 mm usable minimum).`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
