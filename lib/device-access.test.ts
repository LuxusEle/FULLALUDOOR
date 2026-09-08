import { describe, expect, it } from 'vitest';
import {
  canTransitionDevice,
  createDeviceIdentity,
  describeDevice,
  gateKindFromPayload,
  generateDeviceId,
  generateDeviceToken,
  isAdminBypassAccess,
  normalizeDeviceAccessPayload,
  type DeviceAccessPayload,
} from './device-access';

describe('device identity — secure generation', () => {
  it('creates a long, URL-safe random token (not Math.random based)', () => {
    const token = generateDeviceToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });

  it('creates unique tokens and device ids', () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a).not.toBe(b);
    const idA = generateDeviceId();
    const idB = generateDeviceId();
    expect(idA).not.toBe(idB);
  });

  it('creates a device identity with a UUID v4 device id', () => {
    const identity = createDeviceIdentity();
    expect(identity.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(identity.token.length).toBeGreaterThanOrEqual(40);
    expect(identity.createdAt).toBeTruthy();
  });
});

describe('device metadata — user agent parsing', () => {
  it('detects Windows + Chrome', () => {
    const meta = describeDevice(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Win32'
    );
    expect(meta.browser).toBe('Google Chrome');
    expect(meta.os).toContain('Windows');
    expect(meta.label).toContain('Google Chrome');
    expect(meta.label).toContain('Windows');
  });

  it('detects macOS + Safari', () => {
    const meta = describeDevice(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'MacIntel'
    );
    expect(meta.browser).toBe('Safari');
    expect(meta.os).toBe('macOS');
  });

  it('detects Android + Firefox', () => {
    const meta = describeDevice(
      'Mozilla/5.0 (Android 13; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
      'Linux armv8l'
    );
    expect(meta.browser).toBe('Mozilla Firefox');
    expect(meta.os).toBe('Android');
  });

  it('detects iPhone/iOS', () => {
    const meta = describeDevice(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    expect(meta.browser).toBe('Safari');
    expect(meta.os).toBe('iOS (iPhone)');
  });

  it('falls back gracefully on an empty user agent', () => {
    const meta = describeDevice('', '');
    expect(meta.browser).toBe('Web browser');
    expect(meta.label).toBe('Web browser');
  });
});

describe('normalizeDeviceAccessPayload', () => {
  it('maps an approved server verdict', () => {
    const payload = normalizeDeviceAccessPayload({
      ok: true,
      status: 'approved',
      role: 'user',
      device_id: 'dev-123',
      device_name: 'Google Chrome on Windows 10/11',
      registered_at: '2026-09-07T00:00:00Z',
    });
    expect(payload).toMatchObject({
      ok: true,
      status: 'approved',
      role: 'user',
      deviceId: 'dev-123',
    });
  });

  it('maps an account_disabled verdict and role', () => {
    const payload = normalizeDeviceAccessPayload({
      ok: true,
      status: 'account_disabled',
      role: 'admin',
      account_status: 'disabled',
    });
    expect(payload.status).toBe('account_disabled');
    expect(payload.role).toBe('admin');
    expect(payload.accountStatus).toBe('disabled');
  });

  it('rejects malformed server payloads without throwing', () => {
    const payload = normalizeDeviceAccessPayload('nonsense');
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('invalid_server_response');
  });

  it('rejects a payload with an unknown status string', () => {
    const payload = normalizeDeviceAccessPayload({ ok: true, status: 'approved-by-pass', role: 'admin' });
    expect(payload.status).toBeUndefined();
  });

  it('maps the server-declared admin password-only verdict', () => {
    const payload = normalizeDeviceAccessPayload({
      ok: true,
      status: 'approved',
      role: 'admin',
      account_status: 'active',
      binding_mode: 'hybrid_windows',
      admin_access: true,
    });
    expect(payload.status).toBe('approved');
    expect(payload.role).toBe('admin');
    expect(payload.adminAccess).toBe(true);
    expect(isAdminBypassAccess(payload)).toBe(true);
  });
});

describe('isAdminBypassAccess — a client can never fabricate admin access', () => {
  it('requires the server admin_access verdict', () => {
    const serverAdmin: DeviceAccessPayload = {
      ok: true,
      status: 'approved',
      role: 'admin',
      adminAccess: true,
    };
    expect(isAdminBypassAccess(serverAdmin)).toBe(true);
  });

  it('is false when admin_access is absent (normal approved device flow)', () => {
    const approvedUser: DeviceAccessPayload = { ok: true, status: 'approved', role: 'admin', adminAccess: false };
    expect(isAdminBypassAccess(approvedUser)).toBe(false);
  });

  it('is false for a non-approved status even when role is admin', () => {
    const pendingAdmin: DeviceAccessPayload = { ok: true, status: 'pending', role: 'admin', adminAccess: true };
    expect(isAdminBypassAccess(pendingAdmin)).toBe(false);
  });

  it('is false for a user role even when admin_access is set', () => {
    const userClaim: DeviceAccessPayload = { ok: true, status: 'approved', role: 'user', adminAccess: true };
    expect(isAdminBypassAccess(userClaim)).toBe(false);
  });
});

describe('gateKindFromPayload — presentation can never fabricate approval', () => {
  it('grants the workspace only for an approved verdict', () => {
    const approved: DeviceAccessPayload = { ok: true, status: 'approved', role: 'user' };
    expect(gateKindFromPayload(approved)).toBe('approved');
  });

  it('blocks pending/rejected/revoked/disabled verdicts', () => {
    expect(gateKindFromPayload({ ok: true, status: 'pending', role: 'user' })).toBe('pending');
    expect(gateKindFromPayload({ ok: true, status: 'rejected', role: 'user' })).toBe('denied');
    expect(gateKindFromPayload({ ok: true, status: 'revoked', role: 'user' })).toBe('revoked');
    expect(gateKindFromPayload({ ok: true, status: 'account_disabled', role: 'user' })).toBe('disabled');
  });

  it('does not treat a client-crafted admin role as approval', () => {
    // Even if a malicious user claims admin, a non-approved status must not
    // open the workspace.
    expect(gateKindFromPayload({ ok: true, status: 'pending', role: 'admin' })).toBe('pending');
    expect(gateKindFromPayload({ ok: true, role: 'admin' })).toBe('login');
  });

  it('treats missing/unknown status as no access', () => {
    expect(gateKindFromPayload({ ok: true })).toBe('login');
    expect(gateKindFromPayload({ ok: false, error: 'unauthenticated' })).toBe('login');
    expect(gateKindFromPayload({ ok: false, error: 'boom' })).toBe('error');
  });
});

describe('device status transitions — mirrors admin_device_action RPC', () => {
  it('approve is only allowed from pending/rejected/revoked', () => {
    expect(canTransitionDevice('pending', 'approve')).toBe(true);
    expect(canTransitionDevice('rejected', 'approve')).toBe(true);
    expect(canTransitionDevice('revoked', 'approve')).toBe(true);
    expect(canTransitionDevice('approved', 'approve')).toBe(false);
  });

  it('reject is only allowed from pending', () => {
    expect(canTransitionDevice('pending', 'reject')).toBe(true);
    expect(canTransitionDevice('approved', 'reject')).toBe(false);
    expect(canTransitionDevice('rejected', 'reject')).toBe(false);
    expect(canTransitionDevice('revoked', 'reject')).toBe(false);
  });

  it('revoke is only allowed from approved', () => {
    expect(canTransitionDevice('approved', 'revoke')).toBe(true);
    expect(canTransitionDevice('pending', 'revoke')).toBe(false);
    expect(canTransitionDevice('rejected', 'revoke')).toBe(false);
    expect(canTransitionDevice('revoked', 'revoke')).toBe(false);
  });

  it('reopen (pending) is only allowed from rejected/revoked', () => {
    expect(canTransitionDevice('rejected', 'pending')).toBe(true);
    expect(canTransitionDevice('revoked', 'pending')).toBe(true);
    expect(canTransitionDevice('pending', 'pending')).toBe(false);
    expect(canTransitionDevice('approved', 'pending')).toBe(false);
  });
});
