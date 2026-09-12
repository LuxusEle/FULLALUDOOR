'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  BoxSelect,
  Check,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Compass,
  DollarSign,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FolderOpen,
  Hammer,
  Hexagon,
  Home,
  Layers,
  Moon,
  Plus,
  Receipt,
  Save,
  Scissors,
  Shield,
  Sun,
  Wallet,
} from 'lucide-react';
import ProjectSchedule from '../components/project-schedule';
import VectorCadDrawings from '../components/vector-cad-drawings';
import NestingView from '../components/nesting-view';
import CommercialQuoteView from '../components/commercial-quote';
import FabricationAuditReport from '../components/fabrication-audit-report';
import CuttingPlanePrintDocument from '../components/cutting-plane-print-document';
import BasicDetailsPanel from '../components/project/basic-details';
import BomPanel from '../components/project/bom-panel';
import PosPanel from '../components/project/pos-panel';
import FinanceSummaryPanel from '../components/project/finance-summary';
import CloudProjectPanel from '../components/cloud-project-panel';
import ProjectLibrary from '../components/project-library';
import DoorViewer from './door-viewer';
import ProjectDashboard, { type ProjectNavTarget } from '../components/dashboard/project-dashboard';
import OnboardingProvider, { TourReplayButton } from '../components/onboarding/onboarding';
import NewProjectDialog, { type NewProjectDetails } from '../components/dashboard/new-project-dialog';
import type { SessionActivity } from '../components/dashboard/dashboard-types';
import { useAccessSession } from '../components/auth/access-gate';
import { getCurrentUser, isDemoAuth } from '../lib/auth';
import {
  listCloudProjects,
  listLocalProjects,
  loadCloudProject,
  loadLocalProject,
  loadProjectByRef,
  saveCloudProject,
  saveLocalProject,
} from '../lib/project-storage';
import { ROUTES, classifyProjectLoadError, projectWorkspacePath } from '../lib/project-routing';
import { buildBlankOpening } from '../lib/project-creation';
import { applyTheme, readStoredTheme } from '../lib/theme';
import WorkspaceState, { type WorkspaceStateKind } from '../components/project/workspace-state';
import { captureStudioCanvasNow } from '../lib/studio-snapshot';
import { nextProjectNumber } from '../lib/project-catalog';
import { buildManufacturingDossier, type ManufacturingDossier } from '../lib/manufacturing-dossier';
import { buildProjectBOM } from '../lib/bom-engine';
import type { DoorConfig } from '../lib/door-model';
import { defaultDoorConfig, deriveDoor, doorConfigSchema, expandOpeningCuts, fabricationChecks } from '../lib/door-model';
import type { DerivedOpening, OpeningItem, ProjectMetadata, TypologyId, ProjectNestingSummary } from '../lib/types';
import type { StoredProject, StoredProjectRef } from '../lib/project-storage';
import { nestProjectCuts } from '../lib/nesting-engine';

export type WorkspaceTab = 'dashboard' | 'details' | 'designs' | 'bom' | 'quotation' | 'pos' | 'finance';

/** Manufacturing tools that live inside the Designs section. */
export type DesignTool = 'list' | 'studio' | 'cad' | 'audit' | 'nesting';

export interface DoorDesignerProps {
  /** Stored project id from the /project/[projectId] route. */
  initialProjectId?: string;
}

type WorkspaceLoadState = WorkspaceStateKind | 'ready';

declare global {
  interface Document {
    modelContext?: { registerTool?: (tool: unknown) => void };
    __fullAluDoorToolsRegistered?: boolean;
  }
}

