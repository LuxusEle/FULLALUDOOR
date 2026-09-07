'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  BoxSelect,
  Check,
  CircleDollarSign,
  ClipboardList,
  Compass,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FolderKanban,
  Layers,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Weight,
} from 'lucide-react';
import type { DerivedOpening, OpeningItem, ProjectMetadata, TypologyId } from '../lib/types';
import type { StoredProjectRef } from '../lib/project-storage';
import type { ManufacturingDossier } from '../lib/manufacturing-dossier';
import type { ProjectNestingSummary } from '../lib/types';
import { TYPOLOGY_LABELS } from './project-schedule';

export type DashboardGo = 'studio' | 'schedule' | 'cad' | 'nesting' | 'quote' | 'audit';

interface ProjectDashboardProps {
  project: ProjectMetadata;
  projectRef: StoredProjectRef | null;
  openings: OpeningItem[];
  derivedProjectOpenings: DerivedOpening[];
  nesting: ProjectNestingSummary;
  dossier: ManufacturingDossier;
  onGo: (tab: DashboardGo) => void;
  onOpenInStudio: (id: string) => void;
  onAddOpening: (system: TypologyId) => void;
  onNewProject: () => void;
  onExportPdf: () => void;
}

const SYSTEM_SHORT: Record<TypologyId, string> = {
  '100D-single': '100D',
  '100D-double': '100D',
  '100S-sliding-2p': '100S',
  '70S-sliding-2p': '70S',
  '70S-sliding-4p': '70S',
  '74-cgroove': '74C',
  'casement': 'CSM',
};

const CARD: CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--edge)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-sm)',
};

