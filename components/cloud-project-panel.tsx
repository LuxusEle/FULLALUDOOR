'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import {
  Cloud,
  Database,
  Loader2,
  LogIn,
  LogOut,
  Save,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { OpeningItem, ProjectMetadata } from '../lib/types';
import { isDemoAuth, signInWithEmail, signOutCurrentUser, signUpWithEmail, subscribeToAuth } from '../lib/auth';
import type { SupabaseUser } from '../lib/supabase';
import {
  deleteCloudProject,
  deleteLocalProject,
  encodeStoredProject,
  listCloudProjects,
  listLocalProjects,
  loadProjectByRef,
  saveCloudProject,
  saveLocalProject,
  type StoredProject,
  type StoredProjectRef,
} from '../lib/project-storage';

const credentialSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

interface CloudProjectPanelProps {
  project: ProjectMetadata;
  openings: OpeningItem[];
  currentRef: StoredProjectRef | null;
  onOpenDocument: (doc: StoredProject, ref: StoredProjectRef) => void;
  onCurrentRefChange: (ref: StoredProjectRef | null) => void;
}

interface Status {
  tone: 'info' | 'ok' | 'error';
  text: string;
}

const toneColor: Record<Status['tone'], string> = {
  info: '#9aa5b1',
  ok: '#34d399',
  error: '#f87171',
};

const PANEL: React.CSSProperties = {
  position: 'absolute',
  top: 46,
  right: 0,
  width: 340,
  maxHeight: 'min(640px, calc(100vh - 70px))',
  overflowY: 'auto',
  background: '#171c23',
  border: '1px solid #333c45',
  borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
  padding: 14,
  zIndex: 60,
};

const FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 };
const LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b96a5' };
const INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #3b4450',
  background: '#0f141a',
  color: '#e6edf3',
  fontSize: 13,
  outline: 'none',
};

