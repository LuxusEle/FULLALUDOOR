'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Check,
  ChevronLeft,
  Layers,
  Redo2,
  RotateCcw,
  Ruler,
  Scissors,
  Undo2,
} from 'lucide-react';
import type { CutItem, MemberEditableField, MemberOverride, OpeningItem } from '../lib/types';
import { PROFILE_WEIGHTS } from '../lib/door-model';
import {
  buildMemberOverride,
  computeMemberImpact,
  hasCustomOverrides,
  memberGeometryConflicts,
  memberHasEditableChange,
  resolveMemberCut,
  stripMemberOverrides,
  validateMemberValues,
  type MemberDefinition,
  type MemberImpact,
} from '../lib/member-model';
import {
  memberSpecFor,
  type MemberCategory,
} from '../lib/member-map';
import {
  PROFILE_VISUALS,
  type ElevationLayout,
  type ElevationMemberBox,
} from '../lib/shop-drawing';

export interface MemberDetailWorkspaceProps {
  opening: OpeningItem;
  elevation: ElevationLayout;
  members: MemberDefinition[];
  selectedMemberId: string | null;
  onSelectMember: (memberId: string) => void;
  onClose: () => void;
  commitOverrides: (next: Record<string, MemberOverride>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  recalcState: 'idle' | 'recalculating' | 'uptodate' | 'review';
}

interface DraftDimensions {
  length: number;
  width: number;
  depth: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function endLabel(axis: 'horizontal' | 'vertical', side: 'first' | 'second', angle: number): string {
  const position =
    axis === 'horizontal' ? (side === 'first' ? 'LEFT END' : 'RIGHT END') : side === 'first' ? 'TOP END' : 'BOTTOM END';
  if (angle === 45) return `${position} · 45° MITRE`;
  if (angle === 90) return `${position} · 90° SQUARE CUT`;
  return `${position} · ${angle}° CUT`;
}

function parseDraft(definition: MemberDefinition, draft: Record<string, string>): Partial<MemberOverride> {
  const values: Partial<MemberOverride> = {};
  for (const field of definition.editable) {
    const raw = draft[field];
    if (raw === undefined || raw.trim() === '') continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) values[field] = numeric;
  }
  return values;
}

function draftDimensions(definition: MemberDefinition, draft: Record<string, string>): DraftDimensions {
  const result: DraftDimensions = {
    length: definition.current.length,
    width: definition.current.width ?? 0,
    depth: definition.current.depth ?? 0,
  };
  for (const field of ['length', 'width', 'depth'] as const) {
    const raw = draft[field];
    if (raw === undefined || raw.trim() === '') continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) result[field] = numeric;
  }
  return result;
}

