'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Box,
  FolderKanban,
  Layers,
  RefreshCw,
} from 'lucide-react';
import type { CatalogTotals } from '../../lib/project-catalog';
import { Eyebrow } from './panel';

export interface ProjectStatsProps {
  totals: CatalogTotals;
  cloudCount: number;
  localCount: number;
  onRefresh: () => void;
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  emphasis?: boolean;
}

function StatCard({ label, value, sub, icon, emphasis = false }: StatCardProps) {
  return (
    <div className="db-stat" data-emphasis={emphasis ? 'on' : undefined}>
      <div className="db-stat-top">
        <span className="db-stat-label">{label}</span>
        <span className="db-stat-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="db-stat-value">{value}</div>
      <p className="db-stat-sub">{sub}</p>
    </div>
  );
}

export default function ProjectStats({ totals, cloudCount, localCount, onRefresh }: ProjectStatsProps) {
  const storageLabel =
    cloudCount + localCount === 0
      ? 'No stored projects'
      : `${localCount} in this browser${cloudCount > 0 ? ` · ${cloudCount} cloud` : ''}`;

  const reviews = totals.openIssues;
  const reviewsSub =
    reviews === 0
      ? 'No open validation issues'
      : `${reviews} item${reviews === 1 ? '' : 's'} across ${totals.projectsWithIssues} project${totals.projectsWithIssues === 1 ? '' : 's'}`;

  return (
    <section className="db-section" aria-label="Project overview" aria-live="polite">
      <div className="db-section-head">
        <div>
          <Eyebrow>PROJECT OVERVIEW</Eyebrow>
          <h2 className="db-section-title">Workspace totals</h2>
          <p className="db-section-sub">Live figures from your saved project library — nothing is estimated.</p>
        </div>
        <button
          type="button"
          className="btn-icon db-refresh"
          onClick={onRefresh}
          aria-label="Reload project catalog"
          title="Reload project catalog"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="db-stats-grid">
        <StatCard
          label="Total Projects"
          value={String(totals.totalProjects)}
          sub={storageLabel}
          icon={<FolderKanban size={15} />}
        />
        <StatCard
          label="Active Projects"
          value={String(totals.recentProjects)}
          sub="Modified in the last 7 days"
          icon={<Layers size={15} />}
        />
        <StatCard
          label="Total Openings"
          value={String(totals.totalOpenings)}
          sub="Scheduled aluminium openings"
          icon={<Box size={15} />}
        />
        <StatCard
          label="Pending Reviews"
          value={String(reviews)}
          sub={reviewsSub}
          emphasis={reviews > 0}
          icon={<AlertTriangle size={15} />}
        />
      </div>
    </section>
  );
}
