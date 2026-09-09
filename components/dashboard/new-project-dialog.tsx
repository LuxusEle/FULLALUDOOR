'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { PROJECT_CURRENCIES } from '../../lib/types';

export const CURRENCIES = PROJECT_CURRENCIES;

/** Editable project details collected when creating a new project. */
export interface NewProjectDetails {
  projectName: string;
  clientName: string;
  projectNumber: string;
  date: string;
  currency: string;
  taxRatePercent: number;
  contractorName: string;
}

interface NewProjectDialogProps {
  initial: NewProjectDetails;
  onCancel: () => void;
  onCreate: (details: NewProjectDetails) => void;
}

const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

export default function NewProjectDialog({ initial, onCancel, onCreate }: NewProjectDialogProps) {
  const [form, setForm] = useState<NewProjectDetails>(initial);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: keyof NewProjectDetails, value: string) =>
    setForm((current) => ({
      ...current,
      [key]: key === 'taxRatePercent' ? (Number(value) || 0) : value,
    }));

  const submit = () => {
    if (!form.projectName.trim()) {
      setError('Please enter a project name.');
      return;
    }
    if (!form.date) {
      setError('Please enter a project date.');
      return;
    }
    setError(null);
    onCreate({
      projectName: form.projectName.trim(),
      clientName: form.clientName.trim(),
      projectNumber: form.projectNumber.trim(),
      date: form.date,
      currency: form.currency,
      taxRatePercent: form.taxRatePercent,
      contractorName: form.contractorName.trim(),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New project details"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3, 4, 6, 0.72)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div className="modal-card" style={{ width: 'min(540px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card-bg)', border: '1px solid var(--edge)', borderRadius: 16, padding: '20px 22px', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
            <Sparkles size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>New Project</h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Add the project details below. This creates a fresh project with one blank door unit to get
              started.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" style={{ flexShrink: 0, width: 30, height: 30, display: 'grid', placeItems: 'center', border: '1px solid var(--edge)', background: 'transparent', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          <div style={FIELD}>
            <label style={LABEL} htmlFor="new-project-name">Project name *</label>
            <input id="new-project-name" className="input" autoFocus value={form.projectName} onChange={(e) => patch('projectName', e.target.value)} placeholder="e.g. Skyline Residence Glazing" />
          </div>
          <div className="modal-grid-2">
            <div style={FIELD}>
              <label style={LABEL} htmlFor="new-project-client">Client</label>
              <input id="new-project-client" className="input" value={form.clientName} onChange={(e) => patch('clientName', e.target.value)} placeholder="Client name" />
            </div>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="new-project-ref">Project number / ref</label>
              <input id="new-project-ref" className="input" value={form.projectNumber} onChange={(e) => patch('projectNumber', e.target.value)} placeholder="e.g. FA-2026-014" />
            </div>
          </div>
          <div className="modal-grid-2">
            <div style={FIELD}>
              <label style={LABEL} htmlFor="new-project-date">Date</label>
              <input id="new-project-date" className="input" type="date" value={form.date} onChange={(e) => patch('date', e.target.value)} />
            </div>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="new-project-currency">Currency</label>
              <select id="new-project-currency" className="select" value={form.currency} onChange={(e) => patch('currency', e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-grid-2">
            <div style={FIELD}>
              <label style={LABEL} htmlFor="new-project-contractor">Contractor</label>
              <input id="new-project-contractor" className="input" value={form.contractorName} onChange={(e) => patch('contractorName', e.target.value)} placeholder="Fabricating contractor" />
            </div>
            <div style={FIELD}>
              <label style={LABEL} htmlFor="new-project-tax">Tax rate (%)</label>
              <input id="new-project-tax" className="input" type="number" min={0} step="0.5" value={String(form.taxRatePercent)} onChange={(e) => patch('taxRatePercent', e.target.value)} />
            </div>
          </div>
        </div>

        {error && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--danger)' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} style={{ height: 38, padding: '0 16px', border: '1px solid var(--edge-strong)', background: 'transparent', color: 'var(--ink)', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} style={{ height: 38, justifyContent: 'center' }}>
            <Plus size={15} /> Create Project
          </button>
        </div>
      </div>
    </div>
  );
}