export default function CloudProjectPanel({
  project,
  openings,
  currentRef,
  onOpenDocument,
  onCurrentRefChange,
}: CloudProjectPanelProps) {
  const [open, setOpen] = useState(false);
  const demoMode = isDemoAuth();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ tone: 'info', text: '' });
  const [cloudList, setCloudList] = useState<StoredProjectRef[]>([]);
  const [localList, setLocalList] = useState<StoredProjectRef[]>([]);

  const refreshLists = useCallback(async (activeUser: SupabaseUser | null) => {
    setLocalList(listLocalProjects());
    if (activeUser && !demoMode) {
      try {
        setCloudList(await listCloudProjects(activeUser));
      } catch {
        setCloudList([]);
      }
    } else {
      setCloudList([]);
    }
  }, [demoMode]);

  useEffect(() => subscribeToAuth((next) => {
    setUser(next);
    setAuthReady(true);
    if (next === null) setStatus({ tone: 'info', text: '' });
    void refreshLists(next);
  }), [refreshLists]);

  const notify = (next: Status) => setStatus(next);

  const togglePanel = () => {
    setStatus({ tone: 'info', text: '' });
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void refreshLists(user);
  };

  const openDoc = async (ref: StoredProjectRef) => {
    const result = await loadProjectByRef(ref, user);
    if (!result.ok || !result.doc) {
      notify({ tone: 'error', text: result.message });
      return;
    }
    notify({ tone: 'ok', text: result.message });
    onOpenDocument(result.doc, ref);
  };

  const handleSaveCurrent = async () => {
    setBusy(true);
    notify({ tone: 'info', text: 'Saving…' });
    try {
      const doc = encodeStoredProject(project, openings);
      if (user && !demoMode) {
        const rowId = currentRef?.kind === 'cloud' ? currentRef.id : undefined;
        const result = await saveCloudProject(user, doc.project, doc.openings, rowId);
        notify({ tone: result.ok ? 'ok' : 'error', text: result.message });
        if (result.ok && result.ref) onCurrentRefChange(result.ref);
      } else {
        const result = saveLocalProject(doc.project, doc.openings);
        notify({ tone: result.ok ? 'ok' : 'error', text: result.message });
        if (result.ok && result.ref) onCurrentRefChange(result.ref);
      }
      void refreshLists(user);
    } catch (error) {
      notify({ tone: 'error', text: error instanceof Error ? error.message : 'Save failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (ref: StoredProjectRef) => {
    setBusy(true);
    try {
      if (ref.kind === 'cloud' && user && !demoMode) {
        const result = await deleteCloudProject(ref.id);
        notify({ tone: result.ok ? 'ok' : 'error', text: result.message });
        if (result.ok && currentRef?.id === ref.id) onCurrentRefChange(null);
      } else {
        deleteLocalProject(ref.id);
        notify({ tone: 'ok', text: 'Local project deleted.' });
        if (currentRef?.id === ref.id) onCurrentRefChange(null);
      }
      void refreshLists(user);
    } catch (error) {
      notify({ tone: 'error', text: error instanceof Error ? error.message : 'Delete failed.' });
    } finally {
      setBusy(false);
    }
  };

  const runAuth = async () => {
    const parsed = credentialSchema.safeParse({ email, password });
    if (!parsed.success) {
      notify({ tone: 'error', text: parsed.error.issues[0]?.message ?? 'Invalid credentials.' });
      return;
    }
    setBusy(true);
    const action = authMode === 'signin' ? signInWithEmail : signUpWithEmail;
    const result = await action(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (!result.ok) {
      notify({ tone: 'error', text: result.message });
      return;
    }
    notify({
      tone: 'ok',
      text: authMode === 'signin' ? 'Signed in. Cloud saves are active.' : 'Account ready. Cloud saves are active.',
    });
    setPassword('');
    setEmail('');
    setAuthMode('signin');
  };

  const handleSignOut = async () => {
    const result = await signOutCurrentUser();
    if (!result.ok) {
      notify({ tone: 'error', text: result.message });
      return;
    }
    setUser(null);
    setCloudList([]);
    void refreshLists(null);
  };

  const signedIn = Boolean(user) && !demoMode;
  const panelHeaderText = signedIn ? 'Cloud Projects' : demoMode ? 'Local Project Library (Demo)' : 'Sign in to Cloud';

  return (
    <div style={{ position: 'relative', marginLeft: 6 }}>
      <button
        type="button"
        className="btn"
        onClick={togglePanel}
        title={panelHeaderText}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {signedIn ? <Cloud size={14} /> : <Database size={14} />}
        <span className="btn-txt">{signedIn ? user!.email?.split('@')[0] ?? 'Cloud' : 'Cloud'}</span>
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />
          <div aria-label={panelHeaderText} style={PANEL}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#e6edf3' }}>
                {panelHeaderText}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close cloud panel"
                style={{ background: 'transparent', border: 'none', color: '#8b96a5', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>

            {!authReady ? (
              <div style={{ color: '#9aa5b1', fontSize: 12, padding: '12px 0' }}>Loading session…</div>
            ) : demoMode ? (
              <div style={{ fontSize: 11.5, color: '#9aa5b1', background: '#12171e', border: '1px solid #2a323c', borderRadius: 8, padding: '10px 12px', marginBottom: 12, lineHeight: 1.5 }}>
                Supabase is not configured, so projects are stored in this browser only. Add{' '}
                <code style={{ color: '#fbbf24' }}>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                <code style={{ color: '#fbbf24' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable secure cloud saves.
              </div>
            ) : !signedIn ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAuth();
                }}
              >
                <div style={FIELD}>
                  <label htmlFor="cloud-email" style={LABEL}>Email</label>
                  <input
                    id="cloud-email"
                    type="email"
                    autoComplete="email"
                    style={INPUT}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@workshop.com"
                  />
                </div>
                <div style={FIELD}>
                  <label htmlFor="cloud-password" style={LABEL}>Password</label>
                  <input
                    id="cloud-password"
                    type="password"
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    style={INPUT}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {busy ? <Loader2 size={14} className="spin" /> : authMode === 'signin' ? <LogIn size={14} /> : <UserPlus size={14} />}
                  {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode((mode) => (mode === 'signin' ? 'signup' : 'signin'))}
                  style={{ width: '100%', marginTop: 8, background: 'transparent', border: 'none', color: '#60a5fa', fontSize: 12, cursor: 'pointer', padding: 6 }}
                >
                  {authMode === 'signin' ? 'No account? Create one' : 'Already registered? Sign in'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: '#8b96a5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Signed in as <b style={{ color: '#e6edf3' }}>{user!.email}</b>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-primary" onClick={() => void handleSaveCurrent()} disabled={busy} style={{ flex: 1, justifyContent: 'center' }}>
                    {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save Project
                  </button>
                  <button type="button" className="btn" onClick={() => void handleSignOut()} disabled={busy} style={{ flexShrink: 0 }}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </div>
            )}

            {!demoMode && !signedIn && (
              <button
                type="button"
                onClick={() => {
                  const result = saveLocalProject(project, openings);
                  notify({ tone: result.ok ? 'ok' : 'error', text: result.message });
                  if (result.ok && result.ref) onCurrentRefChange(result.ref);
                  void refreshLists(null);
                }}
                disabled={busy}
                style={{ width: '100%', marginTop: 10, background: '#12171e', border: '1px solid #2a323c', color: '#e6edf3', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Continue in Demo Mode — Save to this browser
              </button>
            )}

            {status.text && (
              <div style={{ color: toneColor[status.tone], fontSize: 11.5, marginTop: 12, lineHeight: 1.45, wordBreak: 'break-word' }}>
                {status.text}
              </div>
            )}

            {signedIn && (
              <div style={{ marginTop: 12 }}>
                <div style={LABEL}>My Cloud Projects</div>
                <ProjectList
                  entries={cloudList}
                  emptyText="No cloud projects yet."
                  currentId={currentRef?.kind === 'cloud' ? currentRef.id : null}
                  busy={busy}
                  onOpen={(ref) => void openDoc(ref)}
                  onDelete={(ref) => void handleDelete(ref)}
                />
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div style={LABEL}>This browser (local)</div>
              <ProjectList
                entries={localList}
                emptyText="No local projects saved."
                currentId={currentRef?.kind === 'local' ? currentRef.id : null}
                busy={busy}
                onOpen={(ref) => void openDoc(ref)}
                onDelete={(ref) => void handleDelete(ref)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ProjectListProps {
  entries: StoredProjectRef[];
  emptyText: string;
  currentId: string | null;
  busy: boolean;
  onOpen: (ref: StoredProjectRef) => void;
  onDelete: (ref: StoredProjectRef) => void;
}

function ProjectList({ entries, emptyText, currentId, busy, onOpen, onDelete }: ProjectListProps) {
  if (entries.length === 0) {
    return <div style={{ fontSize: 11.5, color: '#6b7683', padding: '6px 0' }}>{emptyText}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      {entries.map((ref) => {
        const isCurrent = currentId === ref.id;
        return (
          <div
            key={`${ref.kind}-${ref.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: isCurrent ? '#22303f' : '#12171e',
              border: isCurrent ? '1px solid #35618f' : '1px solid #2a323c',
              borderRadius: 8,
              padding: '6px 8px',
            }}
          >
            {ref.kind === 'cloud' ? <Cloud size={13} style={{ color: '#38bdf8', flexShrink: 0 }} /> : <Database size={13} style={{ color: '#a3b3c5', flexShrink: 0 }} />}
            <button
              type="button"
              onClick={() => onOpen(ref)}
              disabled={busy}
              title={`Open ${ref.name}`}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', color: '#e6edf3', cursor: 'pointer', padding: 0 }}
            >
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ref.name}
              </span>
              <span style={{ display: 'block', fontSize: 9.5, color: '#7d8894' }}>
                {isCurrent ? 'Open now · ' : ''}{new Date(ref.savedAt).toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(ref)}
              disabled={busy}
              aria-label={`Delete ${ref.name}`}
              title="Delete"
              style={{ background: 'transparent', border: 'none', color: '#7d8894', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
