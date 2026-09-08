'use client';

// AccessGate is the single entry point for FullAluDoor.
//
// Flow (hybrid_windows, the default production mode):
//   supabase session
//     -> Windows Device Agent detection (localhost)
//     -> server-side device resolution + enrollment (PostgreSQL RPC)
//     -> approved ? challenge/response device attestation
//     -> server verdict -> only approved + active accounts render the app.
//
// browser_legacy (explicit operator choice) keeps the previous per-browser
// token flow. demo only exists when Supabase is not configured at all.
//
// The UI is never the authorization boundary. Every state shown here is
// derived from the database verdict and cryptographic proof; client state can
// never open the workspace.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isDemoAuth, signOutCurrentUser, subscribeToAuth } from '../../lib/auth';
import type { SupabaseUser } from '../../lib/supabase';
import type { AccessGateKind, DeviceAccessPayload, UserRole } from '../../lib/device-access';
import { gateKindFromPayload, isHybridWindowsPayload } from '../../lib/device-access';
import {
  attestWindowsDevice,
  bootstrapFirstAdmin,
  checkDeviceAccess,
  systemHasAdmin,
  type AttestOutcome,
} from '../../lib/device-api';
import type { DeviceAgentInfo } from '../../lib/device-agent-client';
import { fetchAgentDeviceInfo, requestAgentSignature } from '../../lib/device-agent-client';
import {
  deviceAgentDownloadInfo,
  deviceAgentMinVersion,
  isAgentVersionAtLeast,
} from '../../lib/device-config';
import { describeClientPlatform } from '../../lib/device-agent-client';
import {
  AdminRequiredPanel,
  AgentRequiredPanel,
  ErrorPanel,
  LoadingView,
  LoginView,
  StatusPanel,
  submitCredentials,
  type LoginMode,
} from './gate-screens';

export interface AccessSessionValue {
  role: UserRole | null;
  deviceName: string | null;
  signedInEmail: string | null;
  signOut: () => Promise<void>;
}

const AccessSessionContext = createContext<AccessSessionValue>({
  role: null,
  deviceName: null,
  signedInEmail: null,
  signOut: async () => undefined,
});

export function useAccessSession(): AccessSessionValue {
  return useContext(AccessSessionContext);
}

const REVALIDATE_MS = 60000;

interface AccessGateProps {
  children: ReactNode;
  /** Render children only for approved accounts with an admin role. */
  requireAdmin?: boolean;
}

interface PlatformContext {
  isWindows: boolean;
  isMobile: boolean;
}

function detectPlatform(): PlatformContext {
  if (typeof navigator === 'undefined') return { isWindows: false, isMobile: false };
  return describeClientPlatform(navigator.platform, navigator.userAgent);
}

