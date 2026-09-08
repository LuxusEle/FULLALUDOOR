// Thin client for the device-bound SECURITY DEFINER RPC surface.
//
// Authorization is ALWAYS re-verified by PostgreSQL inside each RPC. This
// module only ships credentials + Windows agent proof to the server and
// renders the database verdict. Nothing here can approve a device or grant a
// role.
//
// Credential model:
//   * hybrid_windows (default production) - protected RPCs present the native
//     Windows agent device_id and must have a fresh server-side attestation
//     (last_attested_at) for that device. The browser token is never used for
//     authorization in this mode.
//   * browser_legacy - explicit operator-chosen compatibility mode using the
//     legacy per-browser token hash.

import {
  ensureDeviceIdentity,
  describeCurrentDevice,
  normalizeDeviceAccessPayload,
  type DeviceAccessPayload,
  type DeviceStatus,
  type UserRole,
  type AccountStatus,
  type BindingModeLike,
} from './device-access';
import { isDemoMode, requireSupabase } from './supabase';
import type { DeviceAgentInfo, SignedDeviceChallenge } from './device-agent-client';
import { requestAgentSignature } from './device-agent-client';
import {
  buildAttestationMessage,
  createAttestationState,
  needsFreshAttestation,
  recordAttestationStart,
  recordAttestationSuccess,
} from './device-attestation';
import {
  DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS,
  resolveDeviceBindingMode,
} from './device-config';

export type AdminDeviceAction = 'approve' | 'reject' | 'revoke' | 'pending' | 'reenroll';

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
  deviceKind: 'windows_agent' | 'browser' | null;
  browser: string | null;
  operatingSystem: string | null;
  userAgent: string | null;
  platform: string | null;
  osVersion: string | null;
  agentVersion: string | null;
  deviceKeyAlgorithm: string | null;
  devicePublicKey: string | null;
  deviceAttestationStatus: string | null;
  detectedBrowsers: string[];
  status: DeviceStatus;
  registeredAt: string | null;
  lastSeenAt: string | null;
  lastAttestedAt: string | null;
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

export interface AdminSettings {
  max_approved_devices?: string;
  device_binding_mode?: string;
  device_agent_min_version?: string;
  device_challenge_ttl_seconds?: string;
}

export interface IssuedChallenge {
  challengeId: string;
  nonce: string;
  message: string;
  ttlSeconds: number;
  expiresAt: string;
}

export type ActiveBindingMode = BindingModeLike | 'demo';

const SCHEMA_NOT_PROVISIONED_HINT =
  'Device approval is not provisioned. Run supabase/schema.sql in the Supabase SQL editor.';

// ---------------------------------------------------------------------------
// Runtime session binding (module-local; re-established on every page load by
// checkDeviceAccess). The database remains authoritative at all times.
// ---------------------------------------------------------------------------

interface SessionBinding {
  mode: ActiveBindingMode;
  agentInfo: DeviceAgentInfo | null;
  ttlMs: number;
  attestation: ReturnType<typeof createAttestationState>;
}

const EMPTY_BINDING: SessionBinding = {
  mode: 'demo',
  agentInfo: null,
  ttlMs: DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS * 1000,
  attestation: createAttestationState(DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS * 1000),
};

let session = EMPTY_BINDING;

/**
 * Last role the DATABASE reported for the signed-in user (from get_device_access
 * / verify_device_attestation). Used only to decide whether protected RPCs need
 * a Windows agent proof; the database still re-checks is_admin() on every call,
 * so a stale client-side value can never grant admin access.
 */
let sessionRole: 'admin' | 'user' | null = null;

export function currentBindingMode(): ActiveBindingMode {
  return session.mode;
}

export function cachedWindowsAgent(): DeviceAgentInfo | null {
  return session.agentInfo;
}

export function currentTtlSeconds(): number {
  return Math.round(session.ttlMs / 1000);
}

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

/**
 * Pulls a readable message out of any error shape returned by the Supabase
 * client. PostgrestError extends Error, but bundled builds can surface plain
 * objects, so this never relies on `instanceof`.
 */
