'use client';

// Presentational screens for the FullAluDoor access gate. These only render a
// verdict produced by the database; they never compute authorization.

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  CheckCircle2,
  Hexagon,
  Loader2,
  LogIn,
  LogOut,
  MonitorDown,
  RefreshCw,
  ShieldAlert,
  ShieldCheck as ShieldCheckIcon,
  UserPlus,
} from 'lucide-react';
import { signInWithEmail, signUpWithEmail } from '../../lib/auth';

export function GateBrand() {
  return (
    <div className="gate-brand">
      <span className="gate-brandmark">
        <Hexagon size={22} strokeWidth={2.2} />
      </span>
      <div>
        <div className="gate-brand-name">FullAluDoor Pro</div>
        <span className="gate-brand-sub">Secure Fabrication Workspace</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function LoadingView({ message }: { message?: string }) {
  return (
    <div className="gate-card">
      <GateBrand />
      <div className="gate-loader" style={{ padding: '22px 0' }}>
        <Loader2 size={18} className="spin" />
        <span>{message ?? 'Checking secure access…'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export type LoginMode = 'signin' | 'signup';

interface LoginViewProps {
  busy: boolean;
  error: string | null;
  message: string | null;
  onSubmit: (mode: LoginMode, email: string, password: string) => Promise<void>;
}

export function LoginView({ busy, error, message, onSubmit }: LoginViewProps) {
  const [mode, setMode] = useState<LoginMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void onSubmit(mode, email.trim().toLowerCase(), password);
  };

  return (
    <div className="gate-card">
      <GateBrand />
      <div className="gate-eyebrow">Sign in</div>
      <h1 className="gate-title">Welcome back</h1>
      <p className="gate-lead">
        Sign in with your FullAluDoor credentials. New devices require administrator approval before the
        workspace can be opened.
      </p>

      <form onSubmit={submit} noValidate>
        <div className="gate-row">
          <label htmlFor="gate-email">Email</label>
          <input
            id="gate-email"
            type="email"
            className="gate-input"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@workshop.com"
          />
        </div>
        <div className="gate-row">
          <label htmlFor="gate-password">Password</label>
          <input
            id="gate-password"
            type="password"
            className="gate-input"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button type="submit" className="gate-btn gate-btn-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : mode === 'signin' ? <LogIn size={15} /> : <UserPlus size={15} />}
          {busy ? 'Checking…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <button
          type="button"
          className="gate-link"
          onClick={() => setMode((current) => (current === 'signin' ? 'signup' : 'signin'))}
        >
          {mode === 'signin' ? 'No account? Create one' : 'Already registered? Sign in'}
        </button>
      </div>

      {message && <div className="gate-message" style={{ color: '#34d399' }}>{message}</div>}
      {error && <div className="gate-message" style={{ color: '#f87171' }}>{error}</div>}

      <div className="gate-footer-note">
        Access is granted only when your account is active and this device has been approved by an
        administrator. Approved access is verified on the server for every protected action.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device status panels
// ---------------------------------------------------------------------------

type StatusTone = 'pending' | 'denied' | 'revoked' | 'disabled';

interface StatusPanelProps {
  tone: StatusTone;
  deviceName?: string | null;
  deviceId?: string | null;
  email?: string | null;
  busy: boolean;
  onCheck?: () => void;
  onLogout: () => void;
  checkLabel?: string;
  children?: ReactNode;
}

const STATUS_COPY: Record<StatusTone, { pill: string; pillClass: string; heading: string; lead: string }> = {
  pending: {
    pill: 'PENDING',
    pillClass: 'gate-pill-pending',
    heading: 'Device approval required',
    lead:
      'Your account is authenticated. This device has been registered and is waiting for an administrator to approve it. The workspace stays locked until the device is approved.',
  },
  denied: {
    pill: 'REJECTED',
    pillClass: 'gate-pill-denied',
    heading: 'Device access denied',
    lead:
      'This device was rejected by an administrator and is not authorized to access FullAluDoor. Contact the administrator if you believe this is a mistake.',
  },
  revoked: {
    pill: 'REVOKED',
    pillClass: 'gate-pill-denied',
    heading: 'Device access revoked',
    lead:
      'An administrator has revoked access for this computer. All browsers on this computer are blocked until the device is approved again.',
  },
  disabled: {
    pill: 'DISABLED',
    pillClass: 'gate-pill-denied',
    heading: 'Account disabled',
    lead:
      'This account has been disabled by an administrator. Contact the administrator to reactivate it.',
  },
};

export function StatusPanel({ tone, deviceName, deviceId, email, busy, onCheck, onLogout, checkLabel, children }: StatusPanelProps) {
  const copy = STATUS_COPY[tone];
  return (
    <div className="gate-card">
      <GateBrand />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div className="gate-eyebrow">Access status</div>
          <h1 className="gate-title">{copy.heading}</h1>
        </div>
        <span className={`gate-status-pill ${copy.pillClass}`} style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {copy.pill}
        </span>
      </div>
      <p className="gate-lead">{copy.lead}</p>

      {(deviceName || deviceId || email) && (
        <div className="gate-detail-box">
          {email && (
            <div className="gate-detail-row">
              <span>Account</span>
              <span>{email}</span>
            </div>
          )}
          {deviceName && (
            <div className="gate-detail-row">
              <span>Device</span>
              <span>{deviceName}</span>
            </div>
          )}
          {deviceId && (
            <div className="gate-detail-row">
              <span>Device ID</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}>{deviceId}</span>
            </div>
          )}
        </div>
      )}

      {children}

      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        {onCheck && (
          <button type="button" className="gate-btn gate-btn-primary" onClick={() => onCheck()} disabled={busy} style={{ flex: '1 1 180px', width: 'auto' }}>
            {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            {checkLabel ?? 'Check approval status'}
          </button>
        )}
        <button type="button" className="gate-btn gate-btn-ghost" onClick={() => onLogout()} disabled={busy} style={{ flexShrink: 0, padding: '0 18px', width: 'auto' }}>
          <LogOut size={15} />
          Log out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Windows Device Agent required panel
// ---------------------------------------------------------------------------

export interface AgentDownloadInfo {
  url: string | null;
  label: string;
}

interface AgentRequiredPanelProps {
  busy: boolean;
  onRetry: () => void;
  onLogout: () => void;
  download: AgentDownloadInfo;
  /** When set, shows the "not supported on this platform" variant. */
  unsupported?: boolean;
  /** Optional reason shown to the user (e.g. the agent version is too old). */
  detail?: string | null;
}

export function AgentRequiredPanel({ busy, onRetry, onLogout, download, unsupported = false, detail = null }: AgentRequiredPanelProps) {
  return (
    <div className="gate-card">
      <GateBrand />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div className="gate-eyebrow">Device verification</div>
          <h1 className="gate-title">
            {unsupported ? 'FullAluDoor runs on Windows' : 'Windows Device Agent required'}
          </h1>
        </div>
        <span className="gate-status-pill gate-pill-pending" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          ACTION REQUIRED
        </span>
      </div>
      {unsupported ? (
        <p className="gate-lead">
          FullAluDoor is bound to approved Windows computers through the FullAluDoor Device Agent. This
          platform (phone/tablet/other operating system) cannot provide a Windows device identity, so it
          cannot be approved for access. Use an approved Windows computer.
        </p>
      ) : (
        <p className="gate-lead">
          FullAluDoor requires the FullAluDoor Device Agent to verify this Windows computer before access is
          granted. Access is bound to this physical machine — every browser on this computer uses the same
          approved device identity.
        </p>
      )}
      {detail ? (
        <p className="gate-message" style={{ color: '#fbbf24' }}>{detail}</p>
      ) : null}
      <div className="gate-detail-box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {download.url ? (
          <a
            href={download.url}
            target="_blank"
            rel="noreferrer"
            className="gate-btn gate-btn-primary"
            style={{ textDecoration: 'none', justifyContent: 'center' }}
          >
            <MonitorDown size={15} />
            {download.label}
          </a>
        ) : (
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>
            Ask your administrator for the <strong>FullAluDoor Device Agent</strong> installer, or download it
            from the FullAluDoor portal.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="gate-btn" onClick={() => onRetry()} disabled={busy} style={{ flex: '1 1 180px', width: 'auto' }}>
            {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            Retry detection
          </button>
          <button type="button" className="gate-btn gate-btn-ghost" onClick={() => onLogout()} disabled={busy} style={{ flexShrink: 0, padding: '0 18px', width: 'auto' }}>
            <LogOut size={15} />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server error panel
// ---------------------------------------------------------------------------

interface ErrorPanelProps {
  message: string;
  onRetry: () => void;
  onLogout: () => void;
  busy: boolean;
}

export function ErrorPanel({ message, onRetry, onLogout, busy }: ErrorPanelProps) {
  return (
    <div className="gate-card">
      <GateBrand />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldAlert size={20} style={{ color: '#f87171' }} />
        <h1 className="gate-title" style={{ margin: 0 }}>Access could not be verified</h1>
      </div>
      <p className="gate-lead">{message}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="gate-btn gate-btn-primary" onClick={() => onRetry()} disabled={busy} style={{ flex: '1 1 180px', width: 'auto' }}>
          {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          Retry
        </button>
        <button type="button" className="gate-btn gate-btn-ghost" onClick={() => onLogout()} disabled={busy} style={{ flexShrink: 0, padding: '0 18px', width: 'auto' }}>
          <LogOut size={15} />
          Log out
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin-required panel (authenticated non-admin users visiting /admin)
// ---------------------------------------------------------------------------

interface AdminRequiredPanelProps {
  email?: string | null;
}

export function AdminRequiredPanel({ email }: AdminRequiredPanelProps) {
  return (
    <div className="gate-card">
      <GateBrand />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldAlert size={20} style={{ color: '#fbbf24' }} />
        <h1 className="gate-title" style={{ margin: 0 }}>Administrator area</h1>
      </div>
      <p className="gate-lead">
        This area is restricted to FullAluDoor administrators. Your account{email ? ` (${email})` : ''} does not
        have administrator privileges.
      </p>
      <a href="/dashboard" className="gate-btn gate-btn-primary" style={{ textDecoration: 'none' }}>
        <CheckCircle2 size={15} />
        Back to the dashboard
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approved fallback (used by the dedicated /login and device-status pages)
// ---------------------------------------------------------------------------

export function ApprovedInsidePanel() {
  return (
    <div className="gate-card">
      <GateBrand />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldCheckIcon size={20} style={{ color: '#6ee7b7' }} />
        <h1 className="gate-title" style={{ margin: 0 }}>Access approved</h1>
      </div>
      <p className="gate-lead">
        This device is approved and your account is active. Open the FullAluDoor workspace to continue.
      </p>
      <a href="/dashboard" className="gate-btn gate-btn-primary" style={{ textDecoration: 'none' }}>
        <CheckCircle2 size={15} />
        Open the dashboard
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable sign-in submit shared by the gate
// ---------------------------------------------------------------------------

export async function submitCredentials(mode: LoginMode, email: string, password: string): Promise<{ ok: boolean; message: string }> {
  if (!email || !password) {
    return { ok: false, message: 'Enter your email and password.' };
  }
  if (password.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  const action = mode === 'signin' ? signInWithEmail : signUpWithEmail;
  const result = await action(email, password);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    message:
      mode === 'signin'
        ? 'Signed in. Verifying this device…'
        : 'Account created. Verifying this device…',
  };
}
