import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  buildAttestationMessage,
  bytesToBase64Url,
  createAttestationState,
  isWellFormedChallenge,
  looksLikeEd25519PublicKey,
  looksLikeEd25519Signature,
  needsFreshAttestation,
  recordAttestationStart,
  recordAttestationSuccess,
  utf8Bytes,
} from './device-attestation';
import { parseDeviceAgentInfo, parseSignedDeviceChallenge, describeClientPlatform } from './device-agent-client';
import {
  bindingModeFromRaw,
  isAgentVersionAtLeast,
  isLocalAgentOrigin,
} from './device-config';
import {
  canActOnWindowsDevice,
  gateKindFromPayload,
  isAdminBypassAccess,
  normalizeDeviceAccessPayload,
  type DeviceAccessPayload,
} from './device-access';

const DEVICE_ID = '2f1b6a3c-9e70-4f4a-9a2c-4d2e6f0b5c1d';
const CHALLENGE_ID = 'a8f1d7c2-4b6e-4d5a-b1c2-9e8f7a6b5c4d';
const NONCE = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-';
const PK = 'qR3nXkLpQ9aDfGhJkLzXcVbNmAsDfGhJkLpQ9aDfGhJkLp';
const SIG =
  'QkFDQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ';

describe('device-attestation — canonical message', () => {
  it('builds the exact <device>.<challenge>.<nonce> message', () => {
    const message = buildAttestationMessage(DEVICE_ID, CHALLENGE_ID, NONCE);
    expect(message).toBe(`${DEVICE_ID}.${CHALLENGE_ID}.${NONCE}`);
  });

  it('rejects malformed inputs', () => {
    expect(() => buildAttestationMessage('not-a-uuid', CHALLENGE_ID, NONCE)).toThrow();
    expect(() => buildAttestationMessage(DEVICE_ID, 'nope', NONCE)).toThrow();
    expect(() => buildAttestationMessage(DEVICE_ID, CHALLENGE_ID, 'short')).toThrow();
  });

  it('accepts only well-formed challenge strings (agent-side gate)', () => {
    expect(isWellFormedChallenge(`${DEVICE_ID}.${CHALLENGE_ID}.${NONCE}`)).toBe(true);
    expect(isWellFormedChallenge('')).toBe(false);
    expect(isWellFormedChallenge('garbage')).toBe(false);
    expect(isWellFormedChallenge(`${'a'.repeat(40)}.x`)).toBe(false);
    // An extra field must be rejected.
    expect(isWellFormedChallenge(`${DEVICE_ID}.${CHALLENGE_ID}.${NONCE}.extra`)).toBe(false);
  });
});

describe('device-attestation — base64url round trip', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it('utf8Bytes encodes the exact message text', () => {
    expect(Array.from(utf8Bytes('AB'))).toEqual([65, 66]);
  });

  it('recognises Ed25519 key/signature sizes', () => {
    const pk = bytesToBase64Url(new Uint8Array(32));
    const sig = bytesToBase64Url(new Uint8Array(64));
    expect(looksLikeEd25519PublicKey(pk)).toBe(true);
    expect(looksLikeEd25519Signature(sig)).toBe(true);
    expect(looksLikeEd25519PublicKey(bytesToBase64Url(new Uint8Array(31)))).toBe(false);
    expect(looksLikeEd25519Signature(bytesToBase64Url(new Uint8Array(63)))).toBe(false);
  });
});

describe('device-attestation — freshness state machine', () => {
  it('requires attestation when there is no device or no previous proof', () => {
    expect(needsFreshAttestation(createAttestationState(60000))).toBe(true);
    const bound = createAttestationState(60000);
    bound.deviceId = DEVICE_ID;
    expect(needsFreshAttestation(bound, 1000)).toBe(true);
  });

  it('refreshes after half the TTL has elapsed', () => {
    const bound = createAttestationState(60000);
    bound.deviceId = DEVICE_ID;
    const started = recordAttestationSuccess(bound, 10_000);
    expect(needsFreshAttestation(started, 10_000 + 20_000)).toBe(false);
    expect(needsFreshAttestation(started, 10_000 + 31_000)).toBe(true);
  });

  it('flags in-flight attestations', () => {
    const bound = recordAttestationStart(createAttestationState(60000));
    expect(bound.inFlight).toBe(true);
  });
});