export default function MemberDetailWorkspace({
  opening,
  elevation,
  members,
  selectedMemberId,
  onSelectMember,
  onClose,
  commitOverrides,
  undo,
  redo,
  canUndo,
  canRedo,
  recalcState,
}: MemberDetailWorkspaceProps) {
  const selectedDefinition = useMemo(
    () => members.find((definition) => definition.memberId === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );
  const spec = useMemo(
    () => (selectedMemberId ? memberSpecFor(opening.system, selectedMemberId) : undefined),
    [opening.system, selectedMemberId]
  );
  const cut = useMemo(
    () => (selectedDefinition ? resolveMemberCut(opening, selectedDefinition.memberId) : undefined),
    [opening, selectedDefinition]
  );

  const [editorMode, setEditorMode] = useState<'standard' | 'custom'>('standard');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editorError, setEditorError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedDefinition) {
      setEditorMode('standard');
      setDraft({});
      setEditorError(null);
      setReviewNotes([]);
      return;
    }
    setEditorMode(selectedDefinition.mode);
    const next: Record<string, string> = {};
    for (const field of selectedDefinition.editable) {
      const value = selectedDefinition.current[field as keyof typeof selectedDefinition.current];
      next[field] = value === undefined ? '' : String(value);
    }
    setDraft(next);
    setEditorError(null);
    setReviewNotes([]);
  }, [selectedDefinition]);

  const liveValues = useMemo(
    () => (selectedDefinition ? draftDimensions(selectedDefinition, draft) : { length: 0, width: 0, depth: 0 }),
    [selectedDefinition, draft]
  );

  const impact: MemberImpact | null = useMemo(
    () => (selectedDefinition ? computeMemberImpact(opening, selectedDefinition, parseDraft(selectedDefinition, draft)) : null),
    [opening, selectedDefinition, draft]
  );

  const apply = useCallback(() => {
    if (!selectedDefinition || !spec) return;
    if (editorMode === 'standard') {
      const next = { ...(opening.memberOverrides ?? {}) };
      delete next[selectedDefinition.memberId];
      setEditorError(null);
      setReviewNotes([]);
      commitOverrides(next);
      return;
    }
    const values = parseDraft(selectedDefinition, draft);
    const errors = validateMemberValues(spec, values);
    if (errors.length) {
      setEditorError(errors.join(' '));
      return;
    }
    if (!memberHasEditableChange(selectedDefinition, values)) {
      setEditorError('No change from the catalogue standard. Enter a custom value or switch to STANDARD.');
      return;
    }
    const conflicts = memberGeometryConflicts(opening, selectedDefinition, values);
    const override = buildMemberOverride(spec, values);
    setEditorError(null);
    setReviewNotes(conflicts);
    commitOverrides({ ...(opening.memberOverrides ?? {}), [selectedDefinition.memberId]: override });
  }, [selectedDefinition, spec, editorMode, draft, opening, commitOverrides]);

  const resetSelected = useCallback(() => {
    if (!selectedDefinition) return;
    const next = { ...(opening.memberOverrides ?? {}) };
    delete next[selectedDefinition.memberId];
    setEditorError(null);
    setReviewNotes([]);
    commitOverrides(next);
  }, [selectedDefinition, opening, commitOverrides]);

  const resetAll = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm('Reset ALL custom member overrides on this opening?')) return;
    setEditorError(null);
    setReviewNotes([]);
    commitOverrides({});
  }, [commitOverrides]);

  const cancel = useCallback(() => {
    if (!selectedDefinition) return;
    setEditorMode(selectedDefinition.mode);
    const next: Record<string, string> = {};
    for (const field of selectedDefinition.editable) {
      const value = selectedDefinition.current[field as keyof typeof selectedDefinition.current];
      next[field] = value === undefined ? '' : String(value);
    }
    setDraft(next);
    setEditorError(null);
    setReviewNotes([]);
  }, [selectedDefinition]);

  const grouped = useMemo(() => {
    const order: MemberCategory[] = ['Frame', 'Track', 'Sash', 'Mullion', 'Bead', 'Other'];
    return order
      .map((category) => ({ category, items: members.filter((member) => member.category === category) }))
      .filter((group) => group.items.length > 0);
  }, [members]);

  return (
    <div className="mdd-workspace" data-cad-theme="dark">
      <header className="mdd-header no-print">
        <div className="mdd-header-title">
          <span className="mdd-eyebrow">2D CAD / MEMBER DETAIL</span>
          <h2>
            {selectedDefinition ? `${selectedDefinition.name}` : 'Member Inspector'}
            {selectedDefinition && <span className="mono mdd-header-id">{selectedDefinition.displayId}</span>}
          </h2>
        </div>
        <div className="mdd-header-meta">
          <span className="cad-chip mono">{opening.tag}</span>
          {selectedDefinition && (
            <span className={`mdd-mode-badge ${selectedDefinition.mode}`}>
              {selectedDefinition.mode === 'custom' ? 'CUSTOM' : 'STANDARD'}
            </span>
          )}
          <button type="button" className="cad-action-btn" onClick={onClose}>
            <ChevronLeft size={14} /> BACK TO DRAWING
          </button>
        </div>
      </header>

      <div className="mdd-body">
        <aside className="mdd-list no-print">
          <div className="mdd-list-head">
            <Layers size={13} /> MEMBERS
            <span className="mdd-list-count">{members.length}</span>
          </div>
          {grouped.map((group) => (
            <div className="mdd-group" key={group.category}>
              <div className="mdd-group-title">{group.category.toUpperCase()}</div>
              {group.items.map((member) => (
                <button
                  type="button"
                  key={member.memberId}
                  className={`mdd-member-row${member.memberId === selectedMemberId ? ' active' : ''}`}
                  onClick={() => onSelectMember(member.memberId)}
                >
                  <span className={`mdd-member-status ${member.mode}`} aria-hidden="true">
                    {member.mode === 'custom' ? '!' : '✓'}
                  </span>
                  <span className="mdd-member-name">{member.name}</span>
                  <span className="mdd-member-len mono">{round1(member.current.length)} mm</span>
                  {member.mode === 'custom' && <span className="mdd-member-tag">CUSTOM</span>}
                </button>
              ))}
            </div>
          ))}
          {members.length === 0 && <p className="cad-empty">No member model is available for this system.</p>}
        </aside>

        <main className="mdd-detail">
          {!selectedDefinition ? (
            <div className="mdd-empty-state">
              <Ruler size={30} />
              <h3>Select a member</h3>
              <p>Choose a bar from the member list to open its dedicated technical detail view.</p>
            </div>
          ) : (
            <>
              <section className="mdd-panel mdd-drawing-panel">
                <div className="mdd-panel-head">
                  <span>
                    <Ruler size={13} /> MEMBER TECHNICAL DRAWING
                  </span>
                  <span className="mdd-panel-sub mono">
                    {selectedDefinition.axis === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL'} · {selectedDefinition.profile}
                  </span>
                </div>
                <MemberTechnicalDrawing definition={selectedDefinition} values={liveValues} cut={cut} />
              </section>

              <div className="mdd-top-grid">
                <OpeningContextDiagram
                  elevation={elevation}
                  selectedMemberId={selectedMemberId}
                  onSelectMember={onSelectMember}
                />
                <ProfileSectionPreview definition={selectedDefinition} />
              </div>

              <div className="mdd-panels-grid">
                <MemberInfoPanel definition={selectedDefinition} />
                <DimensionEditor
                  definition={selectedDefinition}
                  editorMode={editorMode}
                  draft={draft}
                  onModeChange={setEditorMode}
                  onDraftChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
                  editorError={editorError}
                  reviewNotes={reviewNotes}
                />
                <CutInformationPanel definition={selectedDefinition} cut={cut} />
                <BeforeAfterComparison definition={selectedDefinition} values={liveValues} />
                <LiveImpactPanel impact={impact} recalcState={recalcState} />
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="mdd-actionbar no-print">
        <div className="mdd-action-left">
          <button
            type="button"
            className="cad-action-btn"
            onClick={resetSelected}
            disabled={!selectedDefinition || selectedDefinition.mode !== 'custom'}
          >
            <RotateCcw size={13} /> RESET MEMBER
          </button>
          <button type="button" className="cad-action-btn" onClick={resetAll} disabled={!hasCustomOverrides(opening)}>
            RESET ALL
          </button>
        </div>
        <div className="mdd-action-mid">
          <button type="button" className="cad-action-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={13} />
          </button>
          <button type="button" className="cad-action-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 size={13} />
          </button>
          <span className={`mdd-recalc ${recalcState}`}>
            {recalcState === 'recalculating'
              ? 'Recalculating fabrication data…'
              : recalcState === 'review'
                ? 'Fabrication data requires review'
                : 'All fabrication data up to date'}
          </span>
        </div>
        <div className="mdd-action-right">
          <button type="button" className="cad-action-btn" onClick={cancel} disabled={!selectedDefinition}>
            CANCEL
          </button>
          <button
            type="button"
            className="cad-action-btn primary"
            onClick={apply}
            disabled={!selectedDefinition}
          >
            {editorMode === 'custom' ? 'APPLY CUSTOM MEMBER' : 'APPLY'}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technical member drawing
// ---------------------------------------------------------------------------

function MemberTechnicalDrawing({
  definition,
  values,
  cut,
}: {
  definition: MemberDefinition;
  values: DraftDimensions;
  cut?: CutItem;
}) {
  const length = Math.max(1, values.length);
  const section = Math.max(1, values.width || values.depth || 40);
  const axis = definition.axis;
  const liveCustom =
    Math.abs(values.length - definition.standard.length) > 0.01 ||
    (definition.standard.width !== undefined && Math.abs(values.width - definition.standard.width) > 0.01) ||
    (definition.standard.depth !== undefined && Math.abs(values.depth - definition.standard.depth) > 0.01);
  const leftAngle = cut?.angleLeft ?? 90;
  const rightAngle = cut?.angleRight ?? 90;

  if (axis === 'horizontal') {
    const viewW = 1000;
    const viewH = 470;
    const left = 130;
    const right = 900;
    const scale = (right - left) / length;
    const thickness = clamp(section * scale, 10, 130);
    const cy = 235;
    const top = cy - thickness / 2;
    const bottom = cy + thickness / 2;
    const dimY = top - 54;
    const cx = (left + right) / 2;
    const hatchCount = Math.max(0, Math.floor((right - left) / 28) - 1);
    return (
      <svg className="mdd-tech-svg" viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet">
        <rect x={left} y={top} width={right - left} height={thickness} className={`mdd-bar${liveCustom ? ' custom' : ''}`} />
        {Array.from({ length: hatchCount }, (_, index) => {
          const x = left + 20 + index * 28;
          return <line key={index} x1={x} y1={bottom} x2={x - 12} y2={top} className="mdd-hatch" />;
        })}
        <line x1={cx} y1={top - 16} x2={cx} y2={bottom + 16} className="mdd-center" />

        <line x1={left} y1={top} x2={left} y2={dimY - 6} className="mdd-ext" />
        <line x1={right} y1={top} x2={right} y2={dimY - 6} className="mdd-ext" />
        <line x1={left} y1={dimY} x2={right} y2={dimY} className="mdd-dim" />
        <polygon points={`${left},${dimY} ${left + 9},${dimY - 4} ${left + 9},${dimY + 4}`} className="mdd-arrow" />
        <polygon points={`${right},${dimY} ${right - 9},${dimY - 4} ${right - 9},${dimY + 4}`} className="mdd-arrow" />
        <text x={cx} y={dimY - 9} className="mdd-dim-text" textAnchor="middle">
          {round1(length)} mm
        </text>

        <line x1={left} y1={top} x2={left - 34} y2={top} className="mdd-ext" />
        <line x1={left} y1={bottom} x2={left - 34} y2={bottom} className="mdd-ext" />
        <line x1={left - 26} y1={top} x2={left - 26} y2={bottom} className="mdd-dim" />
        <text x={left - 34} y={cy} className="mdd-dim-text small" textAnchor="end" dominantBaseline="middle">
          {round1(section)}
        </text>

        <line x1={right} y1={top} x2={right + 34} y2={top} className="mdd-ext" />
        <line x1={right} y1={bottom} x2={right + 34} y2={bottom} className="mdd-ext" />
        <line x1={right + 26} y1={top} x2={right + 26} y2={bottom} className="mdd-dim" />
        <text x={right + 34} y={cy} className="mdd-dim-text small" textAnchor="start" dominantBaseline="middle">
          {round1(section)}
        </text>

        {leftAngle === 45 && <line x1={left} y1={top} x2={left + thickness} y2={bottom} className="mdd-cut" />}
        {rightAngle === 45 && <line x1={right} y1={bottom} x2={right - thickness} y2={top} className="mdd-cut" />}

        <text x={cx} y={cy} className="mdd-bar-label" textAnchor="middle" dominantBaseline="middle">
          {definition.profile}
        </text>
        <text x={20} y={28} className="mdd-title">
          {definition.displayId} · {definition.type}
        </text>
        <text x={viewW - 20} y={28} className={`mdd-mode ${liveCustom ? 'custom' : ''}`} textAnchor="end">
          {liveCustom ? 'CUSTOM' : 'STANDARD'}
        </text>
        <text x={left} y={bottom + 46} className="mdd-cut-label">
          {endLabel('horizontal', 'first', leftAngle)}
        </text>
        <text x={right} y={bottom + 46} className="mdd-cut-label" textAnchor="end">
          {endLabel('horizontal', 'second', rightAngle)}
        </text>
      </svg>
    );
  }

  const viewW = 470;
  const viewH = 1000;
  const top = 120;
  const bottom = 900;
  const scale = (bottom - top) / length;
  const thickness = clamp(section * scale, 10, 130);
  const cx = 220;
  const left = cx - thickness / 2;
  const right = cx + thickness / 2;
  const dimX = right + 56;
  const cy = (top + bottom) / 2;
  const hatchCount = Math.max(0, Math.floor((bottom - top) / 28) - 1);
  return (
    <svg className="mdd-tech-svg" viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet">
      <rect x={left} y={top} width={thickness} height={bottom - top} className={`mdd-bar${liveCustom ? ' custom' : ''}`} />
      {Array.from({ length: hatchCount }, (_, index) => {
        const y = top + 20 + index * 28;
        return <line key={index} x1={left} y1={y} x2={right} y2={y - 12} className="mdd-hatch" />;
      })}
      <line x1={left - 16} y1={cy} x2={right + 16} y2={cy} className="mdd-center" />

      <line x1={right} y1={top} x2={dimX + 6} y2={top} className="mdd-ext" />
      <line x1={right} y1={bottom} x2={dimX + 6} y2={bottom} className="mdd-ext" />
      <line x1={dimX} y1={top} x2={dimX} y2={bottom} className="mdd-dim" />
      <polygon points={`${dimX},${top} ${dimX - 4},${top + 9} ${dimX + 4},${top + 9}`} className="mdd-arrow" />
      <polygon points={`${dimX},${bottom} ${dimX - 4},${bottom - 9} ${dimX + 4},${bottom - 9}`} className="mdd-arrow" />
      <text
        x={dimX - 9}
        y={cy}
        className="mdd-dim-text"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90 ${dimX - 9} ${cy})`}
      >
        {round1(length)} mm
      </text>

      <line x1={left} y1={top} x2={left} y2={top - 34} className="mdd-ext" />
      <line x1={right} y1={top} x2={right} y2={top - 34} className="mdd-ext" />
      <line x1={left} y1={top - 26} x2={right} y2={top - 26} className="mdd-dim" />
      <text x={cx} y={top - 34} className="mdd-dim-text small" textAnchor="middle">
        {round1(section)}
      </text>

      {leftAngle === 45 && <line x1={left} y1={top} x2={right} y2={top + thickness} className="mdd-cut" />}
      {rightAngle === 45 && <line x1={right} y1={bottom} x2={left} y2={bottom - thickness} className="mdd-cut" />}

      <text
        x={cx}
        y={cy}
        className="mdd-bar-label"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90 ${cx} ${cy})`}
      >
        {definition.profile}
      </text>
      <text x={16} y={28} className="mdd-title">
        {definition.displayId} · {definition.type}
      </text>
      <text x={viewW - 16} y={28} className={`mdd-mode ${liveCustom ? 'custom' : ''}`} textAnchor="end">
        {liveCustom ? 'CUSTOM' : 'STANDARD'}
      </text>
      <text x={left - 10} y={top - 46} className="mdd-cut-label" textAnchor="start">
        {endLabel('vertical', 'first', leftAngle)}
      </text>
      <text x={left - 10} y={bottom + 46} className="mdd-cut-label" textAnchor="start">
        {endLabel('vertical', 'second', rightAngle)}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Information panels
// ---------------------------------------------------------------------------

function Panel({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mdd-panel ${className}`}>
      <div className="mdd-panel-head">
        <span>
          {icon} {title}
        </span>
      </div>
      <div className="mdd-panel-body">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, tone = '' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="mdd-info-row">
      <span>{label}</span>
      <b className={`mono ${tone}`}>{value}</b>
    </div>
  );
}

function MemberInfoPanel({ definition }: { definition: MemberDefinition }) {
  const overrideDelta = definition.current.length - definition.standard.length;
  return (
    <Panel title="MEMBER INFORMATION" icon={<Box size={12} />}>
      <InfoRow label="Name" value={definition.name} />
      <InfoRow label="Member ID" value={definition.displayId} />
      <InfoRow label="Type" value={definition.type} />
      <InfoRow label="Profile" value={definition.profile} />
      <InfoRow label="Mode" value={definition.mode === 'custom' ? 'CUSTOM' : 'STANDARD'} tone={definition.mode} />
      <InfoRow label="Current Length" value={`${round1(definition.current.length)} mm`} />
      <InfoRow label="Standard Length" value={`${round1(definition.standard.length)} mm`} />
      <InfoRow
        label="Override"
        value={overrideDelta === 0 ? '—' : `${overrideDelta > 0 ? '+' : ''}${round1(overrideDelta)} mm`}
        tone={overrideDelta === 0 ? '' : 'custom'}
      />
      <InfoRow label="Final Length" value={`${round1(definition.current.length)} mm`} />
      <InfoRow label="Quantity" value={definition.quantity} />
      <InfoRow
        label="Status"
        value={definition.mode === 'custom' ? 'CUSTOM' : 'STANDARD'}
        tone={definition.mode}
      />
    </Panel>
  );
}

function DimensionEditor({
  definition,
  editorMode,
  draft,
  onModeChange,
  onDraftChange,
  editorError,
  reviewNotes,
}: {
  definition: MemberDefinition;
  editorMode: 'standard' | 'custom';
  draft: Record<string, string>;
  onModeChange: (mode: 'standard' | 'custom') => void;
  onDraftChange: (field: MemberEditableField, value: string) => void;
  editorError: string | null;
  reviewNotes: string[];
}) {
  const fieldLabel = (field: MemberEditableField) =>
    field === 'width' ? 'Section Width' : field === 'depth' ? 'Section Depth' : field.charAt(0).toUpperCase() + field.slice(1);
  const notApplicable: MemberEditableField[] = (['width', 'depth'] as MemberEditableField[]).filter(
    (field) => !definition.editable.includes(field)
  );
  return (
    <Panel title="DIMENSION EDITOR" icon={<Ruler size={12} />}>
      <div className="mdd-mode-toggle">
        <button
          type="button"
          className={editorMode === 'standard' ? 'active' : ''}
          onClick={() => onModeChange('standard')}
        >
          STANDARD
        </button>
        <button
          type="button"
          className={editorMode === 'custom' ? 'active custom' : ''}
          onClick={() => onModeChange('custom')}
        >
          CUSTOM
        </button>
      </div>

      {editorMode === 'custom' && (
        <div className="mdd-custom-warning">
          <AlertTriangle size={12} />
          <span>This member differs from the standard configuration. Fabrication review required.</span>
        </div>
      )}

      <div className="mdd-fields">
        {definition.editable.map((field) => (
          <label key={field} className="mdd-field">
            <span>{fieldLabel(field)}</span>
            <div className="mdd-input-wrap">
              <input
                className="input"
                inputMode="decimal"
                readOnly={editorMode === 'standard'}
                value={
                  editorMode === 'standard'
                    ? String((definition.current as unknown as Record<string, number | undefined>)[field] ?? '')
                    : draft[field] ?? ''
                }
                onChange={(event) => onDraftChange(field, event.target.value)}
              />
              <span className="mdd-unit">mm</span>
            </div>
          </label>
        ))}
        {notApplicable.map((field) => (
          <div className="mdd-field not-applicable" key={field}>
            <span>{fieldLabel(field)}</span>
            <div className="mdd-input-wrap">
              <input className="input" value="N/A" readOnly />
            </div>
          </div>
        ))}
      </div>

      {editorError && (
        <div className="mdd-error">
          <AlertTriangle size={12} /> {editorError}
        </div>
      )}
      {reviewNotes.map((note) => (
        <div className="mdd-review" key={note}>
          <AlertTriangle size={12} /> {note}
        </div>
      ))}
      {editorMode === 'standard' && (
        <p className="mdd-hint">Catalogue standard values are calculated and locked. Switch to CUSTOM to override.</p>
      )}
    </Panel>
  );
}

function ProfileSectionPreview({ definition }: { definition: MemberDefinition }) {
  const visual = PROFILE_VISUALS[definition.profile];
  const width = definition.current.width ?? definition.standard.width ?? 50;
  const depth = definition.current.depth ?? definition.standard.depth ?? 50;
  const weight = PROFILE_WEIGHTS[definition.profile]?.kgM;
  const points = visual
    ? visual.points
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
        .filter((pair) => pair.length === 2 && pair.every(Number.isFinite))
    : [];

  if (points.length) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const profileW = maxX - minX || 1;
    const profileH = maxY - minY || 1;
    const scale = Math.min(120 / profileW, 100 / profileH);
    const ox = 18 + (120 - profileW * scale) / 2 - minX * scale;
    const oy = 12 + (100 - profileH * scale) / 2 + maxY * scale;
    const transformed = points
      .map((point) => `${(ox + point[0] * scale).toFixed(1)},${(oy - point[1] * scale).toFixed(1)}`)
      .join(' ');
    return (
      <Panel title="PROFILE SECTION" icon={<Layers size={12} />}>
        <svg className="mdd-section-svg" viewBox="0 0 156 124" preserveAspectRatio="xMidYMid meet">
          <polygon points={transformed} className="mdd-section-poly" />
        </svg>
        <div className="mdd-section-meta">
          <InfoRow label="Profile" value={definition.profile} />
          <InfoRow label="Section" value={`${width} × ${depth} mm`} />
          {weight !== undefined && <InfoRow label="Mass" value={`${weight} kg/m`} />}
        </div>
        <span className="mdd-verified">VERIFIED CATALOGUE GEOMETRY</span>
      </Panel>
    );
  }

  const rectW = clamp(width * 0.9, 14, 120);
  const rectH = clamp(depth * 0.9, 14, 92);
  return (
    <Panel title="PROFILE SECTION" icon={<Layers size={12} />}>
      <svg className="mdd-section-svg" viewBox="0 0 156 124" preserveAspectRatio="xMidYMid meet">
        <rect x={(156 - rectW) / 2} y={(124 - rectH) / 2} width={rectW} height={rectH} className="mdd-section-poly generic" />
      </svg>
      <div className="mdd-section-meta">
        <InfoRow label="Profile" value={definition.profile} />
        <InfoRow label="Section" value={`${width} × ${depth} mm`} />
      </div>
      <span className="mdd-generic">GENERIC SECTION — NOT VERIFIED DXF</span>
    </Panel>
  );
}

function CutInformationPanel({ definition, cut }: { definition: MemberDefinition; cut?: CutItem }) {
  const leftAngle = cut?.angleLeft ?? 90;
  const rightAngle = cut?.angleRight ?? 90;
  const condition = cut?.ends && cut.ends.trim() ? cut.ends : 'Straight cut';
  return (
    <Panel title="CUT INFORMATION" icon={<Scissors size={12} />}>
      <InfoRow label="Member ID" value={definition.displayId} />
      <InfoRow label="Profile" value={definition.profile} />
      <InfoRow label="Member" value={definition.name} />
      <InfoRow label="Cut Length" value={`${round1(cut?.length ?? definition.current.length)} mm`} />
      <InfoRow label="Quantity" value={definition.quantity} />
      <InfoRow label="Mode" value={definition.mode === 'custom' ? 'CUSTOM' : 'STANDARD'} tone={definition.mode} />
      <div className="mdd-subhead">CUT CONDITION</div>
      <InfoRow label="Condition" value={condition} />
      <InfoRow label={definition.axis === 'horizontal' ? 'Left End' : 'Top End'} value={angleLabel(leftAngle)} />
      <InfoRow label={definition.axis === 'horizontal' ? 'Right End' : 'Bottom End'} value={angleLabel(rightAngle)} />
      <div className="mdd-subhead">FABRICATION</div>
      <InfoRow
        label="Status"
        value={definition.mode === 'custom' ? 'REVIEW REQUIRED' : 'STANDARD'}
        tone={definition.mode === 'custom' ? 'review' : ''}
      />
    </Panel>
  );
}

function angleLabel(angle: number): string {
  if (angle === 45) return '45° MITRE';
  if (angle === 90) return '90° SQUARE CUT';
  return `${angle}° CUT`;
}

function OpeningContextDiagram({
  elevation,
  selectedMemberId,
  onSelectMember,
}: {
  elevation: ElevationLayout;
  selectedMemberId: string | null;
  onSelectMember: (memberId: string) => void;
}) {
  const width = elevation.width;
  const height = elevation.height;
  const pad = Math.max(width, height) * 0.06;
  const members = elevation.selectableMembers ?? [];
  const selected = members.find((member) => member.id === selectedMemberId);
  return (
    <Panel title="OPENING CONTEXT" icon={<Box size={12} />} className="mdd-context-panel">
      <svg
        className="mdd-context-svg"
        viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x={0} y={0} width={width} height={height} className="mdd-context-frame" />
        {elevation.panels.flatMap((panel) =>
          panel.glass.map((glass) => (
            <rect key={glass.id} x={glass.x} y={glass.y} width={glass.width} height={glass.height} className="mdd-context-glass" />
          ))
        )}
        {members.map((member: ElevationMemberBox) => {
          const isSelected = member.id === selectedMemberId;
          const isBead = /bead/i.test(member.id);
          return (
            <rect
              key={member.id}
              x={member.x}
              y={member.y}
              width={member.width}
              height={member.height}
              className={`mdd-context-member${isSelected ? ' selected' : ''}${member.custom ? ' custom' : ''}${isBead ? ' bead' : ''}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelectMember(member.id)}
            >
              <title>{member.label}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mdd-context-caption">
        SELECTED: <b>{selected ? selected.label.toUpperCase() : 'NONE'}</b>
      </div>
    </Panel>
  );
}

function BeforeAfterComparison({ definition, values }: { definition: MemberDefinition; values: DraftDimensions }) {
  const rows: Array<{ label: string; standard?: number; current?: number }> = [
    { label: 'Length', standard: definition.standard.length, current: values.length },
    { label: 'Section Width', standard: definition.standard.width, current: values.width },
    { label: 'Section Depth', standard: definition.standard.depth, current: values.depth },
  ].filter((row) => row.standard !== undefined && row.current !== undefined);
  const changed = rows.filter((row) => Math.abs((row.current ?? 0) - (row.standard ?? 0)) > 0.01);
  return (
    <Panel title="BEFORE / AFTER" icon={<Ruler size={12} />}>
      {changed.length === 0 ? (
        <p className="mdd-hint">No override — member matches the catalogue standard.</p>
      ) : (
        changed.map((row) => {
          const max = Math.max(row.standard ?? 0, row.current ?? 0, 1);
          const delta = (row.current ?? 0) - (row.standard ?? 0);
          return (
            <div className="mdd-compare" key={row.label}>
              <div className="mdd-compare-label">{row.label}</div>
              <div className="mdd-compare-row">
                <span className="mdd-compare-tag">STD</span>
                <div className="mdd-compare-track">
                  <div className="mdd-compare-bar std" style={{ width: `${((row.standard ?? 0) / max) * 100}%` }} />
                </div>
                <span className="mono">{round1(row.standard ?? 0)}</span>
              </div>
              <div className="mdd-compare-row">
                <span className="mdd-compare-tag custom">CUS</span>
                <div className="mdd-compare-track">
                  <div className="mdd-compare-bar custom" style={{ width: `${((row.current ?? 0) / max) * 100}%` }} />
                </div>
                <span className="mono">{round1(row.current ?? 0)}</span>
              </div>
              <div className={`mdd-compare-delta ${delta > 0 ? 'up' : 'down'}`}>
                {delta > 0 ? '+' : ''}
                {round1(delta)} mm
              </div>
            </div>
          );
        })
      )}
    </Panel>
  );
}

function LiveImpactPanel({
  impact,
  recalcState,
}: {
  impact: MemberImpact | null;
  recalcState: 'idle' | 'recalculating' | 'uptodate' | 'review';
}) {
  if (!impact) {
    return (
      <Panel title="LIVE IMPACT" icon={<Check size={12} />}>
        <p className="mdd-hint">Select a member to see downstream impact.</p>
      </Panel>
    );
  }
  const rows: Array<[string, boolean]> = [
    ['Cut List updated', impact.cutList],
    ['Nesting updated', impact.nesting],
    ['Stock bars updated', impact.stock],
    ['Yield / scrap updated', impact.yield],
    ['Aluminium weight updated', impact.weight],
    ['BOM updated', impact.bom],
    ['Glass updated', impact.glass],
    ['Quotation updated', impact.quotation],
    ['Fabrication audit updated', impact.audit],
    ['Manufacturing PDF updated', impact.pdf],
  ];
  return (
    <Panel title="LIVE IMPACT" icon={<Check size={12} />}>
      <ul className="mdd-impact-list">
        {rows.map(([label, active]) => (
          <li key={label} className={active ? 'active' : ''}>
            <span aria-hidden="true">{active ? '✓' : '–'}</span> {label}
          </li>
        ))}
      </ul>
      <div className={`mdd-impact-3d ${impact.threeD}`}>
        {impact.threeD === 'updated' ? (
          <>
            <Check size={12} /> 3D — supported by 100D system
          </>
        ) : (
          <>
            <AlertTriangle size={12} /> 3D — REVIEW: geometry propagation is not supported for this
            profile/system. Canonical fabrication data remains updated.
          </>
        )}
      </div>
      <div className={`mdd-recalc ${recalcState}`}>
        {recalcState === 'recalculating' ? 'Recalculating fabrication data…' : 'All fabrication data up to date'}
      </div>
    </Panel>
  );
}
