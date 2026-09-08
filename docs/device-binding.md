# FullAluDoor — Hybrid Windows Device-Bound Access Control

This document describes the **server-enforced hybrid Windows device-bound**
authentication model implemented on top of the existing admin-approved device
system.

> This is server-enforced hybrid access control. It is **not** perfect physical
> hardware locking. A determined attacker with full administrative control of a
> Windows machine can interfere with local software. The security boundary is:
> Windows-protected private key + device attestation + Supabase server-side
> authorization + admin approval. We make no claims of "impossible to copy",
> "100% bypass proof" or "unspoofable hardware".

---

## 1. What problem it solves

FullAluDoor must treat a **physical Windows computer** as the approval unit,
not a browser profile.

```text
ONE PHYSICAL WINDOWS LAPTOP
        |
ONE APPROVED FULLALUDOOR DEVICE IDENTITY
        |
  +------+------+------+
  Chrome Edge Firefox
        |      |      |
        +------+------+
            ACCESS ALLOWED
```

```text
Different laptop / PC / phone / tablet
        |
   NEW DEVICE  ->  PENDING  ->  BLOCKED
        |
        +-- admin approves -->  ACCESS
```

The old system keyed a device to a per-browser token stored in `localStorage`.
Chrome, Edge and Firefox therefore each needed their own approval even on the
same physical machine. The new system keys the device to a **native Windows
agent identity + asymmetric key** shared by every browser on that computer.

## 2. Architecture

```text
                        SUPABASE (source of truth)
          users | user_devices | challenges | audit | settings
                                |
                        Approved Windows Device
                                |
                      Windows Device Agent (native)
                                |
                   Windows Device Identity (Ed25519 key)
                                |
             Chrome          Edge          Firefox
                                |
                       FullAluDoor Web App
                                |
                     Supabase SECURITY DEFINER RPCs
                                |
                      APPROVED / DENIED / PENDING
```

Supabase remains the source of truth for users, accounts, device enrollment,
approval, revocation and admin roles. The Windows agent is **only a device
identity provider / attestation helper**. There is no second authentication
system.

## 3. Windows Device Agent

A small .NET 9 helper (`tools/FullAluDoor.DeviceAgent`).

Responsibilities:

- Generate a cryptographically random `device_id` (UUID v4) during enrollment.
- Generate an **Ed25519** key pair. The 32-byte seed is stored **DPAPI
  encrypted** (Windows-protected storage). The private key is never sent to
  Supabase, never exposed to JavaScript, and never written to
  localStorage/URLs/logs/source.
- Expose a tiny loopback-only HTTP API:

  ```text
  GET  http://127.0.0.1:8750/health        -> status + version + device id
  GET  http://127.0.0.1:8750/device/info   -> public device metadata (never the key)
  POST http://127.0.0.1:8750/device/sign   -> sign a canonical server challenge
  ```

  Nothing else exists. No shell, no file access, no arbitrary RPC, no remote
  admin endpoints.

Localhost security:

- binds only to `127.0.0.1`/`::1` (Kestrel `ListenLocalhost`)
- every non-health request must carry an `Origin` that is in the configured
  allow-list (strict CORS); unknown origins get `403`
