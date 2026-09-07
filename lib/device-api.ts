// Thin client for the device-bound SECURITY DEFINER RPC surface.
//
// Authorization is ALWAYS re-verified by PostgreSQL inside each RPC. This
// module only ships the current device token and renders the database verdict.

import {
  ensureDeviceIdentity,
  describeCurrentDevice,
  normalizeDeviceAccessPayload,
  type DeviceAccessPayload,
  type DeviceStatus,
  type UserRole,
  type AccountStatus,
} from './device-access';
import { isDemoMode, requireSupabase } from './supabase';

export type AdminDeviceAction = 'approve' | 'reject' | 'revoke' | 'pending';

export type RpcResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface AdminCounts {
  pending: number;
  approved: number;
  rejected: number;
  revoked: number;
  users: number;
  disabledUsers: number;
}

export interface AdminDeviceRecord {
  id: string;
  userId: string;
  email: string | null;
  role: UserRole | null;
  userStatus: AccountStatus | null;
  deviceIdentifier: string | null;
  deviceName: string;
  browser: string | null;
  operatingSystem: string | null;
  userAgent: string | null;
  status: DeviceStatus;
  registeredAt: string | null;
  lastSeenAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
  rejectedAt: string | null;
  revokedAt: string | null;
}

export interface AdminUserRecord {
  id: string;
  email: string | null;
  role: UserRole | null;
  status: AccountStatus | null;
  createdAt: string | null;
  totalDevices: number;
  approvedDevices: number;
  pendingDevices: number;
}

export interface AdminActionResult {
  status: string;
  action?: string;
}

const SCHEMA_NOT_PROVISIONED_HINT =
  'Device approval is not provisioned. Run supabase/schema.sql in the Supabase SQL editor.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function pickNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function friendlyRpcError(error: unknown): string {
  if (!error) return 'Unexpected server error.';
  if (error instanceof Error) {
    if (/Could not find the function|PGRST202|function .* does not exist/i.test(error.message)) {
      return SCHEMA_NOT_PROVISIONED_HINT;
    }
    return error.message;
  }
  return typeof error === 'string' && error.length > 0 ? error : 'Unexpected server error.';
}

function currentToken(): string {
  return ensureDeviceIdentity().token;
}

// ---------------------------------------------------------------------------
// Session-backed device check (login-time / revalidation)
// ---------------------------------------------------------------------------

/**
 * Asks the database to resolve this browser device for the signed-in user.
 * The database registers a pending row for unknown devices and returns the
 * authoritative status. Never trust client state to pre-empt this call.
 */
export async function checkDeviceAccess(): Promise<DeviceAccessPayload> {
  if (isDemoMode) return { ok: false, error: 'demo' };
  const supabase = requireSupabase();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    return { ok: false, error: 'unauthenticated' };
  }

  const identity = ensureDeviceIdentity();
  const meta = describeCurrentDevice();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  const { data, error } = await supabase.rpc('get_device_access', {
    p_token: identity.token,
    p_device_id: identity.deviceId,
    p_device_name: meta.label,
    p_user_agent: userAgent,
    p_browser: meta.browser,
    p_operating_system: meta.os,
  });

  if (error) {
    return { ok: false, error: friendlyRpcError(error) };
  }
  return normalizeDeviceAccessPayload(data);
}

export async function systemHasAdmin(): Promise<boolean> {
  if (isDemoMode) return true;
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('system_admin_exists');
  if (error) return false;
  return data === true;
}

/** First-administrator bootstrap. Approves the caller device in the database. */
export async function bootstrapFirstAdmin(): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administrators.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('become_first_admin', {
    p_token: currentToken(),
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  return { ok: true, data: (data ?? {}) as AdminActionResult };
}

// ---------------------------------------------------------------------------
// Admin RPCs — each requires an approved device AND the admin role in the DB
// ---------------------------------------------------------------------------

export async function fetchAdminCounts(): Promise<RpcResult<AdminCounts>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_counts', { p_token: currentToken() });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  return {
    ok: true,
    data: {
      pending: pickNumber(record, 'pending'),
      approved: pickNumber(record, 'approved'),
      rejected: pickNumber(record, 'rejected'),
      revoked: pickNumber(record, 'revoked'),
      users: pickNumber(record, 'users'),
      disabledUsers: pickNumber(record, 'disabled_users'),
    },
  };
}

