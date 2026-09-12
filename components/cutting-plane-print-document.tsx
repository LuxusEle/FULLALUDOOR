'use client';

import type { DerivedOpening, OpeningItem } from '../lib/types';
import type { ManufacturingDossier } from '../lib/manufacturing-dossier';
import { buildElevationLayout, type SwingInfo } from '../lib/shop-drawing';
import {
  buildOpeningFabricationReport,
  projectNetWeightKg,
  projectPurchasedWeightKg,
  type CalcRow,
  type OpeningFabricationReport,
} from '../lib/fabrication-report';

interface CuttingPlanePrintDocumentProps { dossier: ManufacturingDossier }

const mm = (value: number) => `${value.toFixed(1)} mm`;

const angleLabel = (angle: number) =>
  angle === 45 ? '45° MITRE' : angle === 90 ? '90° SQUARE' : `${angle}° CUT`;

const endLabelFor = (orientation: 'horizontal' | 'vertical', which: 1 | 2, angle: number) => {
  const position =
    orientation === 'vertical' ? (which === 1 ? 'TOP' : 'BOTTOM') : which === 1 ? 'LEFT' : 'RIGHT';
  return `${position} ${angleLabel(angle)}`;
};

// Only systems with a real Alumex assembly image are rendered as a full-page
// plate; this prevents accidental blank pages for systems without one.
const ASSEMBLY_IMAGE_SYSTEMS = new Set([
  '100D-single',
  '100D-double',
  '70S-sliding-2p',
  '70S-sliding-4p',
  'casement',
]);

// Minimum on-screen width (%) for a very small cut so its label stays readable.
// The actual dimension label is always the true value.
const MIN_BAR_SEGMENT_PERCENT = 2;

function OpeningElevation({ opening }: { opening: OpeningItem }) {
  const layout = buildElevationLayout(opening);
  const W = layout.width;
  const H = layout.height;
  const pad = Math.max(W, H) * 0.14;
  const dim = Math.max(W, H) * 0.05;
  const frame = layout.frame;
  const stroke = Math.max(1, Math.max(W, H) / 420);
  const heavy = Math.max(2, Math.max(W, H) / 240);
  return (
    <figure className="cutting-plane-visual-card">
      <svg
        className="cutting-plane-door-svg"
        viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
        role="img"
        aria-label={`${opening.tag} single-leaf swing elevation`}
      >
        <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="#eef1f5" stroke="#0b0b0b" strokeWidth={heavy} />
        {layout.panels.map((panel) => (
          <g key={panel.id}>
            <rect x={panel.x} y={panel.y} width={panel.width} height={panel.height} fill="#f7f9fb" stroke="#0b0b0b" strokeWidth={stroke} />
            {panel.glass.map((glass) => (
              <rect key={glass.id} x={glass.x} y={glass.y} width={glass.width} height={glass.height} fill="#dbe9f7" stroke="#1f4e79" strokeWidth={stroke} />
            ))}
          </g>
        ))}
        {layout.members.map((member) =>
          member.axis === 'horizontal' ? (
            <rect key={member.id} x={frame.x} y={member.position} width={frame.width} height={member.thickness} fill="none" stroke="#0b0b0b" strokeWidth={stroke} />
          ) : (
            <rect key={member.id} x={member.position} y={frame.y} width={member.thickness} height={frame.height} fill="none" stroke="#0b0b0b" strokeWidth={stroke} />
          )
        )}
        <line x1={0} y1={H + dim} x2={W} y2={H + dim} stroke="#0b3d91" strokeWidth={stroke} />
        <polygon points={`0,${H + dim} ${stroke * 6},${H + dim - stroke * 3} ${stroke * 6},${H + dim + stroke * 3}`} fill="#0b3d91" />
        <polygon points={`${W},${H + dim} ${W - stroke * 6},${H + dim - stroke * 3} ${W - stroke * 6},${H + dim + stroke * 3}`} fill="#0b3d91" />
        <text x={W / 2} y={H + dim * 2} textAnchor="middle" fontSize={Math.max(9, W / 52)} fill="#0b3d91">
          {Math.round(W)} mm
        </text>
        <line x1={-dim} y1={0} x2={-dim} y2={H} stroke="#0b3d91" strokeWidth={stroke} />
        <text
          x={-dim * 1.8}
          y={H / 2}
          textAnchor="middle"
          fontSize={Math.max(9, H / 58)}
          fill="#0b3d91"
          transform={`rotate(-90 ${-dim * 1.8} ${H / 2})`}
        >
          {Math.round(H)} mm
        </text>
        <text x={0} y={-pad * 0.35} fontSize={Math.max(10, W / 46)} fontWeight="700" fill="#9a5b08">
          {opening.tag} / SINGLE-LEAF SWING / {opening.system}
        </text>
        <text x={W} y={-pad * 0.35} textAnchor="end" fontSize={Math.max(8, W / 62)} fill="#475569">
          HINGE: {(opening.hingeSide ?? 'left').toUpperCase()} · OPENING DIRECTION: REVIEW
        </text>
      </svg>
      <figcaption>
        <strong>{opening.tag}</strong>
        <span>{opening.name}</span>
        <small>
          {opening.width} × {opening.height} mm reference · {opening.finish} finish · {opening.glass}
        </small>
      </figcaption>
    </figure>
  );
}

