'use client';

// AccessGate is the single entry point for FullAluDoor.
//
// Flow: supabase session -> server-side device resolution (PostgreSQL RPC) ->
// only approved + active accounts render the wrapped application. Every state
// shown here is derived from the database verdict; client state alone can
// never open the workspace.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isDemoAuth, signOutCurrentUser, subscribeToAuth } from '../../lib/auth';
import type { SupabaseUser } from '../../lib/supabase';
import type { AccessGateKind, DeviceAccessPayload, UserRole } from '../../lib/device-access';
import { gateKindFromPayload } from '../../lib/device-access';
import { bootstrapFirstAdmin, checkDeviceAccess, systemHasAdmin } from '../../lib/device-api';
import {
  AdminRequiredPanel,
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

export default function AccessGate({ children, requireAdmin = false }: AccessGateProps) {
  const demoMode = useMemo(() => isDemoAuth(), []);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [payload, setPayload] = useState<DeviceAccessPayload | null>(null);
  const [gate, setGate] = useState<AccessGateKind | null>(null);
  const [checking, setChecking] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  // Server verdict refresh without any synchronous spinner state (safe to call
  // from effects; the database RPC is the only source of truth).
  const revalidate = useCallback(async () => {
    if (demoMode) return;
    const result = await checkDeviceAccess();
    setPayload(result);
    setGate(gateKindFromPayload(result));
  }, [demoMode]);

  // User-initiated re-check with busy indicator.
  const refresh = async (showSpinner = false) => {
    if (demoMode) return;
    if (showSpinner) setChecking(true);
    try {
      await revalidate();
    } finally {
      if (showSpinner) setChecking(false);
    }
  };

  // Session subscription.
  useEffect(() => {
    if (demoMode) return undefined;
    return subscribeToAuth((next) => {
      setUser(next);
      setAuthReady(true);
      if (next === null) {
        setPayload(null);
        setGate('login');
      }
    });
  }, [demoMode]);

  // Resolve device access whenever the session changes.
  useEffect(() => {
    if (demoMode) return;
    if (!authReady || !user) return;
    void Promise.resolve().then(() => void revalidate());
  }, [authReady, demoMode, user, revalidate]);

  // Revalidate periodically and on tab focus while approved, so a revocation
  // or disabled account takes effect without waiting for the next login.
  useEffect(() => {
    if (demoMode || gate !== 'approved') return undefined;
    const timer = window.setInterval(() => void revalidate(), REVALIDATE_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
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
    setGate('login');
    setLoginBusy(false);
  }, []);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const result = await bootstrapFirstAdmin();
      if (result.ok) {
        await refresh(true);
      }
    } finally {
      setBootstrapping(false);
    }
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

  // Not ready yet (SSR / first paint).
  if (gate === null || !authReady) {
    return (
      <div className="gate-page">
        <LoadingView />
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

    case 'pending':
      return (
        <div className="gate-page">
          <StatusPanel
            tone="pending"
            email={user?.email}
            deviceName={payload?.deviceName}
            deviceId={payload?.deviceId}
            busy={checking}
            onCheck={() => void refresh(true)}
            checkLabel="Check approval status"
            onLogout={() => void handleLogout()}
          >
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
                  administrator and this device is approved automatically. Complete this before
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
          <StatusPanel tone="revoked" email={user?.email} deviceName={payload?.deviceName} busy={checking} onLogout={() => void handleLogout()} />
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
            message={payload?.error ?? 'The server could not verify this device. Try again.'}
            onRetry={() => void refresh(true)}
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
