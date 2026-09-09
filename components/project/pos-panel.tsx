'use client';

import { FileText, PackageSearch, Truck } from 'lucide-react';
import type { MasterBOMItem, ProjectMetadata } from '../../lib/types';

interface PosPanelProps {
  project: ProjectMetadata;
  bom: MasterBOMItem[];
}

function formatLkr(value: number): string {
  return `Rs. ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function PosPanel({ project, bom }: PosPanelProps) {
  const stockLines = bom.filter((item) =>
    ['Extrusions', 'Glass'].includes(item.category)
  );
  const stockCost = stockLines.reduce((sum, item) => sum + item.totalCost, 0);
  const stockBars = stockLines
    .filter((item) => item.unit === 'bars')
    .reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="quote-wrapper">
      <div className="quote-toolbar">
        <div className="nav-pill-group">
          <span className="bd-count-chip">
            <Truck size={13} /> Purchase Orders
          </span>
        </div>
      </div>

      <div className="pos-empty card">
        <span className="pos-empty-icon" aria-hidden="true">
          <FileText size={20} />
        </span>
        <h2>No purchase orders yet</h2>
        <p>
          POs are generated from an <strong>approved quotation</strong> against the Master BOM. The
          procurement workflow (create PO from BOM lines → supplier → order → receive) ships in the next
          phase — until then, purchase orders are not recorded so the system never shows made-up orders.
        </p>
        <div className="pos-bom-ready">
          <div>
            <PackageSearch size={15} aria-hidden="true" />
            <span>Ready from this project&apos;s BOM</span>
          </div>
          <div className="pos-bom-stats">
            <span>
              Procurement lines · <strong>{stockLines.length}</strong>
            </span>
            <span>
              Stock bars to order · <strong>{stockBars}</strong>
            </span>
            <span>
              Est. material value · <strong>{formatLkr(stockCost)}</strong>
            </span>
          </div>
        </div>
        <p className="pos-hint mono">
          Reference: {project.projectNumber || 'unassigned'} · {project.clientName || 'no client'}
        </p>
      </div>
    </div>
  );
}
