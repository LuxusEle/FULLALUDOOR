'use client';

// Landing dashboard (route: /dashboard). Project-management overview only —
// the engineering workspace lives at /project/[projectId].

import { useMemo, useState } from 'react';
import { ArrowRight, FolderOpen, Plus } from 'lucide-react';
import type { CatalogRecord } from '../../lib/project-catalog';
import { catalogTotals } from '../../lib/project-catalog';
import { ROUTES, projectWorkspacePath } from '../../lib/project-routing';
import { buildNewProject } from '../../lib/project-creation';
import { useProjectCatalog } from './use-project-catalog';
import type { DashboardIssue } from './dashboard-types';
import AppNav from '../app/app-nav';
import { persistNewProject } from '../app/persist-project';
import NewProjectDialog, { type NewProjectDetails } from './new-project-dialog';
import DashboardWelcome from './dashboard-welcome';
import ProjectStats from './project-stats';
import RecentProjects from './recent-projects';
import ActivityTimeline from './activity-timeline';
import AttentionPanel from './attention-panel';
import { DashboardEmpty, DashboardError, DashboardSkeleton, DashboardWarnings } from './dashboard-states';

export default function LandingDashboard() {
  const catalog = useProjectCatalog();
  const [query, setQuery] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const records = catalog.records;
  const totals = useMemo(() => catalogTotals(records), [records]);
  const cloudCount = records.filter((record) => record.kind === 'cloud').length;
  const localCount = records.length - cloudCount;

  const issues: DashboardIssue[] = useMemo(
    () =>
      records.flatMap((record) =>
        record.issues.map((issue, index) => ({
          id: `catalog-${record.kind}-${record.id}-${index}`,
          severity: issue.severity,
          tag: issue.tag,
          title: issue.title,
          detail: issue.detail,
          source: record.name,
        }))
      ),
    [records]
  );

  const openProject = (record: CatalogRecord) => {
    window.location.href = projectWorkspacePath(record.id);
  };

  const handleCreate = async (details: NewProjectDetails) => {
    setBusy(true);
    setStatus(null);
    const existing = records.map((record) => record.projectNumber).filter((value) => value.length > 0);
    const { project, openings } = buildNewProject(
      {
        projectName: details.projectName,
        clientName: details.clientName,
        projectNumber: details.projectNumber,
        date: details.date,
        currency: details.currency,
        taxRatePercent: details.taxRatePercent,
        contractorName: details.contractorName,
      },
      existing
    );
    const result = await persistNewProject(catalog.user, catalog.demoMode, project, openings);
    setBusy(false);
    if (!result.ok || !result.ref) {
      setStatus({ tone: 'error', text: result.message || 'The project could not be created.' });
      return;
    }
    setNewProjectOpen(false);
    window.location.href = projectWorkspacePath(result.ref.id);
  };

  const hasRecords = records.length > 0;

  return (
    <div className="landing">
      <AppNav active="dashboard" />

      <main className="landing-main">
        <DashboardWelcome
          projectName={null}
          onCreateProject={() => setNewProjectOpen(true)}
          onOpenProject={() => {
            window.location.href = ROUTES.projects;
          }}
          searchQuery={query}
          onSearchQueryChange={setQuery}
          canSearch={hasRecords}
        />

        <div className="landing-actions">
          <button type="button" className="btn btn-primary" onClick={() => setNewProjectOpen(true)} disabled={busy}>
            <Plus size={15} strokeWidth={2.6} /> Create New Project
          </button>
          <a className="btn" href={ROUTES.projects} style={{ textDecoration: 'none' }}>
            <FolderOpen size={15} /> View All Projects <ArrowRight size={13} />
          </a>
        </div>

        {status && <div className={`landing-status ${status.tone}`}>{status.text}</div>}
        <DashboardWarnings warnings={catalog.warnings} />

        {catalog.loading ? (
          <DashboardSkeleton />
        ) : catalog.error ? (
          <DashboardError message={catalog.error} onRetry={catalog.refresh} />
        ) : !hasRecords ? (
          <DashboardEmpty openProjectName={null} onCreateProject={() => setNewProjectOpen(true)} onOpenProject={() => { window.location.href = ROUTES.projects; }} />
        ) : (
          <>
            <ProjectStats totals={totals} cloudCount={cloudCount} localCount={localCount} onRefresh={catalog.refresh} />
            <div className="db-mid-grid">
              <RecentProjects
                records={records}
                query={query}
                busyId={busy ? 'creating' : null}
                onOpen={openProject}
                onViewAll={() => {
                  window.location.href = ROUTES.projects;
                }}
              />
              <ActivityTimeline records={records} activities={[]} />
            </div>
            <AttentionPanel issues={issues} />
          </>
        )}
      </main>

      {newProjectOpen && (
        <NewProjectDialog
          initial={{
            projectName: '',
            clientName: '',
            projectNumber: '',
            date: new Date().toISOString().slice(0, 10),
            currency: 'LKR',
            taxRatePercent: 8,
            contractorName: 'ALU DOOR Pro Engineering',
          }}
          onCancel={() => setNewProjectOpen(false)}
          onCreate={(details) => void handleCreate(details)}
        />
      )}
    </div>
  );
}
