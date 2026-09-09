'use client';

import { AlertTriangle, FolderOpen, Plus, RefreshCw } from 'lucide-react';

export function DashboardSkeleton() {
  return (
    <div className="db-loading" aria-busy="true" aria-label="Loading dashboard data">
      <div className="db-stats-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="db-skeleton db-skeleton-stat" />
        ))}
      </div>
      <div className="db-mid-grid" aria-hidden="true">
        <div className="db-skeleton db-skeleton-panel" style={{ minHeight: 320 }} />
        <div className="db-skeleton db-skeleton-panel" style={{ minHeight: 320 }} />
      </div>
      <div className="db-mid-grid" aria-hidden="true">
        <div className="db-skeleton db-skeleton-panel" style={{ minHeight: 240 }} />
        <div className="db-skeleton db-skeleton-panel" style={{ minHeight: 240 }} />
      </div>
    </div>
  );
}

export function DashboardEmpty({
  openProjectName,
  onCreateProject,
  onOpenProject,
}: {
  openProjectName: string | null;
  onCreateProject: () => void;
  onOpenProject: () => void;
}) {
  return (
    <section className="db-empty" aria-label="No projects yet">
      <span className="db-empty-mark" aria-hidden="true">
        <FolderOpen size={22} />
      </span>
      <h2 className="db-empty-title">{openProjectName ? 'No saved projects yet' : 'No projects yet'}</h2>
      <p className="db-empty-text">
        {openProjectName ? (
          <>
            “{openProjectName}” is open in this session but has not been saved. Save it from the top bar, or
            create another project or open a stored one below.
          </>
        ) : (
          <>
            Start your first aluminium door or window project. Create a fresh schedule with a blank unit, or
            open a project stored in the cloud or this browser.
          </>
        )}
      </p>
      <div className="db-empty-actions">
        <button type="button" className="btn btn-primary" onClick={onCreateProject}>
          <Plus size={15} strokeWidth={2.6} /> Create New Project
        </button>
        <button type="button" className="btn" onClick={onOpenProject}>
          <FolderOpen size={15} /> Open Project
        </button>
      </div>
    </section>
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="db-error" role="alert" aria-label="Dashboard error">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <h2 className="db-error-title">Unable to load dashboard data.</h2>
        <p className="db-error-text">{message}</p>
      </div>
      <button type="button" className="btn" onClick={onRetry}>
        <RefreshCw size={14} /> Try again
      </button>
    </section>
  );
}

export function DashboardWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="db-warning-strip" role="status">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  );
}
