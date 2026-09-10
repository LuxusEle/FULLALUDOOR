'use client';

// Dedicated project library (route: /projects). Reads the same authoritative
// catalog as the dashboard and opens the selected project's workspace.

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type { CatalogRecord, CatalogStatus } from '../../lib/project-catalog';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/project-catalog';
import { filterCatalogRecords, projectWorkspacePath } from '../../lib/project-routing';
import { buildNewProject } from '../../lib/project-creation';
import {
  deleteCloudProject,
  deleteLocalProject,
} from '../../lib/project-storage';
import { useProjectCatalog } from '../dashboard/use-project-catalog';
import { persistNewProject } from '../app/persist-project';
import AppNav from '../app/app-nav';
import NewProjectDialog, { type NewProjectDetails } from '../dashboard/new-project-dialog';
import { DashboardError, DashboardSkeleton } from '../dashboard/dashboard-states';

type SortMode = 'recent' | 'alpha';

export default function ProjectsPage() {
  const catalog = useProjectCatalog();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CatalogStatus>('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CatalogRecord | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const filtered = useMemo(
    () => filterCatalogRecords(catalog.records, { query, status: statusFilter, sort, showArchived }),
    [catalog.records, query, statusFilter, sort, showArchived]
  );

  const archivedCount = catalog.records.filter((record) => record.archived).length;

  const openProject = (record: CatalogRecord) => {
    window.location.href = projectWorkspacePath(record.id);
  };

  const handleDelete = async (record: CatalogRecord) => {
    setBusy(true);
    setNotice(null);
    try {
      if (record.kind === 'cloud' && catalog.user && !catalog.demoMode) {
        const result = await deleteCloudProject(record.id);
        setNotice({ tone: result.ok ? 'ok' : 'error', text: result.message });
      } else {
        deleteLocalProject(record.id);
        setNotice({ tone: 'ok', text: 'Project deleted from this browser.' });
      }
      catalog.refresh();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Delete failed.' });
    } finally {
      setConfirmDelete(null);
      setBusy(false);
    }
  };

  const handleCreate = async (details: NewProjectDetails) => {
    setBusy(true);
    setNotice(null);
    const existing = catalog.records.map((record) => record.projectNumber).filter((value) => value.length > 0);
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
      setNotice({ tone: 'error', text: result.message || 'The project could not be created.' });
      return;
    }
    setNewProjectOpen(false);
    window.location.href = projectWorkspacePath(result.ref.id);
  };

  return (
    <div className="projects-page">
      <AppNav active="projects" />

      <main className="projects-main">
        <div className="projects-head">
          <div>
            <p className="projects-kicker">FULLALUDOOR · PROJECT LIBRARY</p>
            <h1 className="projects-title">All Projects</h1>
            <p className="projects-sub">
              {catalog.loading
                ? 'Loading your projects…'
                : `${catalog.records.length} project${catalog.records.length === 1 ? '' : 's'} · ${filtered.length} shown`}
            </p>
          </div>
          <div className="projects-head-actions">
            <button type="button" className="btn-icon" onClick={catalog.refresh} title="Refresh" aria-label="Refresh projects">
              <RefreshCw size={15} />
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setNewProjectOpen(true)} disabled={busy}>
              <Plus size={15} strokeWidth={2.6} /> Create New Project
            </button>
          </div>
        </div>

        <div className="projects-toolbar" role="toolbar" aria-label="Filter projects">
          <label className="projects-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, client, number, site…"
              aria-label="Search projects"
              spellCheck={false}
            />
          </label>
          <label className="projects-field">
            <span>Status</span>
            <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | CatalogStatus)}>
              <option value="all">All statuses</option>
              <option value="in-progress">In Progress</option>
              <option value="review">Requires Review</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <label className="projects-field">
            <span>Sort</span>
            <select className="select" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="recent">Recently modified</option>
              <option value="alpha">Name (A–Z)</option>
            </select>
          </label>
          <button
            type="button"
            className={`btn ${showArchived ? '' : 'btn-ghost'}`}
            aria-pressed={showArchived}
            onClick={() => setShowArchived((value) => !value)}
            disabled={archivedCount === 0}
            title={archivedCount > 0 ? `Show ${archivedCount} archived project${archivedCount === 1 ? '' : 's'}` : 'No archived projects'}
          >
            Show archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
          </button>
        </div>

        {notice && <div className={`projects-notice ${notice.tone}`}>{notice.text}</div>}

        {catalog.loading ? (
          <DashboardSkeleton />
        ) : catalog.error ? (
          <DashboardError message={catalog.error} onRetry={catalog.refresh} />
        ) : catalog.records.length === 0 ? (
          <section className="projects-empty">
            <span className="projects-empty-mark" aria-hidden="true">
              <FolderOpen size={22} />
            </span>
            <h2>NO PROJECTS YET</h2>
            <p>Create your first aluminium door/window project.</p>
            <button type="button" className="btn btn-primary" onClick={() => setNewProjectOpen(true)}>
              <Plus size={15} strokeWidth={2.6} /> CREATE NEW PROJECT
            </button>
          </section>
        ) : filtered.length === 0 ? (
          <div className="projects-none">No projects match the current search or filters.</div>
        ) : (
          <div className="projects-table-wrap">
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Project No</th>
                  <th>Openings</th>
                  <th>Modified</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  const isConfirming = confirmDelete?.id === record.id && confirmDelete?.kind === record.kind;
                  return (
                    <tr key={`${record.kind}-${record.id}`}>
                      <td data-label="Project">
                        <button type="button" className="projects-name" onClick={() => openProject(record)} title={`Open ${record.name}`}>
                          {record.name}
                        </button>
                        <span className="projects-site">{record.siteAddress || 'Site address not set'}</span>
                      </td>
                      <td data-label="Client">{record.clientName || '—'}</td>
                      <td data-label="Project No" className="mono">
                        {record.projectNumber || '—'}
                        <span className="projects-rev">REV {record.revision}</span>
                      </td>
                      <td data-label="Openings" className="mono">
                        {record.openingCount}
                        {record.totalLeaves !== record.openingCount ? ` (${record.totalLeaves} leaves)` : ''}
                      </td>
                      <td data-label="Modified" title={formatAbsoluteTime(record.savedAt)}>
                        {formatRelativeTime(record.savedAt)}
                        <span className="projects-source">{record.kind === 'cloud' ? 'Cloud' : 'This browser'}</span>
                      </td>
                      <td data-label="Status">
                        <span className="projects-status" data-status={record.status}>
                          {record.fabricationStatus}
                        </span>
                      </td>
                      <td data-label="Actions" className="projects-actions">
                        {isConfirming ? (
                          <span className="projects-confirm">
                            <span>Delete?</span>
                            <button type="button" className="projects-danger" onClick={() => void handleDelete(record)} disabled={busy}>
                              {busy ? <Loader2 size={13} className="spin" /> : 'Delete'}
                            </button>
                            <button type="button" className="projects-cancel" onClick={() => setConfirmDelete(null)} disabled={busy}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="projects-confirm">
                            <button type="button" className="btn projects-open" onClick={() => openProject(record)}>
                              <FolderOpen size={14} /> Open <ArrowRight size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => setConfirmDelete(record)}
                              aria-label={`Delete ${record.name}`}
                              title="Delete project"
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
