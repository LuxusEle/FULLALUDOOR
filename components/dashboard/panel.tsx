import type { CSSProperties, ReactNode } from 'react';
import type { CatalogStatus } from '../../lib/project-catalog';
import type { IssueSeverity } from '../../lib/project-catalog';
import { severityRank } from '../../lib/project-catalog';

/** Compact reusable atoms shared across the Dashboard sections. */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="db-eyebrow">{children}</span>;
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
  aside,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="db-section-head">
      <div style={{ minWidth: 0 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="db-section-title">{title}</h2>
        {sub && <p className="db-section-sub">{sub}</p>}
      </div>
      {aside && <div className="db-section-aside">{aside}</div>}
    </div>
  );
}

export function StatusChip({ status }: { status: CatalogStatus }) {
  const label =
    status === 'draft' ? 'Draft' : status === 'review' ? 'Review' : 'In Progress';
  return (
    <span className="db-chip" data-status={status} title={`Project state: ${label}`}>
      <span className="db-chip-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  info: 'Info',
  review: 'Review',
  warning: 'Warning',
  critical: 'Critical',
};

export function SeverityChip({ severity }: { severity: IssueSeverity }) {
  return (
    <span className="db-chip" data-severity={severity}>
      {SEVERITY_LABEL[severity].toUpperCase()}
    </span>
  );
}

export function severitySortValue(severity: IssueSeverity): number {
  return severityRank(severity);
}

export const SEVERITY_ICON_COLOR: Record<IssueSeverity, string> = {
  info: 'var(--muted)',
  review: '#e8a13c',
  warning: '#f0a020',
  critical: 'var(--crimson)',
};

export const CARD_PANEL: CSSProperties = {
  border: '1px solid var(--edge)',
  background: 'var(--card-bg)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-md)',
};