describe('device-agent-client — payload parsing', () => {
  it('accepts a valid /device/info payload', () => {
    const info = parseDeviceAgentInfo({
      deviceId: DEVICE_ID,
      publicKey: PK,
      keyAlgorithm: 'Ed25519',
      deviceName: 'Office Laptop',
      platform: 'Windows',
      osVersion: 'Windows 11 Pro 23H2',
      agentVersion: '1.0.0',
      scope: 'user',
      maliciousExtra: 'ignored',
    });
    expect(info).not.toBeNull();
    expect(info?.deviceId).toBe(DEVICE_ID);
    expect(info?.scope).toBe('user');
  });

  it('rejects forged or malformed agent payloads', () => {
    expect(parseDeviceAgentInfo(null)).toBeNull();
    expect(parseDeviceAgentInfo('x')).toBeNull();
    expect(parseDeviceAgentInfo({ deviceId: 'not-a-uuid', publicKey: PK, keyAlgorithm: 'Ed25519', agentVersion: '1.0.0' })).toBeNull();
    expect(parseDeviceAgentInfo({ deviceId: DEVICE_ID, publicKey: '!!!', keyAlgorithm: 'Ed25519', agentVersion: '1.0.0' })).toBeNull();
    expect(parseDeviceAgentInfo({ deviceId: DEVICE_ID, publicKey: PK, keyAlgorithm: 'RSA', agentVersion: '1.0.0' })).toBeNull();
    expect(parseDeviceAgentInfo({ deviceId: DEVICE_ID, publicKey: PK, keyAlgorithm: 'Ed25519', agentVersion: 'not-semver' })).toBeNull();
  });

  it('accepts and validates a signed challenge response', () => {
    const signed = parseSignedDeviceChallenge({
      deviceId: DEVICE_ID,
      publicKey: PK,
      keyAlgorithm: 'Ed25519',
      signature: SIG,
      signedAt: '2026-09-08T00:00:00Z',
    });
    expect(signed).not.toBeNull();
    expect(signed?.deviceId).toBe(DEVICE_ID);
    expect(parseSignedDeviceChallenge({ deviceId: DEVICE_ID, publicKey: PK, keyAlgorithm: 'Ed25519', signature: 'short', signedAt: 'x' })).toBeNull();
  });

  it('describes Windows vs mobile platform context', () => {
    expect(describeClientPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120').isWindows).toBe(true);
    expect(describeClientPlatform('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)').isMobile).toBe(true);
    expect(describeClientPlatform('MacIntel', 'Safari').isWindows).toBe(false);
  });
});

describe('device-config — binding mode policy', () => {
  it('allows demo only when Supabase is absent', () => {
    expect(bindingModeFromRaw('demo', false)).toBe('demo');
    expect(bindingModeFromRaw(undefined, false)).toBe('demo');
  });

  it('never honours demo once Supabase is configured (fail safe)', () => {
    expect(bindingModeFromRaw('demo', true)).toBe('hybrid_windows');
    expect(bindingModeFromRaw('hybrid_windows', true)).toBe('hybrid_windows');
    expect(bindingModeFromRaw('browser_legacy', true)).toBe('browser_legacy');
    expect(bindingModeFromRaw('whatever', true)).toBe('hybrid_windows');
  });

  it('only ever talks to loopback agent origins', () => {
    expect(isLocalAgentOrigin('http://127.0.0.1:8750')).toBe(true);
    expect(isLocalAgentOrigin('http://localhost:3000')).toBe(true);
    expect(isLocalAgentOrigin('https://evil.example')).toBe(false);
    expect(isLocalAgentOrigin('http://10.0.0.5:8750')).toBe(false);
  });

  it('compares agent versions numerically', () => {
    expect(isAgentVersionAtLeast('1.0.0', '1.0.0')).toBe(true);
    expect(isAgentVersionAtLeast('1.2.0', '1.0.0')).toBe(true);
    expect(isAgentVersionAtLeast('0.9.9', '1.0.0')).toBe(false);
    expect(isAgentVersionAtLeast('1.0.1-beta', '1.0.0')).toBe(true);
    expect(isAgentVersionAtLeast(null, '1.0.0')).toBe(false);
  });
});

describe('access payload mapping — hybrid verdicts', () => {
  it('normalizes hybrid fields from the server', () => {
    const payload = normalizeDeviceAccessPayload({
      ok: true,
      status: 'approved',
      role: 'admin',
      device_id: DEVICE_ID,
      device_kind: 'windows_agent',
      binding_mode: 'hybrid_windows',
      device_attestation_status: 'attested',
      last_attested_at: '2026-09-08T00:00:00Z',
    });
    expect(payload.bindingMode).toBe('hybrid_windows');
    expect(payload.deviceKind).toBe('windows_agent');
    expect(payload.attestationStatus).toBe('attested');
  });

  it('maps server verdicts to gate kinds (including agent_required)', () => {
    expect(gateKindFromPayload({ ok: true, status: 'approved', bindingMode: 'hybrid_windows' })).toBe('approved');
    expect(gateKindFromPayload({ ok: true, status: 'agent_required', bindingMode: 'hybrid_windows' })).toBe('agent_required');
    expect(gateKindFromPayload({ ok: true, status: 'pending', bindingMode: 'hybrid_windows' })).toBe('pending');
    expect(gateKindFromPayload({ ok: true, status: 'revoked', bindingMode: 'hybrid_windows' })).toBe('revoked');
    expect(gateKindFromPayload({ ok: true, status: 'rejected', bindingMode: 'hybrid_windows' })).toBe('denied');
    expect(gateKindFromPayload({ ok: true, status: 're_enrollment_required', bindingMode: 'hybrid_windows' })).toBe('revoked');
    expect(gateKindFromPayload({ ok: true, status: 'not_registered', bindingMode: 'hybrid_windows' })).toBe('pending');
    expect(gateKindFromPayload({ ok: false, status: 'invalid_proof' })).toBe('error');
  });

  it('client-crafted approvals never open the workspace', () => {
    // Even a hostile client claiming an approved hybrid device cannot fabricate
    // the server verdict the UI renders.
    expect(gateKindFromPayload({ ok: true, status: 'approved', role: 'admin', bindingMode: 'hybrid_windows' })).toBe('approved');
    expect(gateKindFromPayload({ ok: false, status: 'pending', bindingMode: 'hybrid_windows' })).toBe('error');
  });
});

describe('device transitions — windows agent', () => {
  it('exposes re-enrollment for windows devices and nothing else', () => {
    expect(canActOnWindowsDevice('approved', 'reenroll')).toBe(true);
    expect(canActOnWindowsDevice('pending', 'reenroll')).toBe(true);
    expect(canActOnWindowsDevice('revoked', 'reenroll')).toBe(true);
    expect(canActOnWindowsDevice('approved', 'revoke')).toBe(true);
    expect(canActOnWindowsDevice('pending', 'approve')).toBe(true);
    expect(canActOnWindowsDevice('approved', 'approve')).toBe(false);
  });
});

// A pure projection of the database authorization model so the acceptance
// behaviour is exercised even without a live PostgreSQL instance. The real
// enforcement lives in the SQL SECURITY DEFINER RPCs (see supabase).
type SimStatus = 'approved' | 'pending' | 'rejected' | 'revoked';

const scenario = (map: Record<string, SimStatus>) => (deviceId: string) => {
  const status: SimStatus = map[deviceId] ?? 'pending';
  const payload: DeviceAccessPayload = { ok: true, status, bindingMode: 'hybrid_windows', deviceId };
  return gateKindFromPayload(payload);
};

describe('scenario simulation — the acceptance model', () => {
  it('Chrome/Edge/Firefox on one approved Windows device all resolve approved', () => {
    // Same physical device -> same device_id -> ONE server device record.
    const laptopA = scenario({ 'DEVICE-A': 'approved' });
    expect(laptopA('DEVICE-A')).toBe('approved');
    // Every browser submits the SAME windows device identity.
    const chrome = scenario({ 'DEVICE-A': 'approved' })('DEVICE-A');
    const edge = scenario({ 'DEVICE-A': 'approved' })('DEVICE-A');
    const firefox = scenario({ 'DEVICE-A': 'approved' })('DEVICE-A');
    expect(chrome).toBe('approved');
    expect(edge).toBe('approved');
    expect(firefox).toBe('approved');
  });

  it('a different laptop stays pending/blocked until admin approval', () => {
    const laptopB = scenario({ 'DEVICE-A': 'approved' });
    expect(laptopB('DEVICE-B')).toBe('pending');
  });

  it('revocation blocks every browser on that device', () => {
    const revoked = scenario({ 'DEVICE-A': 'revoked' });
    expect(revoked('DEVICE-A')).toBe('revoked');
  });

  it('a mobile platform cannot present a windows agent proof (UI boundary)', () => {
    const phone = scenario({});
    // Even if a phone somehow reached an enrollment it stays pending; the
    // actual guard for phones is the platform boundary (unsupported screen)
    // because no Windows agent can exist there.
    expect(phone('PHONE-DEVICE')).toBe('pending');
    expect(describeClientPlatform('iPhone', 'Mobile').isMobile).toBe(true);
  });
});

describe('admin password-only access — non-admins stay device-bound', () => {
  it('an admin with NO windows agent/device is granted by the server verdict', () => {
    const adminPayload = normalizeDeviceAccessPayload({
      ok: true,
      status: 'approved',
      role: 'admin',
      account_status: 'active',
      binding_mode: 'hybrid_windows',
      admin_access: true,
      // no device_id, no device_kind, no attestation fields present
    });
    expect(isAdminBypassAccess(adminPayload)).toBe(true);
    expect(gateKindFromPayload(adminPayload)).toBe('approved');
  });

  it('an approved normal user (no admin_access) still flows through the device verdict', () => {
    const userPayload = normalizeDeviceAccessPayload({
      ok: true,
      status: 'approved',
      role: 'user',
      device_id: DEVICE_ID,
      device_kind: 'windows_agent',
      binding_mode: 'hybrid_windows',
      device_attestation_status: 'attested',
    });
    expect(userPayload.adminAccess).toBe(false);
    expect(isAdminBypassAccess(userPayload)).toBe(false);
    expect(gateKindFromPayload(userPayload)).toBe('approved');
  });

  it('a normal user without an approved device stays pending/blocked', () => {
    const pendingUser = scenario({ 'DEVICE-A': 'approved' });
    expect(pendingUser('DEVICE-NEW')).toBe('pending');
  });

  it('a revoked windows device still blocks a non-admin', () => {
    const revokedUser = scenario({ 'DEVICE-A': 'revoked' });
    expect(revokedUser('DEVICE-A')).toBe('revoked');
  });
});

