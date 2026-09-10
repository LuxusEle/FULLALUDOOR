'use client';

// The dashboard INSIDE a project workspace. It is strictly scoped to the
// current project: every value comes from the passed project + its derived
// fabrication/nesting/dossier data. It never reads the global project catalog.

import { useMemo, type ReactNode } from 'react';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  BoxSelect,
  Building2,
  CheckCircle2,
  ClipboardList,
  Compass,
  DollarSign,
  FileCheck2,
  FileDown,
  FileText,
  Layers,
  Percent,
  Ruler,
  Scissors,
  ShieldAlert,
  Weight,
} from 'lucide-react';
import type { DerivedOpening, OpeningItem, ProjectMetadata, ProjectNestingSummary } from '../../lib/types';
import type { ManufacturingDossier } from '../../lib/manufacturing-dossier';
import { formatRelativeTime } from '../../lib/project-catalog';
import {
  buildProjectDashboard,
  type HealthState,
  type ProjectDashboardModel,
  type ProjectMetric,
} from '../../lib/project-dashboard';
import type { SessionActivity } from './dashboard-types';

export type ProjectNavTarget =
  | 'details'
  | 'designs'
  | 'bom'
  | 'quotation'
  | 'pos'
  | 'finance'
  | 'studio'
  | 'cad'
  | 'nesting'
  | 'audit'
  | 'schedule';

interface ProjectDashboardProps {
  project: ProjectMetadata;
  openings: OpeningItem[];
  derivedOpenings: DerivedOpening[];
  nesting: ProjectNestingSummary;
  dossier: ManufacturingDossier;
  activities: SessionActivity[];
  savedAt: string | null;
  onNavigate: (target: ProjectNavTarget) => void;
  onOpenOpening: (id: string) => void;
  onExportPdf: () => void;
}

const HEALTH_LABEL: Record<HealthState, string> = {
  READY: 'READY',
  'IN PROGRESS': 'IN PROGRESS',
  REVIEW: 'REVIEW',
  BLOCKED: 'BLOCKED',
};

