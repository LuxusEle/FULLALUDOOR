'use client';

// Administrator device management. Every action is executed by a SECURITY
// DEFINER RPC in PostgreSQL that re-checks (approved device + admin role) on
// the server; the UI never trusts its own role state to authorize an action.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { canActOnWindowsDevice, attestationStatusLabel } from '../../lib/device-access';
import {
  fetchAdminCounts,
  fetchAdminDevices,
  fetchAdminSettings,
  fetchAdminUsers,
  performAdminDeviceAction,
  performAdminSetBindingMode,
  performAdminSetMaxDevices,
  performAdminSetUserStatus,
  type AdminCounts,
  type AdminDeviceAction,
  type AdminDeviceRecord,
  type AdminUserRecord,
} from '../../lib/device-api';
import { useAccessSession } from '../auth/access-gate';

type DeviceFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'revoked';

interface ConfirmTarget {
  device: AdminDeviceRecord;
  action: Exclude<AdminDeviceAction, 'approve'>;
}

const ACTION_META: Record<string, { label: string; tone: 'approve' | 'reject' | 'revoke' | 'neutral' }> = {
  approve: { label: 'Approve', tone: 'approve' },
  reject: { label: 'Reject', tone: 'reject' },
  revoke: { label: 'Revoke', tone: 'revoke' },
  pending: { label: 'Reopen', tone: 'neutral' },
  reenroll: { label: 'Re-enroll', tone: 'revoke' },
};

