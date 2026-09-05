'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Hammer,
  Hexagon,
  Sun,
  Moon,
  Save,
  BoxSelect,
  FileSpreadsheet,
  Compass,
  DollarSign,
  Scissors,
  FileCheck2,
  Home,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import DoorViewer from './door-viewer';
import ProjectSchedule from '../components/project-schedule';
import VectorCadDrawings from '../components/vector-cad-drawings';
import NestingView from '../components/nesting-view';
import CommercialQuoteView from '../components/commercial-quote';
import FabricationAuditReport from '../components/fabrication-audit-report';
import CuttingPlanePrintDocument from '../components/cutting-plane-print-document';
import { buildManufacturingDossier } from '../lib/manufacturing-dossier';
import type { DoorConfig } from '../lib/door-model';
import { defaultDoorConfig, deriveDoor, doorConfigSchema, fabricationChecks } from '../lib/door-model';
import type { DerivedOpening, OpeningItem, ProjectMetadata, TypologyId } from '../lib/types';
import { nestProjectCuts } from '../lib/nesting-engine';

declare global {
  interface Document {
    modelContext?: { registerTool?: (tool: unknown) => void };
    __fullAluDoorToolsRegistered?: boolean;
  }
}

const INITIAL_PROJECT: ProjectMetadata = {
  id: 'proj-001',
  projectName: 'Luxury Villa Glazing Project',
  clientName: 'Atelier Architecture & Interiors',
  projectNumber: 'ALU-2026-08',
  date: new Date().toISOString().slice(0, 10),
  currency: 'USD',
  taxRatePercent: 8.0,
  contractorName: 'ALU DOOR Pro Engineering',
};

const INITIAL_OPENINGS: OpeningItem[] = [
  {
    id: 'open-1',
    tag: 'D-01',
    name: 'Main Entrance 100 mm Single Door',
    system: '100D-single',
    width: 950,
    height: 2200,
    quantity: 2,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Ground Floor Entry',
    hingeSide: 'left',
    openingAngle: 8,
  },
  {
    id: 'open-2',
    tag: 'D-02',
    name: 'Patio 100 mm Double Swing Door',
    system: '100D-double',
    width: 1800,
    height: 2200,
    quantity: 1,
    finish: 'black',
    glass: '6mm-clear',
    location: 'Rear Terrace',
    hingeSide: 'left',
    openingAngle: 12,
  },
  {
    id: 'open-3',
    tag: 'W-01',
    name: '70S 2-Track Sliding Window',
    system: '70S-sliding-2p',
    width: 2000,
    height: 2100,
    quantity: 3,
    finish: 'natural',
    glass: '6mm-clear',
    location: 'Living & Dining Room',
  },
];

