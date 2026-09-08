// Pure helpers for the Windows device attestation protocol.
//
// These functions are deliberately free of I/O. They build/validate the
// canonical signed message that the native agent signs and the server verifies
// (see supabase migrations: device_attestation_message). Keeping them pure lets
// the unit tests exercise the exact byte/string contract shared by the browser,
// the Windows agent and PostgreSQL.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Canonical message that MUST be signed by the Windows agent. Format mirrors
 * the SQL helper public.device_attestation_message:
 *
 *   <device_id>.<challenge_id>.<nonce>
 *
 * The device_id binds the signature to a specific Windows identity, the
 * challenge_id to a specific server-issued single-use challenge and the nonce
 * to that challenge's unpredictable value.
 */
export function buildAttestationMessage(deviceId: string, challengeId: string, nonce: string): string {
  if (!UUID_RE.test(deviceId)) {
    throw new Error('A valid device_id is required to build an attestation message.');
  }
  if (!UUID_RE.test(challengeId)) {
    throw new Error('A valid challenge_id is required to build an attestation message.');
  }
  if (!B64URL_RE.test(nonce) || nonce.length < 20) {
    throw new Error('A valid nonce is required to build an attestation message.');
  }
  return `${deviceId}.${challengeId}.${nonce}`;
}

/**
 * Validates that a challenge string presented to the agent has the canonical
 * shape. The agent runs this check before signing so it refuses to sign
 * arbitrary text from a compromised page.
 */
export function isWellFormedChallenge(challenge: string): boolean {
  if (typeof challenge !== 'string') return false;
  const [deviceId, challengeId, nonce, ...rest] = challenge.split('.');
  if (rest.length > 0) return false;
  if (!deviceId || !UUID_RE.test(deviceId)) return false;
  if (!challengeId || !UUID_RE.test(challengeId)) return false;
  if (!nonce || !B64URL_RE.test(nonce) || nonce.length < 20) return false;
  if (challenge.length > 220) return false;
  return true;
}

// ---------------------------------------------------------------------------
// URL-safe base64 encode/decode (mirrors the SQL device_b64url helpers).
// Implemented without btoa/atob so it also runs under Node for tests.
// ---------------------------------------------------------------------------

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += B64_ALPHABET[a >> 2];
    result += B64_ALPHABET[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) result += B64_ALPHABET[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) result += B64_ALPHABET[c & 63];
  }
  return result;
}

export function base64UrlToBytes(value: string): Uint8Array {
  const clean = value.replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = B64_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base64url character.');
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ---------------------------------------------------------------------------
// Ed25519 raw key/signature size checks (format contract, not crypto)
// ---------------------------------------------------------------------------

export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;

export function looksLikeEd25519PublicKey(value: string): boolean {
  if (!value || !B64URL_RE.test(value)) return false;
  try {
    return base64UrlToBytes(value).length === ED25519_PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
}

export function looksLikeEd25519Signature(value: string): boolean {
  if (!value || !B64URL_RE.test(value)) return false;
  try {
    return base64UrlToBytes(value).length === ED25519_SIGNATURE_BYTES;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Attestation session bookkeeping (pure; used by the gate/API layer)
// ---------------------------------------------------------------------------

export interface AttestationState {
  /** Windows agent device_id currently bound to this browser session. */
  deviceId: string | null;
  /** Milliseconds since epoch of the last successful server-side attestation. */
  lastAttestedAt: number | null;
  /** Challenge TTL (ms) reported by the server for the active deployment. */
  ttlMs: number;
  /** True while an attestation request is in flight. */
  inFlight: boolean;
}

export function createAttestationState(ttlMs: number): AttestationState {
  return { deviceId: null, lastAttestedAt: null, ttlMs, inFlight: false };
}

export function needsFreshAttestation(state: AttestationState, nowMs = Date.now()): boolean {
  if (!state.deviceId) return true;
  if (state.lastAttestedAt === null) return true;
  // Refresh when more than half the TTL has elapsed so a data RPC that runs a
  // moment later can never trip the server-side DEVICE_PROOF_STALE window.
  const halfTtl = Math.max(5000, state.ttlMs / 2);
  return nowMs - state.lastAttestedAt >= halfTtl;
}

export function recordAttestationSuccess(state: AttestationState, nowMs = Date.now()): AttestationState {
  return { ...state, lastAttestedAt: nowMs, inFlight: false };
}

export function recordAttestationStart(state: AttestationState): AttestationState {
  return { ...state, inFlight: true };
}