function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : '';
    const hint = typeof record.hint === 'string' ? record.hint : '';
    const details = typeof record.details === 'string' ? record.details : '';
    const code = typeof record.code === 'string' ? record.code : '';
    return message || hint || details || code;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : '';
  } catch {
    return '';
  }
}

const KNOWN_RPC_ERRORS: Array<[RegExp, string]> = [
  [/Could not find the function|PGRST202|function .* does not exist/i, SCHEMA_NOT_PROVISIONED_HINT],
  [/relation .* does not exist|42P01/i, SCHEMA_NOT_PROVISIONED_HINT],
  [/permission denied|42501/i, 'The database rejected this request due to insufficient privileges. Contact your administrator.'],
  [/DEVICE_BINDING_MODE_NOT_HYBRID/i, 'This deployment is configured for legacy browser binding. The Windows agent flow is not active.'],
  [/DEVICE_AGENT_REQUIRED/i, 'The Windows Device Agent is required to continue. Install it and retry.'],
  [/DEVICE_PROOF_STALE/i, 'This Windows device proof expired. Retry to reconnect with the device agent.'],
  [/DEVICE_VERIFIER_UNAVAILABLE/i, 'The database cannot verify device proofs (pgsodium extension unavailable). Contact your administrator.'],
];

function friendlyRpcError(error: unknown): string {
  const text = errorText(error);
  if (!text) return 'Unexpected server error.';
  for (const [pattern, friendly] of KNOWN_RPC_ERRORS) {
    if (pattern.test(text)) return friendly;
  }
  return text;
}

function currentToken(): string {
  return ensureDeviceIdentity().token;
}

function currentDeviceMeta() {
  const meta = describeCurrentDevice();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return { meta, userAgent };
}

function rememberAgent(info: DeviceAgentInfo | null, ttlSeconds: number): void {
  const ttlMs = (ttlSeconds > 0 ? ttlSeconds : DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS) * 1000;
  session = {
    ...session,
    agentInfo: info,
    ttlMs,
    attestation: {
      ...session.attestation,
      deviceId: info?.deviceId ?? null,
      ttlMs,
    },
  };
}

// ---------------------------------------------------------------------------
// Server verdict helpers
// ---------------------------------------------------------------------------

function inferBinding(payload: DeviceAccessPayload): ActiveBindingMode {
  if (payload.bindingMode) return payload.bindingMode;
  return resolveDeviceBindingMode();
}

// ---------------------------------------------------------------------------
// Session-backed device check (login-time / revalidation)
// ---------------------------------------------------------------------------

export interface AgentProbeInput {
  info?: DeviceAgentInfo | null;
  ttlSeconds?: number;
}

function accessRpcArgs(info: DeviceAgentInfo | null) {
  const { meta, userAgent } = currentDeviceMeta();
  const token = currentToken();
  // Prefer the server-confirmed binding mode; fall back to the env default the
  // first time (session.mode starts as 'demo' before any server response).
  const useHybridShape =
    session.mode === 'hybrid_windows'
      ? true
      : session.mode === 'browser_legacy'
        ? false
        : resolveDeviceBindingMode() === 'hybrid_windows';
  const deviceId = useHybridShape && info ? info.deviceId : null;
  return {
    p_token: token,
    p_device_id: deviceId,
    p_device_name: info?.deviceName ?? meta.label,
    p_user_agent: userAgent,
    p_browser: meta.browser,
    p_operating_system: meta.os,
    p_public_key: useHybridShape && info ? info.publicKey : null,
    p_key_algorithm: useHybridShape && info ? info.keyAlgorithm : null,
    p_agent_version: useHybridShape && info ? info.agentVersion : null,
    p_platform: useHybridShape && info ? info.platform : null,
    p_os_version: useHybridShape && info ? info.osVersion : null,
  };
}

/**
 * Asks the database to resolve the current device for the signed-in user.
 * In hybrid_windows the server registers/returns a windows_agent enrollment
 * keyed by the native agent device_id. In browser_legacy it resolves the
 * per-browser token. The database always returns the authoritative status.
 */
