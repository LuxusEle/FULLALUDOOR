'use client';

import { useMemo } from 'react';
import {
  Activity as ActivityIcon,
  ClipboardCheck,
  FileDown,
  FolderOpen,
  FolderPlus,
  PencilLine,
  PlusSquare,
  Save,
} from 'lucide-react';
import type { CatalogRecord } from '../../lib/project-catalog';
import { formatAbsoluteTime, formatRelativeTime } from '../../lib/project-catalog';
import type { ActivityKind, SessionActivity } from './dashboard-types';
import { Eyebrow } from './panel';

interface ActivityTimelineProps {
  records: CatalogRecord[];
  activities: SessionActivity[];
}

const KIND_META: Record<ActivityKind, { icon: typeof Save; label: string }> = {
  created: { icon: FolderPlus, label: 'Project created' },
  opened: { icon: FolderOpen, label: 'Project opened' },
  'unit-added': { icon: PlusSquare, label: 'Opening added' },
  updated: { icon: PencilLine, label: 'Project updated' },
  saved: { icon: Save, label: 'Project saved' },
  exported: { icon: FileDown, label: 'Documentation exported' },
  reviewed: { icon: ClipboardCheck, label: 'Fabrication reviewed' },
  system: { icon: ActivityIcon, label: 'System' },
};

interface TimelineEntry {
  id: string;
  kind: ActivityKind;
  title: string;
  projectName: string | null;
  detail?: string;
  ts: number;
}

export default function ActivityTimeline({ records, activities }: ActivityTimelineProps) {
  const entries: TimelineEntry[] = useMemo(() => {
    const session: TimelineEntry[] = activities.map((activity) => ({
      id: activity.id,
      kind: activity.kind,
      title: activity.title,
      projectName: activity.projectName,
      detail: activity.detail,
      ts: activity.ts,
    }));

    // Real "last saved" history from the project library (timestamps from storage).
    const savedHistory: TimelineEntry[] = records.map((record) => ({
      id: `save-${record.kind}-${record.id}`,
      kind: 'saved',
      title: 'Project saved',
      projectName: record.name,
      detail: record.kind === 'cloud' ? 'Cloud copy updated' : 'Browser copy updated',
      ts: Date.parse(record.savedAt),
    }));

    return [...session, ...savedHistory]
      .filter((entry) => !Number.isNaN(entry.ts))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [activities, records]);

  return (
    <section className="db-section" aria-label="Project activity">
      <Eyebrow>RECENT ACTIVITY</Eyebrow>
      <h2 className="db-section-title">Project Activity</h2>

      {entries.length === 0 ? (
        <div className="db-none">
          No activity recorded yet. Actions you take in this session — creating, opening, editing or
          exporting projects — appear here.
        </div>
      ) : (
        <ol className="db-timeline">
          {entries.map((entry) => {
            const meta = KIND_META[entry.kind];
            const Icon = meta.icon;
            return (
              <li key={entry.id} className="db-timeline-item">
                <span className="db-timeline-icon" aria-hidden="true">
                  <Icon size={14} />
                </span>
                <div className="db-timeline-body">
                  <p className="db-timeline-title">{entry.title}</p>
                  <p className="db-timeline-sub">
                    {entry.detail ? `${entry.detail}${entry.projectName ? ' · ' : ''}` : ''}
                    {entry.projectName}
                  </p>
                </div>
                <time
                  className="db-timeline-time"
                  dateTime={new Date(entry.ts).toISOString()}
                  title={formatAbsoluteTime(new Date(entry.ts).toISOString())}
                >
                  {formatRelativeTime(new Date(entry.ts).toISOString())}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
