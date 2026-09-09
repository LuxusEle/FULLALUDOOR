'use client';

import { BoxSelect, FolderOpen } from 'lucide-react';
import type { StoredProjectRef } from '../../lib/project-storage';

interface DashboardHeaderProps {
  projectName: string | null;
  projectNumber: string;
  projectRef: StoredProjectRef | null;
  onGoStudio: () => void;
  onOpenProject: () => void;
}

function saveStateLabel(projectRef: StoredProjectRef | null): { label: string; tone: 'none' | 'ok' | 'warn' } {
  if (projectRef === null) return { label: 'Unsaved in this session', tone: 'warn' };
  if (projectRef.kind === 'cloud') {
    return { label: `Cloud copy · ${new Date(projectRef.savedAt).toLocaleString()}`, tone: 'ok' };
  }
  return { label: `Saved in this browser · ${new Date(projectRef.savedAt).toLocaleString()}`, tone: 'ok' };
}

/** Context rail shown on the Dashboard when a project is open. */
export default function DashboardHeader({
  projectName,
  projectNumber,
  projectRef,
  onGoStudio,
  onOpenProject,
}: DashboardHeaderProps) {
  const save = saveStateLabel(projectRef);

  if (!projectName) {
    return (
      <div className="db-context db-context-empty">
        <div className="db-context-copy">
          <span className="db-eyebrow">CONTEXT</span>
          <p className="db-context-empty-text">
            No project is open. Create a new aluminium door / window project or open a saved one to reach
            the design tools below.
          </p>
        </div>
        <button type="button" className="btn" onClick={onOpenProject}>
          <FolderOpen size={15} /> Open Project
        </button>
      </div>
    );
  }

  return (
    <div className="db-context" data-tone={save.tone}>
      <div className="db-context-mark" aria-hidden="true" />
      <div className="db-context-copy">
        <div className="db-context-row">
          <span className="db-context-overline">OPEN PROJECT</span>
          <span className="db-context-save">
            <span className="db-context-dot" aria-hidden="true" />
            {save.label}
          </span>
        </div>
        <p className="db-context-name">{projectName}</p>
        <p className="db-context-meta">
          {projectNumber ? <span className="mono">{projectNumber}</span> : <span>No project reference</span>}
          {projectRef ? <span> · {projectRef.kind === 'cloud' ? 'cloud' : 'local'}</span> : null}
        </p>
      </div>
      <button type="button" className="btn db-context-action" onClick={onGoStudio}>
        <BoxSelect size={15} /> Open in 3D Studio
      </button>
    </div>
  );
}