export async function fetchAdminDevices(): Promise<RpcResult<AdminDeviceRecord[]>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_list_devices', { p_token: currentToken() });
  if (error) return { ok: false, message: friendlyRpcError(error) };

  const rows = Array.isArray(data) ? data : [];
  const devices: AdminDeviceRecord[] = rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    const status = row.status;
    if (status !== 'pending' && status !== 'approved' && status !== 'rejected' && status !== 'revoked') {
      return [];
    }
    const role = row.role === 'admin' ? 'admin' : row.role === 'user' ? 'user' : null;
    const userStatus = row.user_status === 'disabled' ? 'disabled' : 'active';
    return [
      {
        id: pickString(row, 'id') ?? '',
        userId: pickString(row, 'user_id') ?? '',
        email: pickString(row, 'email'),
        role,
        userStatus,
        deviceIdentifier: pickString(row, 'device_id'),
        deviceName: pickString(row, 'device_name') ?? 'Unknown device',
        browser: pickString(row, 'browser'),
        operatingSystem: pickString(row, 'operating_system'),
        userAgent: pickString(row, 'user_agent'),
        status,
        registeredAt: pickString(row, 'registered_at'),
        lastSeenAt: pickString(row, 'last_seen_at'),
        approvedAt: pickString(row, 'approved_at'),
        approvedByEmail: pickString(row, 'approved_by_email'),
        rejectedAt: pickString(row, 'rejected_at'),
        revokedAt: pickString(row, 'revoked_at'),
      },
    ];
  });
  return { ok: true, data: devices };
}

export async function fetchAdminUsers(): Promise<RpcResult<AdminUserRecord[]>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_list_users', { p_token: currentToken() });
  if (error) return { ok: false, message: friendlyRpcError(error) };

  const rows = Array.isArray(data) ? data : [];
  const users: AdminUserRecord[] = rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    return [
      {
        id: pickString(row, 'id') ?? '',
        email: pickString(row, 'email'),
        role: row.role === 'admin' ? 'admin' : row.role === 'user' ? 'user' : null,
        status: row.status === 'disabled' ? 'disabled' : 'active',
        createdAt: pickString(row, 'created_at'),
        totalDevices: pickNumber(row, 'total_devices'),
        approvedDevices: pickNumber(row, 'approved_devices'),
        pendingDevices: pickNumber(row, 'pending_devices'),
      },
    ];
  });
  return { ok: true, data: users };
}

export async function performAdminDeviceAction(
  deviceId: string,
  action: AdminDeviceAction
): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_device_action', {
    p_token: currentToken(),
    p_device_id: deviceId,
    p_action: action,
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  return {
    ok: true,
    data: {
      status: pickString(record, 'status') ?? 'unknown',
      action: pickString(record, 'action') ?? undefined,
    },
  };
}

export async function performAdminSetUserStatus(
  userId: string,
  status: 'active' | 'disabled'
): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_set_user_status', {
    p_token: currentToken(),
    p_user_id: userId,
    p_status: status,
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  return {
    ok: true,
    data: { status: pickString(record, 'status') ?? status },
  };
}

export async function fetchAdminSettings(): Promise<RpcResult<Record<string, string>>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_get_settings', { p_token: currentToken() });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  if (!isRecord(data)) return { ok: true, data: {} };
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    settings[key] = typeof value === 'string' ? value : String(value);
  }
  return { ok: true, data: settings };
}

export async function performAdminSetMaxDevices(value: string): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_set_max_devices', {
    p_token: currentToken(),
    p_value: value,
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  return {
    ok: true,
    data: { status: pickString(record, 'value') ?? value },
  };
}
