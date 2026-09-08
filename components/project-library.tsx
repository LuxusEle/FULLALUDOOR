'use client';

// Full project library overlay: lists every saved project (cloud + this
// browser) with Open and Delete actions. Deleting a cloud project runs the
// protected app_delete_project RPC (server enforced).

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Cloud,
  Database,
  FilePlus2,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { isDemoAuth, subscribeToAuth } from '../lib/auth';
import type { SupabaseUser } from '../lib/supabase';
import type { StoredProject, StoredProjectRef } from '../lib/project-storage';
import {
  deleteCloudProject,
  deleteLocalProject,
  listCloudProjects,
  listLocalProjects,
  loadProjectByRef,
} from '../lib/project-storage';

interface ProjectLibraryProps {
  currentRef: StoredProjectRef | null;
  onOpenDocument: (doc: StoredProject, ref: StoredProjectRef) => void;
  onCurrentRefChange: (ref: StoredProjectRef | null) => void;
  onClose: () => void;
}

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(3, 7, 12, 0.68)',
  zIndex: 300,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
};

const CARD: CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '88vh',
  overflowY: 'auto',
  background: 'var(--card-bg)',
  border: '1px solid var(--edge)',
  borderRadius: 16,
  boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
};

const SECTION_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

export default function ProjectLibrary({ currentRef, onOpenDocument, onCurrentRefChange, onClose }: ProjectLibraryProps) {
  const demoMode = isDemoAuth();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [cloud, setCloud] = useState<StoredProjectRef[]>([]);
  const [local, setLocal] = useState<StoredProjectRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StoredProjectRef | null>(null);
  const [status, setStatus] = useState<{ tone: 'info' | 'ok' | 'error'; text: string } | null>(null);

  const notify = (tone: 'info' | 'ok' | 'error', text: string) => setStatus({ tone, text });
  const toneColor = { info: '#9aa5b1', ok: '#34d399', error: '#f87171' } as const;

  const refreshLists = useCallback(async (activeUser: SupabaseUser | null) => {
    setLocal(listLocalProjects());
    if (activeUser && !demoMode) {
      try {
        setCloud(await listCloudProjects(activeUser));
      } catch (error) {
        notify('error', error instanceof Error ? error.message : 'Could not load cloud projects.');
      }
    } else {
      setCloud([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) {
      void refreshLists(null);
      return undefined;
    }
    return subscribeToAuth((next) => {
      setUser(next);
      setAuthReady(true);
      void refreshLists(next);
    });
  }, [demoMode, refreshLists]);

  const handleOpen = async (ref: StoredProjectRef) => {
    setBusy(true);
    try {
      const result = await loadProjectByRef(ref, user);
      if (!result.ok || !result.doc) {
        notify('error', result.message);
        return;
      }
      onOpenDocument(result.doc, ref);
      onClose();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Could not open the project.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (ref: StoredProjectRef) => {
    setBusy(true);
    setConfirmDelete(null);
    try {
      if (ref.kind === 'cloud' && user && !demoMode) {
        const result = await deleteCloudProject(ref.id);
        notify(result.ok ? 'ok' : 'error', result.message);
        if (result.ok && currentRef?.id === ref.id) onCurrentRefChange(null);
      } else {
        deleteLocalProject(ref.id);
        notify('ok', 'Local project deleted.');
        if (currentRef?.id === ref.id) onCurrentRefChange(null);
      }
      void refreshLists(user);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (ref: StoredProjectRef) => {
    const isCurrent = currentRef?.id === ref.id;
    const isConfirming = confirmDelete?.kind === ref.kind && confirmDelete?.id === ref.id;
    return (
      <div
        key={`${ref.kind}-${ref.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: isCurrent ? 'rgba(56,189,248,0.10)' : 'var(--panel)',
          border: isCurrent ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--edge)',
          borderRadius: 10,
          padding: '10px 12px',
        }}
      >
        {ref.kind === 'cloud' ? (
          <Cloud size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
        ) : (
          <Database size={16} style={{ color: '#a3b3c5', flexShrink: 0 }} />
        )}
        <button
          type="button"
          onClick={() => void handleOpen(ref)}
          disabled={busy}
          title={`Open ${ref.name}`}
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isCurrent && <span style={{ color: '#38bdf8' }}>● </span>}
            {ref.name}
          </span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
            {ref.kind === 'cloud' ? 'Cloud · ' : 'This browser · '}
            {new Date(ref.savedAt).toLocaleString()}
          </span>
        </button>

        {isConfirming ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger)' }}>Delete?</span>
            <button
              type="button"
              onClick={() => void handleDelete(ref)}
              disabled={busy}
              style={{ height: 30, padding: '0 10px', border: '1px solid var(--danger)', background: 'var(--danger)', color: '#ffffff', borderRadius: 7, fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}
            >
              {busy ? <Loader2 size={13} className="spin" /> : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={busy}
              style={{ height: 30, padding: '0 10px', border: '1px solid var(--edge-strong)', background: 'transparent', color: 'var(--ink)', borderRadius: 7, fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(ref)}
            disabled={busy}
            aria-label={`Delete ${ref.name}`}
            title="Delete project"
            style={{ flexShrink: 0, width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid var(--edge)', background: 'var(--input-bg)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project library"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={OVERLAY}
    >
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 22px', borderBottom: '1px solid var(--edge)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>
            <FolderOpen size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>My Projects</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Open any saved project or delete one you no longer need.
              {authReady && user && !demoMode ? ` Signed in as ${user.email}.` : demoMode ? ' Supabase is not configured — projects below are stored in this browser only.' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => void refreshLists(user)}
              disabled={busy}
              aria-label="Refresh project list"
              title="Refresh"
              style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid var(--edge)', background: 'transparent', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close project library"
              title="Close"
              style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid var(--edge)', background: 'transparent', color: 'var(--muted)', borderRadius: 8, cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {status && (
            <div style={{ fontSize: 12, lineHeight: 1.45, color: toneColor[status.tone], wordBreak: 'break-word' }}>
              {status.text}
            </div>
          )}

          {user && !demoMode && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={SECTION_LABEL}>CLOUD PROJECTS · {cloud.length}</span>
              </div>
              {cloud.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                  No cloud projects yet. Use <FilePlus2 size={12} style={{ verticalAlign: '-2px' }} /> Save Project in the top bar to upload the current project.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{cloud.map(renderRow)}</div>
              )}
            </section>
          )}

          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={SECTION_LABEL}>THIS BROWSER (LOCAL) · {local.length}</span>
            </div>
            {local.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                No projects saved in this browser yet. Save the current project to keep a copy here.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{local.map(renderRow)}</div>
            )}
          </section>

          {busy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <Loader2 size={14} className="spin" /> Working…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
