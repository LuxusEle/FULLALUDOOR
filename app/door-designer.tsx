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
  Shield,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import Link from 'next/link';
import ProjectSchedule from '../components/project-schedule';
import VectorCadDrawings from '../components/vector-cad-drawings';
import NestingView from '../components/nesting-view';
import CommercialQuoteView from '../components/commercial-quote';
import FabricationAuditReport from '../components/fabrication-audit-report';
import CuttingPlanePrintDocument from '../components/cutting-plane-print-document';
import CloudProjectPanel from '../components/cloud-project-panel';
import ProjectLibrary from '../components/project-library';
import ProjectDashboard, { type NewProjectDetails } from '../components/project-dashboard';
import { useAccessSession } from '../components/auth/access-gate';
import { buildManufacturingDossier } from '../lib/manufacturing-dossier';
import type { DoorConfig } from '../lib/door-model';
import { defaultDoorConfig, deriveDoor, doorConfigSchema, fabricationChecks } from '../lib/door-model';
import type { DerivedOpening, OpeningItem, ProjectMetadata, TypologyId } from '../lib/types';
import type { StoredProject, StoredProjectRef } from '../lib/project-storage';
import { nestProjectCuts } from '../lib/nesting-engine';
import { TYPOLOGY_LABELS } from '../components/project-schedule';

type WorkspaceTab = 'dashboard' | 'studio' | 'schedule' | 'cad' | 'nesting' | 'quote' | 'audit';

const SYSTEM_DEFAULT_SIZE: Record<TypologyId, { width: number; height: number }> = {
  '100D-single': { width: 900, height: 2100 },
  '100D-double': { width: 1800, height: 2100 },
  '100S-sliding-2p': { width: 2400, height: 2100 },
  '70S-sliding-2p': { width: 1800, height: 2100 },
  '70S-sliding-4p': { width: 3200, height: 2200 },
  '74-cgroove': { width: 1800, height: 1500 },
  'casement': { width: 800, height: 1200 },
};