function OpeningPlan({ opening }: { opening: OpeningItem }) {
  const layout = buildElevationLayout(opening);
  const swing: SwingInfo | undefined = layout.swing;
  const W = opening.width;
  const hingeLeft = (swing?.hingeSide ?? opening.hingeSide ?? 'left') === 'left';
  const radius = swing?.leafWidth ?? Math.max(200, W * 0.86);
  const wall = Math.max(90, W * 0.09);
  const hingeX = hingeLeft ? 0 : W;
  const closedX = hingeLeft ? W : 0;
  const wallDepth = Math.max(70, W * 0.07);
  const viewW = W + radius + wall * 2;
  const viewH = wallDepth + radius + wall;
  const stroke = Math.max(1.2, W / 420);
  return (
    <figure className="cutting-plane-visual-card cutting-plane-plan-card">
      <svg className="cutting-plane-door-svg" viewBox={`${-wall} ${-wall * 0.4} ${viewW} ${viewH + wall * 0.6}`} role="img" aria-label={`${opening.tag} plan view with swing arc`}>
        <rect x={-wall} y={0} width={wall} height={wallDepth} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={stroke} />
        <rect x={W} y={0} width={wall} height={wallDepth} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={stroke} />
        <rect x={0} y={0} width={W} height={wallDepth} fill="#eef1f5" stroke="#0b0b0b" strokeWidth={stroke} />
        <line x1={hingeX} y1={wallDepth} x2={hingeX} y2={wallDepth + radius} stroke="#0b0b0b" strokeWidth={stroke * 4} />
        <path
          d={`M ${closedX} ${wallDepth} Q ${closedX} ${wallDepth + radius} ${hingeX} ${wallDepth + radius}`}
          fill="none"
          stroke="#a10f0f"
          strokeWidth={stroke * 1.6}
          strokeDasharray={`${stroke * 8} ${stroke * 5}`}
        />
        <circle cx={hingeX} cy={wallDepth} r={stroke * 3.5} fill="#0b0b0b" />
        <text x={hingeX} y={-wall * 0.08} textAnchor={hingeLeft ? 'start' : 'end'} fontSize={Math.max(9, W / 52)} fontWeight="700" fill="#0b3d91">
          HINGE SIDE
        </text>
        <text x={hingeLeft ? W : 0} y={-wall * 0.08} textAnchor={hingeLeft ? 'end' : 'start'} fontSize={Math.max(9, W / 52)} fontWeight="700" fill="#0b3d91">
          LOCK SIDE
        </text>
        <text x={(hingeLeft ? W : 0) + (hingeLeft ? -radius * 0.35 : radius * 0.35)} y={wallDepth + radius * 0.85} textAnchor="middle" fontSize={Math.max(8, W / 60)} fill="#a10f0f">
          SWING ARC (SCHEMATIC)
        </text>
      </svg>
      <figcaption>
        <strong>{opening.tag} PLAN</strong>
        <span>Hinge {hingeLeft ? 'left' : 'right'} · lock {hingeLeft ? 'right' : 'left'}</span>
        <small>Plan is schematic (NTS). Handing/opening direction: REQUIRES REVIEW.</small>
      </figcaption>
    </figure>
  );
}

