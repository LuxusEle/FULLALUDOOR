'use client';

import type { DerivedOpening } from '../lib/types';
import type { ManufacturingDossier } from '../lib/manufacturing-dossier';

interface CuttingPlanePrintDocumentProps { dossier: ManufacturingDossier }

const mm = (value: number) => `${value.toFixed(1)} mm`;

function DoorElevation({ opening }: { opening: DerivedOpening }) {
  const frameWidth = 220;
  const frameHeight = Math.max(120, Math.min(220, (opening.config.height / opening.config.width) * frameWidth));
  const frameY = 250 - frameHeight;
  const inset = 10;
  const panelHeight = (frameHeight - 34) / 2;

  return (
    <figure className="cutting-plane-visual-card">
      <svg className="cutting-plane-door-svg" viewBox="0 0 360 290" role="img" aria-label={`${opening.config.tag} elevation drawing`}>
        <rect x="0" y="0" width="360" height="290" fill="#f8fafc" />
        <line x1="50" y1="265" x2="310" y2="265" stroke="#94a3b8" strokeWidth="1" />
        <rect x={(360 - frameWidth) / 2} y={frameY} width={frameWidth} height={frameHeight} fill="#dbe3e8" stroke="#17212b" strokeWidth="4" />
        <rect x={(360 - frameWidth) / 2 + inset} y={frameY + inset} width={frameWidth - inset * 2} height={frameHeight - inset * 2} fill="#e9f3f6" stroke="#64748b" strokeWidth="2" />
        <line x1="180" y1={frameY + inset} x2="180" y2={frameY + frameHeight - inset} stroke="#475569" strokeWidth="2" />
        <line x1="140" y1={frameY + frameHeight / 2} x2="220" y2={frameY + frameHeight / 2} stroke="#475569" strokeWidth="3" />
        <rect x="140" y={frameY + inset + 8} width="80" height={panelHeight} fill="#d6eef4" stroke="#60a5b8" strokeWidth="1" />
        <rect x="140" y={frameY + inset + 8 + panelHeight + 14} width="80" height={panelHeight} fill="#d6eef4" stroke="#60a5b8" strokeWidth="1" />
        <line x1="70" y1="276" x2="290" y2="276" stroke="#d58925" strokeWidth="1.5" />
        <text x="180" y="287" textAnchor="middle" fontSize="9" fill="#334155">{opening.config.width} mm</text>
        <line x1="42" y1={frameY} x2="42" y2="250" stroke="#d58925" strokeWidth="1.5" />
        <text x="32" y={(frameY + 250) / 2} textAnchor="middle" fontSize="9" fill="#334155" transform={`rotate(-90 32 ${(frameY + 250) / 2})`}>{opening.config.height} mm</text>
        <text x="180" y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill="#9a5b08">{opening.config.tag} / {opening.config.system}</text>
      </svg>
      <figcaption><strong>{opening.config.tag}</strong><span>{opening.config.name}</span><small>{opening.config.finish} finish / {opening.config.glass}</small></figcaption>
    </figure>
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
  const { project, openings, nesting, allCuts, generatedAt, totals } = dossier;
  const totalPieces = totals.cutPieces;
  const totalGlass = totals.glassPanels;

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
          <div><span>Manufacturing status</span><strong>REQUIRES REVIEW</strong></div>
        </div>
        <div className="cutting-plane-summary-grid">
          <div><strong>{openings.length}</strong><span>Openings</span></div>
          <div><strong>{totalPieces}</strong><span>Cut pieces</span></div>
          <div><strong>{nesting.totalBarsToPull}</strong><span>Stock bars</span></div>
          <div><strong>{nesting.overallEfficiencyPercent}%</strong><span>Overall yield</span></div>
        </div>
        <p className="cutting-plane-note">Verify dimensions against the approved site measurement before releasing material to production.</p>
        {openings[0] && <div className="cutting-plane-cover-preview"><DoorElevation opening={openings[0]} /></div>}
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
        <header className="cutting-plane-header"><div><span>01A / VISUAL REFERENCE</span><h2>Opening elevations</h2></div><strong>NOT TO SCALE</strong></header>
        <p className="cutting-plane-visual-note">Reference elevations generated from the live opening dimensions. Use the dimensioned schedule and approved CAD drawings for final production verification.</p>
        <div className="cutting-plane-visual-grid">{openings.map((opening) => <DoorElevation key={opening.config.id} opening={opening} />)}</div>
      </section>

      {openings.map((opening, idx) => (
        <section className="cutting-plane-sheet cutting-plane-assembly-fullpage" key={`assembly-full-${opening.config.id}`}>
          <header className="cutting-plane-header">
            <div>
              <span>01A-3D / ASSEMBLY — SHEET {idx + 1} OF {openings.length}</span>
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

      <section className="cutting-plane-sheet cutting-plane-wide">
        <header className="cutting-plane-header"><div><span>02 / CUTTING LIST</span><h2>Profile cutting instructions</h2></div><strong>{totalPieces} PCS</strong></header>
        <table className="cutting-plane-table compact">
          <thead><tr><th>Part ID</th><th>Opening</th><th>Profile</th><th>Component</th><th>Description</th><th>Qty</th><th>Length</th><th>L / R</th><th>System / finish</th><th>Preparation</th></tr></thead>
          <tbody>{allCuts.map((cut, index) => { const source = openings.find((opening) => opening.config.tag === cut.openingTag); return <tr key={`${cut.openingTag}-${cut.id}-${index}`}><td className="mono">{cut.id}</td><td className="mono">{cut.openingTag}</td><td className="mono">{cut.profile}</td><td>{cut.group}</td><td>{cut.description}</td><td>{cut.qty}</td><td className="mono">{mm(cut.length)}</td><td className="mono">{cut.angleLeft} / {cut.angleRight}</td><td>{source ? `${source.config.system} / ${source.config.finish}` : 'REQUIRES REVIEW'}</td><td>{cut.ends}</td></tr>; })}</tbody>
        </table>
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
          <div className="cutting-plane-bar-visuals">{profile.bars.map((bar) => <div className="cutting-plane-bar-visual" key={`${profile.profileCode}-visual-${bar.barIndex}`}><span>BAR {String(bar.barIndex).padStart(2, '0')}</span><div>{bar.cuts.map((cut, index) => <i key={cut.cutId} style={{ width: `${Math.max(2, (cut.lengthMm / bar.stockLengthMm) * 100)}%` }} title={`${index + 1}. ${cut.cutId} / ${cut.lengthMm} mm`}><b>{index + 1}. {cut.openingTag}</b><small>{cut.lengthMm}</small></i>)}<em style={{ width: `${Math.max(1, (bar.remainingOffcutMm / bar.stockLengthMm) * 100)}%` }} /></div></div>)}</div>
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
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>06 / FABRICATION AUDIT</span><h2>Geometry and release checks</h2></div><strong>LIVE MODEL CHECKS</strong></header>
        <table className="cutting-plane-table"><thead><tr><th>Opening</th><th>Check</th><th>Detail</th><th>Status</th><th>Value</th></tr></thead><tbody>{dossier.checks.map((check, index) => <tr key={`${check.openingTag}-${check.label}-${index}`}><td className="mono">{check.openingTag}</td><td>{check.label}</td><td>{check.detail}</td><td><b className={`dossier-status dossier-status-${check.status.toLowerCase()}`}>{check.status}</b></td><td className="mono">{check.value}</td></tr>)}</tbody></table>
        <p className="cutting-plane-note">Machine-specific drilling, cleat-hole, lock, hinge and hardware preparation requires workshop verification before production release.</p>
      </section>

      <section className="cutting-plane-sheet">
        <header className="cutting-plane-header"><div><span>07 / COMMERCIAL AND BOM</span><h2>Material and project summary</h2></div><strong>{project.currency}</strong></header>
        <table className="cutting-plane-table"><thead><tr><th>Category</th><th>Reference</th><th>Description</th><th>Qty</th><th>Unit</th><th>Weight</th></tr></thead><tbody>{dossier.bom.map((item) => <tr key={`${item.category}-${item.code}`}><td>{item.category}</td><td className="mono">{item.code}</td><td>{item.description}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{item.totalWeightKg ? `${item.totalWeightKg.toFixed(2)} kg` : 'NOT AVAILABLE'}</td></tr>)}</tbody></table>
        <div className="cutting-plane-commercial-grid"><span>Material <b>{project.currency} {dossier.quote.materialCost.toFixed(2)}</b></span><span>Fabrication <b>{project.currency} {dossier.quote.laborAssemblyCost.toFixed(2)}</b></span><span>Coating <b>{project.currency} {dossier.quote.powderCoatingCost.toFixed(2)}</b></span><span>Project total <b>{project.currency} {dossier.quote.grandTotal.toFixed(2)}</b></span></div>
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
