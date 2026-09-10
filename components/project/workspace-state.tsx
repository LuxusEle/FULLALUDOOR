'use client';

// Full-screen states for the project-scoped workspace while a project is being
// resolved from the URL, or when it cannot be loaded.

import { AlertTriangle, FolderOpen, Hexagon, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { ROUTES } from '../../lib/project-routing';

export type WorkspaceStateKind = 'loading' | 'not-found' | 'denied' | 'error';

interface WorkspaceStateProps {
  state: WorkspaceStateKind;
  message: string | null;
  projectId: string | null;
  onRetry: () => void;
}

const COPY: Record<Exclude<WorkspaceStateKind, 'loading'>, { title: string; lead: string }> = {
  'not-found': {
    title: 'Project not found',
    lead: 'This project does not exist, was deleted, or is not shared with your account.',
  },
  denied: {
    title: 'Access denied',
    lead: 'Your account or this device is not authorized to open this project.',
  },
  error: {
    title: 'Project failed to load',
    lead: 'The project could not be loaded from storage. Check your connection and try again.',
  },
};

export default function WorkspaceState({ state, message, projectId, onRetry }: WorkspaceStateProps) {
  return (
    <div className="workspace-state">
      <div className="workspace-state-card">
        <div className="workspace-state-brand">
          <span className="workspace-state-mark" aria-hidden="true">
            <Hexagon size={20} strokeWidth={2.3} />
          </span>
          <span>FullAluDoor Pro</span>
        </div>

        {state === 'loading' ? (
          <div className="workspace-state-body">
            <Loader2 size={22} className="spin" aria-hidden="true" />
            <h1>Loading project…</h1>
            <p className="workspace-state-lead">
              Resolving {projectId ? <span className="mono">{projectId}</span> : 'the project'} and verifying your
              access.
            </p>
          </div>
        ) : (
          <div className="workspace-state-body">
            <span className={`workspace-state-icon ${state}`} aria-hidden="true">
              {state === 'denied' ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}
            </span>
            <h1>{COPY[state].title}</h1>
            <p className="workspace-state-lead">{message || COPY[state].lead}</p>
            {projectId && (
              <p className="workspace-state-ref">
                Requested project: <span className="mono">{projectId}</span>
              </p>
            )}
          </div>
        )}

        <div className="workspace-state-actions">
          {state !== 'loading' && (
            <button type="button" className="btn" onClick={onRetry}>
              <RefreshCw size={14} /> Retry
            </button>
          )}
          <a className="btn btn-primary" href={ROUTES.projects} style={{ textDecoration: 'none' }}>
            <FolderOpen size={14} /> Back to Projects
          </a>
          <a className="btn" href={ROUTES.dashboard} style={{ textDecoration: 'none' }}>
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
