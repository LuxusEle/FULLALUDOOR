// Device identity, metadata and access-state normalization for the
// admin-approved device-bound authentication system.
//
// IMPORTANT SECURITY PROPERTY
// ---------------------------
// The functions here never decide authorization on their own. They produce a
// *presentation* state from a verdict that is computed in PostgreSQL by the
// SECURITY DEFINER RPCs (see lib/device-api.ts). A user who edits this code,
// localStorage or React state cannot grant themselves access: every protected
// operation re-checks the approved device + active account inside the database.

export type DeviceStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export type AccountStatus = 'active' | 'disabled';

export type UserRole = 'admin' | 'user';

export type DeviceAccessStatus =
  | DeviceStatus
  | 'account_disabled'
  | 'missing_device_token'
  | 'agent_required'
  | 'not_registered'
  | 'invalid_proof'
  | 're_enrollment_required'
  | 'unauthenticated';

export type BindingModeLike = 'hybrid_windows' | 'browser_legacy';

/**
 * Normalized result returned by the database after a login-time device check.
 * Client state can never make this report an approval the database did not
 * issue.
 */
export interface DeviceAccessPayload {
  ok: boolean;
  status?: DeviceAccessStatus;
  role?: UserRole | null;
  deviceId?: string | null;
  deviceName?: string | null;
  registeredAt?: string | null;
  accountStatus?: AccountStatus | null;
  bindingMode?: BindingModeLike | null;
  deviceKind?: 'windows_agent' | 'browser' | null;
  attestationStatus?: string | null;
  lastAttestedAt?: string | null;
  /** Server-declared password-only access for an ACTIVE administrator. */
  adminAccess?: boolean;
  error?: string | null;
}

/**
 * Stable, serializable identity persisted in this browser.
 *
 * LEGACY LAYER — under the default hybrid_windows binding mode this identity
 * is NOT used for authorization. It is retained as the explicit
 * browser_legacy compatibility path only.
 */
export interface DeviceIdentity {
  deviceId: string;
  token: string;
  createdAt: string;
}

/** Browser + operating-system description derived from the user agent. */
export interface DeviceMetadata {
  browser: string;
  os: string;
  label: string;
}

export const DEVICE_IDENTITY_STORAGE_KEY = 'fullaludoor.device-identity.v1';

/**
 * Storage key for the *server-approved binding mode of the last access check*.
 * Stored so the UI can render the correct screen before the next network round
 * trip, but the database is always re-consulted before any authorization.
 */
export const DEVICE_BINDING_MODE_STORAGE_KEY = 'fullaludoor.binding-mode.v1';

// ---------------------------------------------------------------------------
// Secure random generation (Web Crypto; never Math.random for secrets)
// ---------------------------------------------------------------------------

function randomBytes(count: number): Uint8Array {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.getRandomValues !== 'function') {
    throw new Error('A secure random source is required to create a device identity.');
  }
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Cryptographically random, URL-safe 32-byte token (256 bits). */
export function generateDeviceToken(): string {
  return bytesToBase64Url(randomBytes(32));
}

function uuidV4FromBytes(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  hex[12] = (parseInt(hex[12], 16) & 0x0f | 0x40).toString(16);
  hex[16] = (parseInt(hex[16], 16) & 0x3f | 0x80).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

export function generateDeviceId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return uuidV4FromBytes(randomBytes(16));
}

export function createDeviceIdentity(): DeviceIdentity {
  return {
    deviceId: generateDeviceId(),
    token: generateDeviceToken(),
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Persistence (browser only; safe no-op elsewhere)
// ---------------------------------------------------------------------------

function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.deviceId === 'string' &&
    record.deviceId.length > 0 &&
    typeof record.token === 'string' &&
    record.token.length >= 20 &&
    typeof record.createdAt === 'string'
  );
}

function readStorage(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(DEVICE_IDENTITY_STORAGE_KEY);
}

function writeStorage(value: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DEVICE_IDENTITY_STORAGE_KEY, value);
}

/** Returns the stored identity when present and well formed. */
export function loadDeviceIdentity(): DeviceIdentity | null {
  const raw = readStorage();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isDeviceIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Returns the stored identity or creates + persists a fresh cryptographically
 * random one. Creating an identity never approves anything.
 */
export function ensureDeviceIdentity(): DeviceIdentity {
  const existing = loadDeviceIdentity();
  if (existing) return existing;
  const created = createDeviceIdentity();
  writeStorage(JSON.stringify(created));
  return created;
}

/** Clears only the device identity (used by tests / explicit user action). */
export function clearDeviceIdentity(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DEVICE_IDENTITY_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// User-agent based device metadata (display only; never an approval signal)
// ---------------------------------------------------------------------------

function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Google Chrome';
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Mozilla Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Web browser';
}

function detectOs(userAgent: string, platform: string): string {
  if (/Windows NT 10/.test(userAgent)) return 'Windows 10/11';
  if (/Windows NT 6\./.test(userAgent)) return 'Windows';
  if (/iPhone/.test(userAgent)) return 'iOS (iPhone)';
  if (/iPad/.test(userAgent)) return 'iOS (iPad)';
  if (/Android/.test(userAgent)) return 'Android';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  if (/Win/i.test(platform)) return 'Windows';
  if (/Mac/i.test(platform)) return 'macOS';
  if (/Linux/i.test(platform)) return 'Linux';
  return '';
}

export function describeDevice(userAgent: string, platform = ''): DeviceMetadata {
  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent, platform);
  const label = [browser, os].filter(Boolean).join(' on ');
  return { browser, os, label };
}

/** Builds metadata from the current browser context (client only). */
export function describeCurrentDevice(): DeviceMetadata {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
  return describeDevice(userAgent, platform);
}

