'use client';

import React, { useState } from 'react';
import { DollarSign, Download, Printer, ShieldCheck, Layers, FileSpreadsheet, Building } from 'lucide-react';
import type { CommercialQuote, DerivedOpening, MasterBOMItem, ProjectMetadata } from '../lib/types';
import { buildProjectBOM, generateCommercialQuote } from '../lib/bom-engine';
import type { ProjectNestingSummary } from '../lib/types';

interface CommercialQuoteProps {
  project: ProjectMetadata;
  openings: DerivedOpening[];
  nesting: ProjectNestingSummary;
  theme?: 'dark' | 'light';
}

export default function CommercialQuoteView({ project, openings, nesting, theme = 'dark' }: CommercialQuoteProps) {
  const [activeTab, setActiveTab] = useState<'quote' | 'bom' | 'glass'>('quote');
  const bom = buildProjectBOM(openings, nesting);
  const quote = generateCommercialQuote(project, openings, bom);

  const printDocument = () => {
    window.print();
  };

  const exportQuoteCsv = () => {
    const rows = [
      ['Tag', 'System Typology', 'Width mm', 'Height mm', 'Qty', 'Finish', 'Glass', 'Area m2', 'Unit Price', 'Total Price'],
      ...quote.items.map((it) => [
        it.tag,
        `"${it.systemName}"`,
        String(it.width),
        String(it.height),
        String(it.qty),
        it.finish,
        `"${it.glassSpec}"`,
        String(it.areaM2),
        String(it.unitPrice),
        String(it.totalPrice),
      ]),
      [],
      ['Subtotal', '', '', '', '', '', '', '', '', String(quote.subtotal)],
      [`Tax (${project.taxRatePercent}%)`, '', '', '', '', '', '', '', '', String(quote.taxAmount)],
      ['Grand Total', '', '', '', '', '', '', '', '', String(quote.grandTotal)],
    ];

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commercial-quotation-${project.projectNumber || 'draft'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="quote-wrapper">
      {/* Quotation Navigation Header */}
      <div className="quote-toolbar">
        <div className="nav-pill-group">
          <button
            className={`btn-pill ${activeTab === 'quote' ? 'active' : ''}`}
            onClick={() => setActiveTab('quote')}
          >
            <DollarSign size={14} /> Commercial Client Quotation
          </button>
          <button
            className={`btn-pill ${activeTab === 'bom' ? 'active' : ''}`}
            onClick={() => setActiveTab('bom')}
          >
            <Layers size={14} /> Master Procurement BOM
          </button>
          <button
            className={`btn-pill ${activeTab === 'glass' ? 'active' : ''}`}
            onClick={() => setActiveTab('glass')}
          >
            <FileSpreadsheet size={14} /> Glass Cutting Schedule
          </button>
        </div>

        <div className="quote-actions">
          <button className="btn" onClick={exportQuoteCsv} title="Export CSV Quote">
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={printDocument} title="Print or Save as Vector PDF">
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. COMMERCIAL CLIENT QUOTATION SHEET                                      */}
      {/* ========================================================================= */}
      {activeTab === 'quote' && (
        <div className="printable-document quote-sheet card">
          {/* Header Branding */}
          <div className="quote-header">
            <div className="company-info">
              <h2 className="company-name">ALU DOOR ARCHITECTURAL SYSTEMS</h2>
              <p className="company-sub">Certified Alumex Aluminium Doors, Windows & Glazing Facades</p>
              <p className="company-address">Industrial Fabrication Zone, High-Performance Architectural Glazing</p>
            </div>
            <div className="quote-badge-box">
              <span className="quote-title">OFFICIAL COMMERCIAL QUOTE</span>
              <span className="quote-ref">REF: {project.projectNumber || 'ALU-2026-001'}</span>
              <span className="quote-date">DATE: {project.date || new Date().toISOString().slice(0, 10)}</span>
            </div>
          </div>

          <hr className="quote-divider" />

          {/* Client & Project Details */}
          <div className="quote-meta-row">
            <div>
              <span className="meta-label">PREPARED FOR:</span>
              <h3 className="meta-val">{project.clientName || 'Valued Client'}</h3>
              <p className="meta-sub">Project: <b>{project.projectName || 'Residential Villa Project'}</b></p>
            </div>
            <div className="text-right">
              <span className="meta-label">VALIDITY & TERMS:</span>
              <p className="meta-val">30 Days from issue</p>
              <p className="meta-sub">50% Advance / 40% Delivery / 10% Installation</p>
            </div>
          </div>

          {/* Itemized Openings Table */}
          <div className="table-responsive">
            <table className="quote-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Opening Tag</th>
                  <th>Typology Description</th>
                  <th>Size (W × H mm)</th>
                  <th>Finish</th>
                  <th>Glazing Specification</th>
                  <th>Qty</th>
                  <th>Unit Rate</th>
                  <th>Total ({project.currency})</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((it, idx) => (
                  <tr key={it.tag}>
                    <td>{idx + 1}</td>
                    <td><b className="badge badge-unit">{it.tag}</b></td>
                    <td><b>{it.systemName}</b></td>
                    <td className="mono">{it.width} × {it.height} mm</td>
                    <td className="capitalize">{it.finish}</td>
                    <td>{it.glassSpec}</td>
                    <td className="font-bold">{it.qty}</td>
                    <td className="mono">{project.currency} {it.unitPrice.toFixed(2)}</td>
                    <td className="mono font-bold">{project.currency} {it.totalPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cost Summary & Totals */}
          <div className="quote-totals-wrapper">
            <div className="quote-notes">
              <h4>Fabrication & Delivery Terms</h4>
              <ul>
                <li>100% Extrusions compliant with Alumex Advance Profile Book standards.</li>
                <li>All joints mechanically cleated with M6 tie-rods and EPDM acoustic gasket seals.</li>
                <li>Tempered glass certified according to architectural safety building codes.</li>
                <li>Lead time: 14–21 business days upon site measurement approval.</li>
              </ul>
            </div>

            <div className="totals-box">
              <div className="totals-row">
                <span>Material Subtotal:</span>
                <span className="mono">{project.currency} {quote.subtotal.toFixed(2)}</span>
              </div>
              <div className="totals-row">
                <span>Value Added Tax ({project.taxRatePercent}%):</span>
                <span className="mono">{project.currency} {quote.taxAmount.toFixed(2)}</span>
              </div>
              <div className="totals-row grand-total">
                <span>Grand Total:</span>
                <span className="mono">{project.currency} {quote.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="quote-signatures">
            <div className="sig-box">
              <span>Authorized Estimator / Fabricator</span>
              <div className="sig-line" />
              <p>ALU DOOR Technical Dept</p>
            </div>
            <div className="sig-box">
              <span>Client Acceptance & Signature</span>
              <div className="sig-line" />
              <p>{project.clientName || 'Client Representative'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MASTER PROCUREMENT BILL OF MATERIALS (BOM)                             */}
      {/* ========================================================================= */}
      {activeTab === 'bom' && (
        <div className="bom-sheet card">
          <div className="sheet-header">
            <h3>MASTER PROCUREMENT BILL OF MATERIALS (BOM)</h3>
            <p>Aggregated Extrusions, Hardware, Gaskets and Fasteners across all project openings</p>
          </div>

          <div className="table-responsive">
            <table className="bom-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Unit Wt (kg)</th>
                  <th>Total Wt (kg)</th>
                  <th>Est. Cost ({project.currency})</th>
                </tr>
              </thead>
              <tbody>
                {bom.map((b, idx) => (
                  <tr key={`${b.code}-${idx}`}>
                    <td>
                      <span className={`badge ${b.category === 'Extrusions' ? 'badge-blue' : b.category === 'Glass' ? 'badge-purple' : 'badge-amber'}`}>
                        {b.category}
                      </span>
                    </td>
                    <td><code>{b.code}</code></td>
                    <td>{b.description}</td>
                    <td className="font-bold">{b.quantity}</td>
                    <td>{b.unit}</td>
                    <td className="mono">{b.unitWeightKg ? `${b.unitWeightKg} kg` : '—'}</td>
                    <td className="mono">{b.totalWeightKg ? `${b.totalWeightKg} kg` : '—'}</td>
                    <td className="mono font-bold">{project.currency} {b.totalCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. GLASS CUTTING SCHEDULE                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'glass' && (
        <div className="glass-sheet card">
          <div className="sheet-header">
            <h3>GLASS PROCUREMENT & FACTORY CUTTING SCHEDULE</h3>
            <p>Exact factory cut sizes with edge polishing and safety certification specs</p>
          </div>

          <div className="table-responsive">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Glass ID</th>
                  <th>Opening Tag</th>
                  <th>Description</th>
                  <th>Width (mm)</th>
                  <th>Height (mm)</th>
                  <th>Area (m²)</th>
                  <th>Thickness</th>
                  <th>Qty / Unit</th>
                  <th>Total Panels</th>
                </tr>
              </thead>
              <tbody>
                {openings.flatMap((op) =>
                  op.glassPanels.map((g) => (
                    <tr key={g.id}>
                      <td><code>{g.id}</code></td>
                      <td><b className="badge badge-unit">{op.config.tag}</b></td>
                      <td>{g.description}</td>
                      <td className="mono font-bold">{g.width} mm</td>
                      <td className="mono font-bold">{g.height} mm</td>
                      <td className="mono">{g.areaM2} m²</td>
                      <td>{g.thickness} mm</td>
                      <td>{g.qty}</td>
                      <td className="font-bold">{g.qty * op.config.quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