export default function DoorDesigner({ initialProjectId }: DoorDesignerProps) {
  const requestedProjectId =
    typeof initialProjectId === 'string' && initialProjectId.length > 0 ? initialProjectId : null;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(requestedProjectId ? 'designs' : 'dashboard');
  const [designTool, setDesignTool] = useState<DesignTool>('list');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { role: accessRole } = useAccessSession();
  const [theme, setTheme] = useState<'dark' | 'light'>(readStoredTheme);
  const [project, setProject] = useState<ProjectMetadata | null>(null);
  const [openings, setOpenings] = useState<OpeningItem[]>([]);
  const [activeOpeningId, setActiveOpeningId] = useState<string | null>(null);
  const [projectRef, setProjectRef] = useState<StoredProjectRef | null>(null);
  const [projectLoad, setProjectLoad] = useState<WorkspaceLoadState>(requestedProjectId ? 'loading' : 'ready');
  const [projectLoadMessage, setProjectLoadMessage] = useState<string | null>(null);
  const [projectLoadRetry, setProjectLoadRetry] = useState(0);
  const [activities, setActivities] = useState<SessionActivity[]>([]);

  const activityIdRef = useRef(0);
  const logActivity = useCallback((kind: SessionActivity['kind'], title: string, projectName: string | null, detail?: string) => {
    activityIdRef.current += 1;
    setActivities((prev) =>
      [
        { id: `act-${activityIdRef.current}`, kind, title, projectName, detail, ts: Date.now() },
        ...prev,
      ].slice(0, 40)
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-save. New projects and every edit are persisted without pressing Save:
  //  - a project that already lives in the cloud keeps autosaving to the cloud
  //  - otherwise (demo mode / browser copy / fresh project) it autosaves to this
  //    browser's local store; a failed cloud write also falls back to local so
  //    work is never lost.
  // ---------------------------------------------------------------------------
  const demoMode = isDemoAuth();
  const [autosaveNote, setAutosaveNote] = useState<{ tone: 'saving' | 'ok' | 'error'; text: string } | null>(null);
  const [autosaveDetail, setAutosaveDetail] = useState<string | null>(null);
  const savedSnapshotRef = useRef<string | null>(null);
  const autosaveBusyRef = useRef(false);

  const projectFingerprint = useCallback(() => {
    if (!project) return null;
    return JSON.stringify({ project, openings });
  }, [project, openings]);

  const runAutosave = useCallback(async () => {
    if (!project || autosaveBusyRef.current) return;
    const snapshot = projectFingerprint();
    if (snapshot === null || snapshot === savedSnapshotRef.current) return;

    autosaveBusyRef.current = true;
    setAutosaveNote({ tone: 'saving', text: 'Auto-saving…' });
    let persisted = false;
    try {
      let ref: StoredProjectRef | null = projectRef;
      let note: { tone: 'ok' | 'error'; text: string } = {
        tone: 'ok',
        text: `Auto-saved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      };

      if (projectRef?.kind === 'cloud' && !demoMode) {
        const user = await getCurrentUser();
        if (user) {
          const result = await saveCloudProject(user, project, openings, projectRef.id);
          setAutosaveDetail(result.message);
          if (result.ok && result.ref) {
            ref = result.ref;
            persisted = true;
          } else {
            const local = saveLocalProject(project, openings);
            if (local.ok) {
              ref = local.ref;
              persisted = true;
              note.text = 'Cloud unavailable — saved in this browser';
              setAutosaveDetail(local.message);
            } else {
              note = { tone: 'error', text: 'Auto-save failed' };
            }
          }
        } else {
          const local = saveLocalProject(project, openings);
          if (local.ok) {
            ref = local.ref;
            persisted = true;
            note.text = 'Offline — saved in this browser';
          }
        }
      } else {
        const result = saveLocalProject(project, openings);
        if (result.ok) {
          ref = result.ref;
          persisted = true;
          setAutosaveDetail(result.message);
        } else {
          note = { tone: 'error', text: 'Auto-save failed' };
        }
      }

      if (ref) setProjectRef(ref);
      setAutosaveNote(note);
    } catch (caught) {
      setAutosaveDetail(caught instanceof Error ? caught.message : 'Auto-save failed');
      setAutosaveNote({ tone: 'error', text: 'Auto-save failed' });
    } finally {
      // Only mark the snapshot as current when a write actually succeeded.
      if (persisted) savedSnapshotRef.current = snapshot;
      autosaveBusyRef.current = false;
    }
  }, [project, openings, projectRef, demoMode, projectFingerprint]);

  useEffect(() => {
    if (!project) {
      savedSnapshotRef.current = null;
      return;
    }
    const current = projectFingerprint();
    if (current === null || current === savedSnapshotRef.current) return;
    const timer = window.setTimeout(() => void runAutosave(), 1200);
    return () => window.clearTimeout(timer);
  }, [project, openings, projectFingerprint, projectRef, runAutosave]);

  // ---------------------------------------------------------------------------
  // Theme: dark black/crimson is the default identity; light is an explicit opt-in.
  // ---------------------------------------------------------------------------
  const setThemeTo = (nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const goToTab = useCallback(
    (tab: WorkspaceTab) => {
      // Snapshot the live 3D Studio frame before its canvas unmounts so the
      // Fabricator Audit sheet can embed the last rendered model.
      if (activeTab === 'designs' && designTool === 'studio' && tab !== 'designs') {
        captureStudioCanvasNow();
      }
      setActiveTab(tab);
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    },
    [activeTab, designTool]
  );

  const openDesignTool = useCallback(
    (tool: DesignTool) => {
      if (designTool === 'studio' && tool !== 'studio') {
        captureStudioCanvasNow();
      }
      setDesignTool(tool);
    },
    [designTool]
  );

  // Active opening currently loaded in the 3D & 2D views.
  const activeOpening = useMemo(
    () => openings.find((o) => o.id === activeOpeningId) || openings[0] || null,
    [openings, activeOpeningId]
  );

  // 3D Studio single-unit configuration adapter.
  const [config, setConfig] = useState<DoorConfig>(defaultDoorConfig);

  const [view, setView] = useState<'assembly' | 'exploded' | 'section'>('assembly');
  const [showConfig, setShowConfig] = useState(true);
  const [showFab, setShowFab] = useState(true);
  const [dimensionDraft, setDimensionDraft] = useState({
    width: String(defaultDoorConfig.width),
    height: String(defaultDoorConfig.height),
  });
  const [makeStatus, setMakeStatus] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [studioMobileTab, setStudioMobileTab] = useState<'canvas' | 'config' | 'fab'>('canvas');

  const focusConfig = useCallback((opening: OpeningItem) => {
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
      memberOverrides: opening.memberOverrides,
    });
    setDimensionDraft({ width: String(opening.width), height: String(opening.height) });
  }, []);

  const handleSelectOpening = useCallback(
    (id: string) => {
      const target = openings.find((o) => o.id === id);
      if (!target) return;
      setActiveOpeningId(id);
      focusConfig(target);
    },
    [openings, focusConfig]
  );

  // Canonical member-edit entry point: the 2D CAD editor updates the opening's
  // memberOverrides and every derived engine recalculates from this one source.
  const handleUpdateOpening = useCallback(
    (next: OpeningItem) => {
      setOpenings((prev) => prev.map((o) => (o.id === next.id ? next : o)));
      if (next.id === activeOpeningId) {
        setConfig((prev) => ({ ...prev, memberOverrides: next.memberOverrides }));
      }
    },
    [activeOpeningId]
  );

  // Navigation targets used by the project-scoped dashboard. Each maps onto the
  // existing workspace sections — no new pages are created.
  const navigateProject = useCallback(
    (target: ProjectNavTarget) => {
      switch (target) {
        case 'details':
          goToTab('details');
          return;
        case 'designs':
        case 'schedule':
          setDesignTool('list');
          goToTab('designs');
          return;
        case 'bom':
          goToTab('bom');
          return;
        case 'quotation':
          goToTab('quotation');
          return;
        case 'pos':
          goToTab('pos');
          return;
        case 'finance':
          goToTab('finance');
          return;
        case 'studio':
          setDesignTool('studio');
          goToTab('designs');
          return;
        case 'cad':
          setDesignTool('cad');
          goToTab('designs');
          return;
        case 'nesting':
          setDesignTool('nesting');
          goToTab('designs');
          return;
        case 'audit':
          setDesignTool('audit');
          goToTab('designs');
          return;
      }
    },
    [goToTab]
  );

  const openProjectOpening = useCallback(
    (id: string) => {
      handleSelectOpening(id);
      setDesignTool('list');
      goToTab('designs');
    },
    [handleSelectOpening, goToTab]
  );

  const applyStoredProject = useCallback(
    (doc: StoredProject, ref: StoredProjectRef) => {
      setProject(doc.project);
      setOpenings(doc.openings);
      setProjectRef(ref);
      setMakeStatus('');
      // Nothing is dirty right after a load — the next autosave only fires on edits.
      savedSnapshotRef.current = JSON.stringify({ project: doc.project, openings: doc.openings });
      setAutosaveNote(null);
      const first = doc.openings[0] ?? null;
      if (first) {
        setActiveOpeningId(first.id);
        focusConfig(first);
      }
    },
    [focusConfig]
  );

  const openStoredProject = useCallback(
    (doc: StoredProject, ref: StoredProjectRef) => {
      applyStoredProject(doc, ref);
      logActivity('opened', 'Project opened', doc.project.projectName, ref.kind === 'cloud' ? 'Cloud copy' : 'Browser copy');
      setDesignTool('list');
      goToTab('designs');
    },
    [applyStoredProject, logActivity, goToTab]
  );

  // Resolve the project named in the URL. A missing project or a storage
  // failure is surfaced explicitly instead of silently loading another one.
  useEffect(() => {
    if (!requestedProjectId) return undefined;
    let active = true;
    void (async () => {
      try {
        setProjectLoad('loading');
        setProjectLoadMessage(null);
        const user = demoMode ? null : await getCurrentUser();
        let ref: StoredProjectRef | null =
          listLocalProjects().find((item) => item.id === requestedProjectId) ?? null;
        if (!ref && user && !demoMode) {
          const cloudRefs = await listCloudProjects(user);
          ref = cloudRefs.find((item) => item.id === requestedProjectId) ?? null;
        }
        if (!ref) {
          if (!active) return;
          setProjectLoad('not-found');
          setProjectLoadMessage('This project does not exist or is not shared with your account.');
          return;
        }
        const result = await loadProjectByRef(ref, user);
        if (!active) return;
        if (!result.ok || !result.doc) {
          setProjectLoad(classifyProjectLoadError(result.message));
          setProjectLoadMessage(result.message);
          return;
        }
        applyStoredProject(result.doc, ref);
        logActivity(
          'opened',
          'Project opened',
          result.doc.project.projectName,
          ref.kind === 'cloud' ? 'Cloud copy' : 'Browser copy'
        );
        setDesignTool('list');
        setActiveTab('designs');
        setProjectLoad('ready');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'The project failed to load.';
        setProjectLoad(classifyProjectLoadError(message));
        setProjectLoadMessage(message);
      }
    })();
    return () => {
      active = false;
    };
  }, [requestedProjectId, demoMode, applyStoredProject, logActivity, projectLoadRetry]);

  // Keep the URL in sync with the project actually open (create, autosave or
  // opening another project from the library) so a refresh reloads it.
  useEffect(() => {
    if (typeof window === 'undefined' || !projectRef) return;
    const desired = projectWorkspacePath(projectRef.id);
    if (window.location.pathname !== desired) {
      window.history.replaceState(null, '', desired);
    }
  }, [projectRef]);

  const collectExistingProjectNumbers = useCallback(async (): Promise<string[]> => {
    const existing: string[] = [];
    for (const ref of listLocalProjects()) {
      const stored = loadLocalProject(ref.id);
      if (stored?.project.projectNumber) existing.push(stored.project.projectNumber);
    }
    if (!demoMode) {
      try {
        const user = await getCurrentUser();
        if (user) {
          const cloudRefs = await listCloudProjects(user);
          for (const cloudRef of cloudRefs) {
            try {
              const stored = await loadCloudProject(cloudRef.id);
              if (stored?.project.projectNumber) existing.push(stored.project.projectNumber);
            } catch {
              // best-effort: an unreadable cloud row is skipped
            }
          }
        }
      } catch {
        // offline / approval issues — numbering falls back to local only
      }
    }
    return existing;
  }, [demoMode]);

  const nextProjectNumberForYear = useCallback(async (): Promise<string> => {
    return nextProjectNumber(await collectExistingProjectNumbers());
  }, [collectExistingProjectNumbers]);

  const startNewProject = async (details: NewProjectDetails) => {
    const now = new Date();
    const enteredNumber = details.projectNumber?.trim() || '';
    const freshProject: ProjectMetadata = {
      id: `proj-${now.getTime().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`,
      projectName: details.projectName?.trim() || 'New Project',
      clientName: details.clientName || '',
      projectNumber: enteredNumber || (await nextProjectNumberForYear()),
      date: details.date || now.toISOString().slice(0, 10),
      currency: details.currency || 'LKR',
      taxRatePercent: details.taxRatePercent,
      contractorName: details.contractorName || 'ALU DOOR Pro Engineering',
    };
    const firstUnit = buildBlankOpening('100D-single', 1, now.getTime());
    setProject(freshProject);
    setOpenings([firstUnit]);
    setProjectRef(null);
    setMakeStatus('');
    // Force the very first auto-save for a freshly created project.
    savedSnapshotRef.current = null;
    setAutosaveNote(null);
    setActiveOpeningId(firstUnit.id);
    focusConfig(firstUnit);
    logActivity('created', 'Project created', freshProject.projectName, `No. ${freshProject.projectNumber || 'unassigned'}`);
    setNewProjectOpen(false);
    setDesignTool('list');
    goToTab('designs');
  };

  const openNewProjectDialog = () => setNewProjectOpen(true);

  const openProjectLibrary = () => setProjectsOpen(true);

  const handleDuplicateProject = useCallback(async () => {
    if (!project) return;
    const now = new Date();
    const copyNumber = await nextProjectNumberForYear();
    const copyProject: ProjectMetadata = {
      ...project,
      id: `proj-${now.getTime().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
      projectName: `${project.projectName} (Copy)`,
      projectNumber: copyNumber,
      archived: false,
      archivedAt: null,
      duplicateOf: project.id,
    };
    const copyOpenings = openings.map((opening) => ({
      ...opening,
      id: `open-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    }));
    setProject(copyProject);
    setOpenings(copyOpenings);
    setProjectRef(null);
    setMakeStatus('');
    savedSnapshotRef.current = null;
    setAutosaveNote(null);
    const first = copyOpenings[0] ?? null;
    if (first) {
      setActiveOpeningId(first.id);
      focusConfig(first);
    }
    logActivity('created', 'Project duplicated', copyProject.projectName, `Copy of ${project.projectNumber}`);
    setDesignTool('list');
    goToTab('designs');
  }, [project, openings, focusConfig, nextProjectNumberForYear, logActivity, goToTab]);

  const derived = useMemo(() => deriveDoor(config), [config]);
  const checks = useMemo(() => fabricationChecks(config), [config]);

  const derivedProjectOpenings: DerivedOpening[] = useMemo(
    () => openings.map((o) => deriveDoor(o)),
    [openings]
  );

  const allProjectCuts = useMemo(() => expandOpeningCuts(derivedProjectOpenings), [derivedProjectOpenings]);

  const projectNesting: ProjectNestingSummary = useMemo(() => nestProjectCuts(allProjectCuts), [allProjectCuts]);

  const bomLines = useMemo(
    () => (project ? buildProjectBOM(derivedProjectOpenings, projectNesting) : []),
    [project, derivedProjectOpenings, projectNesting]
  );

  const manufacturingDossier: ManufacturingDossier | null = useMemo(
    () => (project ? buildManufacturingDossier(project, derivedProjectOpenings, projectNesting) : null),
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
        if (activeOpeningId) {
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
        }
        return next;
      });
    },
    [activeOpeningId]
  );

  const makeDoor = () => {
    if (!activeOpeningId) return;
    const w = Number(dimensionDraft.width);
    const h = Number(dimensionDraft.height);
    if (w < 500 || w > 4500 || h < 600 || h > 3500) {
      setMakeStatus('Width must be 500-4500 mm; height 600-3500 mm.');
      return;
    }
    const next = { ...config, width: w, height: h };
    setConfig(next);
    setOpenings((prev) => prev.map((o) => (o.id === activeOpeningId ? { ...o, width: w, height: h } : o)));
    setMakeStatus(`Built ${w} × ${h} mm`);
  };

  const exportCsv = () => {
    if (!project) return;
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

  const exportCuttingPlanePdf = () => {
    if (!project) return;
    const validation = manufacturingDossier?.validation;
    if (validation && !validation.ok) {
      const lines = validation.issues
        .filter((issue) => issue.severity === 'error')
        .slice(0, 8)
        .map((issue) => `• ${issue.code}: ${issue.message}`)
        .join('\n');
      window.alert(
        `PDF EXPORT BLOCKED — ${validation.issues.filter((i) => i.severity === 'error').length} fabrication inconsistency(ies) detected.\n\n${lines}\n\nResolve these before exporting manufacturing data.`
      );
      return;
    }
    if (validation) {
      const summary = validation.summary;
      const proceed = window.confirm(
        `PDF READY\n\n` +
          `✓ ${summary.openings} openings\n` +
          `✓ ${summary.physicalMembers} physical members\n` +
          `✓ ${summary.cutEntries} cut-list entries\n` +
          `✓ ${summary.nestedPieces} nested / accounted members\n` +
          `✓ BOM ${summary.bomReconciled ? 'reconciled' : 'NOT reconciled'}\n` +
          `✓ Custom members: ${summary.customMembers}\n` +
          `✓ Fabrication reviews: ${summary.reviews}\n\n` +
          `No calculation inconsistencies detected.\n\nProceed to export?`
      );
      if (!proceed) return;
    }
    logActivity('exported', 'Manufacturing dossier export started', project.projectName);
    setIsExportingPdf(true);
  };

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

  // ProjectSchedule edits metadata of the currently open (non-null) project.
  const updateProject: Dispatch<SetStateAction<ProjectMetadata>> = useCallback((action) => {
    setProject((prev) => {
      if (prev === null) return prev;
      return typeof action === 'function' ? action(prev) : action;
    });
  }, []);

  const NAV_ITEMS: { key: string; icon: typeof Home; label: string; short: string; go: WorkspaceTab }[] = [
    { key: 'dashboard', icon: Home, label: 'Dashboard', short: 'Home', go: 'dashboard' },
    { key: 'details', icon: ClipboardList, label: 'Details', short: 'Details', go: 'details' },
    {
      key: 'designs',
      icon: FileSpreadsheet,
      label: `Designs (${openings.length})`,
      short: 'Designs',
      go: 'designs',
    },
    { key: 'bom', icon: Layers, label: 'BOM', short: 'BOM', go: 'bom' },
    { key: 'quotation', icon: DollarSign, label: 'Quotation', short: 'Quote', go: 'quotation' },
    { key: 'pos', icon: Receipt, label: 'POs', short: 'POs', go: 'pos' },
    { key: 'finance', icon: Wallet, label: 'Finance Summary', short: 'Finance', go: 'finance' },
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
          system: {
            enum: [
              '100D-single',
              '100D-double',
              '100S-sliding-2p',
              '70S-sliding-2p',
              '70S-sliding-4p',
              '74-cgroove',
              'casement',
            ],
          },
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
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { configuration: config, cutList: derived.cutList, nesting: projectNesting },
              null,
              2
            ),
          },
        ],
      }),
    });
  }, [config, derived, projectNesting]);

  const hasProject = project !== null;

  const renderWorkspaceGate = () => (
    <section className="db-gate" aria-label="Open or create a project">
      <div className="db-gate-card">
        <span className="db-gate-icon" aria-hidden="true">
          <FolderOpen size={22} />
        </span>
        <h2>No project is open</h2>
        <p>
          The Details, Designs, BOM, Quotation, POs and Finance sections all work against a
          project. Create a new project or open a saved one to continue.
        </p>
        <div className="db-gate-actions">
          <button type="button" className="btn btn-primary" onClick={openNewProjectDialog}>
            <Plus size={15} strokeWidth={2.6} /> Create New Project
          </button>
          <button type="button" className="btn" onClick={openProjectLibrary}>
            <FolderOpen size={15} /> Open Project
          </button>
        </div>
      </div>
    </section>
  );

  const workspaceState: WorkspaceStateKind | null =
    !project && requestedProjectId && projectLoad !== 'ready' ? projectLoad : null;

  if (workspaceState) {
    return (
      <WorkspaceState
        state={workspaceState}
        message={projectLoadMessage}
        projectId={requestedProjectId}
        onRetry={() => setProjectLoadRetry((value) => value + 1)}
      />
    );
  }

  return (
    <OnboardingProvider
      hasProject={hasProject}
      onActivateSection={(section, tool) => {
        switch (section) {
          case 'dashboard':
            goToTab('dashboard');
            break;
          case 'details':
            goToTab('details');
            break;
          case 'designs':
            openDesignTool(tool ?? 'list');
            goToTab('designs');
            break;
          case 'bom':
            goToTab('bom');
            break;
          case 'quotation':
            goToTab('quotation');
            break;
          case 'pos':
            goToTab('pos');
            break;
          case 'finance':
            goToTab('finance');
            break;
          case 'workflow':
            goToTab('dashboard');
            break;
        }
      }}
      onFinish={() => {
        setDesignTool('list');
        goToTab('dashboard');
      }}
      onStartNewProject={openNewProjectDialog}
    >
      <main className={`app-shell ${isExportingPdf ? 'printing-cutting-plane' : ''}`} data-theme={theme}>
      {/* Top Application Bar */}
      <header className="topbar">
        <div className="brand" style={{ flexShrink: 0 }}>
          <span className="brandmark">
            <Hexagon size={17} strokeWidth={2.2} />
          </span>
          <span className="brand-name">FullAluDoor Pro</span>
          <span className="brand-sub">CAD/CAM</span>
          {project && (
            <span className="topbar-context" title="Current project">
              <span className="topbar-context-dot" aria-hidden="true" />
              <span className="topbar-context-name">{project.projectName}</span>
            </span>
          )}
        </div>

        <nav className="tab-strip" style={{ flex: 1, minWidth: 0 }} aria-label="Workspace sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.go;
            return (
              <button
                key={item.key}
                className={`tab-item ${isActive ? 'active' : ''}`}
                data-onboard={`nav-${item.go}`}
                onClick={() => goToTab(item.go)}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                style={{ flexShrink: 0 }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="top-actions" style={{ flexShrink: 0, paddingLeft: 12 }}>
          <div className="theme-seg">
            <button
              onClick={() => setThemeTo('light')}
              aria-pressed={theme === 'light'}
              title="Light mode"
              className={theme === 'light' ? 'active' : ''}
            >
              <Sun size={14} /> <span className="seg-txt">Light</span>
            </button>
            <button
              onClick={() => setThemeTo('dark')}
              aria-pressed={theme === 'dark'}
              title="Dark mode"
              className={theme === 'dark' ? 'active' : ''}
            >
              <Moon size={14} /> <span className="seg-txt">Dark</span>
            </button>
          </div>

          <TourReplayButton />

          {hasProject && (
            <button className="btn csv-hide" onClick={exportCsv} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              <Download size={14} /> <span className="btn-txt">Export CSV</span>
            </button>
          )}
          {hasProject && (
            <button className="btn btn-primary" onClick={exportCuttingPlanePdf} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              <Save size={14} /> <span className="btn-txt">Export PDF</span>
            </button>
          )}
          {accessRole === 'admin' && (
            // eslint-disable-next-line next/no-html-link-for-pages -- full-page navigation to /admin is required: vinext RSC <Link> client-navigation crashes in production builds.
            <a
              href="/admin"
              className="btn"
              title="Approve and manage user devices"
              style={{ flexShrink: 0, whiteSpace: 'nowrap', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            >
              <Shield size={14} /> <span className="btn-txt">Admin</span>
            </a>
          )}
          {hasProject && autosaveNote && (
            <span
              className={`autosave-indicator tone-${autosaveNote.tone}`}
              aria-live="polite"
              title={autosaveDetail ?? autosaveNote.text}
            >
              <span className="autosave-dot" aria-hidden="true" />
              {autosaveNote.text}
            </span>
          )}
          {hasProject ? (
            <CloudProjectPanel
              project={project}
              openings={openings}
              currentRef={projectRef}
              onOpenDocument={(doc, ref) => openStoredProject(doc, ref)}
              onCurrentRefChange={setProjectRef}
            />
          ) : (
            <button className="btn" disabled title="Save the current project to the cloud or this browser" style={{ flexShrink: 0, whiteSpace: 'nowrap', opacity: 0.55 }}>
              <Save size={14} /> <span className="btn-txt">Save</span>
            </button>
          )}
        </div>
      </header>

      {hasProject && project && (
        <nav className="workspace-crumbs" aria-label="Breadcrumb">
          <div className="workspace-crumbs-path">
            <a href={ROUTES.dashboard} className="workspace-crumb-link">
              Dashboard
            </a>
            <span className="workspace-crumb-sep" aria-hidden="true">
              /
            </span>
            <a href={ROUTES.projects} className="workspace-crumb-link">
              Projects
            </a>
            <span className="workspace-crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="workspace-crumb-current" title={project.projectName}>
              {project.projectName}
            </span>
            {project.projectNumber && <span className="workspace-crumb-rev mono">{project.projectNumber}</span>}
          </div>
          <a href={ROUTES.projects} className="workspace-back">
            <ChevronsLeft size={14} /> Back to Projects
          </a>
        </nav>
      )}

      {activeTab === 'dashboard' && project && manufacturingDossier ? (
        <ProjectDashboard
          project={project}
          openings={openings}
          derivedOpenings={derivedProjectOpenings}
          nesting={projectNesting}
          dossier={manufacturingDossier}
          activities={activities}
          savedAt={projectRef?.savedAt ?? null}
          onNavigate={navigateProject}
          onOpenOpening={openProjectOpening}
          onExportPdf={exportCuttingPlanePdf}
        />
      ) : !hasProject ? (
        renderWorkspaceGate()
      ) : (
        <>
          {/* ========================================================================= */}
          {/* PROJECT SECTION: DETAILS (BASIC DETAILS)                                   */}
          {/* ========================================================================= */}
          {activeTab === 'details' && (
            <BasicDetailsPanel
              project={project}
              openings={openings}
              onChange={(updates) => updateProject((current) => ({ ...current, ...updates }))}
              onDuplicate={() => void handleDuplicateProject()}
              onGoDesigns={() => {
                setDesignTool('list');
                goToTab('designs');
              }}
            />
          )}

          {/* ========================================================================= */}
          {/* PROJECT SECTION: DESIGNS HUB (OPENING LIST + DESIGN TOOLS)                 */}
          {/* ========================================================================= */}
          {activeTab === 'designs' && (
            <nav className="designs-toolbar" aria-label="Design tools">
              {(
                [
                  { key: 'list', label: 'Opening List', icon: FileSpreadsheet },
                  { key: 'studio', label: '3D Studio', icon: BoxSelect },
                  { key: 'cad', label: '2D CAD', icon: Compass },
                  { key: 'audit', label: 'Fabrication Audit', icon: FileCheck2 },
                  { key: 'nesting', label: 'Cutting / Nesting', icon: Scissors },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const active = designTool === tool.key;
                return (
                <button
                  key={tool.key}
                  type="button"
                  className={`btn-pill ${active ? 'active' : ''}`}
                  data-onboard={`tool-${tool.key}`}
                  aria-pressed={active}
                  onClick={() => openDesignTool(tool.key)}
                >
                    <Icon size={14} /> {tool.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* ========================================================================= */}
          {/* 3D STUDIO DESIGN TOOL                                                        */}
          {/* ========================================================================= */}
          {activeTab === 'designs' && designTool === 'studio' && (
            <>
              <div className="studio-mobile-switcher">
                <button type="button" className={`studio-mobile-btn ${studioMobileTab === 'canvas' ? 'active' : ''}`} onClick={() => setStudioMobileTab('canvas')}>
                  <BoxSelect size={14} />
                  <span>3D Canvas</span>
                </button>
                <button type="button" className={`studio-mobile-btn ${studioMobileTab === 'config' ? 'active' : ''}`} onClick={() => setStudioMobileTab('config')}>
                  <Compass size={14} />
                  <span>Parameters</span>
                </button>
                <button type="button" className={`studio-mobile-btn ${studioMobileTab === 'fab' ? 'active' : ''}`} onClick={() => setStudioMobileTab('fab')}>
                  <Scissors size={14} />
                  <span>Cut List</span>
                </button>
              </div>

              <div className={`workspace ${showConfig ? '' : 'cfg-off'} ${showFab ? '' : 'fab-off'}`} data-mobile-tab={studioMobileTab}>
                {showConfig && (
                  <aside className="panel panel-left">
                    <div className="panel-head">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="eyebrow">ACTIVE UNIT</span>
                          <span className="mono active-unit-chip">{activeOpening ? activeOpening.tag : '—'}</span>
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
                      <h1 className="panel-title">{activeOpening ? activeOpening.name : 'No unit'}</h1>
                      <div className="fab-ready-chip">
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

                      <div className="built-size-box">
                        <span>Built Size</span>
                        <span className="mono">{config.width} × {config.height} mm</span>
                      </div>

                      <button className="make-door" onClick={makeDoor}>
                        <Hammer size={15} /> Apply Dimensions
                      </button>
                      <div className={`make-status ${makeStatus.startsWith('Built') ? 'ok' : makeStatus ? 'error' : ''}`}>{makeStatus}</div>
                    </section>

                    <section className="section">
                      <h2 className="section-title">TYPOLOGY & PROFILE SYSTEM</h2>
                      <div className="field" style={{ marginBottom: 12 }}>
                        <label htmlFor="system">Profile Series</label>
                        <select id="system" className="select" value={config.system} onChange={(e) => update('system', e.target.value as TypologyId)}>
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
                          <select id="finish" className="select" value={config.finish} onChange={(e) => update('finish', e.target.value as DoorConfig['finish'])}>
                            <option value="natural">Natural Silver</option>
                            <option value="bronze">Architectural Bronze</option>
                            <option value="black">Matt Black Anodized</option>
                            <option value="powder-white">Powder Coat White</option>
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="glass">Glazing Type</label>
                          <select id="glass" className="select" value={config.glass || '6mm-clear'} onChange={(e) => update('glass', e.target.value as DoorConfig['glass'])}>
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
                          <select id="hingeSide" className="select" value={config.hingeSide} onChange={(e) => update('hingeSide', e.target.value as 'left' | 'right')}>
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
                        <button type="button" aria-label="Toggle threshold weather seal" className={`switch ${config.thresholdSeal ? 'on' : ''}`} onClick={() => setConfig((prev) => ({ ...prev, thresholdSeal: !prev.thresholdSeal }))}>
                          <span />
                        </button>
                      </div>
                      <div className="switch-row">
                        <span>Concealed Overhead Closer</span>
                        <button type="button" aria-label="Toggle concealed overhead closer" className={`switch ${config.closer ? 'on' : ''}`} onClick={() => setConfig((prev) => ({ ...prev, closer: !prev.closer }))}>
                          <span />
                        </button>
                      </div>
                      <div className="switch-row">
                        <span>Perimeter Weather Strip</span>
                        <button type="button" aria-label="Toggle perimeter weather strip" className={`switch ${config.weatherStrip ? 'on' : ''}`} onClick={() => setConfig((prev) => ({ ...prev, weatherStrip: !prev.weatherStrip }))}>
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

                {/* Central 3D canvas */}
                <div className="viewport-shell">
                  <DoorViewer config={config} view={view} setView={setView} theme={theme} />
                </div>

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
                      <div className="fab-head-status">
                        <div className="fab-head-badge">
                          <Check size={26} strokeWidth={2.6} />
                        </div>
                        <div>
                          <h3>All Good</h3>
                          <span>Ready for production</span>
                        </div>
                      </div>
                      <div className="status-summary">
                        <div className="metric">
                          <strong>0</strong>
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
                        <h2 className="section-title" style={{ margin: 0 }}>CUT LIST FOR UNIT {activeOpening ? activeOpening.tag : ''}</h2>
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
                      <button onClick={() => openDesignTool('list')} className="panel-inline-link">
                        View Full Cut List <span aria-hidden>→</span>
                      </button>
                    </section>
                  </aside>
                )}
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* DESIGNS → OPENING LIST (PROJECT REGISTER)                                   */}
          {/* ========================================================================= */}
          {activeTab === 'designs' && designTool === 'list' && project && (
            <ProjectSchedule
              project={project}
              setProject={updateProject}
              openings={openings}
              setOpenings={setOpenings}
              activeOpeningId={activeOpeningId ?? ''}
              onSelectOpening={(id) => {
                handleSelectOpening(id);
                setDesignTool('studio');
              }}
            />
          )}

          {/* ========================================================================= */}
          {/* DESIGNS → 2D VECTOR CAD CONSTRUCTION DOCUMENTS                             */}
          {/* ========================================================================= */}
          {activeTab === 'designs' && designTool === 'cad' && activeOpening && (
            <VectorCadDrawings
              opening={activeOpening}
              theme={theme}
              project={project}
              openings={openings}
              onSelectOpening={handleSelectOpening}
              onUpdateOpening={handleUpdateOpening}
            />
          )}

          {/* ========================================================================= */}
          {/* DESIGNS → CUTTING / NESTING                                               */}
          {/* ========================================================================= */}
          {activeTab === 'designs' && designTool === 'nesting' && <NestingView nesting={projectNesting} cuts={allProjectCuts} theme={theme} />}

          {/* ========================================================================= */}
          {/* PROJECT SECTION: BOM                                                        */}
          {/* ========================================================================= */}
          {activeTab === 'bom' && (
            <BomPanel
              project={project}
              openings={derivedProjectOpenings}
              nesting={projectNesting}
            />
          )}

          {/* ========================================================================= */}
          {/* PROJECT SECTION: QUOTATION                                                  */}
          {/* ========================================================================= */}
          {activeTab === 'quotation' && project && (
            <CommercialQuoteView
              project={project}
              openings={derivedProjectOpenings}
              nesting={projectNesting}
              theme={theme}
              onCurrencyChange={(currency) =>
                updateProject((current) => ({ ...current, currency }))
              }
            />
          )}

          {/* ========================================================================= */}
          {/* PROJECT SECTION: PURCHASE ORDERS                                            */}
          {/* ========================================================================= */}
          {activeTab === 'pos' && (
            <PosPanel
              bom={bomLines}
              project={project}
            />
          )}

          {/* ========================================================================= */}
          {/* PROJECT SECTION: FINANCE SUMMARY                                             */}
          {/* ========================================================================= */}
          {activeTab === 'finance' && (
            <FinanceSummaryPanel
              project={project}
              openings={derivedProjectOpenings}
              nesting={projectNesting}
              onChange={(updates) => updateProject((current) => ({ ...current, ...updates }))}
            />
          )}

          {/* ========================================================================= */}
          {/* DESIGNS → EXPERT FABRICATOR AUDIT REPORT & CONSTRUCTION DOSSIER            */}
          {/* ========================================================================= */}
          {activeTab === 'designs' && designTool === 'audit' && project && activeOpening && (
            <FabricationAuditReport
              project={project}
              openings={openings}
              activeOpeningId={activeOpeningId ?? ''}
              onSelectOpening={handleSelectOpening}
              theme={theme}
            />
          )}
        </>
      )}

      {projectsOpen && (
        <ProjectLibrary
          currentRef={projectRef}
          onOpenDocument={(doc, ref) => openStoredProject(doc, ref)}
          onCurrentRefChange={setProjectRef}
          onClose={() => setProjectsOpen(false)}
        />
      )}

      {newProjectOpen && (
        <NewProjectDialog
          initial={{
            projectName: '',
            clientName: project?.clientName ?? '',
            projectNumber: '',
            date: new Date().toISOString().slice(0, 10),
            currency: 'LKR',
            taxRatePercent: project?.taxRatePercent ?? 8,
            contractorName: project?.contractorName ?? 'ALU DOOR Pro Engineering',
          }}
          onCancel={() => setNewProjectOpen(false)}
          onCreate={startNewProject}
        />
      )}

      {isExportingPdf && manufacturingDossier && <CuttingPlanePrintDocument dossier={manufacturingDossier} />}

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
                data-onboard={`nav-${item.go}`}
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
    </OnboardingProvider>
  );
}