export default function AccessGate({ children, requireAdmin = false }: AccessGateProps) {
  const demoMode = useMemo(() => isDemoAuth(), []);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [payload, setPayload] = useState<DeviceAccessPayload | null>(null);
  const [gate, setGate] = useState<AccessGateKind | null>(null);
  const [checking, setChecking] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [agentNote, setAgentNote] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<DeviceAgentInfo | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const minAgentVersion = useMemo(() => deviceAgentMinVersion(), []);
  const download = useMemo(() => deviceAgentDownloadInfo(), []);

  // Translates an attestation round-trip result into the gate state to show.
  const applyAttestOutcome = useCallback((outcome: AttestOutcome) => {
    if (outcome.ok) {
      setGate('approved');
      return;
    }
    setAgentError(outcome.error ?? 'The device proof could not be verified.');
    const verdict = outcome.verdict;
    if (verdict === 'pending') setGate('pending');
    else if (verdict === 'rejected' || verdict === 'revoked') setGate('revoked');
    else setGate('agent_required');
  }, []);

  const probeAgent = useCallback(async (): Promise<DeviceAgentInfo | null> => {
    try {
      const info = await fetchAgentDeviceInfo();
      if (!isAgentVersionAtLeast(info.agentVersion, minAgentVersion)) {
        setAgentNote(
          `The installed FullAluDoor Device Agent (${info.agentVersion}) is older than the required version ${minAgentVersion}. Update the agent and retry.`
        );
        return null;
      }
      setAgentNote(null);
      setAgentInfo(info);
      return info;
    } catch {
      return null;
    }
  }, [minAgentVersion]);

  // Full access check: probe agent -> resolve server verdict -> attest when
  // the server reports an approved Windows device.
  const runAccessCheck = useCallback(
    async (withSpinner = false) => {
      if (demoMode) return;
      if (withSpinner) setChecking(true);
      try {
        const platform = detectPlatform();
        const info = await probeAgent();
        const result = await checkDeviceAccess({ info });
        setPayload(result);
        setAgentError(null);

        // Non-approved / explicit states.
        if (result.status === 'agent_required') {
          if (!info && !platform.isWindows) {
            setGate('unsupported');
          } else {
            setGate('agent_required');
          }
          return;
        }
        if (result.status === 'approved' && isHybridWindowsPayload(result)) {
          if (!info) {
            // Approved row but the agent cannot be reached right now.
            setGate('agent_required');
            setAgentError('The device is approved but the Windows Device Agent is not responding.');
            return;
          }
          setAttesting(true);
          try {
            const outcome = await attestWindowsDevice(info, requestAgentSignature);
            applyAttestOutcome(outcome);
            return;
          } finally {
            setAttesting(false);
          }
        }
        setGate(gateKindFromPayload(result));
      } catch (error) {
        console.error('FullAluDoor access check failed:', error);
        setPayload({ ok: false, error: errorMessage(error) });
        setGate('error');
      } finally {
        if (withSpinner) setChecking(false);
      }
    },
    [applyAttestOutcome, demoMode, probeAgent]
  );

  // Re-validation: re-check the server verdict (periodically / on focus) and
  // re-attest when approved so a revocation or stale proof is caught quickly.
  const revalidate = useCallback(async () => {
    if (demoMode) return;
    try {
      const result = await checkDeviceAccess();
      setPayload(result);
      const kind = gateKindFromPayload(result);
      if (result.status === 'approved' && isHybridWindowsPayload(result)) {
        const info = agentInfo;
        if (!info) {
          // Try to rediscover the agent; if it is truly gone the protected RPCs
          // will fail safe anyway.
          const rediscovered = await probeAgent();
          if (!rediscovered) {
            setGate('agent_required');
            return;
          }
          const outcome = await attestWindowsDevice(rediscovered, requestAgentSignature);
          applyAttestOutcome(outcome);
          return;
        }
        const outcome = await attestWindowsDevice(info, requestAgentSignature);
        applyAttestOutcome(outcome);
        return;
      }
      setGate(kind);
    } catch (error) {
      // A transient revalidation failure must not kick the user out; the next
      // tick or focus event will retry. Log for diagnostics.
      console.error('FullAluDoor revalidation failed:', error);
    }
  }, [agentInfo, applyAttestOutcome, demoMode, probeAgent]);

  // Session subscription.
  useEffect(() => {
    if (demoMode) return undefined;
    return subscribeToAuth((next) => {
      setUser(next);
      setAuthReady(true);
      if (next === null) {
        setPayload(null);
        setAgentInfo(null);
        setGate('login');
      }
    });
  }, [demoMode]);

  // Resolve device access whenever the session changes.
  useEffect(() => {
    if (demoMode) return;
    if (!authReady || !user) return;
    void Promise.resolve().then(() => void runAccessCheck());
  }, [authReady, demoMode, user, runAccessCheck]);

  // Revalidate periodically and on tab focus while access is active or pending.
  useEffect(() => {
    if (demoMode) return undefined;
    if (gate !== 'approved' && gate !== 'pending') return undefined;
    const timer = window.setInterval(() => void revalidate(), REVALIDATE_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    const onFocus = () => void revalidate();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [demoMode, gate, revalidate]);

  // Detect whether a first-administrator bootstrap is available while pending.
  useEffect(() => {
    if (demoMode || gate !== 'pending' || payload?.role === 'admin') return;
    let active = true;
    void systemHasAdmin()
      .then((hasAdmin) => {
        if (active) setAdminExists(hasAdmin);
      })
      .catch(() => {
        if (active) setAdminExists(true);
      });
    return () => {
      active = false;
    };
  }, [demoMode, gate, payload?.role]);

  const canBootstrap = gate === 'pending' && payload?.role !== 'admin' && adminExists === false;

  const handleCredentials = async (mode: LoginMode, email: string, password: string) => {
    setLoginBusy(true);
    setLoginError(null);
    setLoginMessage(null);
    const result = await submitCredentials(mode, email, password);
    setLoginBusy(false);
    if (!result.ok) {
      setLoginError(result.message);
      return;
    }
    setLoginMessage(result.message);
  };

  const handleLogout = useCallback(async () => {
    setLoginBusy(true);
    await signOutCurrentUser();
    setUser(null);
    setAgentInfo(null);
    setPayload(null);
    setGate('login');
    setLoginBusy(false);
  }, []);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const info = await probeAgent();
      const result = await bootstrapFirstAdmin(info);
      if (result.ok) {
        setAgentError(null);
        await runAccessCheck(true);
      } else {
        setAgentError(result.message);
      }
    } finally {
      setBootstrapping(false);
    }
  };

  const handleRetry = async () => {
    setAgentError(null);
    await runAccessCheck(true);
  };

  const sessionValue = useMemo<AccessSessionValue>(
    () => ({
      role: payload?.role ?? null,
      deviceName: payload?.deviceName ?? null,
      signedInEmail: user?.email ?? null,
      signOut: handleLogout,
    }),
    [payload?.role, payload?.deviceName, user?.email, handleLogout]
  );

  if (demoMode) {
    return <AccessSessionContext.Provider value={sessionValue}>{children}</AccessSessionContext.Provider>;
  }

  // Not ready yet (SSR / first paint) or actively proving the device.
  if (gate === null || !authReady || attesting) {
    return (
      <div className="gate-page">
        <LoadingView message={attesting ? 'Verifying this Windows device…' : undefined} />
      </div>
    );
  }

  switch (gate) {
    case 'login':
      return (
        <div className="gate-page">
          <LoginView busy={loginBusy} error={loginError} message={loginMessage} onSubmit={handleCredentials} />
        </div>
      );

    case 'agent_required':
    case 'unsupported':
      return (
        <div className="gate-page">
          <AgentRequiredPanel
            busy={checking}
            onRetry={() => void handleRetry()}
            onLogout={() => void handleLogout()}
            download={download}
            unsupported={gate === 'unsupported'}
            detail={agentError ?? agentNote}
          />
        </div>
      );

    case 'pending':
      return (
        <div className="gate-page">
          <StatusPanel
            tone="pending"
            email={user?.email}
            deviceName={payload?.deviceName}
            deviceId={payload?.deviceId}
            busy={checking}
            onCheck={() => void handleRetry()}
            checkLabel="Check approval status"
            onLogout={() => void handleLogout()}
          >
            {agentError && (
              <p className="gate-message" style={{ color: '#f87171', marginTop: 10 }}>
                {agentError}
              </p>
            )}
            {canBootstrap && (
              <div style={{ margin: '14px 0' }}>
                <button
                  type="button"
                  className="gate-btn"
                  onClick={() => void handleBootstrap()}
                  disabled={bootstrapping || checking}
                  style={{ borderColor: 'rgba(245, 158, 11, 0.55)' }}
                >
                  {bootstrapping ? <LoadingViewSpinner /> : null}
                  Initialize this deployment (first administrator)
                </button>
                <p style={{ color: '#8b96a5', fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>
                  No administrator exists yet. The first person to activate this option becomes the
                  administrator and this Windows device is approved automatically. Complete this before
                  distributing access to the team.
                </p>
              </div>
            )}
          </StatusPanel>
        </div>
      );

    case 'denied':
      return (
        <div className="gate-page">
          <StatusPanel tone="denied" email={user?.email} deviceName={payload?.deviceName} busy={checking} onLogout={() => void handleLogout()} />
        </div>
      );

    case 'revoked':
      return (
        <div className="gate-page">
          <StatusPanel tone="revoked" email={user?.email} deviceName={payload?.deviceName} busy={checking} onCheck={() => void handleRetry()} checkLabel="Check approval status" onLogout={() => void handleLogout()} />
        </div>
      );

    case 'disabled':
      return (
        <div className="gate-page">
          <StatusPanel tone="disabled" email={user?.email} busy={checking} onLogout={() => void handleLogout()} />
        </div>
      );

    case 'error':
      return (
        <div className="gate-page">
          <ErrorPanel
            message={payload?.error ?? agentError ?? 'The server could not verify this device. Try again.'}
            onRetry={() => void handleRetry()}
            onLogout={() => void handleLogout()}
            busy={checking}
          />
        </div>
      );

    case 'approved':
    default: {
      const isAdmin = payload?.role === 'admin';
      if (requireAdmin && !isAdmin) {
        return (
          <div className="gate-page">
            <AdminRequiredPanel email={user?.email} />
          </div>
        );
      }
      return <AccessSessionContext.Provider value={sessionValue}>{children}</AccessSessionContext.Provider>;
    }
  }
}

function LoadingViewSpinner() {
  return <span className="spin" style={{ display: 'inline-grid', placeItems: 'center', width: 15, height: 15, border: '2px solid rgba(245,158,11,.4)', borderTopColor: '#f59e0b', borderRadius: '50%' }} />;
}

function errorMessage(error: unknown): string {
  if (!error) return 'Unexpected server error.';
  if (typeof error === 'string' && error.length > 0) return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.error === 'string' && record.error) return record.error;
  }
  return 'Unexpected server error.';
}
