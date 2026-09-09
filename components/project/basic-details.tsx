'use client';

import {
  Archive,
  Building2,
  Calendar,
  Copy,
  FolderOpen,
  Hash,
  Mail,
  MapPin,
  PencilRuler,
  Phone,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import type { CatalogStatus, ProjectIssue } from '../../lib/project-catalog';
import { catalogStatus, deriveProjectIssues } from '../../lib/project-catalog';
import type { OpeningItem, ProjectMetadata } from '../../lib/types';
import { PROJECT_CURRENCIES } from '../../lib/types';

interface BasicDetailsProps {
  project: ProjectMetadata;
  openings: OpeningItem[];
  onChange: (updates: Partial<ProjectMetadata>) => void;
  onDuplicate: () => void;
  onGoDesigns: () => void;
}

const STATUS_LABEL: Record<CatalogStatus, string> = {
  draft: 'Draft',
  review: 'Review needed',
  'in-progress': 'In progress',
};

export default function BasicDetailsPanel({
  project,
  openings,
  onChange,
  onDuplicate,
  onGoDesigns,
}: BasicDetailsProps) {
  const ephemeral: Parameters<typeof catalogStatus>[0] = {
    version: 1,
    savedAt: new Date().toISOString(),
    project,
    openings,
  };
  const issues: ProjectIssue[] = deriveProjectIssues(ephemeral);
  const status = catalogStatus(ephemeral);
  const issuesBySeverity = issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
    return counts;
  }, {});
  const totalLeaves = openings.reduce((sum, opening) => sum + (opening.quantity || 0), 0);

  const field = (
    key: keyof ProjectMetadata,
    label: string,
    icon?: typeof Building2,
    multiline = false
  ) => {
    const FieldIcon = icon;
    return (
      <div className="meta-field" style={{ gridColumn: multiline ? 'span 2' : undefined }}>
        <label>
          {FieldIcon ? <FieldIcon size={12} /> : null} {label}
        </label>
        {multiline ? (
          <textarea
            className="input-meta bd-textarea"
            value={(project[key] as string | undefined) ?? ''}
            onChange={(event) => onChange({ [key]: event.target.value })}
          />
        ) : (
          <input
            type={key === 'date' || key === 'targetCompletionDate' ? 'date' : 'text'}
            className="input-meta"
            value={(project[key] as string | undefined) ?? ''}
            onChange={(event) => onChange({ [key]: event.target.value })}
          />
        )}
      </div>
    );
  };

  const archive = () => {
    onChange({ archived: !project.archived, archivedAt: project.archived ? null : new Date().toISOString() });
  };

  return (
    <div className="schedule-wrapper">
      {project.archived && (
        <div className="bd-archive-banner" role="status">
          <Archive size={15} aria-hidden="true" />
          <span>
            This project is archived{project.archivedAt ? ` on ${new Date(project.archivedAt).toLocaleDateString()}` : ''}.
            Restore it to keep working on it.
          </span>
          <button type="button" className="btn" onClick={archive}>
            <RotateCcw size={13} /> Restore Project
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bd-toolbar">
        <div className="nav-pill-group" role="tablist" aria-label="Project actions">
          <span className="bd-status-chip" data-status={status}>
            <span className="bd-status-dot" aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
          <span className="bd-count-chip">
            {openings.length} opening{openings.length === 1 ? '' : 's'} · {totalLeaves} leaf
            {totalLeaves === 1 ? '' : 'ren'}
          </span>
          {issues.length > 0 && (
            <span className="bd-count-chip" data-warn>
              {issues.length} validation issue{issues.length === 1 ? '' : 's'}
              {issuesBySeverity.critical ? ` · ${issuesBySeverity.critical} critical` : ''}
            </span>
          )}
        </div>
        <div className="bd-toolbar-actions">
          <button type="button" className="btn" onClick={onDuplicate} title="Duplicate this project with a new number">
            <Copy size={14} /> Duplicate
          </button>
          {!project.archived && (
            <button type="button" className="btn" onClick={archive} title="Archive this project">
              <Archive size={14} /> Archive
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onGoDesigns}>
            <FolderOpen size={14} /> Open Designs
          </button>
        </div>
      </div>

      {/* Identity */}
      <div className="bd-block">
        <div className="bd-block-head">
          <h2 className="section-title">PROJECT IDENTITY</h2>
          <p className="bd-block-sub">Reference and client information for this project.</p>
        </div>
        <div className="project-meta-grid bd-grid-wide">
          {field('projectName', 'Project Name', Building2)}
          <div className="meta-field">
            <label>
              <Hash size={12} /> Project Number
            </label>
            <input
              type="text"
              className="input-meta"
              value={project.projectNumber}
              onChange={(event) => onChange({ projectNumber: event.target.value })}
              placeholder="FA-2026-001"
            />
            <small className="bd-hint">Format FA-YYYY-NNN · auto-assigned on creation</small>
          </div>
          {field('date', 'Created Date', Calendar)}
          {field('targetCompletionDate', 'Target Completion', Calendar)}
          {field('company', 'Company / Brand', Building2)}
          {field('assignedStaff', 'Assigned Staff', UserRound)}
        </div>
      </div>

      {/* Client */}
      <div className="bd-block">
        <div className="bd-block-head">
          <h2 className="section-title">CLIENT</h2>
          <p className="bd-block-sub">A client can have multiple projects; these details are kept with each project.</p>
        </div>
        <div className="project-meta-grid bd-grid-wide">
          {field('clientName', 'Client Name', Building2)}
          {field('clientContact', 'Contact Person', UserRound)}
          {field('clientPhone', 'Phone', Phone)}
          {field('clientEmail', 'Email', Mail)}
          {field('siteAddress', 'Site Address', MapPin, true)}
        </div>
      </div>

      {/* Site / Workscope */}
      <div className="bd-block">
        <div className="bd-block-head">
          <h2 className="section-title">SITE & WORKSCOPE</h2>
          <p className="bd-block-sub">Where the work happens and what it covers.</p>
        </div>
        <div className="project-meta-grid bd-grid-wide">
          {field('contractorName', 'Contractor', Building2)}
          <div className="meta-field">
            <label>Currency</label>
            <select
              className="input-meta"
              value={project.currency}
              onChange={(event) => onChange({ currency: event.target.value })}
            >
              {PROJECT_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          {field('description', 'Project Description', PencilRuler, true)}
          {field('notes', 'Notes', PencilRuler, true)}
        </div>
      </div>
    </div>
  );
}
