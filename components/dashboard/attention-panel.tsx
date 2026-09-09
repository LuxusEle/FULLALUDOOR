'use client';

import { CheckCircle2, CircleAlert, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { DashboardIssue } from './dashboard-types';
import { Eyebrow, SEVERITY_LABEL, severitySortValue } from './panel';

interface AttentionPanelProps {
  issues: DashboardIssue[];
}

const SEVERITY_ICON = {
  info: Info,
  review: TriangleAlert,
  warning: ShieldAlert,
  critical: CircleAlert,
} as const;

function AttentionRow({ issue }: { issue: DashboardIssue }) {
  const Icon = SEVERITY_ICON[issue.severity];
  return (
    <li className="db-attention-row" data-severity={issue.severity}>
      <span className="db-attention-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <div className="db-attention-copy">
        <div className="db-attention-head">
          <p className="db-attention-title">
            {issue.tag && <span className="mono db-attention-tag">{issue.tag}</span>}
            {issue.title}
          </p>
          <span className="db-attention-level">{SEVERITY_LABEL[issue.severity].toUpperCase()}</span>
        </div>
        <p className="db-attention-detail">{issue.detail}</p>
        <p className="db-attention-source">Source: {issue.source}</p>
      </div>
    </li>
  );
}

export default function AttentionPanel({ issues }: AttentionPanelProps) {
  const ordered = [...issues].sort(
    (a, b) => severitySortValue(b.severity) - severitySortValue(a.severity) || a.title.localeCompare(b.title)
  );
  const visible = ordered.slice(0, 6);
  const remaining = ordered.length - visible.length;

  return (
    <section className="db-section db-attention" aria-label="Attention and fabrication alerts">
      <div className="db-section-head">
        <div>
          <Eyebrow>ATTENTION</Eyebrow>
          <h2 className="db-section-title">
            {ordered.length === 0 ? 'Fabrication Alerts' : `Fabrication Alerts · ${ordered.length}`}
          </h2>
          <p className="db-section-sub">
            Real validation issues detected in your projects — dimensions, references and completeness.
          </p>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="db-clear">
          <CheckCircle2 size={17} aria-hidden="true" />
          <p>
            <strong>No items require attention.</strong> All stored projects pass basic fabrication
            checks.
          </p>
        </div>
      ) : (
        <>
          <ul className="db-attention-list">
            {visible.map((issue) => (
              <AttentionRow key={issue.id} issue={issue} />
            ))}
          </ul>
          {remaining > 0 && (
            <p className="db-attention-more">
              + {remaining} more issue{remaining === 1 ? '' : 's'} in the project library
            </p>
          )}
        </>
      )}
    </section>
  );
}