function healthTone(state: HealthState | 'ready' | 'review' | 'blocked' | 'progress'): string {
  switch (state) {
    case 'READY':
    case 'ready':
      return 'ok';
    case 'REVIEW':
    case 'review':
      return 'review';
    case 'BLOCKED':
    case 'blocked':
      return 'blocked';
    default:
      return 'progress';
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-LK', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not saved yet';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function MetricCard({ metric }: { metric: ProjectMetric }) {
  return (
    <div className="pd-metric" data-state={metric.state}>
      <span className="pd-metric-label">{metric.label}</span>
      <span className="pd-metric-value mono">
        {metric.value}
        {metric.unit ? <span className="pd-metric-unit">{metric.unit}</span> : null}
      </span>
      <span className="pd-metric-detail">{metric.detail}</span>
    </div>
  );
}

function StatusChip({ state, children }: { state: string; children?: ReactNode }) {
  return (
    <span className="pd-chip" data-state={state}>
      <span className="pd-chip-dot" aria-hidden="true" />
      {children ?? state}
    </span>
  );
}

export default function ProjectDashboard({
  project,
  openings,
  derivedOpenings,
  nesting,
  dossier,
  activities,
  savedAt,
  onNavigate,
  onOpenOpening,
  onExportPdf,
}: ProjectDashboardProps) {
  const model: ProjectDashboardModel = useMemo(
    () =>
      buildProjectDashboard({
        project,
        openings,
        derivedOpenings,
        nesting,
        dossier,
        activities,
        lastUpdated: savedAt,
      }),
    [project, openings, derivedOpenings, nesting, dossier, activities, savedAt]
  );

  const workflow: Array<{ key: ProjectNavTarget; label: string; state: 'ready' | 'review' | 'blocked' | 'progress' }> = useMemo(
    () => [
      { key: 'details' as const, label: 'Details', state: model.readiness.items.find((item) => item.key === 'info')?.state ?? 'review' },
      { key: 'designs' as const, label: 'Designs', state: model.design.incomplete === 0 && model.totals.openings > 0 ? 'ready' : 'review' },
      { key: 'bom' as const, label: 'BOM', state: model.readiness.items.find((item) => item.key === 'bom')?.state ?? 'review' },
      { key: 'quotation' as const, label: 'Quotation', state: model.commercial.available ? 'ready' : 'review' },
      { key: 'pos' as const, label: 'POs', state: 'progress' as const },
      { key: 'finance' as const, label: 'Finance', state: 'progress' as const },
    ],
    [model]
  );

  const quickActions: Array<{ key: ProjectNavTarget | 'export'; label: string; icon: typeof Box }> = [
    { key: 'details', label: 'Project Details', icon: Building2 },
    { key: 'schedule', label: 'Project Schedule', icon: ClipboardList },
    { key: 'studio', label: '3D Studio', icon: BoxSelect },
    { key: 'cad', label: '2D CAD', icon: Compass },
    { key: 'nesting', label: 'Cutting & Nesting', icon: Scissors },
    { key: 'bom', label: 'BOM', icon: Layers },
    { key: 'quotation', label: 'Quotation', icon: DollarSign },
    { key: 'audit', label: 'Fabrication Audit', icon: FileCheck2 },
    { key: 'export', label: 'Export PDF', icon: FileDown },
  ];

  const auditWarnings = model.audit.warnings.slice(0, 8);

  return (
    <div className="pd" data-project={model.identity.number || model.identity.name}>
      {/* ------------------------------------------------------------------ */}
      <header className="pd-header">
        <div className="pd-header-brand">
          <span className="pd-header-mark">FULLALUDOOR</span>
          <div className="pd-header-titles">
            <h1 className="pd-header-name">{model.identity.name || 'Untitled project'}</h1>
            <p className="pd-header-meta">
              <span className="mono">{model.identity.number || 'No project number'}</span>
              {model.identity.client ? <span>· {model.identity.client}</span> : null}
              {model.identity.site ? <span>· {model.identity.site}</span> : null}
            </p>
          </div>
        </div>
        <div className="pd-header-side">
          <StatusChip state={model.identity.status}>{model.identity.status}</StatusChip>
          <div className="pd-header-facts">
            <span>
              <em>Revision</em>
              <span className="mono">{model.identity.revision}</span>
            </span>
            <span>
              <em>Last updated</em>
              <span>{formatTimestamp(model.identity.lastUpdated)}</span>
            </span>
          </div>
          <a className="pd-back" href="/projects">
            <ArrowLeft size={14} /> Back to Projects
          </a>
        </div>
      </header>

      {/* Summary hero ----------------------------------------------------- */}
      <section className="pd-hero" aria-label="Project summary">
        <div className="pd-hero-copy">
          <p className="pd-kicker">PROJECT OVERVIEW</p>
          <h2 className="pd-hero-title">{model.identity.name}</h2>
          <p className="pd-hero-sub">
            {model.identity.client || 'Client not set'}
            {model.summary.contractor ? ` · ${model.summary.contractor}` : ''}
          </p>
          <p className="pd-hero-desc">{model.summary.description || 'No project description recorded.'}</p>
        </div>
        <div className="pd-hero-facts">
          <div>
            <span>Openings</span>
            <strong className="mono">{model.totals.openings}</strong>
          </div>
          <div>
            <span>Total quantity</span>
            <strong className="mono">{model.totals.totalQuantity}</strong>
          </div>
          <div>
            <span>Glazed area</span>
            <strong className="mono">{model.totals.glazedAreaM2} m²</strong>
          </div>
          <div>
            <span>Aluminium</span>
            <strong className="mono">{model.totals.totalWeightKg} kg</strong>
          </div>
          <div>
            <span>Currency</span>
            <strong className="mono">{model.summary.currency}</strong>
          </div>
        </div>
      </section>

      {/* KPI metrics ------------------------------------------------------ */}
      <section className="pd-section" aria-label="Project metrics">
        <div className="pd-section-head">
          <h3>Project Metrics</h3>
          <span className="pd-section-sub">Calculated from this project only</span>
        </div>
        <div className="pd-metrics">
          {model.metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      </section>

      {/* Openings + health ------------------------------------------------ */}
      <div className="pd-grid pd-grid-wide-left">
        <section className="pd-section" aria-label="Project openings">
          <div className="pd-section-head">
            <h3>Project Openings</h3>
            <span className="pd-section-sub">{model.totals.totalQuantity} unit{model.totals.totalQuantity === 1 ? '' : 's'} scheduled</span>
          </div>
          {model.openings.length === 0 ? (
            <div className="pd-none">No openings scheduled for this project.</div>
          ) : (
            <div className="pd-openings-wrap">
              <table className="pd-openings">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Opening</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Finish / Glass</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {model.openings.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">
                        <button type="button" className="pd-opening-tag" onClick={() => onOpenOpening(row.id)}>
                          {row.tag}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="pd-opening-name" onClick={() => onOpenOpening(row.id)}>
                          {row.name}
                        </button>
                        <span className="pd-opening-system">{row.systemLabel}</span>
                        {row.location ? <span className="pd-opening-loc">{row.location}</span> : null}
                      </td>
                      <td className="mono">
                        {row.width} × {row.height}
                      </td>
                      <td className="mono">{row.quantity}</td>
                      <td>
                        <span className="pd-opening-finish">{row.finish}</span>
                        <span className="pd-opening-glass">{row.glass}</span>
                      </td>
                      <td>
                        <StatusChip state={row.status === 'READY' ? 'READY' : 'REVIEW'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="pd-section" aria-label="Project health">
          <div className="pd-section-head">
            <h3>Project Health</h3>
          </div>
          <ul className="pd-health">
            {model.health.map((item) => (
              <li key={item.key} className="pd-health-row" data-tone={healthTone(item.state)}>
                <span className="pd-health-icon" aria-hidden="true">
                  {item.state === 'READY' ? <CheckCircle2 size={15} /> : item.state === 'BLOCKED' ? <AlertTriangle size={15} /> : <ShieldAlert size={15} />}
                </span>
                <span className="pd-health-copy">
                  <strong>{item.label}</strong>
                  <em>{item.detail}</em>
                </span>
                <StatusChip state={HEALTH_LABEL[item.state]} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Design + fabrication -------------------------------------------- */}
      <div className="pd-grid">
        <section className="pd-section" aria-label="Design status">
          <div className="pd-section-head">
            <h3>Design Status</h3>
          </div>
          <p className="pd-design-summary">
            <strong className="mono">{model.design.configured}</strong> / <span className="mono">{model.design.total}</span> openings configured
          </p>
          <ul className="pd-flag-list">
            <li><span>3D model</span><StatusChip state={model.design.threeD} /></li>
            <li><span>2D CAD</span><StatusChip state={model.design.cad} /></li>
            <li><span>Profiles</span><StatusChip state={model.design.profiles} /></li>
            <li><span>Glass</span><StatusChip state={model.design.glass} /></li>
            <li><span>Hardware</span><StatusChip state={model.design.hardware} /></li>
          </ul>
        </section>

        <section className="pd-section" aria-label="Fabrication status">
          <div className="pd-section-head">
            <h3>Fabrication Status</h3>
          </div>
          <div className="pd-fab-grid">
            <div><span>Cut pieces</span><strong className="mono">{model.fabrication.cutPieces}</strong></div>
            <div><span>Profiles</span><strong className="mono">{model.fabrication.profileCount}</strong></div>
            <div><span>Stock bars</span><strong className="mono">{model.fabrication.stockBars}</strong></div>
            <div><span>Yield</span><strong className="mono">{model.fabrication.yieldPercent}%</strong></div>
            <div><span>Reusable offcut</span><strong className="mono">{model.fabrication.reusableOffcutM} m</strong></div>
            <div><span>Scrap</span><strong className="mono">{model.fabrication.scrapMm} mm</strong></div>
            <div><span>Kerf loss</span><strong className="mono">{model.fabrication.kerfMm} mm</strong></div>
            <div><span>Aluminium</span><strong className="mono">{model.fabrication.weightKg} kg</strong></div>
          </div>
        </section>
      </div>

      {/* Audit + materials ------------------------------------------------ */}
      <div className="pd-grid">
        <section className="pd-section pd-audit" aria-label="Fabrication audit">
          <div className="pd-section-head">
            <h3>Fabrication Audit</h3>
            <span className="pd-section-sub">{auditWarnings.length} finding{auditWarnings.length === 1 ? '' : 's'}</span>
          </div>
          <div className="pd-audit-counts">
            <div data-state="pass"><span>PASS</span><strong className="mono">{model.audit.pass}</strong></div>
            <div data-state="review"><span>REVIEW</span><strong className="mono">{model.audit.review}</strong></div>
            <div data-state="fail"><span>FAIL</span><strong className="mono">{model.audit.fail}</strong></div>
          </div>
          {auditWarnings.length === 0 ? (
            <div className="pd-clear">
              <CheckCircle2 size={15} /> No open findings.
            </div>
          ) : (
            <ul className="pd-warnings">
              {auditWarnings.map((warning) => (
                <li key={warning.id} data-level={warning.level}>
                  <span className="pd-warning-level">{warning.level}</span>
                  <span className="pd-warning-copy">
                    <strong>{warning.title}</strong>
                    <em>{warning.detail}</em>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pd-section" aria-label="Material summary">
          <div className="pd-section-head">
            <h3>Material Summary</h3>
          </div>
          <div className="pd-material">
            <h4><Ruler size={14} /> Aluminium</h4>
            <ul>
              <li><span>Total weight</span><strong className="mono">{model.materials.aluminium.weightKg} kg</strong></li>
              <li><span>Profiles</span><strong className="mono">{model.materials.aluminium.profileCount}</strong></li>
              <li><span>Stock length</span><strong className="mono">{model.materials.aluminium.stockLengthM} m</strong></li>
              <li><span>Net cut length</span><strong className="mono">{model.materials.aluminium.netCutLengthM} m</strong></li>
              <li><span>Waste</span><strong className="mono">{model.materials.aluminium.wasteM} m</strong></li>
              <li><span>Yield</span><strong className="mono">{model.materials.aluminium.yieldPercent}%</strong></li>
            </ul>
          </div>
          <div className="pd-material">
            <h4><Layers size={14} /> Glass</h4>
            <ul>
              <li><span>Panels</span><strong className="mono">{model.materials.glass.panelCount}</strong></li>
              <li><span>Total area</span><strong className="mono">{model.materials.glass.areaM2} m²</strong></li>
              <li><span>Types</span><strong>{model.materials.glass.types.join(', ')}</strong></li>
            </ul>
          </div>
          <div className="pd-material">
            <h4><Box size={14} /> Hardware</h4>
            <ul>
              <li><span>Items</span><strong className="mono">{model.materials.hardware.itemCount}</strong></li>
              <li><span>Missing</span><strong className="mono">{model.materials.hardware.missingCount}</strong></li>
            </ul>
          </div>
          <div className="pd-material">
            <h4><Weight size={14} /> Gasket / Bead</h4>
            {model.materials.gasket ? (
              <ul>
                <li><span>Required</span><strong className="mono">{model.materials.gasket.itemCount} {model.materials.gasket.unit}</strong></li>
              </ul>
            ) : (
              <p className="pd-na">NOT AVAILABLE</p>
            )}
          </div>
        </section>
      </div>

      {/* Commercial + workflow ------------------------------------------- */}
      <div className="pd-grid">
        <section className="pd-section" aria-label="Commercial summary">
          <div className="pd-section-head">
            <h3>Commercial Summary</h3>
            {model.commercial.available ? (
              <button type="button" className="pd-text-link" onClick={() => onNavigate('quotation')}>
                View Quotation <ArrowRight size={13} />
              </button>
            ) : null}
          </div>
          {model.commercial.available ? (
            <div className="pd-commercial">
              <ul className="pd-commercial-lines">
                {model.commercial.lines.map((line) => (
                  <li key={line.key}>
                    <span>{line.label}</span>
                    <strong className="mono">{formatMoney(line.amount, model.commercial.currency)}</strong>
                  </li>
                ))}
              </ul>
              <div className="pd-commercial-totals">
                <div><span>Subtotal</span><strong className="mono">{formatMoney(model.commercial.subtotal, model.commercial.currency)}</strong></div>
                <div><span>Tax ({model.commercial.taxRatePercent}%)</span><strong className="mono">{formatMoney(model.commercial.taxAmount, model.commercial.currency)}</strong></div>
                <div className="pd-grand"><span>Grand total</span><strong className="mono">{formatMoney(model.commercial.grandTotal, model.commercial.currency)}</strong></div>
              </div>
            </div>
          ) : (
            <p className="pd-na">NOT AVAILABLE — no BOM / quotation data for this project.</p>
          )}
        </section>

        <section className="pd-section" aria-label="Release readiness">
          <div className="pd-section-head">
            <h3>Release Readiness</h3>
            <StatusChip state={model.readiness.status}>{model.readiness.status}</StatusChip>
          </div>
          <ul className="pd-readiness">
            {model.readiness.items.map((item) => (
              <li key={item.key} data-state={item.state}>
                <span className="pd-readiness-icon" aria-hidden="true">
                  {item.state === 'ready' ? <CheckCircle2 size={14} /> : item.state === 'blocked' ? <AlertTriangle size={14} /> : <ShieldAlert size={14} />}
                </span>
                <span className="pd-readiness-label">{item.label}</span>
                <span className="pd-readiness-detail">{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Workflow + activity --------------------------------------------- */}
      <div className="pd-grid">
        <section className="pd-section" aria-label="Project workflow">
          <div className="pd-section-head">
            <h3>Project Workflow</h3>
          </div>
          <ol className="pd-workflow">
            {workflow.map((step, index) => (
              <li key={step.key}>
                <button type="button" className="pd-workflow-step" data-state={step.state} onClick={() => onNavigate(step.key)}>
                  <span className="pd-workflow-index mono">{String(index + 1).padStart(2, '0')}</span>
                  <span className="pd-workflow-label">{step.label}</span>
                  <span className={`pd-workflow-state tone-${healthTone(step.state)}`}>
                    {step.state === 'progress' ? 'IN PROGRESS' : step.state.toUpperCase()}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="pd-section" aria-label="Recent project activity">
          <div className="pd-section-head">
            <h3>Recent Activity</h3>
          </div>
          {model.activity.length === 0 ? (
            <div className="pd-none">NO RECENT ACTIVITY</div>
          ) : (
            <ol className="pd-activity">
              {model.activity.map((entry) => (
                <li key={entry.id}>
                  <span className="pd-activity-icon" aria-hidden="true">
                    <ActivityIcon size={13} />
                  </span>
                  <span className="pd-activity-copy">
                    <strong>{entry.title}</strong>
                    {entry.detail ? <em>{entry.detail}</em> : null}
                  </span>
                  <time className="pd-activity-time mono" dateTime={new Date(entry.ts).toISOString()}>
                    {formatRelativeTime(new Date(entry.ts).toISOString())}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Quick actions ---------------------------------------------------- */}
      <section className="pd-section" aria-label="Quick actions">
        <div className="pd-section-head">
          <h3>Quick Actions</h3>
        </div>
        <div className="pd-actions">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                className="pd-action"
                onClick={() => (action.key === 'export' ? onExportPdf() : onNavigate(action.key))}
              >
                <Icon size={15} />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Notes ------------------------------------------------------------ */}
      {model.notes.length > 0 && (
        <section className="pd-section" aria-label="Project notes">
          <div className="pd-section-head">
            <h3><FileText size={14} /> Project Notes</h3>
          </div>
          <dl className="pd-notes">
            {model.notes.map((note) => (
              <div key={note.key}>
                <dt>{note.label}</dt>
                <dd>{note.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="pd-foot">
        <Percent size={12} /> All figures are derived from this project&apos;s live schedule, fabrication model and nesting.
      </p>
    </div>
  );
}
