'use client';

import { useMemo } from 'react';
import { ArrowRight, CircleAlert, FolderOpen, Loader2 } from 'lucide-react';
import type { CatalogRecord } from '../../lib/project-catalog';
import { formatRelativeTime, severityRank } from '../../lib/project-catalog';
import type { IssueSeverity } from '../../lib/project-catalog';
import { SectionHeader, StatusChip } from './panel';

interface RecentProjectsProps {
  records: CatalogRecord[];
  query: string;
  busyId: string | null;
  onOpen: (record: CatalogRecord) => void;
  onViewAll: () => void;
}

function severityOf(record: CatalogRecord): IssueSeverity | null {
  if (record.issues.length === 0) return null;
  return record.issues.reduce((highest, issue) =>
    severityRank(issue.severity) > severityRank(highest.severity) ? issue : highest
  ).severity;
}

export default function RecentProjects({
  records,
  query,
  busyId,
  onOpen,
  onViewAll,
}: RecentProjectsProps) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter(
      (record) =>
        record.name.toLowerCase().includes(needle) ||
        record.clientName.toLowerCase().includes(needle) ||
        record.projectNumber.toLowerCase().includes(needle)
    );
  }, [records, query]);

  const visible = query ? filtered : filtered.slice(0, 6);

  return (
    <section className="db-section" aria-label="Recent projects">
      <SectionHeader
        eyebrow="PROJECTS"
        title="Recent Projects"
        sub={`${records.length} saved project${records.length === 1 ? '' : 's'}${records.length > 6 ? ' · showing latest 6' : ''}`}
        aside={
          records.length > 0 ? (
            <button type="button" className="db-text-link" onClick={onViewAll}>
              View all projects <ArrowRight size={13} aria-hidden="true" />
            </button>
          ) : undefined
        }
      />

      {records.length === 0 ? null : visible.length === 0 ? (
        <div className="db-none">
          No projects match “{query}”. Try a project name, client or reference.
        </div>
      ) : (
        <ul className="db-recent-list">
          {visible.map((record) => {
            const severity = severityOf(record);
            const busy = busyId === `${record.kind}-${record.id}`;
            const modified = formatRelativeTime(record.savedAt);
            return (
              <li key={`${record.kind}-${record.id}`} className="db-recent-row">
                <div className="db-recent-main">
                  <div className="db-recent-title-row">
                    <button
                      type="button"
                      className="db-recent-name"
                      onClick={() => onOpen(record)}
                      disabled={busy}
                      title={`Open ${record.name}`}
                    >
                      {record.name}
                    </button>
                    <StatusChip status={record.status} />
                    {severity && (
                      <span
                        className="db-recent-alert"
                        data-severity={severity}
                        title={`${record.issues.length} issue${record.issues.length === 1 ? '' : 's'} need attention`}
                      >
                        <CircleAlert size={13} aria-hidden="true" />
                        <span className="mono">{record.issues.length}</span>
                        <span className="sr-only">
                          {record.issues.length} issue{record.issues.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="db-recent-meta">
                    <span>Client: {record.clientName || '—'}</span>
                    <span className="mono">No: {record.projectNumber || '—'}</span>
                  </p>
                </div>

                <div className="db-recent-spec">
                  <span className="db-recent-count">
                    <strong className="mono">{record.openingCount}</strong> opening
                    {record.openingCount === 1 ? '' : 's'}
                    {record.totalLeaves !== record.openingCount
                      ? ` · ${record.totalLeaves} leaves`
                      : ''}
                  </span>
                  <span className="db-recent-modified">
                    {record.kind === 'cloud' ? 'Cloud' : 'This browser'} · {modified}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn db-recent-open"
                  onClick={() => onOpen(record)}
                  disabled={busy}
                  title={`Open ${record.name}`}
                >
                  {busy ? <Loader2 size={14} className="spin" /> : <FolderOpen size={14} />}
                  <span>Open</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