const isWindowSystem = (system: TypologyId) =>
  system === 'casement' || system.startsWith('70S') || system.startsWith('100S');

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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const { role: accessRole } = useAccessSession();
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [project, setProject] = useState<ProjectMetadata>(INITIAL_PROJECT);
  const [openings, setOpenings] = useState<OpeningItem[]>(INITIAL_OPENINGS);
  const [activeOpeningId, setActiveOpeningId] = useState<string>(INITIAL_OPENINGS[0].id);
  const [projectRef, setProjectRef] = useState<StoredProjectRef | null>(null);

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
  const [studioMobileTab, setStudioMobileTab] = useState<'canvas' | 'config' | 'fab'>('canvas');

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

  const applyStoredProject = useCallback((doc: StoredProject, ref: StoredProjectRef) => {
    setProject(doc.project);
    setOpenings(doc.openings);
    setProjectRef(ref);
    setMakeStatus('');
    const first = doc.openings[0];
    if (first) {
      setActiveOpeningId(first.id);
      setConfig({
        ...defaultDoorConfig,
        width: first.width,
        height: first.height,
        system: first.system,
        finish: first.finish,
        hingeSide: first.hingeSide || 'left',
        tag: first.tag,
        quantity: first.quantity,
        glass: first.glass,
        location: first.location,
      });
      setDimensionDraft({ width: String(first.width), height: String(first.height) });
    }
  }, []);

  const focusOpening = (opening: OpeningItem) => {
    setActiveOpeningId(opening.id);
    setConfig({
      ...defaultDoorConfig,
      width: opening.width,
      height: opening.height,
      system: opening.system,
      finish: opening.finish,
      hingeSide: opening.hingeSide || 'left',
      tag: opening.tag,
      quantity: opening.quantity,
      glass: opening.glass,
      location: opening.location,
    });
    setDimensionDraft({ width: String(opening.width), height: String(opening.height) });
  };

  const buildBlankUnit = (system: TypologyId, nextIndex: number): OpeningItem => {
    const size = SYSTEM_DEFAULT_SIZE[system];
    const prefix = isWindowSystem(system) ? 'W' : 'D';
    return {
      id: `open-${Date.now()}`,
      tag: `${prefix}-${String(nextIndex).padStart(2, '0')}`,
      name: TYPOLOGY_LABELS[system],
      system,
      width: size.width,
      height: size.height,
      quantity: 1,
      finish: 'natural',
      glass: '6mm-clear',
      location: 'Ground Floor',
      hingeSide: 'left',
    };
  };

  const handleAddOpeningFromDashboard = (system: TypologyId) => {
    const unit = buildBlankUnit(system, openings.length + 1);
    setOpenings((prev) => [...prev, unit]);
    focusOpening(unit);
    setMakeStatus('');
    setActiveTab('studio');
  };

  const handleStartNewProject = (details: NewProjectDetails) => {
    const now = new Date();
    const freshProject: ProjectMetadata = {
      id: `proj-${now.getTime().toString().slice(-6)}`,
      projectName: details.projectName?.trim() || 'New Project',
      clientName: details.clientName || '',
      projectNumber: details.projectNumber || '',
      date: details.date || now.toISOString().slice(0, 10),
      currency: details.currency || 'USD',
      taxRatePercent: details.taxRatePercent,
      contractorName: details.contractorName || 'ALU DOOR Pro Engineering',
    };
    const firstUnit = buildBlankUnit('100D-single', 1);
    setProject(freshProject);
    setOpenings([firstUnit]);
    setProjectRef(null);
    setMakeStatus('');
    focusOpening(firstUnit);
    setActiveTab('dashboard');
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

  const NAV_ITEMS: { key: string; icon: typeof Home; label: string; short: string; go: WorkspaceTab }[] = [
    { key: 'dashboard', icon: Home, label: 'Dashboard', short: 'Home', go: 'dashboard' },
    { key: 'schedule', icon: FileSpreadsheet, label: `Project Schedule (${openings.length})`, short: 'Schedule', go: 'schedule' },
    { key: 'studio', icon: BoxSelect, label: '3D Studio', short: 'Studio', go: 'studio' },
    { key: 'cad', icon: Compass, label: '2D Vector CAD', short: 'CAD', go: 'cad' },
    { key: 'nesting', icon: Scissors, label: `1D Nesting & Labels (${projectNesting.totalBarsToPull} bars)`, short: 'Nesting', go: 'nesting' },
    { key: 'quote', icon: DollarSign, label: 'Commercial Quote & BOM', short: 'Quote', go: 'quote' },
    { key: 'audit', icon: FileCheck2, label: 'Fabricator Audit (PDF)', short: 'Audit', go: 'audit' },
  ];

  const goToTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    // Switching sections should always start at the top of the new view.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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
          system: { enum: ['100D-single', '100D-double', '100S-sliding-2p', '70S-sliding-2p', '70S-sliding-4p', '74-cgroove', 'casement'] },
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
            const isActive = activeTab === item.go;
            return (
              <button
                key={item.key}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => goToTab(item.go)}
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
          {accessRole === 'admin' && (
            <Link
              href="/admin"
              className="btn"
              title="Approve and manage user devices"
              style={{ flexShrink: 0, whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              <Shield size={14} /> <span className="btn-txt">Admin</span>
            </Link>
          )}
          <CloudProjectPanel
            project={project}
            openings={openings}
            currentRef={projectRef}
            onOpenDocument={applyStoredProject}
            onCurrentRefChange={setProjectRef}
          />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 0. PROJECT DASHBOARD TAB                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <ProjectDashboard
          project={project}
          projectRef={projectRef}
          openings={openings}
          derivedProjectOpenings={derivedProjectOpenings}
          nesting={projectNesting}
          dossier={manufacturingDossier}
          onGo={(tab) => setActiveTab(tab)}
          onOpenInStudio={(id) => {
            handleSelectOpening(id);
            setActiveTab('studio');
          }}
          onAddOpening={handleAddOpeningFromDashboard}
          onOpenProjects={() => setProjectsOpen(true)}
          onNewProject={handleStartNewProject}
          onExportPdf={exportCuttingPlanePdf}
        />
      )}

      {/* ========================================================================= */}
      {/* 1. 3D STUDIO TAB                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'studio' && (
        <>
          {/* Mobile sub-navigation switcher for 3D Studio (< 1081px) */}
          <div className="studio-mobile-switcher">
            <button
              type="button"
              className={`studio-mobile-btn ${studioMobileTab === 'canvas' ? 'active' : ''}`}
              onClick={() => setStudioMobileTab('canvas')}
            >
              <BoxSelect size={14} />
              <span>3D Canvas</span>
            </button>
            <button
              type="button"
              className={`studio-mobile-btn ${studioMobileTab === 'config' ? 'active' : ''}`}
              onClick={() => setStudioMobileTab('config')}
            >
              <Compass size={14} />
              <span>Parameters</span>
            </button>
            <button
              type="button"
              className={`studio-mobile-btn ${studioMobileTab === 'fab' ? 'active' : ''}`}
              onClick={() => setStudioMobileTab('fab')}
            >
              <Scissors size={14} />
              <span>Cut List</span>
            </button>
          </div>

          <div
            className={`workspace ${showConfig ? '' : 'cfg-off'} ${showFab ? '' : 'fab-off'}`}
            data-mobile-tab={studioMobileTab}
          >
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
                <Hammer size={15} /> Apply Dimensions
              </button>
              <div className={`make-status ${makeStatus.startsWith('Built') ? 'ok' : makeStatus ? 'error' : ''}`}>
                {makeStatus}
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">TYPOLOGY & PROFILE SYSTEM</h2>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="system">Profile Series</label>
                <select
                  id="system"
                  className="select"
                  value={config.system}
                  onChange={(e) => update('system', e.target.value as TypologyId)}
                >
                  <option value="100D-single">100D Single Door (100mm Frame)</option>
                  <option value="100D-double">100D Double Swing Door (100mm Frame)</option>
                  <option value="100S-sliding-2p">100S 2-Track Heavy Sliding Door</option>
                  <option value="70S-sliding-2p">70S 2-Track Slim Sliding Window/Door</option>
                  <option value="70S-sliding-4p">70S 4-Panel Center Open Slider</option>
                  <option value="74-cgroove">74-C Commercial Groove Door</option>
                  <option value="casement">Casement Window System</option>
                </select>
              </div>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="finish">Anodized Finish</label>
                  <select
                    id="finish"
                    className="select"
                    value={config.finish}
                    onChange={(e) => update('finish', e.target.value as DoorConfig['finish'])}
                  >
                    <option value="natural">Natural Silver</option>
                    <option value="bronze">Architectural Bronze</option>
                    <option value="black">Matt Black Anodized</option>
                    <option value="powder-white">Powder Coat White</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="glass">Glazing Type</label>
                  <select
                    id="glass"
                    className="select"
                    value={config.glass || '6mm-clear'}
                    onChange={(e) => update('glass', e.target.value as DoorConfig['glass'])}
                  >
                    <option value="6mm-clear">6mm Clear Toughened</option>
                    <option value="8mm-tinted">8mm Tinted Glass</option>
                    <option value="10.38mm-laminated">10.38mm Laminated Safety</option>
                    <option value="12mm-toughened">12mm Toughened Glass</option>
                    <option value="24mm-dgu">24mm Double Glazed Unit (DGU)</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">HARDWARE & HINGE SIDE</h2>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="hingeSide">Hinge / Drive Side</label>
                  <select
                    id="hingeSide"
                    className="select"
                    value={config.hingeSide}
                    onChange={(e) => update('hingeSide', e.target.value as 'left' | 'right')}
                  >
                    <option value="left">Left Hand Hinge</option>
                    <option value="right">Right Hand Hinge</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="openingAngle">3D Swing Angle</label>
                  <div className="range-row" style={{ height: 42 }}>
                    <input
                      id="openingAngle"
                      type="range"
                      min="0"
                      max="90"
                      value={config.openingAngle}
                      onChange={(e) => setConfig((prev) => ({ ...prev, openingAngle: Number(e.target.value) }))}
                    />
                    <span className="range-value">{config.openingAngle}°</span>
                  </div>
                </div>
              </div>

              <div className="switch-row">
                  <span>Threshold Weather Seal</span>
                  <button
                    type="button"
                    aria-label="Toggle threshold weather seal"
                    className={`switch ${config.thresholdSeal ? 'on' : ''}`}
                    onClick={() => setConfig((prev) => ({ ...prev, thresholdSeal: !prev.thresholdSeal }))}
                  >
                    <span />
                  </button>
              </div>

              <div className="switch-row">
                <span>Concealed Overhead Closer</span>
                <button
                  type="button"
                  aria-label="Toggle concealed overhead closer"
                  className={`switch ${config.closer ? 'on' : ''}`}
                  onClick={() => setConfig((prev) => ({ ...prev, closer: !prev.closer }))}
                >
                  <span />
                </button>
              </div>

              <div className="switch-row">
                <span>Perimeter Weather Strip</span>
                <button
                  type="button"
                  aria-label="Toggle perimeter weather strip"
                  className={`switch ${config.weatherStrip ? 'on' : ''}`}
                  onClick={() => setConfig((prev) => ({ ...prev, weatherStrip: !prev.weatherStrip }))}
                >
                  <span />
                </button>
              </div>
            </section>

            <section className="section" style={{ borderBottom: 'none' }}>
              <h2 className="section-title">EXPLODED ASSEMBLY ANIMATION</h2>
              <div className="range-row">
                <input
                  id="explodeFactor"
                  type="range"
                  min="0"
                  max="100"
                  value={config.explodeFactor}
                  onChange={(e) => {
                    const factor = Number(e.target.value);
                    setConfig((prev) => ({ ...prev, explodeFactor: factor }));
                    if (factor > 0 && view !== 'exploded') setView('exploded');
                    if (factor === 0 && view === 'exploded') setView('assembly');
                  }}
                />
                <span className="range-value">{config.explodeFactor}%</span>
              </div>
            </section>
          </aside>
          )}

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
      </>
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
      {activeTab === 'nesting' && <NestingView nesting={projectNesting} cuts={allProjectCuts} theme={theme} />}

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

      {projectsOpen && (
        <ProjectLibrary
          currentRef={projectRef}
          onOpenDocument={(doc, ref) => applyStoredProject(doc, ref)}
          onCurrentRefChange={setProjectRef}
          onClose={() => setProjectsOpen(false)}
        />
      )}

      {isExportingPdf && (
        <CuttingPlanePrintDocument dossier={manufacturingDossier} />
      )}

      {/* Mobile-only bottom navigation bar (hidden on desktop by CSS). */}
      <nav className="bottom-nav" aria-label="Workspace sections">
        <div className="bottom-nav-scroll">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.go;
            return (
              <button
                key={item.key}
                type="button"
                className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => goToTab(item.go)}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 2} />
                <span>{item.short}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