const STATUS_CLASS: Record<AdminDeviceRecord['status'], string> = {
  pending: 'admin-status-pending',
  approved: 'admin-status-approved',
  rejected: 'admin-status-rejected',
  revoked: 'admin-status-revoked',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function AdminDevicePanel() {
  const { signOut, signedInEmail } = useAccessSession();
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [devices, setDevices] = useState<AdminDeviceRecord[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [maxDevices, setMaxDevices] = useState('0');
  const [settingsDraft, setSettingsDraft] = useState('0');
  const [bindingMode, setBindingMode] = useState('hybrid_windows');
  const [bindingModeBusy, setBindingModeBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [query, setQuery] = useState('');
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  const refreshAll = useCallback(async () => {
    const [countResult, deviceResult, userResult, settingsResult] = await Promise.all([
      fetchAdminCounts(),
      fetchAdminDevices(),
      fetchAdminUsers(),
      fetchAdminSettings(),
    ]);
    if (!countResult.ok) {
      setError(countResult.message);
      return;
    }
    if (!deviceResult.ok) {
      setError(deviceResult.message);
      return;
    }
    if (!userResult.ok) {
      setError(userResult.message);
      return;
    }
    setCounts(countResult.data);
    setDevices(deviceResult.data);
    setUsers(userResult.data);
    if (settingsResult.ok) {
      setMaxDevices(settingsResult.data.max_approved_devices ?? '0');
      setSettingsDraft(settingsResult.data.max_approved_devices ?? '0');
      const mode = settingsResult.data.device_binding_mode;
      if (mode === 'hybrid_windows' || mode === 'browser_legacy') setBindingMode(mode);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => refreshAll())
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshAll]);

  const applyDeviceAction = async (target: { id: string; action: AdminDeviceAction }) => {
    setBusyDeviceId(target.id);
    setError(null);
    setNotice(null);
    const result = await performAdminDeviceAction(target.id, target.action);
    setBusyDeviceId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(`Device ${ACTION_META[target.action]?.label.toLowerCase() ?? 'updated'}.`);
    void refreshAll();
  };

  const applyUserStatus = async (userId: string, status: 'active' | 'disabled') => {
    setBusyUserId(userId);
    setError(null);
    setNotice(null);
    const result = await performAdminSetUserStatus(userId, status);
    setBusyUserId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(`Account ${status === 'disabled' ? 'disabled' : 'enabled'}.`);
    void refreshAll();
  };

  const saveSettings = async () => {
    if (!/^[0-9]+$/.test(settingsDraft)) {
      setError('Maximum approved devices must be a whole number (0 = unlimited).');
      return;
    }
    setSettingsBusy(true);
    setError(null);
    setNotice(null);
    const result = await performAdminSetMaxDevices(settingsDraft);
    setSettingsBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMaxDevices(result.data.status ?? settingsDraft);
    setNotice('Policy updated.');
  };

  const saveBindingMode = async (next: string) => {
    setBindingModeBusy(true);
    setError(null);
    setNotice(null);
    const result = await performAdminSetBindingMode(next);
    setBindingModeBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBindingMode(result.data.status ?? next);
    setNotice('Device binding mode updated. The change is enforced server-side on the next access check.');
    void refreshAll();
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((device) => {
      if (filter !== 'all' && device.status !== filter) return false;
      if (!q) return true;
      const haystack = [
        device.email,
        device.deviceName,
        device.deviceIdentifier,
        device.browser,
        device.operatingSystem,
        device.userId,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [devices, filter, query]);

  const canAct = (device: AdminDeviceRecord, action: AdminDeviceAction): boolean => {
    if (action === 'reenroll') {
      return device.deviceKind === 'windows_agent';
    }
    return canActOnWindowsDevice(device.status, action);
  };

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#9aa5b1', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}>
          <ArrowLeft size={15} />
          Workspace
        </Link>
        <ShieldCheck size={17} style={{ color: '#fbbf24' }} />
        <span className="admin-title">Device Administration</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#8b96a5', fontSize: 11.5 }}>{signedInEmail}</span>
          <button type="button" className="gate-btn gate-btn-ghost" onClick={() => void handleSignOut()} style={{ width: 'auto', height: 34, padding: '0 14px' }}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-body">
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: 12.5 }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7', fontSize: 12.5 }}>
            {notice}
          </div>
        )}

        <div className="admin-summary-grid">
          <SummaryCard label="Pending devices" value={counts?.pending ?? 0} tone="pending" />
          <SummaryCard label="Approved devices" value={counts?.approved ?? 0} tone="approved" />
          <SummaryCard label="Rejected devices" value={counts?.rejected ?? 0} tone="rejected" />
          <SummaryCard label="Revoked devices" value={counts?.revoked ?? 0} tone="revoked" />
          <SummaryCard label="Accounts" value={counts?.users ?? 0} tone="neutral" />
          <SummaryCard label="Disabled accounts" value={counts?.disabledUsers ?? 0} tone="rejected" />
        </div>

        <div className="admin-panel" style={{ marginBottom: 18 }}>
          <div className="admin-panel-head">
            <div className="admin-filter-tabs">
              {(['all', 'pending', 'approved', 'rejected', 'revoked'] as DeviceFilter[]).map((tab) => (
                <button key={tab} type="button" className={`admin-filter-tab ${filter === tab ? 'active' : ''}`} onClick={() => setFilter(tab)}>
                  {tab === 'all' ? 'All' : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Search size={14} style={{ color: '#6b7683', marginLeft: 4 }} />
              <input
                className="admin-search"
                placeholder="Search user, email, device, ID…"
                aria-label="Search devices"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="button" className="admin-action-btn" onClick={() => void refreshAll()} title="Refresh" style={{ height: 34 }}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="admin-table-wrap">
            {loading ? (
              <div className="admin-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader2 size={16} className="spin" />
                Loading devices…
              </div>
            ) : filtered.length === 0 ? (
              <div className="admin-empty">No devices match this view.</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th aria-label="Details" style={{ width: 30 }} />
                    <th>Kind</th>
                    <th>User</th>
                    <th>Device</th>
                    <th>Browser</th>
                    <th>Platform / OS</th>
                    <th>Agent</th>
                    <th>Attestation</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Last seen</th>
                    <th style={{ width: 170 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      expanded={expandedId === device.id}
                      busy={busyDeviceId === device.id}
                      onToggle={() => setExpandedId(expandedId === device.id ? null : device.id)}
                      onAct={(action) => {
                        if (action === 'reject' || action === 'revoke' || action === 'reenroll') {
                          setConfirm({ device, action });
                          return;
                        }
                        void applyDeviceAction({ id: device.id, action });
                      }}
                      canAct={canAct}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="admin-panel" style={{ marginBottom: 18 }}>
          <div className="admin-panel-head">
            <strong style={{ fontSize: 13 }}>Approval policy</strong>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label htmlFor="admin-max" style={{ color: '#8b96a5', fontSize: 12 }}>Max approved devices per user</label>
              <input
                id="admin-max"
                className="admin-search"
                style={{ width: 90, textAlign: 'center' }}
                value={settingsDraft}
                onChange={(event) => setSettingsDraft(event.target.value)}
                inputMode="numeric"
                aria-label="Maximum approved devices per user"
              />
              <span style={{ color: '#6b7683', fontSize: 11 }}>0 = unlimited</span>
              <button type="button" className="admin-action-btn" onClick={() => void saveSettings()} disabled={settingsBusy} style={{ height: 32 }}>
                {settingsBusy ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                Save policy
              </button>
            </div>
          </div>
          {maxDevices !== '0' && (
            <div style={{ padding: '0 18px 14px', color: '#8b96a5', fontSize: 11.5 }}>
              Each account can hold up to {maxDevices} approved {maxDevices === '1' ? 'device' : 'devices'}. Additional approvals are rejected.
            </div>
          )}
          <div style={{ padding: '14px 18px', borderTop: '1px solid #242b33', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#8b96a5', fontSize: 12 }}>Device binding mode</span>
            <select
              className="admin-search"
              style={{ width: 200 }}
              value={bindingMode}
              disabled={bindingModeBusy}
              aria-label="Device binding mode"
              onChange={(event) => void saveBindingMode(event.target.value)}
            >
              <option value="hybrid_windows">hybrid_windows (default)</option>
              <option value="browser_legacy">browser_legacy (compat)</option>
            </select>
            {bindingModeBusy && <Loader2 size={13} className="spin" />}
            <span style={{ color: '#6b7683', fontSize: 11 }}>
              hybrid_windows requires the native agent + admin approval per Windows computer.
            </span>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <strong style={{ fontSize: 13 }}>Accounts</strong>
            <span style={{ color: '#8b96a5', fontSize: 11.5 }}>Disable an account to block every device immediately (server enforced).</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Approved</th>
                  <th>Pending</th>
                  <th>Joined</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.id}>
                    <td className="admin-cell-main">{account.email ?? account.id}</td>
                    <td>
                      <span className="admin-status-badge" style={account.role === 'admin' ? { color: '#fcd34d', background: 'rgba(245,158,11,0.14)' } : undefined}>
                        {account.role ?? 'user'}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status-badge ${account.status === 'disabled' ? 'admin-status-rejected' : 'admin-status-approved'}`}>
                        {account.status ?? 'active'}
                      </span>
                    </td>
                    <td>{account.approvedDevices}</td>
                    <td>{account.pendingDevices}</td>
                    <td style={{ color: '#8b96a5' }}>{formatDate(account.createdAt)}</td>
                    <td>
                      {account.status === 'disabled' ? (
                        <button type="button" className="admin-action-btn admin-action-approve" onClick={() => void applyUserStatus(account.id, 'active')} disabled={busyUserId === account.id}>
                          {busyUserId === account.id ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                          Enable
                        </button>
                      ) : (
                        <button type="button" className="admin-action-btn admin-action-reject" onClick={() => void applyUserStatus(account.id, 'disabled')} disabled={busyUserId === account.id}>
                          {busyUserId === account.id ? <Loader2 size={13} className="spin" /> : <Ban size={13} />}
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {confirm && (
        <ConfirmDialog
          device={confirm.device}
          action={confirm.action}
          busy={busyDeviceId === confirm.device.id}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const target = confirm;
            setConfirm(null);
            void applyDeviceAction({ id: target.device.id, action: target.action });
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'pending' | 'approved' | 'rejected' | 'revoked' | 'neutral' }) {
  const color =
    tone === 'pending' ? '#fcd34d' : tone === 'approved' ? '#6ee7b7' : tone === 'rejected' || tone === 'revoked' ? '#fca5a5' : '#e6edf3';
  return (
    <div className="admin-summary-card">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>{value}</div>
    </div>
  );
}

interface DeviceRowProps {
  device: AdminDeviceRecord;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onAct: (action: AdminDeviceAction) => void;
  canAct: (device: AdminDeviceRecord, action: AdminDeviceAction) => boolean;
}

function DeviceRow({ device, expanded, busy, onToggle, onAct, canAct }: DeviceRowProps) {
  const isWindows = device.deviceKind === 'windows_agent';
  const actions: AdminDeviceAction[] = isWindows
    ? device.status === 'pending'
      ? ['approve', 'reject', 'reenroll']
      : device.status === 'approved'
        ? ['revoke', 'reenroll']
        : ['approve', 'pending', 'reenroll']
    : device.status === 'pending'
      ? ['approve', 'reject']
      : device.status === 'approved'
        ? ['revoke']
        : device.status === 'rejected'
          ? ['approve', 'pending']
          : ['approve', 'pending'];

  return (
    <>
      <tr>
        <td>
          <button type="button" onClick={onToggle} aria-label="Toggle device details" style={{ background: 'none', border: 'none', color: '#8b96a5', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </td>
        <td>
          <span className={`admin-status-badge ${isWindows ? 'admin-status-pending' : ''}`} style={!isWindows ? { color: '#9aa5b1', background: 'rgba(148,163,184,0.12)' } : undefined}>
            {isWindows ? 'Windows' : 'Browser'}
          </span>
        </td>
        <td>
          <div className="admin-cell-main">{device.email ?? 'Unknown user'}</div>
          {device.userStatus === 'disabled' && <div className="admin-cell-sub">account disabled</div>}
        </td>
        <td>
          <div className="admin-cell-main">{device.deviceName}</div>
          <div className="admin-cell-sub">{device.deviceIdentifier?.slice(0, 8) ?? ''}…</div>
        </td>
        <td>
          {isWindows ? (
            device.detectedBrowsers.length > 0 ? (
              <span className="admin-cell-main">{device.detectedBrowsers.join(', ')}</span>
            ) : (
              <span className="admin-cell-sub">—</span>
            )
          ) : (
            device.browser ?? '—'
          )}
        </td>
        <td>
          {isWindows ? (
            <>
              <div className="admin-cell-main">{device.platform ?? 'Windows'}</div>
              <div className="admin-cell-sub">{device.osVersion ?? device.operatingSystem ?? '—'}</div>
            </>
          ) : (
            device.operatingSystem ?? '—'
          )}
        </td>
        <td>
          {isWindows ? (
            <>
              <div className="admin-cell-main">v{device.agentVersion ?? '?'}</div>
              <div className="admin-cell-sub">{device.deviceKeyAlgorithm ?? '—'}</div>
            </>
          ) : (
            <span className="admin-cell-sub">legacy</span>
          )}
        </td>
        <td>
          {isWindows ? (
            <>
              <span className="admin-cell-main" style={device.deviceAttestationStatus === 'attested' ? { color: '#6ee7b7' } : device.deviceAttestationStatus === 'failed' || device.deviceAttestationStatus === 're_enrollment_required' ? { color: '#fca5a5' } : undefined}>
                {attestationStatusLabel(device.deviceAttestationStatus)}
              </span>
              <div className="admin-cell-sub">{formatDate(device.lastAttestedAt)}</div>
            </>
          ) : (
            <span className="admin-cell-sub">—</span>
          )}
        </td>
        <td>
          <span className={`admin-status-badge ${STATUS_CLASS[device.status]}`}>{device.status}</span>
        </td>
        <td style={{ whiteSpace: 'nowrap', color: '#8b96a5' }}>{formatDate(device.registeredAt)}</td>
        <td style={{ whiteSpace: 'nowrap', color: '#8b96a5' }}>{formatDate(device.lastSeenAt)}</td>
        <td>
          <div style={{ display: 'flex', gap: 5 }}>
            {actions.map((action) => {
              if (!canAct(device, action)) return null;
              const meta = ACTION_META[action];
              const Icon = action === 'approve' ? Check : action === 'reject' ? Ban : action === 'reenroll' ? RotateCcw : RotateCcw;
              return (
                <button
                  key={action}
                  type="button"
                  className={`admin-action-btn ${meta.tone === 'approve' ? 'admin-action-approve' : meta.tone === 'reject' ? 'admin-action-reject' : meta.tone === 'revoke' ? 'admin-action-revoke' : ''}`}
                  onClick={() => onAct(action)}
                  disabled={busy}
                  title={meta.label}
                >
                  {busy ? <Loader2 size={13} className="spin" /> : <Icon size={13} />}
                  {meta.label}
                </button>
              );
            })}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} aria-label="Device details" style={{ background: '#10151b', padding: '12px 18px' }}>
            <div className="admin-detail-grid">
              <div className="row"><span>Device kind</span><span>{isWindows ? 'Windows Device Agent' : 'Legacy browser'}</span></div>
              <div className="row"><span>Device ID</span><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}>{device.deviceIdentifier ?? '—'}</span></div>
              <div className="row"><span>User ID</span><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}>{device.userId}</span></div>
              <div className="row"><span>Platform / OS</span><span>{[device.platform, device.osVersion].filter(Boolean).join(' / ') || device.operatingSystem || '—'}</span></div>
              <div className="row"><span>Agent version</span><span>{device.agentVersion ? `v${device.agentVersion}` : '—'}</span></div>
              <div className="row"><span>Key algorithm</span><span>{device.deviceKeyAlgorithm ?? '—'}</span></div>
              <div className="row"><span>Attestation status</span><span>{attestationStatusLabel(device.deviceAttestationStatus)}</span></div>
              <div className="row"><span>Last attested</span><span>{formatDate(device.lastAttestedAt)}</span></div>
              {isWindows && device.devicePublicKey && (
                <div className="row"><span>Public key</span><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, wordBreak: 'break-all' }}>{device.devicePublicKey}</span></div>
              )}
              <div className="row"><span>User agent</span><span>{device.userAgent ?? '—'}</span></div>
              <div className="row"><span>Registered</span><span>{formatDate(device.registeredAt)}</span></div>
              <div className="row"><span>Last seen</span><span>{formatDate(device.lastSeenAt)}</span></div>
              <div className="row"><span>Approved</span><span>{device.approvedAt ? `${formatDate(device.approvedAt)}${device.approvedByEmail ? ` by ${device.approvedByEmail}` : ''}` : '—'}</span></div>
              <div className="row"><span>Rejected</span><span>{formatDate(device.rejectedAt)}</span></div>
              <div className="row"><span>Revoked</span><span>{formatDate(device.revokedAt)}</span></div>
              {isWindows && (
                <div className="row"><span>Browsers detected</span><span>{device.detectedBrowsers.length ? device.detectedBrowsers.join(', ') : '—'}</span></div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface ConfirmDialogProps {
  device: AdminDeviceRecord;
  action: Exclude<AdminDeviceAction, 'approve'>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ device, action, busy, onCancel, onConfirm }: ConfirmDialogProps) {
  const copy =
    action === 'revoke'
      ? {
          title: 'Revoke this device?',
          body: `The user will immediately lose access from ${device.deviceName}. The server blocks every browser on this Windows device at the next authorization check.`,
          confirmLabel: 'Revoke device',
          tone: 'admin-action-revoke',
        }
      : action === 'reject'
        ? {
            title: 'Reject this device?',
            body: `The pending device ${device.deviceName} will be rejected and cannot access FullAluDoor until approved again.`,
            confirmLabel: 'Reject device',
            tone: 'admin-action-reject',
          }
        : action === 'reenroll'
          ? {
              title: 'Force re-enrollment?',
              body: `The stored public key of ${device.deviceName} will be invalidated and the device revoked. The user must re-enroll the Windows Device Agent (generating a brand new device identity) before access can be approved again.`,
              confirmLabel: 'Force re-enrollment',
              tone: 'admin-action-revoke',
            }
          : {
              title: 'Reopen this device?',
              body: `${device.deviceName} will return to pending review.`,
              confirmLabel: 'Reopen device',
              tone: '',
            };

  return (
    <dialog open aria-label={copy.title} className="admin-confirm-overlay" style={{ border: 'none', background: 'transparent', padding: 0, maxWidth: 'none' }}>
      <div className="admin-confirm-card">
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="gate-btn gate-btn-ghost" onClick={onCancel} disabled={busy} style={{ width: 'auto', height: 36, padding: '0 16px' }}>
            Cancel
          </button>
          <button type="button" className={`admin-action-btn ${copy.tone}`} onClick={onConfirm} disabled={busy} style={{ height: 36, padding: '0 16px' }}>
            {busy ? <Loader2 size={14} className="spin" /> : null}
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