export async function checkDeviceAccess(probe?: AgentProbeInput): Promise<DeviceAccessPayload> {
  if (isDemoMode) return { ok: false, error: 'demo' };
  const supabase = requireSupabase();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    return { ok: false, error: 'unauthenticated' };
  }

  const info = probe?.info !== undefined ? probe.info : session.agentInfo;
  const ttl = probe?.ttlSeconds ?? currentTtlSeconds();
  const { data, error } = await supabase.rpc('get_device_access', accessRpcArgs(info));

  if (error) {
    return { ok: false, error: friendlyRpcError(error) };
  }
  const payload = normalizeDeviceAccessPayload(data);
  session = { ...session, mode: inferBinding(payload) };
  if (payload.status === 'account_disabled') {
    sessionRole = null;
  } else if (payload.role === 'admin' || payload.role === 'user') {
    sessionRole = payload.role;
  }
  if (info) rememberAgent(info, ttl);
  return payload;
}

// ---------------------------------------------------------------------------
// Challenge/response attestation
// ---------------------------------------------------------------------------

export async function issueDeviceChallenge(deviceId: string): Promise<RpcResult<IssuedChallenge>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no device attestation.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('device_issue_challenge', { p_device_id: deviceId });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  const challengeId = pickString(record, 'challenge_id');
  const nonce = pickString(record, 'nonce');
  const message = pickString(record, 'message');
  if (!challengeId || !nonce || !message) {
    return { ok: false, message: 'The server issued an invalid challenge.' };
  }
  const ttl = Number(record.ttl_seconds ?? DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS) || DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS;
  return {
    ok: true,
    data: {
      challengeId,
      nonce,
      message,
      ttlSeconds: ttl,
      expiresAt: pickString(record, 'expires_at') ?? '',
    },
  };
}

/**
 * Verifies a challenge signature with the server. On success the database marks
 * the challenge consumed, records the attestation and returns the verdict.
 * Pass the exact `challenge` string the agent signed.
 */
export async function verifyDeviceAttestation(
  agent: DeviceAgentInfo,
  challengeId: string,
  challenge: string,
  signature: string
): Promise<DeviceAccessPayload> {
  if (isDemoMode) return { ok: false, error: 'demo' };
  const supabase = requireSupabase();
  const { meta, userAgent } = currentDeviceMeta();
  const { data, error } = await supabase.rpc('verify_device_attestation', {
    p_challenge_id: challengeId,
    p_device_id: agent.deviceId,
    p_signature: signature,
    p_browser: meta.browser,
    p_user_agent: userAgent,
    p_os_version: agent.osVersion || null,
  });
  if (error) return { ok: false, error: friendlyRpcError(error) };
  return normalizeDeviceAccessPayload(data);
}

export interface AttestOutcome {
  ok: boolean;
  verdict?: string;
  error?: string;
}

/**
 * Full attestation round-trip: server challenge -> agent signature -> server
 * verification. Used by the gate right after an 'approved' verdict and by the
 * protected-RPC guard whenever the local proof becomes stale.
 */
export async function attestWindowsDevice(
  agent: DeviceAgentInfo,
  sign: (challenge: string) => Promise<SignedDeviceChallenge>
): Promise<AttestOutcome> {
  session.attestation = recordAttestationStart(session.attestation);
  try {
    const challenge = await issueDeviceChallenge(agent.deviceId);
    if (!challenge.ok) return { ok: false, error: challenge.message };

    // Defensive re-derivation: only ever sign the canonical message string.
    let message: string;
    try {
      message = buildAttestationMessage(agent.deviceId, challenge.data.challengeId, challenge.data.nonce);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Invalid challenge.' };
    }
    if (challenge.data.message !== message) {
      // The server and this client must agree on the canonical message.
      return { ok: false, error: 'The server challenge could not be validated.' };
    }

    const signed = await sign(message);
    if (signed.deviceId !== agent.deviceId) {
      return { ok: false, error: 'The device agent returned a mismatched device identity.' };
    }
    if (signed.publicKey !== agent.publicKey) {
      return { ok: false, error: 'The device agent returned a mismatched public key.' };
    }

    const verdict = await verifyDeviceAttestation(agent, challenge.data.challengeId, message, signed.signature);
    rememberAgent(agent, challenge.data.ttlSeconds);
    if (!verdict.ok) {
      return { ok: false, error: verdict.error ?? 'The server rejected the device proof.' };
    }
    if (verdict.status !== 'approved') {
      return { ok: false, verdict: verdict.status, error: `Device status is ${verdict.status ?? 'unknown'}.` };
    }

    session.attestation = recordAttestationSuccess(session.attestation, Date.now());
    session.attestation = { ...session.attestation, deviceId: agent.deviceId };
    return { ok: true, verdict: 'approved' };
  } finally {
    session.attestation = { ...session.attestation, inFlight: false };
  }
}