// ---------------------------------------------------------------------------
// Normalizing + presentation mapping (pure; unit-tested)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isDeviceStatus(value: unknown): value is DeviceStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected' || value === 'revoked';
}

function isRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'user';
}

function isAccessStatus(value: unknown): value is Exclude<DeviceAccessStatus, DeviceStatus> {
  return (
    value === 'account_disabled' ||
    value === 'missing_device_token' ||
    value === 'agent_required' ||
    value === 'not_registered' ||
    value === 'invalid_proof' ||
    value === 're_enrollment_required' ||
    value === 'unauthenticated'
  );
}

function isBindingMode(value: unknown): value is BindingModeLike {
  return value === 'hybrid_windows' || value === 'browser_legacy';
}

function isDeviceKind(value: unknown): value is 'windows_agent' | 'browser' {
  return value === 'windows_agent' || value === 'browser';
}

/** Converts the raw JSON returned by the get_device_access RPC into a typed payload. */
export function normalizeDeviceAccessPayload(payload: unknown): DeviceAccessPayload {
  if (!isRecord(payload)) {
    return { ok: false, error: 'invalid_server_response' };
  }

  const ok = payload.ok === true;
  const error = asString(payload.error);

  const rawStatus = asString(payload.status);
  const status: DeviceAccessStatus | undefined =
    isDeviceStatus(rawStatus) || isAccessStatus(rawStatus)
      ? (rawStatus as DeviceAccessStatus)
      : undefined;

  const rawRole = payload.role;
  const role = isRole(rawRole) ? rawRole : null;

  return {
    ok,
    status,
    role,
    deviceId: asString(payload.device_id),
    deviceName: asString(payload.device_name),
    registeredAt: asString(payload.registered_at),
    accountStatus: payload.account_status === 'disabled' ? 'disabled' : 'active',
    bindingMode: isBindingMode(payload.binding_mode) ? payload.binding_mode : null,
    deviceKind: isDeviceKind(payload.device_kind) ? payload.device_kind : null,
    attestationStatus: asString(payload.device_attestation_status),
    lastAttestedAt: asString(payload.last_attested_at),
    adminAccess: payload.admin_access === true,
    error,
  };
}

/**
 * Pure projection of a server verdict to the gate state the UI renders.
 * Client-side state can never make this return 'approved'.
 */
export function gateKindFromPayload(payload: DeviceAccessPayload): AccessGateKind {
  if (!payload.ok) {
    if (payload.error === 'unauthenticated') return 'login';
    return 'error';
  }
  switch (payload.status) {
    case 'approved':
      return 'approved';
    case 'pending':
      return 'pending';
    case 'rejected':
      return 'denied';
    case 'revoked':
      return 'revoked';
    case 're_enrollment_required':
      return 'revoked';
    case 'account_disabled':
      return 'disabled';
    case 'agent_required':
      return 'agent_required';
    case 'invalid_proof':
      return 'error';
    case 'not_registered':
      return 'pending';
    default:
      return payload.error === 'missing_device_token' ? 'error' : 'login';
  }
}

export type AccessGateKind =
  | 'login'
  | 'approved'
  | 'pending'
  | 'denied'
  | 'revoked'
  | 'disabled'
  | 'agent_required'
  | 'unsupported'
  | 'error';

/** True when the server placed this session under the hybrid Windows policy. */
export function isHybridWindowsPayload(payload: DeviceAccessPayload | null): boolean {
  if (!payload) return false;
  if (payload.bindingMode) return payload.bindingMode === 'hybrid_windows';
  return false;
}

/**
 * True ONLY when the database issued an admin password-only verdict
 * (status='approved', role='admin' AND admin_access=true). This flag is set
 * server-side by get_device_access from profiles.role/status — it is never
 * derived from local state, so a browser cannot claim it.
 */
export function isAdminBypassAccess(payload: DeviceAccessPayload | null): boolean {
  if (!payload?.ok) return false;
  return payload.status === 'approved' && payload.role === 'admin' && payload.adminAccess === true;
}

// ---------------------------------------------------------------------------
// Status transition rules — mirrors the admin_device_action RPC so the UI and
// the automated tests always agree with the server-enforced behaviour.
// ---------------------------------------------------------------------------

export type DeviceTransition = 'approve' | 'reject' | 'revoke' | 'pending';

export const DEVICE_TRANSITIONS: readonly DeviceTransition[] = ['approve', 'reject', 'revoke', 'pending'];

export function canTransitionDevice(status: DeviceStatus, action: DeviceTransition): boolean {
  switch (action) {
    case 'approve':
      return status === 'pending' || status === 'rejected' || status === 'revoked';
    case 'reject':
      return status === 'pending';
    case 'revoke':
      return status === 'approved';
    case 'pending':
      return status === 'rejected' || status === 'revoked';
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Windows-agent device transitions. 'reenroll' invalidates the stored public
// key server-side so the agent must generate a fresh identity/key pair.
// ---------------------------------------------------------------------------

export type WindowsDeviceAction = 'approve' | 'reject' | 'revoke' | 'pending' | 'reenroll';

export function canActOnWindowsDevice(status: DeviceStatus, action: WindowsDeviceAction): boolean {
  if (action === 'reenroll') {
    // Re-enrollment is offered for any Windows agent device the admin may want
    // to invalidate (approved, or already revoked/pending/rejected).
    return true;
  }
  return canTransitionDevice(status, action);
}

export function attestationStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'attested':
      return 'Attested';
    case 'enrolled':
      return 'Enrolled (key stored)';
    case 'failed':
      return 'Failed';
    case 're_enrollment_required':
      return 'Re-enrollment required';
    case 'none':
      return 'None';
    default:
      return '—';
  }
}
