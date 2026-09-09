'use client';

import {
  BoxSelect,
  ClipboardList,
  Compass,
  DollarSign,
  FileCheck2,
  FileDown,
  Plus,
  Scissors,
} from 'lucide-react';
import type { DashboardGo } from './dashboard-types';
import { Eyebrow } from './panel';

interface QuickAction {
  key: string;
  label: string;
  desc: string;
  icon: typeof Plus;
  needsProject: boolean;
  run: () => void;
}

interface QuickActionsProps {
  hasProject: boolean;
  onGo: (tab: DashboardGo) => void;
  onNewProject: () => void;
  onExportPdf: () => void;
}

export default function QuickActions({ hasProject, onGo, onNewProject, onExportPdf }: QuickActionsProps) {
  const blockedHint = hasProject
    ? null
    : 'Design, CAD, nesting, quotation and export tools open against the current project — create or open one to enable them.';

  const actions: QuickAction[] = [
    { key: 'new', label: 'New Project', desc: 'Create a fresh aluminium project', icon: Plus, needsProject: false, run: onNewProject },
    { key: 'schedule', label: 'Project Schedule', desc: 'Openings, tags, sizes, finishes', icon: ClipboardList, needsProject: true, run: () => onGo('schedule') },
    { key: 'studio', label: '3D Studio', desc: 'Model & configure the active unit', icon: BoxSelect, needsProject: true, run: () => onGo('studio') },
    { key: 'cad', label: '2D CAD', desc: 'Construction drawings & elevations', icon: Compass, needsProject: true, run: () => onGo('cad') },
    { key: 'nesting', label: 'Cutting & Nesting', desc: '1D bar nesting & labels', icon: Scissors, needsProject: true, run: () => onGo('nesting') },
    { key: 'quote', label: 'Quote / BOM', desc: 'Commercial quote & materials', icon: DollarSign, needsProject: true, run: () => onGo('quote') },
    { key: 'audit', label: 'Fabrication Audit', desc: 'Validation & dossier checks', icon: FileCheck2, needsProject: true, run: () => onGo('audit') },
    { key: 'export', label: 'Export PDF', desc: 'Print the A4 manufacturing dossier', icon: FileDown, needsProject: true, run: onExportPdf },
  ];

  return (
    <section className="db-section" aria-label="Quick actions">
      <div className="db-section-head">
        <div>
          <Eyebrow>WORKFLOW</Eyebrow>
          <h2 className="db-section-title">Quick Actions</h2>
          {blockedHint && <p className="db-section-sub">{blockedHint}</p>}
        </div>
      </div>

      <div className="db-actions-grid">
        {actions.map((action) => {
          const Icon = action.icon;
          const disabled = action.needsProject && !hasProject;
          return (
            <button
              key={action.key}
              type="button"
              className="db-action"
              disabled={disabled}
              onClick={action.run}
              title={disabled ? 'Create or open a project first' : action.desc}
            >
              <span className="db-action-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="db-action-copy">
                <span className="db-action-label">{action.label}</span>
                <span className="db-action-desc">{action.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