function CalcTable({ rows }: { rows: CalcRow[] }) {
  if (!rows.length) return <p className="cutting-plane-visual-note">No applicable calculation rows.</p>;
  return (
    <table className="cutting-plane-table compact">
      <thead><tr><th>Calculation</th><th>Formula</th><th>Value</th><th>Source</th><th>Status</th></tr></thead>
      <tbody>{rows.map((row, index) => (
        <tr key={`${row.label}-${index}`}>
          <td>{row.label}</td>
          <td className="mono">{row.formula}</td>
          <td className="mono">{row.value}</td>
          <td>{row.source}</td>
          <td><b className={row.status === 'PASS' ? 'dossier-status-pass' : 'dossier-status-review'}>{row.status}</b></td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function ProfileReference({ profile }: { profile: ManufacturingDossier['profiles'][number] }) {
  return (
    <div className="cutting-plane-profile-reference">
      <div className="cutting-plane-profile-svg-wrap">
        {profile.points && profile.width && profile.height ? (
          <svg viewBox={`0 0 ${profile.width} ${profile.height}`} role="img" aria-label={`${profile.id} profile cross-section`}>
            <polygon points={profile.points} fill="#d9e2e8" stroke="#17212b" strokeWidth={Math.max(profile.width, profile.height) / 90} />
          </svg>
        ) : <strong>PROFILE VISUAL NOT AVAILABLE</strong>}
      </div>
      <div className="cutting-plane-profile-data">
        <h3>{profile.id}</h3>
        <p>{profile.description}</p>
        <dl><dt>System reference</dt><dd>{profile.id.startsWith('70S') ? '70S' : profile.id.startsWith('100D') ? '100D' : 'Catalogue reference'}</dd><dt>Catalogue size</dt><dd>{profile.width && profile.height ? `${profile.width.toFixed(2)} x ${profile.height.toFixed(2)} mm` : 'Not specified in reference'}</dd><dt>Weight</dt><dd>{profile.kgM === null ? 'Not specified in reference' : `${profile.kgM.toFixed(3)} kg/m`}</dd><dt>Required</dt><dd>{profile.quantity} pcs / {profile.totalLengthMm.toFixed(1)} mm</dd><dt>Catalogue ref.</dt><dd>{profile.catalogueReference}</dd><dt>Confidence</dt><dd>{profile.confidence}</dd></dl>
      </div>
    </div>
  );
}

function AssemblyDiagram({ opening }: { opening: DerivedOpening }) {
  // Try to load the image corresponding to the system type. 
  // In Next.js, images in /public are served from the root.
  const imageSrc = `/assembly-details/${opening.config.system}.png`;

  return (
    <div className="cutting-plane-assembly-card">
      <div className="cutting-plane-assembly-title">
        <strong>{opening.config.tag}</strong>
        <span>{opening.config.system} / 3D Assembly Detail (Alumex PDF)</span>
      </div>
      
      <div style={{ position: 'relative', width: '100%', minHeight: '300px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* We use a standard img tag with an onError fallback to show a helpful message if the user hasn't added the image yet */}
        <img 
          src={imageSrc} 
          alt={`3D Assembly detail for ${opening.config.system}`} 
          style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
        <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.5 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <strong style={{ color: '#334155', marginBottom: '0.5rem' }}>Image Not Found</strong>
          <p style={{ fontSize: '0.85rem' }}>Please save the 3D assembly detail from the Alumex PDF as:<br/><br/><code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>public/assembly-details/{opening.config.system}.png</code><br/><br/>to display it here automatically.</p>
        </div>
      </div>
      
      <p>3D assembly detail sourced directly from the Alumex Advance Profile Book for manufacturing reference.</p>
    </div>
  );
}

export default function CuttingPlanePrintDocument({ dossier }: CuttingPlanePrintDocumentProps) {
  const { project, openings, nesting, generatedAt, totals } = dossier;
  const totalGlass = totals.glassPanels;
  // Only openings whose system has a verified assembly plate are given a full
  // page; this avoids accidental blank pages for other systems.
  const assemblyOpenings = openings.filter((opening) => ASSEMBLY_IMAGE_SYSTEMS.has(opening.config.system));
  const reports: OpeningFabricationReport[] = openings.map((opening) => buildOpeningFabricationReport(opening.config));
  const purchased = projectPurchasedWeightKg(nesting);
  const netWeight = projectNetWeightKg(openings);

  return (
    <div className="cutting-plane-print-document">
      <section className="cutting-plane-sheet cutting-plane-cover">
        <div className="cutting-plane-kicker">FULLALUDOOR PRO / FABRICATION CONTROL</div>
        <h1>Cutting Plane & Manufacturing Pack</h1>
        <p className="cutting-plane-lead">Linear bar cutting plan generated from the current project openings, door geometry and nesting calculations.</p>
        <div className="cutting-plane-meta-grid">
          <div><span>Project</span><strong>{project.projectName}</strong></div>
          <div><span>Client</span><strong>{project.clientName}</strong></div>
          <div><span>Project No.</span><strong>{project.projectNumber}</strong></div>
          <div><span>Generated</span><strong>{generatedAt}</strong></div>
          <div><span>Revision</span><strong>LIVE DESIGN EXPORT</strong></div>
          <div><span>Units</span><strong>Millimetres / kilograms</strong></div>
          <div><span>Site / location</span><strong>{openings[0]?.config.location || 'NOT AVAILABLE'}</strong></div>
          <div><span>Opening reference</span><strong>{openings.map((opening) => opening.config.tag).join(' / ') || 'NOT AVAILABLE'}</strong></div>
          <div><span>Manufacturing status</span><strong className="dossier-status-review">REQUIRES REVIEW</strong></div>
        </div>
        <div className="cutting-plane-summary-grid">
          <div><strong>{openings.length}</strong><span>Openings</span></div>
          <div><strong>{dossier.validation.summary.physicalMembers}</strong><span>Physical members</span></div>
          <div><strong>{nesting.totalBarsToPull}</strong><span>Stock bars</span></div>
          <div><strong>{nesting.overallEfficiencyPercent}%</strong><span>Overall yield</span></div>
          <div><strong>{dossier.validation.summary.customMembers}</strong><span>Custom members</span></div>
        </div>
        <p className="cutting-plane-note">Verify dimensions against the approved site measurement before releasing material to production.</p>
        {openings[0] && <div className="cutting-plane-cover-preview"><OpeningElevation opening={openings[0].config} /></div>}
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>00 / PDF PRE-FLIGHT</span><h2>Canonical data reconciliation</h2></div><strong className={dossier.validation.ok ? 'dossier-status-pass' : 'dossier-status-review'}>{dossier.validation.ok ? 'PDF READY' : 'EXPORT BLOCKED'}</strong></header>
        <div className={`cutting-plane-preflight ${dossier.validation.ok ? 'ok' : 'blocked'}`}>
          <strong>{dossier.validation.ok ? 'No calculation inconsistencies detected.' : `${dossier.validation.issues.filter((issue) => issue.severity === 'error').length} fabrication inconsistency(ies) detected.`}</strong>
          <ul className="cutting-plane-preflight-list">
            <li>{dossier.validation.summary.openings} openings</li>
            <li>{dossier.validation.summary.physicalMembers} physical members</li>
            <li>{dossier.validation.summary.cutEntries} cut-list entries</li>
            <li>{dossier.validation.summary.nestedPieces} nested / accounted members</li>
            <li className={dossier.validation.summary.bomReconciled ? 'ok' : 'bad'}>BOM {dossier.validation.summary.bomReconciled ? 'reconciled' : 'NOT reconciled'}</li>
            <li className={dossier.validation.summary.nestingReconciled ? 'ok' : 'bad'}>Nesting {dossier.validation.summary.nestingReconciled ? 'reconciled' : 'NOT reconciled'}</li>
            <li>{dossier.validation.summary.customMembers} custom members</li>
            <li>{dossier.validation.summary.reviews} fabrication reviews</li>
          </ul>
        </div>
        {dossier.validation.issues.length > 0 && (
          <table className="cutting-plane-table">
            <thead><tr><th>Severity</th><th>Code</th><th>Opening</th><th>Member</th><th>Detail</th></tr></thead>
            <tbody>{dossier.validation.issues.map((issue, index) => (
              <tr key={`${issue.code}-${index}`}>
                <td><b className={issue.severity === 'error' ? 'dossier-status-review' : 'dossier-status-warning'}>{issue.severity.toUpperCase()}</b></td>
                <td className="mono">{issue.code}</td>
                <td className="mono">{issue.openingTag || '—'}</td>
                <td className="mono">{issue.memberId || '—'}</td>
                <td>{issue.message}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>01 / PROJECT SCHEDULE</span><h2>Opening and geometry schedule</h2></div><strong>{project.projectNumber}</strong></header>
        <table className="cutting-plane-table">
          <thead><tr><th>Tag</th><th>Description</th><th>System</th><th>Opening</th><th>Qty</th><th>Finish</th><th>Location</th></tr></thead>
          <tbody>{openings.map((opening) => <tr key={opening.config.id}><td className="mono">{opening.config.tag}</td><td>{opening.config.name}</td><td>{opening.config.system}</td><td className="mono">{opening.config.width} x {opening.config.height}</td><td>{opening.config.quantity}</td><td>{opening.config.finish}</td><td>{opening.config.location}</td></tr>)}</tbody>
        </table>
        <div className="cutting-plane-stat-row"><span>Total glazed area <b>{openings.reduce((sum, opening) => sum + opening.areaM2 * opening.config.quantity, 0).toFixed(2)} m2</b></span><span>Aluminium weight <b>{openings.reduce((sum, opening) => sum + opening.totalAluWeightKg * opening.config.quantity, 0).toFixed(2)} kg</b></span><span>Glass panels <b>{totalGlass}</b></span></div>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>00A / REFERENCE DIMENSION &amp; HANDING</span><h2>Reference interpretation</h2></div><strong className="dossier-status-review">REQUIRES REVIEW</strong></header>
        <table className="cutting-plane-table">
          <thead><tr><th>Opening</th><th>System</th><th>Reference (mm)</th><th>Interpretation</th><th>Hinge side</th><th>Lock side</th><th>Handing</th><th>Opening direction</th><th>Status</th></tr></thead>
          <tbody>{reports.map((report) => (
            <tr key={report.opening.id}>
              <td className="mono">{report.opening.tag}</td>
              <td>{report.systemLabel}</td>
              <td className="mono">{report.reference.width} × {report.reference.height}</td>
              <td>{report.reference.interpretation}</td>
              <td className="mono">{report.handing.hingeSide.toUpperCase()}</td>
              <td className="mono">{report.handing.lockSide.toUpperCase()}</td>
              <td className="mono">{report.handing.handing}</td>
              <td className="mono">REVIEW</td>
              <td><b className="dossier-status-review">REVIEW</b></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="cutting-plane-note">REQUIRES REVIEW — 900 × 2100 reference dimension is not confirmed as a structural opening or an outside-frame dimension. Handing is taken from the opening configuration; opening direction is not recorded and must be confirmed before fabrication.</p>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>01A / VISUAL REFERENCE</span><h2>Opening elevations</h2></div><strong>NOT TO SCALE</strong></header>
        <p className="cutting-plane-visual-note">Single-leaf swing elevations generated from the live opening geometry. Use the dimensioned schedule and approved CAD drawings for final production verification.</p>
        <div className="cutting-plane-visual-grid">{openings.map((opening) => <OpeningElevation key={opening.config.id} opening={opening.config} />)}</div>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>01B / PLAN VIEW &amp; SWING</span><h2>Handing and swing direction</h2></div><strong>SCHEMATIC / NTS</strong></header>
        <p className="cutting-plane-visual-note">Plan views are schematic. Clearances, hinge positions and opening direction are not verified against catalogue assembly data and must be confirmed on site.</p>
        <div className="cutting-plane-visual-grid">{openings.map((opening) => <OpeningPlan key={opening.config.id} opening={opening.config} />)}</div>
      </section>

      {assemblyOpenings.map((opening, idx) => (
        <section className="cutting-plane-sheet cutting-plane-assembly-fullpage" key={`assembly-full-${opening.config.id}`}>
          <header className="cutting-plane-header">
            <div>
              <span>01A-3D / ASSEMBLY — SHEET {idx + 1} OF {assemblyOpenings.length}</span>
              <h2>{opening.config.tag} — {opening.config.name}</h2>
            </div>
            <strong>{opening.config.system}</strong>
          </header>
          <div className="cutting-plane-assembly-fullpage-meta">
            <span>Width: <b>{opening.config.width} mm</b></span>
            <span>Height: <b>{opening.config.height} mm</b></span>
            <span>Finish: <b>{opening.config.finish}</b></span>
            <span>Glass: <b>{opening.config.glass}</b></span>
            <span>Qty: <b>{opening.config.quantity}</b></span>
            <span>Ref: <b>Alumex Advance — {opening.config.system}</b></span>
          </div>
          <div className="cutting-plane-assembly-fullpage-image">
            <img
              src={`/assembly-details/${opening.config.system}.png`}
              alt={`3D Assembly detail for ${opening.config.system}`}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.nextElementSibling) {
                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                }
              }}
            />
            <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', textAlign: 'center', gap: '1rem' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3 }}>
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <div>
                <strong style={{ color: '#334155', display: 'block', marginBottom: '0.5rem' }}>Assembly Image Not Found</strong>
                <code style={{ background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>public/assembly-details/{opening.config.system}.png</code>
              </div>
            </div>
          </div>

        </section>
      ))}

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>01B / TECHNICAL REFERENCES</span><h2>Sections and assembly verification</h2></div><strong>CATALOGUE CONTROL</strong></header>
        <p className="cutting-plane-technical-note">Technical references are generated from the selected opening geometry and the verified Alumex profile sections listed in the profile schedule. Use the written dimensions and catalogue references for fabrication; visual scale is not contractual.</p>
        <div className="cutting-plane-reference-grid">{openings.map((opening) => <div className="cutting-plane-reference-card" key={opening.config.id}><h3>{opening.config.tag} / {opening.config.system}</h3><p>Frame profiles: {opening.cutList.filter((cut) => cut.group === 'Outer Frame').map((cut) => cut.profile).filter((value, index, values) => values.indexOf(value) === index).join(', ') || 'Not specified in reference'}</p><p>Sash/leaf profiles: {opening.cutList.filter((cut) => cut.group === 'Sash / Leaf').map((cut) => cut.profile).filter((value, index, values) => values.indexOf(value) === index).join(', ') || 'Not specified in reference'}</p><p>Glass: {opening.glassPanels.map((panel) => `${panel.width.toFixed(1)} x ${panel.height.toFixed(1)} x ${panel.thickness} mm`).join('; ') || 'Not specified in reference'}</p><p>Profile schedule and catalogue references: <b>SEE PROFILE SCHEDULE</b></p></div>)}</div>
      </section>

      {reports.map((report) => (
        <section className="cutting-plane-sheet" key={`calc-${report.opening.id}`}>
          <header className="cutting-plane-header"><div><span>01C / MEMBER CALCULATION SCHEDULE</span><h2>{report.opening.tag} — {report.systemLabel}</h2></div><strong className="dossier-status-review">REVIEW</strong></header>
          <div className="cutting-plane-stat-row">
            <span>Gross opening <b>{report.areas.grossM2.toFixed(4)} m²</b></span>
            <span>Actual glazed area <b>{report.areas.glazedM2.toFixed(4)} m²</b></span>
            <span>Net fabricated aluminium <b>{report.netFabricatedKg.toFixed(2)} kg</b></span>
          </div>
          <h3 className="cutting-plane-subhead">FRAME</h3>
          <CalcTable rows={report.frameRows} />
          <h3 className="cutting-plane-subhead">DOOR LEAF</h3>
          <CalcTable rows={report.leafRows} />
          <h3 className="cutting-plane-subhead">GLASS</h3>
          <CalcTable rows={report.glassRows} />
          <h3 className="cutting-plane-subhead">GLAZING BEAD</h3>
          <CalcTable rows={report.beadRows} />
          <h3 className="cutting-plane-subhead">GASKET</h3>
          <CalcTable rows={report.gasketRows} />
          <p className="cutting-plane-note">Every dimensional row remains REVIEW until the reference dimension, glass bite, gasket/setting arrangement and catalogue assembly detail are confirmed. Gross opening area is not the glazed area.</p>
        </section>
      ))}

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>02B / PROFILE VERIFICATION</span><h2>Catalogue source verification</h2></div><strong className="dossier-status-review">REQUIRES REVIEW</strong></header>
        <p className="cutting-plane-technical-note">Only profiles with verified catalogue geometry are marked PASS. Profiles without a verified section remain REVIEW and must not be fabricated from this document alone.</p>
        <table className="cutting-plane-table">
          <thead><tr><th>Member</th><th>Profile code</th><th>Description</th><th>Catalogue page</th><th>Section verified</th><th>Status</th></tr></thead>
          <tbody>{reports.flatMap((report) => report.profiles.map((profile, index) => (
            <tr key={`${report.opening.id}-${profile.code}-${index}`}>
              <td>{report.opening.tag} — {profile.member}</td>
              <td className="mono">{profile.code}</td>
              <td>{profile.description}</td>
              <td className="mono">{profile.cataloguePage === null ? '—' : `p.${profile.cataloguePage}`}</td>
              <td>{profile.sectionVerified ? 'YES' : 'NO'}</td>
              <td><b className={profile.status === 'PASS' ? 'dossier-status-pass' : 'dossier-status-review'}>{profile.status === 'PASS' ? 'PASS' : 'REVIEW'}</b></td>
            </tr>
          )))}</tbody>
        </table>
      </section>

      <section className="cutting-plane-sheet cutting-plane-wide">
        <header className="cutting-plane-header"><div><span>02 / CUTTING LIST</span><h2>Profile cutting instructions</h2></div><strong>{dossier.validation.summary.physicalMembers} PCS</strong></header>
        <table className="cutting-plane-table compact">
          <thead><tr><th>Member</th><th>ID</th><th>Profile</th><th>Qty</th><th>Cut Length</th><th>Standard</th><th>Δ</th><th>End 1</th><th>End 2</th><th>Status</th></tr></thead>
          <tbody>{dossier.fabricationMembers.map((member, index) => (
            <tr key={`${member.openingId}-${member.memberId}-${index}`} className={member.custom ? 'cutting-plane-row-custom' : ''}>
              <td>{member.name}<span className="cutting-plane-orient">{member.orientation === 'vertical' ? 'V' : 'H'}</span></td>
              <td className="mono">{member.displayId}</td>
              <td className="mono">{member.profile}</td>
              <td>{member.qty}</td>
              <td className="mono">{mm(member.lengthMm)}</td>
              <td className="mono">{mm(member.standardLengthMm)}</td>
              <td className={`mono ${member.custom ? 'dossier-status-review' : ''}`}>{member.deltaMm === 0 ? '—' : `${member.deltaMm > 0 ? '+' : ''}${member.deltaMm}`}</td>
              <td className="mono">{endLabelFor(member.orientation, 1, member.angleLeft)}</td>
              <td className="mono">{endLabelFor(member.orientation, 2, member.angleRight)}</td>
              <td><b className={member.custom ? 'dossier-status-review' : 'dossier-status-pass'}>{member.custom ? 'CUSTOM / REVIEW' : 'STANDARD'}</b></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="cutting-plane-note">Cut lengths are the canonical fabrication values from the door model. Custom members differ from catalogue standard and require independent fabrication review.</p>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>02A / PROFILE REFERENCE</span><h2>Actual catalogue profile sections</h2></div><strong>{dossier.profiles.length} PROFILES</strong></header>
        <div className="cutting-plane-profile-grid">{dossier.profiles.map((profile) => <ProfileReference key={profile.id} profile={profile} />)}</div>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>03 / GLASS AND MATERIAL SCHEDULE</span><h2>Panel dimensions and fabrication materials</h2></div><strong>{totalGlass} PANELS</strong></header>
        <table className="cutting-plane-table">
          <thead><tr><th>Tag</th><th>Panel</th><th>Description</th><th>Width</th><th>Height</th><th>Thickness</th><th>Qty</th><th>Area</th></tr></thead>
          <tbody>{openings.flatMap((opening) => opening.glassPanels.map((panel) => <tr key={`${opening.config.id}-${panel.id}`}><td className="mono">{opening.config.tag}</td><td className="mono">{panel.id}</td><td>{panel.description}</td><td className="mono">{mm(panel.width)}</td><td className="mono">{mm(panel.height)}</td><td>{panel.thickness} mm</td><td>{panel.qty * opening.config.quantity}</td><td>{(panel.areaM2 * panel.qty * opening.config.quantity).toFixed(3)} m2</td></tr>))}</tbody>
        </table>
        <div className="cutting-plane-material-columns">{openings.map((opening) => <div key={opening.config.id}><h3>{opening.config.tag} hardware</h3>{opening.hardware.map((item) => <p key={item.code}><span className="mono">{item.code}</span> {item.name} <b>x{item.qty * opening.config.quantity}</b></p>)}</div>)}</div>
      </section>

      {nesting.resultsByProfile.map((profile) => (
        <section className="cutting-plane-sheet cutting-plane-wide" key={profile.profileCode}>
          <header className="cutting-plane-header"><div><span>04 / LINEAR NESTING</span><h2>{profile.profileCode} - {profile.profileDescription}</h2></div><strong>{profile.totalStockBars} BARS</strong></header>
          <div className="cutting-plane-stat-row"><span>Stock length <b>{profile.stockLengthMm.toFixed(0)} mm</b></span><span>Kerf <b>{profile.bladeKerfMm.toFixed(1)} mm</b></span><span>Net material <b>{profile.totalNetLengthM.toFixed(2)} m</b></span><span>Yield <b>{profile.overallYieldPercent}%</b></span></div>
          <div className="cutting-plane-bar-visuals">{profile.bars.map((bar) => {
            const cutSum = bar.cuts.reduce((sum, cut) => sum + cut.lengthMm, 0);
            const kerf = Math.max(0, bar.cuts.length - 1) * profile.bladeKerfMm;
            const used = cutSum + kerf;
            const valid = used <= profile.stockLengthMm + 0.6;
            return (
              <div className="cutting-plane-bar-visual" key={`${profile.profileCode}-visual-${bar.barIndex}`}>
                <span>BAR {String(bar.barIndex).padStart(2, '0')}</span>
                <div>
                  {bar.cuts.map((cut, index) => (
                    <i key={cut.cutId} style={{ width: `${Math.max(MIN_BAR_SEGMENT_PERCENT, (cut.lengthMm / bar.stockLengthMm) * 100)}%` }} title={`${index + 1}. ${cut.cutId} / ${cut.lengthMm} mm`}>
                      <b>{index + 1}. {cut.openingTag}</b><small>{cut.lengthMm.toFixed(1)}</small>
                    </i>
                  ))}
                  {bar.remainingOffcutMm > 0 && <em style={{ width: `${Math.max(MIN_BAR_SEGMENT_PERCENT, (bar.remainingOffcutMm / bar.stockLengthMm) * 100)}%` }} />}
                </div>
                <span className={valid ? 'dossier-status-pass' : 'dossier-status-review'}>
                  {valid ? `USED ${used.toFixed(1)} / OFF ${bar.remainingOffcutMm.toFixed(1)}` : 'INVALID NESTING'}
                </span>
              </div>
            );
          })}</div>
          <p className="cutting-plane-visual-note">Bar segments are scaled to the actual cut lengths. A minimum display width of {MIN_BAR_SEGMENT_PERCENT}% is applied only so very small cuts stay labelled; the printed dimension is always the true value.</p>
          <table className="cutting-plane-table compact">
            <thead><tr><th>Bar</th><th>Seq</th><th>Part ID</th><th>Opening</th><th>Description</th><th>Length</th><th>Ends</th><th>Offcut</th><th>Disposition</th></tr></thead>
            <tbody>{profile.bars.flatMap((bar) => bar.cuts.map((cut, index) => <tr key={`${profile.profileCode}-${bar.barIndex}-${cut.cutId}`}><td className="mono">{index === 0 ? `BAR ${String(bar.barIndex).padStart(2, '0')}` : ''}</td><td className="mono">{index + 1}</td><td className="mono">{cut.cutId}</td><td className="mono">{cut.openingTag}</td><td>{cut.pieceDescription}</td><td className="mono">{mm(cut.lengthMm)}</td><td>{cut.angleL} / {cut.angleR}</td><td>{index === bar.cuts.length - 1 ? mm(bar.remainingOffcutMm) : ''}</td><td>{index === bar.cuts.length - 1 ? (bar.isReusableOffcut ? 'REUSE' : 'SCRAP') : ''}</td></tr>))}</tbody>
          </table>
        </section>
      ))}

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>05 / MATERIAL EFFICIENCY</span><h2>Project nesting summary</h2></div><strong>{nesting.overallEfficiencyPercent}% YIELD</strong></header>
        <div className="cutting-plane-summary-grid"><div><strong>{nesting.totalStockLengthM.toFixed(1)} m</strong><span>Total stock</span></div><div><strong>{totals.totalCutLengthMm.toFixed(1)} mm</strong><span>Net cut</span></div><div><strong>{totals.totalKerfMm.toFixed(1)} mm</strong><span>Kerf loss</span></div><div><strong>{totals.totalReusableOffcutMm.toFixed(1)} mm</strong><span>Reusable offcut</span></div><div><strong>{totals.totalScrapMm.toFixed(1)} mm</strong><span>Scrap</span></div><div><strong>{totals.totalWeightKg.toFixed(2)} kg</strong><span>Aluminium weight</span></div></div>
        <table className="cutting-plane-table"><thead><tr><th>Profile</th><th>Stock bars</th><th>Stock length</th><th>Net length</th><th>Yield</th><th>Waste</th></tr></thead><tbody>{nesting.resultsByProfile.map((profile) => <tr key={profile.profileCode}><td className="mono">{profile.profileCode}</td><td>{profile.totalStockBars}</td><td>{profile.totalStockLengthM.toFixed(2)} m</td><td>{profile.totalNetLengthM.toFixed(2)} m</td><td>{profile.overallYieldPercent}%</td><td>{profile.totalScrapWastePercent}%</td></tr>)}</tbody></table>
        <div className="cutting-plane-weight-grid">
          <span>Net fabricated aluminium <b>{netWeight.toFixed(2)} kg</b></span>
          <span>Purchased stock <b>{purchased.stockBars} × 6.000 m = {purchased.purchasedStockKg.toFixed(2)} kg</b></span>
          <span>Reusable offcut <b>{purchased.reusableOffcutKg.toFixed(2)} kg</b></span>
          <span>Scrap <b>{purchased.scrapKg.toFixed(2)} kg</b></span>
        </div>
        <p className="cutting-plane-note">Purchased stock weight is calculated from complete 6 m bars × verified kg/m, never from the sum of cut lengths. Net fabricated weight covers the actual cut members only.</p>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>06 / FABRICATION AUDIT</span><h2>Geometry and release checks</h2></div><strong>LIVE MODEL CHECKS</strong></header>
        <table className="cutting-plane-table"><thead><tr><th>Opening</th><th>Check</th><th>Detail</th><th>Status</th><th>Value</th></tr></thead><tbody>{dossier.checks.map((check, index) => <tr key={`${check.openingTag}-${check.label}-${index}`}><td className="mono">{check.openingTag}</td><td>{check.label}</td><td>{check.detail}</td><td><b className={`dossier-status dossier-status-${check.status.toLowerCase()}`}>{check.status}</b></td><td className="mono">{check.value}</td></tr>)}</tbody></table>
        <p className="cutting-plane-note">Machine-specific drilling, cleat-hole, lock, hinge and hardware preparation requires workshop verification before production release.</p>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>07 / COMMERCIAL AND BOM</span><h2>Material and project summary</h2></div><strong>{project.currency}</strong></header>
        <table className="cutting-plane-table"><thead><tr><th>Category</th><th>Reference</th><th>Description</th><th>Qty</th><th>Unit</th><th>Weight</th></tr></thead><tbody>{dossier.bom.map((item) => <tr key={`${item.category}-${item.code}`}><td>{item.category}</td><td className="mono">{item.code}</td><td>{item.description}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{item.totalWeightKg ? `${item.totalWeightKg.toFixed(2)} kg` : 'NOT AVAILABLE'}</td></tr>)}</tbody></table>
        <div className="cutting-plane-commercial-grid">
          <span>Material (extrusion) <b>{project.currency} {(dossier.quote.materialCost - dossier.quote.powderCoatingCost).toFixed(2)}</b></span>
          <span>Powder coating <b>{project.currency} {dossier.quote.powderCoatingCost.toFixed(2)}</b></span>
          <span>Glass <b>{project.currency} {dossier.quote.glassCost.toFixed(2)}</b></span>
          <span>Hardware &amp; seals <b>{project.currency} {dossier.quote.hardwareCost.toFixed(2)}</b></span>
          <span>Fabrication labour <b>{project.currency} {dossier.quote.laborAssemblyCost.toFixed(2)}</b></span>
          <span>Wastage <b>NOT CONFIGURED</b></span>
          <span>Subtotal <b>{project.currency} {dossier.quote.subtotal.toFixed(2)}</b></span>
          <span>Overhead <b>NOT CONFIGURED</b></span>
          <span>Profit <b>NOT CONFIGURED</b></span>
          <span>Tax ({project.taxRatePercent}%) <b>{project.currency} {dossier.quote.taxAmount.toFixed(2)}</b></span>
          <span>Final project total <b>{project.currency} {dossier.quote.grandTotal.toFixed(2)}</b></span>
        </div>
        <p className="cutting-plane-note">Coating is shown separately from the extrusion material rate so the lines reconcile to the subtotal. Overhead, profit and wastage percentages are not configured for this project and are therefore not applied.</p>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>07A / CALCULATION CHECK</span><h2>Reconciliation &amp; verification summary</h2></div><strong className="dossier-status-review">REQUIRES REVIEW</strong></header>
        {reports.map((report) => (
          <div className="cutting-plane-check-block" key={`check-${report.opening.id}`}>
            <h3>{report.opening.tag} — {report.reference.width} × {report.reference.height} mm — {report.systemLabel}</h3>
            <ul className="cutting-plane-check-list">
              {report.checks.map((check) => (
                <li key={check.label} className={check.status === 'PASS' ? 'ok' : 'review'}>
                  <b>{check.status === 'PASS' ? '✓' : '⚠'}</b> {check.label} <span>{check.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="cutting-plane-disclaimer">Document status remains REQUIRES REVIEW until site dimensions, reference-dimension interpretation, handing, opening direction, catalogue revision, glass bite, gasket/setting arrangement, hardware and machine preparation are confirmed.</p>
      </section>

      <section className="cutting-plane-sheet cutting-plane-notes">
        <header className="cutting-plane-header"><div><span>08 / MANUFACTURING RELEASE</span><h2>Production checklist and sign-off</h2></div><strong>REQUIRES REVIEW</strong></header>
        <ol><li>Site dimensions confirmed against approved measurement.</li><li>Opening configuration, handing and finish checked.</li><li>Profile catalogue revision confirmed.</li><li>Cut list and nesting reviewed.</li><li>Glass dimensions and hardware reviewed.</li><li>Fabrication warnings and machine preparation reviewed.</li></ol>
        <div className="cutting-plane-release-grid"><span>Revision <b>{dossier.revision}</b></span><span>Date <b>{generatedAt}</b></span><span>Prepared by <b>{project.contractorName}</b></span><span>Checked by <b>REQUIRES REVIEW</b></span><span>Approved by <b>REQUIRES REVIEW</b></span></div>
        <div className="cutting-plane-signoff"><span>Prepared: ____________________</span><span>Checked: ____________________</span><span>Approved: ____________________</span></div>
        <p className="cutting-plane-disclaimer">Production release requires physical/site measurement confirmation and verification of machine-specific drilling, cleat-hole, lock, hinge and hardware preparation requirements.</p>
      </section>
      <section className="cutting-plane-sheet cutting-plane-notes">
        <header className="cutting-plane-header"><div><span>09 / ALUMEX ADVANCE SYSTEM ASSEMBLY INSTRUCTIONS</span><h2>Standard Assembly Guidelines</h2></div><strong>ALUMEX ADVANCE PROFILE BOOK</strong></header>
        <ol>
          <li><b>Profile Preparation:</b> Cut all profiles precisely according to the optimized Cutting List (Section 02). Ensure cuts are clean and at the specified angles (45° or 90°).</li>
          <li><b>Milling & Drilling:</b> Mill slots for locks, handles, and hinges. Drill holes for corner cleats and assembly screws exactly as detailed in the <b>Alumex Advance Profile Book (August Edition)</b>.</li>
          <li><b>Corner Joint Assembly:</b> Insert the specified Alumex corner cleats into the mitred profiles. Apply approved joint sealant to the cut edges for waterproofing before crimping or screwing the corners tight.</li>
          <li><b>Weatherproofing:</b> Install EPDM rubber gaskets (glazing and frame) and wool pile weatherstrips into the designated profile grooves before assembling the main frames.</li>
          <li><b>Hardware Fitting:</b> Install system-specific hardware (rollers, multi-point locks, hinges). Verify alignment and smooth operation within the profile tracks.</li>
          <li><b>Frame Integration:</b> Assemble the outer frame squarely. For sliding systems, install the tracks and insert sashes. For casement systems, mount the sashes using the designated friction stays or hinges.</li>
          <li><b>Glazing Procedure:</b> Position the glass panels on appropriate setting blocks within the sash. Snap the aluminium glazing beads into place and firmly press in the wedge gaskets to secure the glass.</li>
          <li><b>Final QA:</b> Verify frame squareness, sash operation, lock engagement, and sealing. Clean profiles and remove any excess sealant.</li>
        </ol>
        <p className="cutting-plane-disclaimer">Note: These are standard guidelines. Always refer to the exact cross-sectional drawings and assembly details provided in the <b>Alumex Advance Profile Book (August)</b> for system-specific joint configurations, cleat references, and hardware positioning.</p>
      </section>
    </div>
  );
}
