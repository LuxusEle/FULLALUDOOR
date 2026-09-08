// Explicit device-binding configuration.
//
// The database remains the authoritative source of the active binding mode
// (app_settings.device_binding_mode) and is re-checked on every protected RPC.
// This module only supplies safe client defaults and the localhost agent
// endpoint used to communicate with the native Windows Device Agent.
//
// Production safety rule: 'demo' mode is ONLY reachable when Supabase is not
// configured at all (mirrors the existing demo behaviour). If Supabase IS
// configured, a NEXT_PUBLIC_DEVICE_BINDING_MODE=demo value is ignored and the
// application fails safe into hybrid_windows.

import { isDemoMode } from './supabase';

export type DeviceBindingMode = 'demo' | 'hybrid_windows' | 'browser_legacy';

export type DeviceKind = 'windows_agent' | 'browser';

/** Loopback origin the Windows Device Agent listens on by default. */
export const DEVICE_AGENT_DEFAULT_ORIGIN = 'http://127.0.0.1:8750';

/** Minimum agent version accepted for attestation. */
export const DEVICE_AGENT_DEFAULT_MIN_VERSION = '1.0.0';

/** Matches the database device_challenge_ttl_seconds default. */
export const DEVICE_CHALLENGE_DEFAULT_TTL_SECONDS = 60;

/** How long the agent health/info probe is allowed to take (ms). */
export const DEVICE_AGENT_PROBE_TIMEOUT_MS = 1200;

/** How long a single agent signing request may take (ms). */
export const DEVICE_AGENT_SIGN_TIMEOUT_MS = 5000;

/** Revalidation cadence of the server verdict while approved (ms). */
export const DEVICE_REVALIDATE_MS = 60000;

/**
 * Pure resolution of a raw environment string + whether Supabase is wired up.
 * Exported separately for unit tests.
 */
export function bindingModeFromRaw(raw: string | undefined, supabaseConfigured: boolean): DeviceBindingMode {
  if (!supabaseConfigured) return 'demo';
  if (raw === 'browser_legacy') return 'browser_legacy';
  // Anything else (including an explicit 'demo') degrades to the safe default.
  return 'hybrid_windows';
}

/** Effective client-side binding mode. Demo requires Supabase to be absent. */
export function resolveDeviceBindingMode(): DeviceBindingMode {
  const raw =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DEVICE_BINDING_MODE : undefined;
  return bindingModeFromRaw(raw, !isDemoMode);
}

function normalizeLoopbackOrigin(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const value = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(value)) {
    // Never point the agent client at anything other than this machine.
    return fallback;
  }
  return value;
}

/** Localhost origin of the native Windows Device Agent. */
export function deviceAgentOrigin(): string {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_DEVICE_AGENT_ORIGIN
      : undefined;
  return normalizeLoopbackOrigin(raw, DEVICE_AGENT_DEFAULT_ORIGIN);
}

/** Minimum accepted Windows Device Agent version. */
export function deviceAgentMinVersion(): string {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_DEVICE_AGENT_MIN_VERSION
      : undefined;
  return raw && /^\d+(\.\d+)*$/.test(raw.trim()) ? raw.trim() : DEVICE_AGENT_DEFAULT_MIN_VERSION;
}

/** True when a value is a string that looks like a local agent origin. */
export function isLocalAgentOrigin(value: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(value);
}

export interface AgentDownloadInfo {
  url: string | null;
  label: string;
}

/** Optional administrator-provided URL for the Windows Device Agent installer. */
export function deviceAgentDownloadInfo(): AgentDownloadInfo {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_DEVICE_AGENT_DOWNLOAD_URL
      : undefined;
  const url = raw && /^https:\/\//i.test(raw.trim()) ? raw.trim() : null;
  return { url, label: 'Download FullAluDoor Device Agent' };
}

/**
 * Compare dotted numeric versions. Returns >= 0 when `installed` is at least
 * `minimum` (e.g. "1.2.0" vs "1.0.0"). Non-numeric segments are ignored.
 */
export function isAgentVersionAtLeast(installed: string | null | undefined, minimum: string): boolean {
  if (!installed) return false;
  const parse = (value: string): number[] =>
    value.split('.').map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const a = parse(installed);
  const b = parse(minimum);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
}
