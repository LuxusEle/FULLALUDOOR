// Browser client for the native FullAluDoor Windows Device Agent.
//
// The agent runs ONLY on this machine and binds to 127.0.0.1. It exposes a
// tiny, purpose-built surface (/health, /device/info, /device/sign). The
// browser NEVER sees the private key: the agent signs challenges with a key
// held in Windows-protected storage and only returns the signature + public
// metadata.
//
// Any website may *attempt* to contact the agent; the agent itself enforces
// the allowed-origin policy, request rate limits, payload bounds and challenge
// shape. This client additionally refuses to talk to any non-loopback origin,
// so a misconfigured deployment cannot leak device metadata to a remote host.

import { deviceAgentOrigin, isLocalAgentOrigin } from './device-config';
import {
  DEVICE_AGENT_PROBE_TIMEOUT_MS,
  DEVICE_AGENT_SIGN_TIMEOUT_MS,
} from './device-config';

export const DEVICE_KEY_ALGORITHM = 'Ed25519' as const;

export interface DeviceAgentInfo {
  deviceId: string;
  publicKey: string;
  keyAlgorithm: typeof DEVICE_KEY_ALGORITHM;
  deviceName: string;
  platform: string;
  osVersion: string;
  agentVersion: string;
  scope: 'machine' | 'user';
}

export interface DeviceAgentHealth {
  ok: boolean;
  version: string;
  deviceId: string | null;
}

export interface SignedDeviceChallenge {
  deviceId: string;
  publicKey: string;
  keyAlgorithm: typeof DEVICE_KEY_ALGORITHM;
  signature: string;
  signedAt: string;
}

export interface AgentSignRequest {
  /** The canonical message the agent must sign (see device-attestation). */
  challenge: string;
}

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Pure parsers / validators (unit-tested)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function describeClientPlatform(platform: string, userAgent: string): { isWindows: boolean; isMobile: boolean } {
  const haystack = `${userAgent} ${platform}`;
  return {
    isWindows: /Windows|Win32|Win64|Windows NT/i.test(haystack),
    isMobile: /iPhone|iPad|iPod|Android|Mobile/i.test(haystack),
  };
}

/** Validates and normalizes a /device/info payload. Never trusts extra fields. */
export function parseDeviceAgentInfo(value: unknown): DeviceAgentInfo | null {
  if (!isRecord(value)) return null;
  const deviceId = str(value, 'deviceId');
  const publicKey = str(value, 'publicKey');
  const algorithm = str(value, 'keyAlgorithm');
  const deviceName = str(value, 'deviceName') ?? 'Windows computer';
  const platform = str(value, 'platform') ?? 'Windows';
  const osVersion = str(value, 'osVersion') ?? '';
  const agentVersion = str(value, 'agentVersion');
  const scope = value.scope === 'machine' ? 'machine' : 'user';

  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) return null;
  if (!publicKey || !B64URL_RE.test(publicKey)) return null;
  if (algorithm !== DEVICE_KEY_ALGORITHM) return null;
  if (!agentVersion || !/^\d+(\.\d+)*$/.test(agentVersion)) return null;
  if (publicKey.length < 40) return null;

  return {
    deviceId,
    publicKey,
    keyAlgorithm: DEVICE_KEY_ALGORITHM,
    deviceName,
    platform,
    osVersion,
    agentVersion,
    scope,
  };
}

/** Validates and normalizes a /device/sign response. */
export function parseSignedDeviceChallenge(value: unknown): SignedDeviceChallenge | null {
  if (!isRecord(value)) return null;
  const deviceId = str(value, 'deviceId');
  const publicKey = str(value, 'publicKey');
  const algorithm = str(value, 'keyAlgorithm');
  const signature = str(value, 'signature');
  const signedAt = str(value, 'signedAt');

  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) return null;
  if (!publicKey || !B64URL_RE.test(publicKey) || publicKey.length < 40) return null;
  if (algorithm !== DEVICE_KEY_ALGORITHM) return null;
  if (!signature || !B64URL_RE.test(signature) || signature.length < 80) return null;
  if (!signedAt || signedAt.length < 10) return null;

  return { deviceId, publicKey, keyAlgorithm: DEVICE_KEY_ALGORITHM, signature, signedAt };
}

// ---------------------------------------------------------------------------
// HTTP helpers (dependency-injectable fetch for tests)
// ---------------------------------------------------------------------------

export type FetchLike = typeof fetch;

function endpoint(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

async function timedFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function assertLocalOrigin(origin: string): void {
  if (!isLocalAgentOrigin(origin)) {
    throw new Error('The device agent origin must be a local loopback address.');
  }
}

function rpcError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error('The Windows Device Agent did not respond.');
}

export interface AgentFetchOptions {
  origin?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

function resolveOrigin(options: AgentFetchOptions): string {
  return options.origin ?? deviceAgentOrigin();
}

/** GET /health — is the agent installed and running? */
export async function fetchAgentHealth(options: AgentFetchOptions = {}): Promise<DeviceAgentHealth> {
  const origin = resolveOrigin(options);
  assertLocalOrigin(origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEVICE_AGENT_PROBE_TIMEOUT_MS;
  let response: Response;
  try {
    response = await timedFetch(fetchImpl, endpoint(origin, '/health'), { method: 'GET' }, timeoutMs);
  } catch (error) {
    throw rpcError(error);
  }
  if (!response.ok) {
    throw new Error(`Windows Device Agent health check failed (HTTP ${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new Error('Windows Device Agent returned an invalid health payload.');
  const version = str(payload, 'version');
  return {
    ok: payload.status === 'ok' || payload.status === 'healthy',
    version: version ?? '0.0.0',
    deviceId: str(payload, 'deviceId'),
  };
}

/** GET /device/info — public device identity metadata (never the private key). */
export async function fetchAgentDeviceInfo(options: AgentFetchOptions = {}): Promise<DeviceAgentInfo> {
  const origin = resolveOrigin(options);
  assertLocalOrigin(origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEVICE_AGENT_PROBE_TIMEOUT_MS;
  let response: Response;
  try {
    response = await timedFetch(fetchImpl, endpoint(origin, '/device/info'), { method: 'GET' }, timeoutMs);
  } catch (error) {
    throw rpcError(error);
  }
  if (!response.ok) {
    throw new Error(`Windows Device Agent info request failed (HTTP ${response.status}).`);
  }
  const parsed = parseDeviceAgentInfo(await response.json());
  if (!parsed) throw new Error('Windows Device Agent returned an invalid device payload.');
  return parsed;
}

/**
 * POST /device/sign — ask the agent to sign a server-issued challenge with the
 * Windows-protected private key. Returns only the signature + metadata.
 */
export async function requestAgentSignature(
  challenge: string,
  options: AgentFetchOptions = {}
): Promise<SignedDeviceChallenge> {
  const origin = resolveOrigin(options);
  assertLocalOrigin(origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEVICE_AGENT_SIGN_TIMEOUT_MS;
  let response: Response;
  try {
    response = await timedFetch(
      fetchImpl,
      endpoint(origin, '/device/sign'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge } satisfies AgentSignRequest),
      },
      timeoutMs
    );
  } catch (error) {
    throw rpcError(error);
  }
  if (!response.ok) {
    throw new Error(`Windows Device Agent rejected the signing request (HTTP ${response.status}).`);
  }
  const parsed = parseSignedDeviceChallenge(await response.json());
  if (!parsed) throw new Error('Windows Device Agent returned an invalid signature payload.');
  return parsed;
}
