'use client';

import { useMemo, useState } from 'react';
import { Layers, Printer, Tag } from 'lucide-react';
import type { DerivedOpening, MasterBOMItem, ProjectMetadata } from '../../lib/types';
import type { ProjectNestingSummary } from '../../lib/types';
import { buildProjectBOM } from '../../lib/bom-engine';

interface BomPanelProps {
  project: ProjectMetadata;
  openings: DerivedOpening[];
  nesting: ProjectNestingSummary;
}

const CATEGORY_LABEL: Record<MasterBOMItem['category'], string> = {
  Extrusions: 'Aluminium Profiles',
  Glass: 'Glass',
  Hardware: 'Hardware',
  'Gaskets & Seals': 'Gaskets & Seals',
};

function formatLkr(value: number): string {
  return `Rs. ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function BomPanel({ project, openings, nesting }: BomPanelProps) {
  const [printMode, setPrintMode] = useState(false);
  const bom = useMemo(() => buildProjectBOM(openings, nesting), [openings, nesting]);

  const grouped = useMemo(() => {
    const order: MasterBOMItem['category'][] = ['Extrusions', 'Glass', 'Hardware', 'Gaskets & Seals'];
    return order
      .map((category) => ({
        category,
        items: bom.filter((item) => item.category === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [bom]);

  const totalCost = bom.reduce((sum, item) => sum + item.totalCost, 0);
  const totalWeightKg = bom.reduce((sum, item) => sum + (item.totalWeightKg || 0), 0);

  const print = () => {
    setPrintMode(true);
    window.setTimeout(() => window.print(), 80);
  };

  return (
    <div className="quote-wrapper">
      <div className="quote-toolbar">
        <div className="nav-pill-group">
          <span className="bd-count-chip">
            <Layers size={13} /> Master Procurement BOM · {bom.length} lines
          </span>
          <span className="bd-count-chip">{grouped.length} categories</span>
        </div>
        <div className="quote-actions">
          <button type="button" className="btn btn-primary" onClick={print} title="Print / Save BOM as PDF">
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className={`bom-sheet card ${printMode ? 'bom-printing' : ''}`}>
        <div className="sheet-header">
          <h3>MASTER PROCUREMENT BILL OF MATERIALS (BOM)</h3>
          <p>
            Aggregated across all designs · {project.projectNumber || 'no reference'} · LKR market rates
          </p>
        </div>

        <div className="bd-bom-summary">
          <div>
            <span>Est. Material Value</span>
            <strong>{formatLkr(totalCost)}</strong>
          </div>
          <div>
            <span>Aluminium Weight</span>
            <strong>{totalWeightKg ? `${totalWeightKg.toFixed(1)} kg` : '—'}</strong>
          </div>
          <div>
            <span>Stock Bars</span>
            <strong>{nesting.totalBarsToPull}</strong>
          </div>
          <div>
            <span>Distinct Profiles</span>
            <strong>{nesting.resultsByProfile.length}</strong>
          </div>
        </div>

        {grouped.map((group) => (
          <div key={group.category} className="bd-bom-category">
            <div className="bd-bom-category-head">
              <Tag size={13} aria-hidden="true" /> {CATEGORY_LABEL[group.category]} ({group.items.length})
            </div>
            <div className="table-responsive">
              <table className="bom-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Unit Price (LKR)</th>
                    <th>Total (LKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, index) => (
                    <tr key={`${item.code}-${index}`}>
                      <td><code>{item.code}</code></td>
                      <td>{item.description}</td>
                      <td>{item.unit}</td>
                      <td className="font-bold">{item.quantity}</td>
                      <td className="mono">{formatLkr(item.unitCost)}</td>
                      <td className="mono font-bold">{formatLkr(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="bd-bom-total">
          <span>ESTIMATED MATERIAL COST (LKR)</span>
          <strong>{formatLkr(totalCost)}</strong>
        </div>
        <p className="bd-bom-note">
          Rates are the configurable Sri Lankan market price card in the pricing engine. Unit prices are
          per bar / panel / item; quantities come directly from the designs and nesting calculations.
        </p>
      </div>
    </div>
  );
}