- bounded request bodies (4 KiB)
- signing is rate limited
- the agent only signs **well-formed canonical messages that begin with its own
  device id** (it can never be tricked into signing another device's proof)
- no plain-text shared secrets, no hardcoded device ids, no MAC/IP/CPU/board
  based identity

Config (JSON): `%ProgramData%\FullAluDoor Device Agent\config.json`
(machine-wide) and `%LocalAppData%\FullAluDoor Device Agent\config.json`
(user override). Add your production origin(s) to `AllowedOrigins`.

```json
{
  "Port": 8750,
  "AllowedOrigins": "https://app.yourcompany.com,http://localhost:3000",
  "MaxSignPerWindow": 30,
  "RateWindowSeconds": 10
}
```

## 4. Enrollment & approval (server controlled)

```text
User signs in (Chrome on Windows)
      |
      +-> browser finds the local Windows Device Agent
      |   browser reads device_id + public key from /device/info
      +-> browser calls get_device_access(device_id, public_key, ...)
      |   DB: unknown Windows device => insert PENDING windows_agent row
      |       (enrollment is NEVER auto-approved)
      +-> Admin panel shows "Windows ... PENDING"
      +-> Admin approves -> status = approved
      +-> every browser on that PC now presents the same device_id
          and gains access after a valid proof
```

The association is server controlled: a device never binds to an account simply
because someone logged in; it is bound by the authenticated user's enrollment
request and completed by an admin approval.

## 5. Challenge / response proof

`device_id` alone is never trusted. The server verifies possession of the
registered private key:

```text
Browser                          Supabase                    Windows Agent
   |   device_issue_challenge()      |                              |
   |-------------------------------->|  (random nonce, expiry,      |
   |                                 |   single-use, bound to       |
   |<---------- nonce --------------|   user + device)             |
   |   POST /device/sign  (message = device.challenge.nonce)        |
   |-------------------------------------------------------------->|
   |<------------------------- signature ---------------------------|
   |   verify_device_attestation(challenge_id, signature)           |
   |-------------------------------->|  Ed25519 verify against      |
   |                                 |  stored public key           |
   |<------ verdict (approved...) ---|  + consume challenge         |
```

Challenges are random (32 bytes, `gen_random_bytes`), expire (default 60 s,
configurable 10–600 s), are single-use (`consumed_at`), bound to the user and
to the intended device, and replayed/expired challenges are rejected and
audited.

Signatures are verified **inside PostgreSQL** with libsodium Ed25519 through
`pgsodium` (bundled with Supabase):

- `device_issue_challenge(device_id)`
- `verify_device_attestation(challenge_id, device_id, signature, ...)`
- `device_ed25519_verify(signature, message, public_key)`

## 6. Authorization flow (server enforced)

Every protected RPC re-checks inside the database:

```text
JWT subject (auth.uid())
  + active account (profiles.status = active)
  + approved device (user_devices status = approved)
  + valid device proof (last_attested_at inside challenge TTL)
```

Credential rules:

| Binding mode       | Protected RPC credential                       |
|--------------------|------------------------------------------------|
| `hybrid_windows`   | native agent `device_id` + fresh attestation   |
| `browser_legacy`   | legacy per-browser token hash (explicit opt-in)|

The mode is read from `app_settings.device_binding_mode` on **every** call
(`assert_device_approved`). The client cannot influence it. `browser_legacy`
rows (`device_kind = 'browser'`) never authorize in `hybrid_windows`, and
Windows-agent rows never authorize in `browser_legacy`.

Admin RPCs additionally require `is_admin()` (active admin role in the DB).

## 7. Database

Extends the existing `user_devices` table (single device model, no duplicate
device table):

- `device_kind` `browser | windows_agent` (existing rows migrated to
  `browser`; they are never silently promoted to Windows devices)
- `device_public_key`, `device_key_algorithm` (Ed25519)
- `device_agent_version`, `platform`, `os_version`
- `device_attestation_status` `none | enrolled | attested | failed | re_enrollment_required`
- `last_attested_at`
- `detected_browsers` (Chrome/Edge/Firefox list shown in admin)

New tables:

- `device_attestation_challenges` — single-use, expiring, user+device bound

New settings (`app_settings`):

- `device_binding_mode` = `hybrid_windows` (default) | `browser_legacy`
- `device_agent_min_version` = `1.0.0`
- `device_agent_origin` = `http://127.0.0.1:8750`
- `device_challenge_ttl_seconds` = `60`

Statuses stay `pending | approved | rejected | revoked`.

New migration: `supabase/migrations/20260908000000_hybrid_windows_device_binding.sql`.
Existing data (users, devices, projects, organizations, audit logs, roles) is
preserved. Legacy browser rows are explicitly tagged `browser` and require
re-enrollment under `hybrid_windows`.

RLS is enabled; all mutation happens inside SECURITY DEFINER RPCs with a safe
`search_path`. The service-role key, admin credentials and private keys are
never exposed to the browser.

## 8. Audit events

`DEVICE_ENROLLMENT_STARTED`, `DEVICE_ATTESTED`, `DEVICE_APPROVED`,
`DEVICE_REJECTED`, `DEVICE_REVOKED`, `DEVICE_REOPENED`,
`DEVICE_REENROLLMENT_REQUIRED`, `DEVICE_ATTESTATION_FAILED`,
`DEVICE_CHALLENGE_EXPIRED`, `DEVICE_REPLAY_BLOCKED`, `DEVICE_AGENT_MISSING`(UI),
`SETTING_UPDATED`.

Private keys and full signed-challenge material are never stored.

## 9. Admin workflow

`/admin` shows each **Windows device** as a single row with:

User, Device name, Device ID, Platform, Windows/OS version, Agent version,
Browsers detected, Attestation status + last attested, Status, Registered,
Last seen, Approved by/at.

Actions per row: Approve, Reject, Revoke, Reopen, **Force re-enrollment**
(invalidates the stored public key + revokes until the agent generates a brand
new identity).

Enforcement is always in the DB: the browser can never change its own status.

## 10. User experience

New computer:

```text
Device verification required.
This Windows computer has not been approved yet.
Status: PENDING
Please ask an administrator to approve this device.
```

Approved computer:

```text
LOGIN SUCCESSFUL / DEVICE VERIFIED / ACCESS GRANTED
```

Revoked computer:

```text
DEVICE ACCESS REVOKED — An administrator has revoked access for this computer.
```

Agent missing (on Windows):

```text
WINDOWS DEVICE AGENT REQUIRED
Install the FullAluDoor Device Agent to continue. [Download Agent] [Retry]
```

Phone / tablet / non-Windows platform: an explicit "FullAluDoor runs on
Windows" unsupported screen. There is **no silent fallback** to the old browser
token in hybrid mode.

## 11. Known limitations

- The agent can be removed/reinstalled by anyone with full local control of the
  machine (attacker with admin rights can always interfere with local
  software). This is inherent to OS-level access control, not a bug in the
  binding model.
- Device identity is per Windows *user scope* by default (per-machine
  `%ProgramData%` scope is used when the agent runs with the right to write
  there). Two different Windows accounts on the same PC get separate identities
  unless machine scope is used.
- The proof guarantees "this browser is running on an approved Windows device";
  it is not a claim that the physical hardware is unforgeable.

## 12. Configuration reference

Public (client) environment variables (Vinext `NEXT_PUBLIC_*`):

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_DEVICE_BINDING_MODE      # hybrid_windows (default) | browser_legacy
NEXT_PUBLIC_DEVICE_AGENT_ORIGIN      # http://127.0.0.1:8750
NEXT_PUBLIC_DEVICE_AGENT_MIN_VERSION # 1.0.0
NEXT_PUBLIC_DEVICE_AGENT_DOWNLOAD_URL# optional installer link shown on the agent screen
```

No secrets are exposed through public environment variables. `demo` mode only
exists when Supabase is not configured; production never silently enters demo.

Server-side settings (authoritative) live in `app_settings` and are editable
via the admin policy panel or SQL.

## 13. Tests

Web (Vitest): `npm test` — pure client/agent-protocol logic, payload
normalization, gate projections, binding-mode policy, agent payload parsing,
attestation freshness and acceptance scenario projections.

Windows agent (xUnit): `dotnet test` under `tools/` — Ed25519 key generation,
public key serialization, sign/verify, DPAPI persistence round-trip, device id
uniqueness, the multi-browser single-identity contract, canonical challenge
validation, origin allow-list enforcement, malformed/foreign-device/oversized
challenge rejection, and live localhost API signature verification.
