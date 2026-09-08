# FullAluDoor Device Agent (Windows)

Native Windows helper that gives FullAluDoor a **trusted per-computer device
identity**. Every browser (Chrome/Edge/Firefox) on the same Windows computer
talks to this one agent and therefore presents the **same** device identity to
Supabase. One admin approval covers the whole computer.

This is a *device identity / attestation helper only*. Accounts, approvals and
authorization stay in Supabase.

## Requirements

- Windows 10/11 x64
- .NET 9 Runtime (self-contained publish also supported)

## Build

```bash
cd tools
dotnet build FullAluDoor.DeviceAgent.sln
dotnet test  FullAluDoor.DeviceAgent.sln
```

## Publish (framework-dependent)

```bash
dotnet publish FullAluDoor.DeviceAgent/FullAluDoor.DeviceAgent/FullAluDoor.DeviceAgent.csproj -c Release -o publish/agent
```

Run `publish\agent\FullAluDoor.DeviceAgent.exe`.

## Install (user-level autostart, no admin)

```bat
FullAluDoor.DeviceAgent.exe --install
```

This registers HKCU\...\Run so the agent starts when you sign in. No admin
privileges are needed for the default user-scope setup.

```bat
FullAluDoor.DeviceAgent.exe --uninstall          REM remove autostart
FullAluDoor.DeviceAgent.exe --uninstall --purge  REM also delete device identity
```

## Options

| Option         | Description                                                    |
|----------------|----------------------------------------------------------------|
| `--version`    | Show version                                                   |
| `--re-enroll`  | Generate a NEW device identity + key pair (needs re-approval)  |
| `--install`    | Register per-user autostart                                    |
| `--uninstall`  | Remove autostart (`--purge` also deletes identity + key)       |
| `--background` | Run silently (used by autostart / service-style)               |
| `--port <n>`   | Override loopback port (default 8750)                          |

Interactive console commands: `s`tatus, `i`nfo, `r`e-enroll (with
confirmation), `o`pen FullAluDoor, `a`bout, `q`uit.

## Configuration

`config.json` at `%ProgramData%\FullAluDoor Device Agent\` (machine wide) and
`%LocalAppData%\FullAluDoor Device Agent\` (user override). See
`config.sample.json` in this folder.

The **AllowedOrigins** list is the gate for the localhost API. Add your
FullAluDoor deployment origin(s). The agent rejects requests from any origin
not listed.

```json
{
  "Port": 8750,
  "AllowedOrigins": "http://localhost:3000,https://app.example.com",
  "MaxSignPerWindow": 30,
  "RateWindowSeconds": 10
}
```

## Data it stores

- `identity.json` — public metadata: `deviceId`, device name, **public** key,
  agent version, scope, created at. Not secret.
- `key.bin` — the 32-byte Ed25519 seed, **DPAPI encrypted** (CurrentUser or
  LocalMachine depending on scope). Never leaves the machine.

Default scope: `%ProgramData%` (machine) when the process can write it,
otherwise `%LocalAppData%` (per Windows user). Override with the
`FULLALUDOOR_DEVICE_STORAGE` environment variable.

## Localhost API surface

| Endpoint              | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `GET /health`         | Is the agent running? version + device id          |
| `GET /device/info`    | Public device metadata (never the private key)     |
| `POST /device/sign`   | Sign a canonical server challenge (rate-limited)   |

The agent binds loopback only, enforces the allowed-origin list, rejects
malformed/foreign-device challenges, and exposes **no** shell/file/upload/
download/admin endpoints.

## Production deployment notes

1. Install the agent on each approved Windows computer (or deploy as part of
   your image).
2. In the config `AllowedOrigins`, add your production FullAluDoor origin.
3. Sign in to FullAluDoor; the computer appears as a pending Windows device in
   `/admin`.
4. Approve it. All browsers on that computer are now approved.
5. Revoke/force re-enrollment from `/admin` when a computer is lost or needs a
   fresh key.

Security boundary reminder: this is Windows-protected-key + attestation +
server authorization. It is not "unforgeable hardware" — full local
administrative access can always interfere with local software.
