'use client';

import { useMemo } from 'react';
import type { DerivedOpening, ProjectMetadata, ProjectPricing } from '../../lib/types';
import { DEFAULT_PROJECT_PRICING } from '../../lib/types';
import type { ProjectNestingSummary } from '../../lib/types';
import { buildProjectBOM, DEFAULT_RATES } from '../../lib/bom-engine';

interface FinanceSummaryProps {
  project: ProjectMetadata;
  openings: DerivedOpening[];
  nesting: ProjectNestingSummary;
  onChange: (updates: Partial<ProjectMetadata>) => void;
}

export function formatLkr(value: number): string {
  return `Rs. ${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function projectPricing(project: ProjectMetadata): ProjectPricing {
  return { ...DEFAULT_PROJECT_PRICING, ...(project.pricing ?? {}) };
}

export default function FinanceSummaryPanel({
  project,
  openings,
  nesting,
  onChange,
}: FinanceSummaryProps) {
  const bom = useMemo(() => buildProjectBOM(openings, nesting), [openings, nesting]);
  const pricing = projectPricing(project);

  const figures = useMemo(() => {
    const materialsCost = bom.reduce((sum, item) => sum + item.totalCost, 0);
    const labourUnits = openings.reduce((sum, opening) => sum + (opening.config.quantity || 0), 0);
    const labourCost = labourUnits * DEFAULT_RATES.laborPerOpening;
    const extrasCost =
      (pricing.labourLkr || 0) +
      (pricing.transportLkr || 0) +
      (pricing.installationLkr || 0) +
      (pricing.overheadLkr || 0);
    const totalCost = materialsCost + labourCost + extrasCost;
    const taxAmount = (totalCost * (project.taxRatePercent || 0)) / 100;
    const costWithTax = totalCost + taxAmount;

    const autoSelling = totalCost * (1 + (pricing.defaultMarginPercent || 0) / 100);
    const sellingBase = pricing.manualSellingLkr ?? autoSelling;
    const selling = Math.max(0, sellingBase - (pricing.discountLkr || 0));
    const profit = selling - costWithTax;
    const marginPercent = selling > 0 ? (profit / selling) * 100 : 0;

    return {
      materialsCost,
      labourUnits,
      labourCost,
      extrasCost,
      totalCost,
      taxAmount,
      costWithTax,
      autoSelling,
      selling,
      profit,
      marginPercent,
    };
  }, [bom, openings, pricing, project.taxRatePercent]);

  const patchPricing = (updates: Partial<ProjectPricing>) => {
    onChange({ pricing: { ...pricing, ...updates } });
  };

  const moneyInput = (
    label: string,
    key: keyof ProjectPricing,
    step = 1000,
    hint?: string
  ) => (
    <div className="meta-field">
      <label>{label}</label>
      <div className="input-wrap">
        <input
          type="number"
          className="input-meta"
          min={0}
          step={step}
          value={pricing[key] as number}
          onChange={(event) => patchPricing({ [key]: Number(event.target.value) || 0 })}
        />
        <span className="unit">LKR</span>
      </div>
      {hint && <small className="bd-hint">{hint}</small>}
    </div>
  );

  return (
    <div className="quote-wrapper">
      <div className="quote-toolbar">
        <div className="nav-pill-group">
          <span className="bd-count-chip">Finance Summary · LKR</span>
        </div>
      </div>

      <div className="fin-grid">
        {/* Derived financial snapshot */}
        <div className="fin-summary card">
          <div className="sheet-header">
            <h3>PROJECT FINANCE SUMMARY</h3>
            <p>
              Derived from the real LKR BOM × rates, labour and the add-ons you enter below.
              {project.projectNumber ? ` · ${project.projectNumber}` : ''}
            </p>
          </div>

          <div className="fin-block">
            <div className="fin-row"><span>Selling Price</span><strong>{formatLkr(figures.selling)}</strong></div>
            <div className="fin-row"><span>Less: Discount</span><span>− {formatLkr(pricing.discountLkr || 0)}</span></div>
            <div className="fin-row fin-sub"><span>Project Cost (incl. VAT)</span><span>{formatLkr(figures.costWithTax)}</span></div>
            <div className="fin-row fin-profit"><span>Gross Profit</span><strong>{formatLkr(figures.profit)}</strong></div>
            <div className="fin-row"><span>Profit Margin</span><strong>{figures.marginPercent.toFixed(1)}%</strong></div>
          </div>

          <div className="fin-breakdown">
            <div><span>Material / Glass / Hardware</span><strong>{formatLkr(figures.materialsCost)}</strong></div>
            <div><span>Machining & assembly labour ({figures.labourUnits} units)</span><strong>{formatLkr(figures.labourCost)}</strong></div>
            <div><span>Add-ons (labour/transport/installation/overhead)</span><strong>{formatLkr(figures.extrasCost)}</strong></div>
            <div><span>VAT ({project.taxRatePercent || 0}%)</span><strong>{formatLkr(figures.taxAmount)}</strong></div>
            <div><span>Est. material value from BOM</span><strong>{formatLkr(bom.reduce((sum, item) => sum + item.totalCost, 0))}</strong></div>
          </div>
        </div>

        {/* Pricing controls */}
        <div className="fin-pricing card">
          <div className="sheet-header">
            <h3>PRICING & PROFIT CONFIGURATION</h3>
            <p>Stored on the project. Internal — never printed on the customer quotation.</p>
          </div>

          <div className="fin-form">
            {moneyInput('Extra fabrication labour', 'labourLkr', 1000, 'Any labour beyond the per-unit rate')}
            {moneyInput('Transport / delivery', 'transportLkr')}
            {moneyInput('Installation', 'installationLkr')}
            {moneyInput('Overhead / contingency', 'overheadLkr')}
            {moneyInput('Discount', 'discountLkr')}

            <div className="meta-field">
              <label>Profit margin when selling price is automatic (%)</label>
              <input
                type="number"
                className="input-meta"
                min={0}
                step={0.5}
                value={pricing.defaultMarginPercent}
                onChange={(event) => patchPricing({ defaultMarginPercent: Number(event.target.value) || 0 })}
              />
              <small className="bd-hint">Leave the manual selling price empty to auto-price at this margin.</small>
            </div>

            <div className="meta-field">
              <label>Manual final selling price (LKR) — optional</label>
              <div className="input-wrap">
                <input
                  type="number"
                  className="input-meta"
                  min={0}
                  step={1000}
                  placeholder="Auto (margin applied)"
                  value={pricing.manualSellingLkr ?? ''}
                  onChange={(event) =>
                    patchPricing({
                      manualSellingLkr: event.target.value === '' ? null : Number(event.target.value) || 0,
                    })
                  }
                />
                <span className="unit">LKR</span>
              </div>
              <small className="bd-hint">
                Auto price today: {formatLkr(figures.autoSelling)}
              </small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
