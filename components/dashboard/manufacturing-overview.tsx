'use client';

import { Box, FileCheck2, Layers, Percent, Ruler, Scissors, Shapes, Weight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ManufacturingDossier } from '../../lib/manufacturing-dossier';
import { Eyebrow } from './panel';

interface ManufacturingOverviewProps {
  dossier: ManufacturingDossier | null;
  projectName: string | null;
}

function Metric({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon: ReactNode }) {
  return (
    <div className="db-metric">
      <span className="db-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span className="db-metric-label">{label}</span>
        <div className="db-metric-value mono">
          {value}
          {unit && <span className="db-metric-unit">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

/** Manufacturing figures are computed ONLY from the real dossier of the open project. */
export default function ManufacturingOverview({ dossier, projectName }: ManufacturingOverviewProps) {
  if (!dossier) {
    return (
      <section className="db-section" aria-label="Manufacturing overview">
        <Eyebrow>MATERIAL UTILIZATION</Eyebrow>
        <h2 className="db-section-title">Manufacturing Overview</h2>
        <div className="db-na">
          <Shapes size={18} aria-hidden="true" />
          <p>
            No project is open, so material figures are <strong>not calculated</strong>. Cutting, yield,
            glass and hardware totals are derived from a real project dossier.
          </p>
        </div>
      </section>
    );
  }

  const yieldPercent = dossier.nesting.overallEfficiencyPercent;
  const wastePercent = Number(Math.max(0, 100 - yieldPercent).toFixed(1));
  const hardwareItems = dossier.hardware.reduce(
    (sum, item) => sum + item.qty * item.openingQuantity,
    0
  );

  return (
    <section className="db-section" aria-label="Manufacturing overview">
      <div className="db-section-head">
        <div>
          <Eyebrow>MATERIAL UTILIZATION</Eyebrow>
          <h2 className="db-section-title">Manufacturing Overview</h2>
          <p className="db-section-sub">
            Calculated from the live dossier{projectName ? ` of “${projectName}”` : ''} — open the Cutting &amp;
            Nesting tab for the full bar layout.
          </p>
        </div>
      </div>

      <div className="db-metrics-grid">
        <Metric
          label="Aluminium Required"
          value={dossier.nesting.totalProfileLengthM.toFixed(1)}
          unit="m"
          icon={<Ruler size={15} />}
        />
        <Metric label="Stock Bars to Pull" value={String(dossier.nesting.totalBarsToPull)} unit="bars" icon={<Scissors size={15} />} />
        <Metric label="Estimated Yield" value={yieldPercent.toFixed(1)} unit="%" icon={<Percent size={15} />} />
        <Metric label="Waste" value={wastePercent.toFixed(1)} unit="%" icon={<Box size={15} />} />
        <Metric label="Glass Panels" value={String(dossier.totals.glassPanels)} icon={<Layers size={15} />} />
        <Metric label="Hardware Items" value={String(hardwareItems)} icon={<FileCheck2 size={15} />} />
      </div>

      <p className="db-metrics-foot">
        <Weight size={13} aria-hidden="true" />
        Profile kit: <strong className="mono">{dossier.profiles.length}</strong> distinct extrusion
        profile{dossier.profiles.length === 1 ? '' : 's'} · aluminium weight{' '}
        <strong className="mono">{dossier.totals.totalWeightKg.toFixed(1)} kg</strong> · {dossier.totals.cutPieces}{' '}
        cut piece{dossier.totals.cutPieces === 1 ? '' : 's'}
      </p>
    </section>
  );
}
