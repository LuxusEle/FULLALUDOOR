'use client';

import { useMemo, useState } from 'react';
import type { ManufacturingDossier } from '../../lib/manufacturing-dossier';
import type { OpeningItem, ProjectMetadata } from '../../lib/types';
import type { StoredProject, StoredProjectRef } from '../../lib/project-storage';
import {
  catalogStatus,
  catalogTotals,
  deriveProjectIssues,
  type CatalogRecord,
} from '../../lib/project-catalog';
import { loadProjectByRef } from '../../lib/project-storage';
import { useProjectCatalog } from './use-project-catalog';
import type { DashboardGo, DashboardIssue, SessionActivity } from './dashboard-types';
import DashboardHeader from './dashboard-header';
import DashboardWelcome from './dashboard-welcome';
import ProjectStats from './project-stats';
import RecentProjects from './recent-projects';
import QuickActions from './quick-actions';
import ManufacturingOverview from './manufacturing-overview';
import ActivityTimeline from './activity-timeline';
import AttentionPanel from './attention-panel';
import { DashboardEmpty, DashboardError, DashboardSkeleton, DashboardWarnings } from './dashboard-states';

interface DashboardHomeProps {
  project: ProjectMetadata | null;
  projectRef: StoredProjectRef | null;
  openings: OpeningItem[];
  dossier: ManufacturingDossier | null;
  activities: SessionActivity[];
  onGo: (tab: DashboardGo) => void;
  onOpenDocument: (doc: StoredProject, ref: StoredProjectRef) => void;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onExportPdf: () => void;
}

function isOpenProject(record: CatalogRecord, project: ProjectMetadata | null, projectRef: StoredProjectRef | null): boolean {
  if (!project) return false;
  if (record.kind === 'local' && record.id === project.id) return true;
  if (record.kind === 'cloud' && projectRef?.kind === 'cloud' && record.id === projectRef.id) return true;
  return false;
}

export default function DashboardHome({
  project,
  projectRef,
  openings,
  dossier,
  activities,
  onGo,
  onOpenDocument,
  onCreateProject,
  onOpenProject,
  onExportPdf,
}: DashboardHomeProps) {
  const catalog = useProjectCatalog();
  const [query, setQuery] = useState('');
  const [busyRecord, setBusyRecord] = useState<string | null>(null);

  // Live view of the currently open project, used to keep stats/alerts honest
  // even when the open project is newer than its last saved snapshot.
  const currentDoc = useMemo<StoredProject | null>(
    () =>
      project
        ? {
            version: 1,
            savedAt: projectRef?.savedAt ?? new Date().toISOString(),
            project,
            openings,
          }
        : null,
    [project, projectRef?.savedAt, openings]
  );

  const records = useMemo(() => {
    return catalog.records.map((record) => {
      if (isOpenProject(record, project, projectRef) && currentDoc) {
        return {
          ...record,
          openingCount: currentDoc.openings.length,
          totalLeaves: currentDoc.openings.reduce((sum, o) => sum + (o.quantity || 0), 0),
          issues: deriveProjectIssues(currentDoc),
          status: catalogStatus(currentDoc),
        };
      }
      return record;
    });
  }, [catalog.records, project, projectRef, currentDoc]);

  const cloudCount = catalog.records.filter((record) => record.kind === 'cloud').length;
  const localCount = catalog.records.length - cloudCount;

  const currentIssues: DashboardIssue[] = useMemo(() => {
    if (!project || !currentDoc) return [];
    if (catalog.records.some((record) => isOpenProject(record, project, projectRef))) return [];
    return deriveProjectIssues(currentDoc).map((issue, index) => ({
      id: `open-${index}`,
      severity: issue.severity,
      tag: issue.tag,
      title: issue.title,
      detail: issue.detail,
      source: `Open project — ${project.projectName}`,
    }));
  }, [project, projectRef, currentDoc, catalog.records]);

  const totals = useMemo(() => {
    const base = catalogTotals(records);
    // Include real issues from the open-but-unsaved project in the pending tally.
    if (currentIssues.length > 0) {
      return {
        ...base,
        openIssues: base.openIssues + currentIssues.length,
        projectsWithIssues: base.projectsWithIssues + 1,
      };
    }
    return base;
  }, [records, currentIssues]);

  const issues: DashboardIssue[] = useMemo(() => {
    const fromRecords = records.flatMap((record) =>
      record.issues.map((issue, index) => ({
        id: `catalog-${record.kind}-${record.id}-${index}`,
        severity: issue.severity,
        tag: issue.tag,
        title: issue.title,
        detail: issue.detail,
        source: record.name,
      }))
    );
    return [...fromRecords, ...currentIssues];
  }, [records, currentIssues]);

  const handleOpenRecord = async (record: CatalogRecord) => {
    const key = `${record.kind}-${record.id}`;
    setBusyRecord(key);
    try {
      const result = await loadProjectByRef(
        { id: record.id, name: record.name, savedAt: record.savedAt, kind: record.kind },
        catalog.user
      );
      if (!result.ok || !result.doc) {
        // Surface silently here — the library overlay and states show errors.
        return;
      }
      onOpenDocument(result.doc, {
        id: record.id,
        name: record.name,
        savedAt: record.savedAt,
        kind: record.kind,
      });
    } catch {
      // ignore: opening is best-effort from the dashboard row
    } finally {
      setBusyRecord(null);
    }
  };

  const hasAny = catalog.records.length > 0;

  return (
    <div className="dashboard-wrapper db-home">
      <DashboardHeader
        projectName={project ? project.projectName : null}
        projectNumber={project?.projectNumber ?? ''}
        projectRef={projectRef}
        onGoStudio={() => onGo('studio')}
        onOpenProject={onOpenProject}
      />

      <DashboardWelcome
        projectName={project ? project.projectName : null}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        searchQuery={query}
        onSearchQueryChange={setQuery}
        canSearch={hasAny}
      />

      <DashboardWarnings warnings={catalog.warnings} />

      {catalog.loading ? (
        <DashboardSkeleton />
      ) : catalog.error ? (
        <DashboardError message={catalog.error} onRetry={catalog.refresh} />
      ) : !hasAny ? (
        <DashboardEmpty
          openProjectName={project?.projectName ?? null}
          onCreateProject={onCreateProject}
          onOpenProject={onOpenProject}
        />
      ) : (
        <>
          <ProjectStats
            totals={totals}
            cloudCount={cloudCount}
            localCount={localCount}
            onRefresh={catalog.refresh}
          />

          <div className="db-mid-grid">
            <RecentProjects
              records={records}
              query={query}
              busyId={busyRecord}
              onOpen={(record) => void handleOpenRecord(record)}
              onViewAll={onOpenProject}
            />
            <QuickActions
              hasProject={project !== null}
              onGo={onGo}
              onNewProject={onCreateProject}
              onExportPdf={onExportPdf}
            />
          </div>

          <div className="db-mid-grid">
            <ManufacturingOverview dossier={dossier} projectName={project?.projectName ?? null} />
            <ActivityTimeline records={records} activities={activities} />
          </div>

          <AttentionPanel issues={issues} />
        </>
      )}
    </div>
  );
}
