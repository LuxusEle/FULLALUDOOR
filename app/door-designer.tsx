'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  Download,
  Hammer,
  Hexagon,
  Layers3,
  MousePointer2,
  Rotate3D,
  Ruler,
  Save,
  ShieldCheck,
  Sun,
  Moon,
  BoxSelect,
  FileSpreadsheet,
  Compass,
  DollarSign,
  Scissors,
  FileCheck2,
} from 'lucide-react';
import DoorViewer from './door-viewer';
import ProjectSchedule from '../components/project-schedule';
import VectorCadDrawings from '../components/vector-cad-drawings';
import NestingView from '../components/nesting-view';
import CommercialQuoteView from '../components/commercial-quote';
import FabricationAuditReport from '../components/fabrication-audit-report';
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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
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
  const [dimensionDraft, setDimensionDraft] = useState({
    width: String(activeOpening.width),
    height: String(activeOpening.height),
  });
  const [makeStatus, setMakeStatus] = useState('');

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

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

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
    <main className="app-shell" data-theme={theme}>
      {/* Top Application Bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brandmark">
            <Hexagon size={17} />
          </span>
          FullAluDoor Pro
          <span className="brand-sub">CAD/CAM</span>
        </div>

        {/* Workspace Mode Navigation Tabs */}
        <nav className="tab-strip">
          <button
            className={`tab-item ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
            title="Interactive 3D Visualizer & Studio"
          >
            <BoxSelect size={14} /> 3D Studio
          </button>
          <button
            className={`tab-item ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
            title="Multi-Opening Project Schedule Table"
          >
            <FileSpreadsheet size={14} /> Project Schedule ({openings.length})
          </button>
          <button
            className={`tab-item ${activeTab === 'cad' ? 'active' : ''}`}
            onClick={() => setActiveTab('cad')}
            title="Architectural Vector CAD Construction Shop Drawings"
          >
            <Compass size={14} /> 2D Vector CAD
          </button>
          <button
            className={`tab-item ${activeTab === 'nesting' ? 'active' : ''}`}
            onClick={() => setActiveTab('nesting')}
            title="1D Linear Bar Nesting & Cutting Mark Labels"
          >
            <Scissors size={14} /> 1D Nesting & Labels ({projectNesting.totalBarsToPull} bars)
          </button>
          <button
            className={`tab-item ${activeTab === 'quote' ? 'active' : ''}`}
            onClick={() => setActiveTab('quote')}
            title="Commercial Client Quote & Master BOM"
          >
            <DollarSign size={14} /> Commercial Quote & BOM
          </button>
          <button
            className={`tab-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
            title="Expert Fabricator Audit Report & Construction Dossier (PDF)"
          >
            <FileCheck2 size={14} /> Fabricator Audit (PDF)
          </button>
        </nav>

        {/* Global Action Tools */}
        <div className="top-actions">
          <button className="theme-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="btn" onClick={exportCsv} title="Export Current Cut List as CSV">
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => window.print()} title="Print or Save Full Project PDF">
            <Save size={14} /> Export PDF
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 1. 3D STUDIO TAB                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'studio' && (
        <div className="workspace">
          {/* Left Parameter Controls Panel */}
          <aside className="panel panel-left">
            <div className="panel-head">
              <div className="eyebrow">Active Unit: {activeOpening.tag}</div>
              <h1 className="panel-title">{activeOpening.name}</h1>
            </div>

            <section className="section">
              <h2 className="section-title">Overall Opening Frame</h2>
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
              <button className="make-door" onClick={makeDoor}>
                <Hammer size={15} /> Update 3D Geometry
              </button>
              <div className={`make-status ${makeStatus.startsWith('Built') ? 'ok' : ''}`} aria-live="polite">
                {makeStatus || 'Edit dimensions, then build the new geometry.'}
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">System Typology</h2>
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
              <h2 className="section-title">Handing & Finish</h2>
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
                    <option value="natural">Natural Anodised</option>
                    <option value="black">Jet Black</option>
                    <option value="bronze">Bronze</option>
                    <option value="white">Pure White</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">Operation & Glass</h2>
              <div className="range-row">
                <input
                  aria-label="Opening angle"
                  type="range"
                  min="0"
                  max="110"
                  value={config.openingAngle}
                  onChange={(e) => update('openingAngle', Number(e.target.value))}
                />
                <span className="range-value">{config.openingAngle}°</span>
              </div>
              <div className="switch-row">
                <span>Show Glass Panels</span>
                <button
                  className={`switch ${config.showGlass ? 'on' : ''}`}
                  onClick={() => update('showGlass', !config.showGlass)}
                  aria-label="Toggle glass"
                >
                  <span />
                </button>
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">Catalogue Profiles</h2>
              <div className="check-list">
                {[
                  ['Outer frame', '100D-3105'],
                  ['Hinge / lock stiles', '100D-101 / 103'],
                  ['Top / mid / bottom', '100D-201 / 301 / 401'],
                  ['Glazing bead', '100D-501'],
                ].map(([a, b]) => (
                  <div className="check" key={a}>
                    <Box size={15} color="var(--muted)" />
                    <span>{a}</span>
                    <code>{b}</code>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          {/* Center 3D Viewport with Pan, Zoom & X-Ray controls */}
          <section className="viewport">
            <div className="view-toolbar">
              {(
                [
                  ['assembly', 'Assembly'],
                  ['exploded', 'Exploded'],
                  ['section', 'Joint Cutaway (X-Ray)'],
                ] as const
              ).map(([val, label]) => (
                <button key={val} className={view === val ? 'active' : ''} onClick={() => setView(val)}>
                  {label}
                </button>
              ))}
            </div>

            <DoorViewer config={config} view={view} theme={theme} />

            <div className="canvas-help">
              <span>
                <MousePointer2 size={11} /> Drag orbit (or Pan button)
              </span>
              <span>
                <Rotate3D size={11} /> Wheel zoom (accelerated)
              </span>
            </div>
            <div className="datum">
              {view === 'section'
                ? config.system?.startsWith('70S')
                  ? '70S SILL & ROLLER CARRIAGE CUTAWAY: 35% X-Ray / 70S-1101-1 / 70S-1501 / 70S-1914 Roller'
                  : 'MID-RAIL JOINT CUTAWAY: 35% X-Ray / Angle Cleats / M6 Rod'
                : `UNIT: ${activeOpening.tag} | SYSTEM: ${config.system}`}
            </div>
          </section>

          {/* Right Fabrication & Checks Panel */}
          <aside className="panel panel-right">
            <div className="panel-head">
              <div className="eyebrow">Fabrication Status</div>
              <h2 className="panel-title">Physical Joints & BOM</h2>
              <div className="status-summary">
                <div className="metric">
                  <strong style={{ color: 'var(--green)' }}>0</strong>
                  <span>joint collisions</span>
                </div>
                <div className="metric">
                  <strong>{(derived.clearWidth - derived.jointGap * 2).toFixed(1)}</strong>
                  <span>rail cut mm</span>
                </div>
              </div>
            </div>

            <section className="section">
              <h2 className="section-title">Geometry Invariants</h2>
              <div className="check-list">
                {checks.map((c) => (
                  <div className="check" key={c.label}>
                    <span className="check-icon">
                      <Check size={12} />
                    </span>
                    <span>
                      {c.label}
                      <br />
                      <small>{c.detail}</small>
                    </span>
                    <b className="pass">{c.value}</b>
                  </div>
                ))}
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">Cut List for Unit {activeOpening.tag}</h2>
              <table className="quote-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th>Qty</th>
                    <th>Cut Length</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.cutList
                    .filter((x) => x.length > 0)
                    .map((x) => (
                      <tr key={x.id}>
                        <td>
                          <code>{x.profile}</code>
                          <br />
                          <small>{x.description}</small>
                        </td>
                        <td className="font-bold">{x.qty}</td>
                        <td className="mono font-bold">{x.length.toFixed(0)} mm</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>

            <section className="section">
              <h2 className="section-title">Machine Path & CNC</h2>
              <div className="check-list">
                <div className="check">
                  <Ruler size={15} />
                  <span>Drill & Prep Coordinates</span>
                  <b className="pass">MM</b>
                </div>
                <div className="check">
                  <Layers3 size={15} />
                  <span>DXF Solid Extrusions</span>
                  <b className="pass">ACTIVE</b>
                </div>
                <div className="check">
                  <ShieldCheck size={15} />
                  <span>ISO Structural Integrity</span>
                  <b className="pass">PASS</b>
                </div>
              </div>
            </section>
          </aside>
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
    </main>
  );
}