/**
 * Server-side proof freshness guard used before protected data RPCs in
 * hybrid_windows mode. When no valid recent attestation exists it performs one
 * immediately. Throws when no Windows agent proof can be produced so the RPC
 * is never sent with an unverified device.
 */
export async function ensureFreshWindowsProof(
  agent: DeviceAgentInfo | null,
  sign: (challenge: string) => Promise<SignedDeviceChallenge>
): Promise<void> {
  if (session.mode !== 'hybrid_windows') return;
  if (!agent) {
    throw new Error('DEVICE_AGENT_REQUIRED: no Windows device agent is available.');
  }
  if (!needsFreshAttestation(session.attestation)) return;
  if (session.attestation.inFlight) return;

  const outcome = await attestWindowsDevice(agent, sign);
  if (!outcome.ok) {
    throw new Error(outcome.error ?? 'DEVICE_PROOF_UNAVAILABLE');
  }
}

/**
 * Credential that protected (data/admin) RPCs must present. In hybrid_windows
 * this is the Windows agent device_id AND it guarantees a fresh server-side
 * attestation exists before the RPC is sent. In browser_legacy it is the
 * per-browser token. Throws when a required Windows proof cannot be produced,
 * so an RPC is never sent unverified.
 */
export async function protectedRpcCredential(): Promise<string> {
  const mode = session.mode === 'demo' ? resolveDeviceBindingMode() : session.mode;
  if (mode === 'hybrid_windows') {
    // Active admins authenticate with email + password only. The database's
    // assert_device_approved() short-circuits to true for them, so no agent
    // proof is fetched. The credential value is irrelevant for an admin but is
    // still sent (never trusted client-side).
    if (sessionRole === 'admin') {
      return currentToken();
    }
    const agent = session.agentInfo;
    if (!agent) {
      throw new Error('DEVICE_AGENT_REQUIRED: no Windows device agent is available for this session.');
    }
    await ensureFreshWindowsProof(agent, requestAgentSignature);
    return agent.deviceId;
  }
  return currentToken();
}

// ---------------------------------------------------------------------------
// First-administrator bootstrap
// ---------------------------------------------------------------------------

export async function systemHasAdmin(): Promise<boolean> {
  if (isDemoMode) return true;
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('system_admin_exists');
  if (error) return false;
  return data === true;
}