export default function DoorDesigner() {
  const [activeTab, setActiveTab] = useState<'studio' | 'schedule' | 'cad' | 'nesting' | 'quote' | 'audit'>('studio');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [project, setProject] = useState<ProjectMetadata>(INITIAL_PROJECT);
  const [openings, setOpenings] = useState<OpeningItem[]>(INITIAL_OPENINGS);
  const [activeOpeningId, setActiveOpeningId] = useState<string>(INITIAL_OPENINGS[0].id);

  // Active opening currently loaded in 3D & 2D views
  const activeOpening = useMemo(
    () => openings.find((o) => o.id === activeOpeningId) || openings[0],
    [openings, activeOpeningId]
  );

  // 3D Studio Single-Door config adapter
  const [config, setConfig] = useState<DoorConfig>({
    ...defaultDoorConfig,
    width: activeOpening.width,
    height: activeOpening.height,
    system: activeOpening.system,
    finish: activeOpening.finish,
    hingeSide: activeOpening.hingeSide || 'left',
  });

  const [view, setView] = useState<'assembly' | 'exploded' | 'section'>('assembly');
  const [showConfig, setShowConfig] = useState(true);
  const [showFab, setShowFab] = useState(true);
  const [dimensionDraft, setDimensionDraft] = useState({
    width: String(activeOpening.width),
    height: String(activeOpening.height),
  });
  const [makeStatus, setMakeStatus] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleSelectOpening = (id: string) => {
    setActiveOpeningId(id);
    const target = openings.find((o) => o.id === id);
    if (target) {
      setConfig({
        ...defaultDoorConfig,
        width: target.width,
        height: target.height,
        system: target.system,
        finish: target.finish,
        hingeSide: target.hingeSide || 'left',
        tag: target.tag,
      });
      setDimensionDraft({
        width: String(target.width),
        height: String(target.height),
      });
    }
  };

  const derived = useMemo(() => deriveDoor(config), [config]);
  const checks = useMemo(() => fabricationChecks(config), [config]);

  // Project-wide derived openings & 1D Nesting
  const derivedProjectOpenings: DerivedOpening[] = useMemo(
    () => openings.map((o) => deriveDoor(o)),
    [openings]
  );

  const allProjectCuts = useMemo(() => {
    return derivedProjectOpenings.flatMap((d) => d.cutList);
  }, [derivedProjectOpenings]);

  const projectNesting = useMemo(() => {
    return nestProjectCuts(allProjectCuts);
  }, [allProjectCuts]);

  const manufacturingDossier = useMemo(
    () => buildManufacturingDossier(project, derivedProjectOpenings, projectNesting),
    [project, derivedProjectOpenings, projectNesting]
  );

  const summaryRef = useRef({ configuration: config, cutList: derived.cutList, checks });
  useEffect(() => {
    summaryRef.current = { configuration: config, cutList: derived.cutList, checks };
  }, [config, derived, checks]);

  const update = useCallback(
    <K extends keyof DoorConfig>(key: K, value: DoorConfig[K]) => {
      setConfig((c) => {
        const next = { ...c, [key]: value };
        // also reflect back into active opening
        setOpenings((prev) =>
          prev.map((o) =>
            o.id === activeOpeningId
              ? {
                  ...o,
                  [key]: value,
                  width: next.width,
                  height: next.height,
                  finish: next.finish,
                  hingeSide: next.hingeSide,
                }
              : o
          )
        );
        return next;
      });
    },
    [activeOpeningId]
  );

  const makeDoor = () => {
    const w = Number(dimensionDraft.width);
    const h = Number(dimensionDraft.height);
    if (w < 500 || w > 4500 || h < 600 || h > 3500) {
      setMakeStatus('Width must be 500-4500 mm; height 600-3500 mm.');
      return;
    }
    const next = { ...config, width: w, height: h };
    setConfig(next);
    setOpenings((prev) =>
      prev.map((o) => (o.id === activeOpeningId ? { ...o, width: w, height: h } : o))
    );
    setMakeStatus(`Built ${w} × ${h} mm`);
  };

  const exportCsv = () => {
    const rows = [
      'Item,Profile,Description,Qty,Length mm,Ends',
      ...derived.cutList.map((r) =>
        [r.id, r.profile, r.description, r.qty, r.length.toFixed(1), r.ends].map((v) => `"${v}"`).join(',')
      ),
    ];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `door-${config.width}x${config.height}-cut-list.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCuttingPlanePdf = () => setIsExportingPdf(true);

  useEffect(() => {
    if (!isExportingPdf) return;
    const timer = window.setTimeout(() => window.print(), 120);
    const finishExport = () => setIsExportingPdf(false);
    window.addEventListener('afterprint', finishExport);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finishExport);
    };
  }, [isExportingPdf]);

  const setThemeTo = (nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const NAV_ITEMS: { key: string; icon: typeof Home; label: string; go: 'studio' | 'schedule' | 'cad' | 'nesting' | 'quote' | 'audit' }[] = [
    { key: 'dashboard', icon: Home, label: 'Dashboard', go: 'studio' },
    { key: 'studio', icon: BoxSelect, label: '3D Studio', go: 'studio' },
    { key: 'schedule', icon: FileSpreadsheet, label: `Project Schedule (${openings.length})`, go: 'schedule' },
    { key: 'cad', icon: Compass, label: '2D Vector CAD', go: 'cad' },
    { key: 'nesting', icon: Scissors, label: `1D Nesting & Labels (${projectNesting.totalBarsToPull} bars)`, go: 'nesting' },
    { key: 'quote', icon: DollarSign, label: 'Commercial Quote & BOM', go: 'quote' },
    { key: 'audit', icon: FileCheck2, label: 'Fabricator Audit (PDF)', go: 'audit' },
  ];

  // Register AI Tools for document.modelContext
  useEffect(() => {
    const api = document.modelContext;
    if (!api?.registerTool || document.__fullAluDoorToolsRegistered) return;
    document.__fullAluDoorToolsRegistered = true;
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(api.registerTool?.(tool)).catch(() => undefined);
      } catch {}
    };

    register({
      name: 'configure_aluminium_door',
      description: 'Set door width, height, hinge side, finish, opening angle or system typology.',
      inputSchema: {
        type: 'object',
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
          hingeSide: { enum: ['left', 'right'] },
          finish: { enum: ['natural', 'black', 'bronze', 'white'] },
          openingAngle: { type: 'number' },
          system: { enum: ['100D-single', '100D-double', '70S-sliding-2p', '70S-sliding-4p', '74-cgroove', 'casement'] },
        },
      },
      execute: async (input: Partial<DoorConfig>) => {
        const parsed = doorConfigSchema.safeParse({ ...summaryRef.current.configuration, ...input });
        if (!parsed.success) {
          return { content: [{ type: 'text', text: 'Invalid door dimensions.' }] };
        }
        setConfig(parsed.data);
        setDimensionDraft({ width: String(parsed.data.width), height: String(parsed.data.height) });
        return { content: [{ type: 'text', text: 'Door configuration updated and revalidated.' }] };
      },
    });

    register({
      name: 'read_fabrication_summary',
      description: 'Return current cut list, 1D nesting, and validation state.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ configuration: config, cutList: derived.cutList, nesting: projectNesting }, null, 2) }],
      }),
    });
  }, [config, derived, projectNesting]);

  return (
    <main className={`app-shell ${isExportingPdf ? 'printing-cutting-plane' : ''}`} data-theme={theme}>
      {/* Top Application Bar */}
      <header className="topbar">
        <div className="brand" style={{ flexShrink: 0 }}>
          <span className="brandmark"><Hexagon size={17} strokeWidth={2.2} /></span>
          <span className="brand-name" style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em', color: '#ffffff', whiteSpace: 'nowrap' }}>FullAluDoor Pro</span>
          <span className="brand-sub">CAD/CAM</span>
        </div>

        {/* Workspace Mode Navigation Tabs */}
        <nav className="tab-strip" style={{ flex: 1, minWidth: 0 }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === 'dashboard' ? false : activeTab === item.key;
            return (
              <button
                key={item.key}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.go)}
                title={item.label}
                style={{ flexShrink: 0 }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Action Tools */}
        <div className="top-actions" style={{ flexShrink: 0, paddingLeft: 12 }}>
          <div className="theme-seg" style={{ display: 'flex', background: '#1f242b', border: '1px solid #333c45', borderRadius: 9, padding: 3, gap: 2 }}>
            <button
              onClick={() => setThemeTo('light')}
              aria-pressed={theme === 'light'}
              title="White / Light mode"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
                borderRadius: 7,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: theme === 'light' ? '#ffffff' : 'transparent',
                color: theme === 'light' ? '#0f172a' : '#9aa5b1',
                transition: 'all 0.15s ease'
              }}
            >
              <Sun size={14} /> <span className="seg-txt">Light</span>
            </button>
            <button
              onClick={() => setThemeTo('dark')}
              aria-pressed={theme === 'dark'}
              title="Dark mode"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
                borderRadius: 7,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: theme === 'dark' ? '#ffffff' : 'transparent',
                color: theme === 'dark' ? '#0f172a' : '#9aa5b1',
                transition: 'all 0.15s ease'
              }}
            >
              <Moon size={14} /> <span className="seg-txt">Dark</span>
            </button>
          </div>
          <button className="btn csv-hide" onClick={exportCsv} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            <Download size={14} /> <span className="btn-txt">Export CSV</span>
          </button>
          <button className="btn btn-primary" onClick={exportCuttingPlanePdf} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            <Save size={14} /> <span className="btn-txt">Export PDF</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 1. 3D STUDIO TAB                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'studio' && (
        <div className={`workspace ${showConfig ? '' : 'cfg-off'} ${showFab ? '' : 'fab-off'}`}>
          {/* Left Parameter Controls Panel */}
          {showConfig && (
          <aside className="panel panel-left">
            <div className="panel-head">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="eyebrow">ACTIVE UNIT</span>
                  <span className="mono" style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '2px 10px', borderRadius: 20, fontWeight: 800, fontSize: 11 }}>
                    {activeOpening.tag}
                  </span>
                </div>
                <button
                  onClick={() => setShowConfig(false)}
                  title="Hide configuration panel"
                  aria-label="Hide configuration panel"
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, display: 'grid', placeItems: 'center' }}
                >
                  <ChevronsLeft size={16} />
                </button>
              </div>
              <h1 className="panel-title">{activeOpening.name}</h1>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'var(--green-soft)', color: 'var(--green)', padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                <Check size={13} strokeWidth={3} /> Ready to Fabricate
              </div>
            </div>

            <section className="section">
              <h2 className="section-title">OVERALL OPENING FRAME</h2>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="width">Width</label>
                  <div className="input-wrap">
                    <input
                      id="width"
                      className="input"
                      type="number"
                      min="500"
                      max="4500"
                      value={dimensionDraft.width}
                      onChange={(e) => {
                        setDimensionDraft((draft) => ({ ...draft, width: e.target.value }));
                        setMakeStatus('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') makeDoor();
                      }}
                    />
                    <span className="unit">mm</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="height">Height</label>
                  <div className="input-wrap">
                    <input
                      id="height"
                      className="input"
                      type="number"
                      min="600"
                      max="3500"
                      value={dimensionDraft.height}
                      onChange={(e) => {
                        setDimensionDraft((draft) => ({ ...draft, height: e.target.value }));
                        setMakeStatus('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') makeDoor();
                      }}
                    />
                    <span className="unit">mm</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--accent-soft)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 10, padding: '10px 13px', margin: '13px 0' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Built Size</span>
                <span className="mono" style={{ fontWeight: 800, color: 'var(--accent-strong)', fontSize: 13 }}>{config.width} × {config.height} mm</span>
              </div>

              <button className="make-door" onClick={makeDoor}>
                <Hammer size={16} /> Update 3D Geometry
              </button>
              {makeStatus && (
                <div className={`make-status ${makeStatus.startsWith('Built') ? 'ok' : 'error'}`} style={{ marginTop: 8, textAlign: 'center' }}>
                  {makeStatus}
                </div>
              )}
            </section>

            <section className="section">
              <h2 className="section-title">SYSTEM TYPOLOGY</h2>
              <select
                className="select"
                value={config.system || '100D-single'}
                onChange={(e) => update('system', e.target.value as TypologyId)}
              >
                <option value="100D-single">100 mm Single Swing Door</option>
                <option value="100D-double">100 mm Double Swing Door</option>
                <option value="70S-sliding-2p">70S 2-Track 2-Panel Slider</option>
                <option value="70S-sliding-4p">70S 2-Track 4-Panel Slider (OXXO)</option>
                <option value="74-cgroove">74 mm C-Groove Slider</option>
                <option value="casement">Casement / Projected Window</option>
              </select>
            </section>

            <section className="section">
              <h2 className="section-title">HANDING & FINISH</h2>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="handing">Hinge / Slide</label>
                  <select
                    id="handing"
                    className="select"
                    value={config.hingeSide}
                    onChange={(e) => update('hingeSide', e.target.value as DoorConfig['hingeSide'])}
                  >
                    <option value="left">Left Hand</option>
                    <option value="right">Right Hand</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="finish">Finish</label>
                  <select
                    id="finish"
                    className="select"
                    value={config.finish}
                    onChange={(e) => update('finish', e.target.value as DoorConfig['finish'])}
                  >
                    <option value="natural">Natural Anodized</option>
                    <option value="black">Jet Black</option>
                    <option value="bronze">Bronze</option>
                    <option value="white">Pure White</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">OPERATION & GLASS</h2>
              <div className="field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>Opening Angle</span>
                  <span className="mono" style={{ fontWeight: 800, color: 'var(--accent-strong)' }}>{config.openingAngle}°</span>
                </label>
                <input
                  aria-label="Opening angle"
                  type="range"
                  min="0"
                  max="110"
                  value={config.openingAngle}
                  onChange={(e) => update('openingAngle', Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>
              <div className="switch-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Show Glass Panels</span>
                <button
                  className={`switch ${config.showGlass ? 'on' : ''}`}
                  onClick={() => update('showGlass', !config.showGlass)}
                  aria-label="Toggle glass"
                  style={{ background: config.showGlass ? 'var(--accent)' : 'var(--edge-strong)', width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s ease' }}
                >
                  <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#ffffff', position: 'absolute', top: 2, left: config.showGlass ? 18 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'all 0.15s ease' }} />
                </button>
              </div>
            </section>
          </aside>
          )}

          {/* Center 3D Studio Viewport */}
          <div className="viewport-shell">
            <section className="viewport">
              <DoorViewer config={config} view={view} setView={setView} theme="dark" />
            </section>
            {!showConfig && (
              <button className="edge-reopen reopen-left" onClick={() => setShowConfig(true)} title="Show configuration panel" aria-label="Show configuration panel">
                <ChevronsRight size={16} />
              </button>
            )}
            {!showFab && (
              <button className="edge-reopen reopen-right" onClick={() => setShowFab(true)} title="Show fabrication panel" aria-label="Show fabrication panel">
                <ChevronsLeft size={16} />
              </button>
            )}
          </div>

          {/* Right Fabrication & Checks Panel */}
          {showFab && (
          <aside className="panel panel-right">
            <div className="panel-head">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span className="eyebrow">FABRICATION STATUS</span>
                <button
                  onClick={() => setShowFab(false)}
                  title="Hide fabrication panel"
                  aria-label="Hide fabrication panel"
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, display: 'grid', placeItems: 'center' }}
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--green-soft)', color: 'var(--green)', display: 'grid', placeItems: 'center' }}>
                  <Check size={26} strokeWidth={2.6} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>All Good</h3>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ready for production</span>
                </div>
              </div>
              <div className="status-summary" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                <div className="metric">
                  <strong style={{ color: 'var(--green)' }}>0</strong>
                  <span>Joint Collisions</span>
                </div>
                <div className="metric">
                  <strong>{(derived.clearWidth - derived.jointGap * 2).toFixed(1)}</strong>
                  <span>Total Cut (mm)</span>
                </div>
              </div>
            </div>

            <section className="section">
              <h2 className="section-title">GEOMETRY CHECKS</h2>
              <div className="check-list">
                {checks.map((c) => (
                  <div className="check" key={c.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--edge)' }}>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', minWidth: 0 }}>
                      <span className="check-icon" style={{ color: 'var(--green)', marginTop: 1, flexShrink: 0 }}>
                        <Check size={15} strokeWidth={2.6} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{c.label}</div>
                        <small style={{ color: 'var(--muted)', fontSize: 10, lineHeight: 1.35, display: 'block', marginTop: 1 }}>{c.detail}</small>
                      </div>
                    </div>
                    <b className="pass" style={{ color: 'var(--green)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.03em', textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>{c.value}</b>
                  </div>
                ))}
              </div>
            </section>

            <section className="section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className="section-title" style={{ margin: 0 }}>CUT LIST FOR UNIT {activeOpening.tag}</h2>
              </div>
              <div style={{ border: '1px solid var(--edge)', borderRadius: 10, overflow: 'hidden' }}>
                <table className="quote-table" style={{ fontSize: '11px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--panel)' }}>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', textAlign: 'left', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Profile</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', textAlign: 'center', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '8px 10px', color: 'var(--muted)', textAlign: 'right', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cut Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.cutList
                      .filter((x) => x.length > 0)
                      .map((x, index) => (
                        <tr key={`${x.id}-${index}`} style={{ borderTop: '1px solid var(--edge)', background: index % 2 ? 'var(--table-hover)' : 'transparent' }}>
                          <td style={{ padding: '7px 10px' }}>
                            <span className="mono" style={{ fontWeight: 800, color: 'var(--ink)', fontSize: 11 }}>{x.profile}</span>
                            <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 1 }}>{x.description}</div>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, color: 'var(--ink)' }}>{x.qty}</td>
                          <td className="mono" style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--accent-strong)' }}>{x.length.toFixed(0)} mm</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => setActiveTab('schedule')}
                style={{ marginTop: 14, background: 'transparent', border: 'none', color: 'var(--accent-strong)', fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}
              >
                View Full Cut List <span aria-hidden>→</span>
              </button>
            </section>
          </aside>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PROJECT SCHEDULE TAB                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <ProjectSchedule
          project={project}
          setProject={setProject}
          openings={openings}
          setOpenings={setOpenings}
          activeOpeningId={activeOpeningId}
          onSelectOpening={(id) => {
            handleSelectOpening(id);
            setActiveTab('studio');
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 3. 2D VECTOR CAD CONSTRUCTION DOCUMENTS TAB                               */}
      {/* ========================================================================= */}
      {activeTab === 'cad' && <VectorCadDrawings opening={activeOpening} theme={theme} />}

      {/* ========================================================================= */}
      {/* 4. 1D BAR NESTING & LABELS TAB                                            */}
      {/* ========================================================================= */}
      {activeTab === 'nesting' && <NestingView nesting={projectNesting} theme={theme} />}

      {/* ========================================================================= */}
      {/* 5. COMMERCIAL QUOTE & MASTER BOM TAB                                      */}
      {/* ========================================================================= */}
      {activeTab === 'quote' && (
        <CommercialQuoteView
          project={project}
          openings={derivedProjectOpenings}
          nesting={projectNesting}
          theme={theme}
        />
      )}

      {/* ========================================================================= */}
      {/* 6. EXPERT FABRICATOR AUDIT REPORT & CONSTRUCTION DOSSIER TAB              */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <FabricationAuditReport
          project={project}
          openings={openings}
          activeOpeningId={activeOpeningId}
          onSelectOpening={handleSelectOpening}
          theme={theme}
        />
      )}

      {isExportingPdf && (
        <CuttingPlanePrintDocument dossier={manufacturingDossier} />
      )}
    </main>
  );
}