export default function ProjectDashboard({
  project,
  projectRef,
  openings,
  derivedProjectOpenings,
  nesting,
  dossier,
  onGo,
  onOpenInStudio,
  onAddOpening,
  onNewProject,
  onExportPdf,
}: ProjectDashboardProps) {
  const [quickSystem, setQuickSystem] = useState<TypologyId>('100D-single');
  const [confirmNew, setConfirmNew] = useState(false);

  const stats = useMemo(() => {
    const totalUnits = openings.reduce((sum, o) => sum + o.quantity, 0);
    const totalAreaM2 = derivedProjectOpenings.reduce((sum, d) => sum + d.areaM2 * d.config.quantity, 0);
    const totalAluKg = derivedProjectOpenings.reduce((sum, d) => sum + d.totalAluWeightKg * d.config.quantity, 0);
    const totalGlassM2 = derivedProjectOpenings.reduce((sum, d) => {
      const panelArea = d.glassPanels.reduce((glassSum, g) => glassSum + g.areaM2, 0);
      return sum + panelArea * d.config.quantity;
    }, 0);
    const glassPanels = derivedProjectOpenings.reduce(
      (sum, d) => sum + d.glassPanels.reduce((s, g) => s + g.qty, 0) * d.config.quantity,
      0
    );
    return { totalUnits, totalAreaM2, totalAluKg, totalGlassM2, glassPanels };
  }, [openings, derivedProjectOpenings]);

  const systemMix = useMemo(() => {
    const mix = new Map<TypologyId, { qty: number; label: string }>();
    for (const opening of openings) {
      const current = mix.get(opening.system) ?? { qty: 0, label: TYPOLOGY_LABELS[opening.system] };
      current.qty += opening.quantity;
      mix.set(opening.system, current);
    }
    return [...mix.entries()];
  }, [openings]);

  const reviews = useMemo(() => dossier.checks.filter((check) => check.status !== 'PASS').length, [dossier]);
  const currency = project.currency || 'USD';
  const money = (value: number) =>
    `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const quickLinks: { label: string; desc: string; icon: typeof BoxSelect; go: DashboardGo; accent: string }[] = [
    { label: '3D Studio', desc: 'Model, configure & dimension the active unit', icon: BoxSelect, go: 'studio', accent: '#f59e0b' },
    { label: 'Project Schedule', desc: 'Manage units, tags, glass, finishes & location', icon: FileSpreadsheet, go: 'schedule', accent: '#38bdf8' },
    { label: '1D Nesting & Labels', desc: `${nesting.totalBarsToPull} stock bars · ${nesting.overallEfficiencyPercent.toFixed(1)}% yield`, icon: Scissors, go: 'nesting', accent: '#a78bfa' },
    { label: '2D Vector CAD', desc: 'Elevations, sections & fabrication drawings', icon: Compass, go: 'cad', accent: '#34d399' },
    { label: 'Commercial Quote & BOM', desc: `Estimated ${money(dossier.quote.grandTotal)}`, icon: CircleDollarSign, go: 'quote', accent: '#fb7185' },
    { label: 'Fabricator Audit', desc: `${reviews} of ${dossier.checks.length} checks need review`, icon: FileCheck2, go: 'audit', accent: '#f472b6' },
  ];

  const saveLabel =
    projectRef === null
      ? 'Unsaved in this session'
      : projectRef.kind === 'cloud'
        ? `Saved to cloud · ${new Date(projectRef.savedAt).toLocaleString()}`
        : `Saved in this browser · ${new Date(projectRef.savedAt).toLocaleString()}`;

  return (
    <div className="dashboard-wrapper">
      {/* Project Identity Banner */}
      <div style={{ ...CARD, padding: '20px 22px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <FolderKanban size={18} style={{ color: 'var(--accent-strong)' }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)' }}>ACTIVE PROJECT</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--accent-strong)', background: 'var(--accent-soft)', padding: '2px 9px', borderRadius: 12, fontWeight: 800 }}>{project.projectNumber || 'NO REF'}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{project.projectName}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            <span><b style={{ color: 'var(--ink)' }}>{project.clientName || '—'}</b> · Client</span>
            <span>Date <b className="mono" style={{ color: 'var(--ink)' }}>{project.date}</b></span>
            <span>Contractor <b style={{ color: 'var(--ink)' }}>{project.contractorName || '—'}</b></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: projectRef === null ? 'var(--danger)' : 'var(--green)' }} />
              {saveLabel}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {confirmNew ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 9, padding: '4px 6px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', padding: '0 6px' }}>Start a new project?</span>
              <button
                type="button"
                onClick={() => {
                  setConfirmNew(false);
                  onNewProject();
                }}
                style={{ height: 28, padding: '0 10px', border: '1px solid var(--danger)', background: 'var(--danger)', color: '#ffffff', borderRadius: 7, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
              >
                Yes, Start New
              </button>
              <button
                type="button"
                onClick={() => setConfirmNew(false)}
                style={{ height: 28, padding: '0 10px', border: '1px solid var(--edge-strong)', background: 'transparent', color: 'var(--ink)', borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmNew(true)}
              style={{ height: 38, padding: '0 14px', border: '1px solid var(--edge-strong)', background: 'transparent', color: 'var(--ink)', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Sparkles size={14} /> New Project
            </button>
          )}
          <button
            type="button"
            onClick={() => onGo('schedule')}
            style={{ height: 38, padding: '0 14px', border: '1px solid var(--edge-strong)', background: 'transparent', color: 'var(--ink)', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <ClipboardList size={14} /> Edit Project
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onExportPdf}
            style={{ height: 38, justifyContent: 'center' }}
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Opening Units" value={String(openings.length)} sub={`${stats.totalUnits} leaves / items`} icon={<Layers size={15} />} tone="#38bdf8" />
        <KpiCard label="Glass Area" value={`${stats.totalGlassM2.toFixed(1)} m²`} sub={`${stats.glassPanels} panels`} icon={<BoxSelect size={15} />} tone="#34d399" />
        <KpiCard label="Aluminium Extrusion" value={`${stats.totalAluKg.toFixed(1)} kg`} sub={`${dossier.totals.cutPieces} cut pieces`} icon={<Weight size={15} />} tone="#a78bfa" />
        <KpiCard label="Stock Bars to Pull" value={String(nesting.totalBarsToPull)} sub={`${nesting.overallEfficiencyPercent.toFixed(1)}% yield`} icon={<Scissors size={15} />} tone="#f59e0b" />
        <KpiCard label="Est. Project Value" value={money(dossier.quote.grandTotal)} sub={`${money(dossier.quote.subtotal)} + tax`} icon={<CircleDollarSign size={15} />} tone="#fb7185" />
        <KpiCard label="Fabrication Checks" value={`${dossier.checks.length - reviews}/${dossier.checks.length}`} sub={reviews === 0 ? 'All clear to build' : `${reviews} need review`} icon={<ShieldCheck size={15} />} tone={reviews === 0 ? '#34d399' : '#fbbf24'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Quick add a unit */}
          <div style={{ ...CARD, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
                <Plus size={15} strokeWidth={2.6} />
              </span>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>ADD A NEW OPENING TO THIS PROJECT</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                className="select"
                aria-label="Quick add system"
                value={quickSystem}
                onChange={(event) => setQuickSystem(event.target.value as TypologyId)}
                style={{ flex: '1 1 260px', width: 'auto' }}
              >
                {Object.entries(TYPOLOGY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onAddOpening(quickSystem)}
                className="btn"
                style={{ height: 42, padding: '0 16px', whiteSpace: 'nowrap' }}
              >
                <Plus size={14} /> Add Opening
              </button>
            </div>
          </div>

          {/* Opening register */}
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--edge)' }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)' }}>OPENING REGISTER</span>
                <h2 style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{openings.length} units scheduled</h2>
              </div>
              <button type="button" onClick={() => onGo('schedule')} style={{ background: 'transparent', border: 'none', color: 'var(--accent-strong)', fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                Full schedule <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--panel)', textAlign: 'left' }}>
                    {['Tag', 'System', 'Size (mm)', 'Qty', 'Glass', 'Alu / unit', ''].map((heading) => (
                      <th key={heading} style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800 }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {derivedProjectOpenings.map((opening, index) => {
                    const panelArea = opening.glassPanels.reduce((sum, g) => sum + g.areaM2, 0);
                    return (
                      <tr key={opening.config.id} style={{ borderTop: '1px solid var(--edge)', background: index % 2 ? 'var(--table-hover)' : 'transparent' }}>
                        <td style={{ padding: '11px 12px' }}>
                          <span className="mono" style={{ fontWeight: 800, fontSize: 12, color: 'var(--ink)' }}>{opening.config.tag}</span>
                        </td>
                        <td style={{ padding: '11px 12px' }}>
                          <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontSize: 10 }}>{SYSTEM_SHORT[opening.config.system]}</span>{' '}
                          <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, display: 'inline-block', verticalAlign: 'bottom' }}>{opening.config.name}</span>
                        </td>
                        <td className="mono" style={{ padding: '11px 12px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{opening.config.width} × {opening.config.height}</td>
                        <td className="mono" style={{ padding: '11px 12px', color: 'var(--ink)', textAlign: 'center' }}>{opening.config.quantity}</td>
                        <td style={{ padding: '11px 12px', color: 'var(--muted)' }}>{panelArea.toFixed(1)} m²</td>
                        <td className="mono" style={{ padding: '11px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{opening.totalAluWeightKg.toFixed(1)} kg</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            title={`Open ${opening.config.tag} in 3D Studio`}
                            onClick={() => onOpenInStudio(opening.config.id)}
                            style={{ background: 'var(--accent-soft)', border: 'none', color: 'var(--accent-strong)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'inline-grid', placeItems: 'center' }}
                          >
                            <Eye size={14} />
                            <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 }}>Open {opening.config.tag} in 3D Studio</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* System mix */}
          <div style={{ ...CARD, padding: 18 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)' }}>SYSTEM MIX</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {systemMix.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No openings yet.</div>}
              {systemMix.map(([system, info]) => {
                const percent = stats.totalUnits === 0 ? 0 : Math.round((info.qty / stats.totalUnits) * 100);
                return (
                  <div key={system}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.label}</span>
                      <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>{info.qty} · {percent}%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 5, background: 'var(--edge)', overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, var(--accent), var(--accent-strong))' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Where to go next */}
          <div style={{ ...CARD, padding: 18 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)' }}>PROJECT WORKFLOW</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.go}
                    type="button"
                    onClick={() => onGo(link.go)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 10, padding: '11px 13px', cursor: 'pointer', transition: 'border-color 0.15s ease, transform 0.1s ease' }}
                  >
                    <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center', background: `${link.accent}1f`, color: link.accent }}>
                      <Icon size={16} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{link.label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.desc}</span>
                    </span>
                    <Check size={15} style={{ color: link.accent, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: ReactNode; tone: string }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', minWidth: 0 }}>{label}</span>
        <span style={{ color: tone, flexShrink: 0, display: 'grid', placeItems: 'center' }}>{icon}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
  );
}
