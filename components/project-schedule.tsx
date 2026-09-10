'use client';

import React, { useState } from 'react';
import { Copy, Eye, Plus, Trash2, Layers, Building2, Calendar, Hash } from 'lucide-react';
import type { DerivedOpening, FinishType, GlassType, OpeningItem, ProjectMetadata, TypologyId } from '../lib/types';
import { TYPOLOGY_LABELS } from '../lib/types';
import { deriveDoor } from '../lib/door-model';

export { TYPOLOGY_LABELS };

interface ProjectScheduleProps {
  project: ProjectMetadata;
  setProject: React.Dispatch<React.SetStateAction<ProjectMetadata>>;
  openings: OpeningItem[];
  setOpenings: React.Dispatch<React.SetStateAction<OpeningItem[]>>;
  activeOpeningId: string;
  onSelectOpening: (id: string) => void;
}

export default function ProjectSchedule({
  project,
  setProject,
  openings,
  setOpenings,
  activeOpeningId,
  onSelectOpening,
}: ProjectScheduleProps) {
  const [selectedSystem, setSelectedSystem] = useState<TypologyId>('100D-single');

  const addOpening = () => {
    const nextIndex = openings.length + 1;
    const isWindow = selectedSystem === 'casement' || selectedSystem.startsWith('70S') || selectedSystem.startsWith('100S');
    const tagPrefix = isWindow ? 'W' : 'D';
    const tag = `${tagPrefix}-${String(nextIndex).padStart(2, '0')}`;

    let defaultW = 900;
    let defaultH = 2100;
    if (selectedSystem === '100D-double') {
      defaultW = 1800;
      defaultH = 2100;
    } else if (selectedSystem === '100S-sliding-2p') {
      defaultW = 2400;
      defaultH = 2100;
    } else if (selectedSystem === '70S-sliding-2p') {
      defaultW = 1800;
      defaultH = 2100;
    } else if (selectedSystem === '70S-sliding-4p') {
      defaultW = 3200;
      defaultH = 2200;
    } else if (selectedSystem === 'casement') {
      defaultW = 800;
      defaultH = 1200;
    }

    const newOpening: OpeningItem = {
      id: `open-${Date.now()}`,
      tag,
      name: TYPOLOGY_LABELS[selectedSystem],
      system: selectedSystem,
      width: defaultW,
      height: defaultH,
      quantity: 1,
      finish: 'natural',
      glass: '6mm-clear',
      location: 'Ground Floor',
      hingeSide: 'left',
    };

    setOpenings((prev) => [...prev, newOpening]);
    onSelectOpening(newOpening.id);
  };

  const duplicateOpening = (item: OpeningItem) => {
    const dup: OpeningItem = {
      ...item,
      id: `open-${Date.now()}`,
      tag: `${item.tag}-COPY`,
      name: `${item.name} (Copy)`,
    };
    setOpenings((prev) => [...prev, dup]);
  };

  const deleteOpening = (id: string) => {
    if (openings.length <= 1) {
      alert('A project must contain at least one opening.');
      return;
    }
    setOpenings((prev) => prev.filter((o) => o.id !== id));
  };

  const updateItem = (id: string, updates: Partial<OpeningItem>) => {
    setOpenings((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  // Compute Project Summary KPIs
  const derivedList: DerivedOpening[] = openings.map((o) => deriveDoor(o));
  const totalOpeningsCount = openings.reduce((sum, o) => sum + o.quantity, 0);
  const totalAreaM2 = derivedList.reduce((sum, d) => sum + d.areaM2 * d.config.quantity, 0);
  const totalAluWeightKg = derivedList.reduce((sum, d) => sum + d.totalAluWeightKg * d.config.quantity, 0);
  const totalGlassM2 = derivedList.reduce((sum, d) => {
    const panelArea = d.glassPanels.reduce((s, g) => s + g.areaM2, 0);
    return sum + panelArea * d.config.quantity;
  }, 0);

  return (
    <div className="schedule-wrapper">
      {/* Project Meta Banner */}
      <div className="project-banner card">
        <div className="project-meta-grid">
          <div className="meta-field">
            <label><Building2 size={13} /> Project Name</label>
            <input
              type="text"
              className="input-meta"
              value={project.projectName}
              onChange={(e) => setProject({ ...project, projectName: e.target.value })}
            />
          </div>
          <div className="meta-field">
            <label><Building2 size={13} /> Client / Architect</label>
            <input
              type="text"
              className="input-meta"
              value={project.clientName}
              onChange={(e) => setProject({ ...project, clientName: e.target.value })}
            />
          </div>
          <div className="meta-field">
            <label><Hash size={13} /> Project Ref #</label>
            <input
              type="text"
              className="input-meta"
              value={project.projectNumber}
              onChange={(e) => setProject({ ...project, projectNumber: e.target.value })}
            />
          </div>
          <div className="meta-field">
            <label><Calendar size={13} /> Date</label>
            <input
              type="date"
              className="input-meta"
              value={project.date}
              onChange={(e) => setProject({ ...project, date: e.target.value })}
            />
          </div>
        </div>

        {/* Aggregate Project KPIs */}
        <div className="kpi-grid">
          <div className="kpi-box">
            <span className="kpi-num">{totalOpeningsCount}</span>
            <span className="kpi-lbl">Total Units</span>
          </div>
          <div className="kpi-box">
            <span className="kpi-num">{totalAreaM2.toFixed(1)} m²</span>
            <span className="kpi-lbl">Total Opening Area</span>
          </div>
          <div className="kpi-box">
            <span className="kpi-num">{totalAluWeightKg.toFixed(1)} kg</span>
            <span className="kpi-lbl">Net Extrusions</span>
          </div>
          <div className="kpi-box">
            <span className="kpi-num">{totalGlassM2.toFixed(1)} m²</span>
            <span className="kpi-lbl">Glazing Area</span>
          </div>
        </div>
      </div>

      {/* Schedule Table Actions Bar */}
      <div className="schedule-toolbar">
        <div className="add-group">
          <label htmlFor="system-select" className="sr-only">Choose System</label>
          <select
            id="system-select"
            className="select"
            value={selectedSystem}
            onChange={(e) => setSelectedSystem(e.target.value as TypologyId)}
          >
            {Object.entries(TYPOLOGY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={addOpening}>
            <Plus size={14} /> <span className="btn-label">Add Opening Unit</span>
          </button>
        </div>
        <div className="toolbar-info">
          <span>Click any row to load into 3D Visualizer & 2D Vector CAD</span>
        </div>
      </div>

      {/* Multi-Opening Schedule Table */}
      <div className="table-responsive card">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>System Typology</th>
              <th>Width (mm)</th>
              <th>Height (mm)</th>
              <th>Qty</th>
              <th>Finish</th>
              <th>Glazing</th>
              <th>Location</th>
              <th>Alu (kg)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {openings.map((op) => {
              const derived = deriveDoor(op);
              const isActive = op.id === activeOpeningId;
              return (
                <tr key={op.id} className={isActive ? 'row-active' : ''}>
                  <td>
                    <input
                      type="text"
                      className="table-input input-tag"
                      value={op.tag}
                      onChange={(e) => updateItem(op.id, { tag: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="table-select"
                      value={op.system}
                      onChange={(e) =>
                        updateItem(op.id, {
                          system: e.target.value as TypologyId,
                          name: TYPOLOGY_LABELS[e.target.value as TypologyId],
                        })
                      }
                    >
                      {Object.entries(TYPOLOGY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="table-input input-dim"
                      value={op.width}
                      onChange={(e) => updateItem(op.id, { width: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="table-input input-dim"
                      value={op.height}
                      onChange={(e) => updateItem(op.id, { height: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="table-input input-qty"
                      min="1"
                      value={op.quantity}
                      onChange={(e) => updateItem(op.id, { quantity: Math.max(1, Number(e.target.value)) })}
                    />
                  </td>
                  <td>
                    <select
                      className="table-select"
                      value={op.finish}
                      onChange={(e) => updateItem(op.id, { finish: e.target.value as FinishType })}
                    >
                      <option value="natural">Natural Anodised</option>
                      <option value="black">Jet Black</option>
                      <option value="bronze">Architectural Bronze</option>
                      <option value="white">Pure White</option>
                    </select>
                  </td>
                  <td>
                    <select
                      className="table-select"
                      value={op.glass}
                      onChange={(e) => updateItem(op.id, { glass: e.target.value as GlassType })}
                    >
                      <option value="6mm-clear">6mm Clear Tempered</option>
                      <option value="8mm-tinted">8mm Tinted Solar</option>
                      <option value="10.38mm-laminated">10.38mm Laminated</option>
                      <option value="12mm-toughened">12mm Toughened</option>
                      <option value="24mm-dgu">24mm DGU (6-12-6)</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      value={op.location}
                      onChange={(e) => updateItem(op.id, { location: e.target.value })}
                    />
                  </td>
                  <td className="mono font-semibold">
                    {(derived.totalAluWeightKg * op.quantity).toFixed(1)}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className={`btn-icon ${isActive ? 'btn-icon-active' : ''}`}
                        title="View in 3D & 2D CAD"
                        onClick={() => onSelectOpening(op.id)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="btn-icon"
                        title="Duplicate Opening"
                        onClick={() => duplicateOpening(op)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        className="btn-icon btn-icon-danger"
                        title="Delete Opening"
                        onClick={() => deleteOpening(op.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