/** First-administrator bootstrap. Approves the caller's device in the database. */
export async function bootstrapFirstAdmin(agent?: DeviceAgentInfo | null): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administrators.' };
  const supabase = requireSupabase();
  const { meta, userAgent } = currentDeviceMeta();
  const useHybrid = resolveDeviceBindingMode() === 'hybrid_windows';
  const { data, error } = await supabase.rpc('become_first_admin', {
    p_token: currentToken(),
    p_device_id: useHybrid && agent ? agent.deviceId : null,
    p_public_key: useHybrid && agent ? agent.publicKey : null,
    p_key_algorithm: useHybrid && agent ? agent.keyAlgorithm : null,
    p_device_name: agent?.deviceName ?? meta.label,
    p_platform: useHybrid && agent ? agent.platform : null,
    p_os_version: useHybrid && agent ? agent.osVersion : null,
    p_agent_version: useHybrid && agent ? agent.agentVersion : null,
    p_browser: meta.browser,
    p_user_agent: userAgent,
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  if (agent) rememberAgent(agent, currentTtlSeconds());
  return {
    ok: true,
    data: {
      status: pickString(record, 'status') ?? 'unknown',
      action: pickString(record, 'action') ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Admin RPCs - each requires an approved device AND the admin role in the DB
// ---------------------------------------------------------------------------

export async function fetchAdminCounts(): Promise<RpcResult<AdminCounts>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_counts', { p_token: await protectedRpcCredential() });
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
  const { data, error } = await supabase.rpc('admin_list_devices', { p_token: await protectedRpcCredential() });
  if (error) return { ok: false, message: friendlyRpcError(error) };

  const rows = Array.isArray(data) ? data : [];
  const devices: AdminDeviceRecord[] = rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    const status = row.status;
    if (status !== 'pending' && status !== 'approved' && status !== 'rejected' && status !== 'revoked') {
      return [];
    }
    const role = row.role === 'admin' ? 'admin' : row.role === 'user' ? 'user' : null;
    const rawUserStatus = pickString(row, 'user_status');
    const userStatus = rawUserStatus === 'disabled' ? 'disabled' : 'active';
    const kind = row.device_kind === 'windows_agent' ? 'windows_agent' : row.device_kind === 'browser' ? 'browser' : null;
    const detected = Array.isArray(row.detected_browsers)
      ? row.detected_browsers.filter((item): item is string => typeof item === 'string')
      : [];
    return [
      {
        id: pickString(row, 'id') ?? '',
        userId: pickString(row, 'user_id') ?? '',
        email: pickString(row, 'email'),
        role,
        userStatus,
        deviceIdentifier: pickString(row, 'device_id'),
        deviceName: pickString(row, 'device_name') ?? 'Unknown device',
        deviceKind: kind,
        browser: pickString(row, 'browser'),
        operatingSystem: pickString(row, 'operating_system'),
        userAgent: pickString(row, 'user_agent'),
        platform: pickString(row, 'platform'),
        osVersion: pickString(row, 'os_version'),
        agentVersion: pickString(row, 'agent_version'),
        deviceKeyAlgorithm: pickString(row, 'device_key_algorithm'),
        devicePublicKey: pickString(row, 'device_public_key'),
        deviceAttestationStatus: pickString(row, 'device_attestation_status'),
        detectedBrowsers: detected,
        status,
        registeredAt: pickString(row, 'registered_at'),
        lastSeenAt: pickString(row, 'last_seen_at'),
        lastAttestedAt: pickString(row, 'last_attested_at'),
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
  const { data, error } = await supabase.rpc('admin_list_users', { p_token: await protectedRpcCredential() });
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
    p_token: await protectedRpcCredential(),
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
    p_token: await protectedRpcCredential(),
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

export async function fetchAdminSettings(): Promise<RpcResult<AdminSettings>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_get_settings', { p_token: await protectedRpcCredential() });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  if (!isRecord(data)) return { ok: true, data: {} };
  const settings: AdminSettings = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') settings[key as keyof AdminSettings] = value;
  }
  return { ok: true, data: settings };
}

export async function performAdminSetMaxDevices(value: string): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_update_setting', {
    p_token: await protectedRpcCredential(),
    p_key: 'max_approved_devices',
    p_value: value,
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  return {
    ok: true,
    data: { status: pickString(record, 'value') ?? value },
  };
}

export async function performAdminSetBindingMode(value: string): Promise<RpcResult<AdminActionResult>> {
  if (isDemoMode) return { ok: false, message: 'Demo mode has no administration.' };
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_update_setting', {
    p_token: await protectedRpcCredential(),
    p_key: 'device_binding_mode',
    p_value: value,
  });
  if (error) return { ok: false, message: friendlyRpcError(error) };
  const record = isRecord(data) ? data : {};
  return {
    ok: true,
    data: { status: pickString(record, 'value') ?? value },
  };
}
