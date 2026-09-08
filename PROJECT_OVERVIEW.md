# FullAluDoor — Project Overview

## 1. What it is

FullAluDoor is a fabrication-aware aluminium door and window design workspace
delivered as a browser application. A single live project state drives the
whole flow — parametric opening configuration, 3D visualization, 2D CAD-style
drawings, profile cut lists, linear-bar nesting, commercial quoting,
fabrication checks, and a printable A4 manufacturing dossier — with no separate
data entry before PDF export.

The repository root **is** the application (this is not a nested-repo layout).
It also holds the Supabase migrations that back device-bound authentication and
admin-managed access, and the native Windows Device Agent that provides the
trusted per-computer identity.

## 2. Repository layout

```text
D:\FULLALUDOOR\
  app\                     Next/Vinext pages: workspace, login, /admin,
                           device-pending, device-denied, 3D viewer, designer
  components\              UI (auth gate screens, admin device panel, shadcn/ui kit)
  hooks\                   Shared React hooks
  lib\                     Domain engines + auth/device client, Supabase,
                           unit tests (*.test.ts, vitest)
  public\profiles\alumex\  Browser-loadable DXF profile library (192 profiles)
  supabase\                Supabase CLI migrations + schema reference
  tools\                   FullAluDoor Device Agent (.NET, Windows) + tests
  docs\                    Design docs (device-binding.md)
  reference\               Alumex catalogues, archival profiles, prototypes
  publish\                 Build output (wrangler/agent artifacts)
  .github\workflows\       CI: build, test, Cloudflare Workers deploy
  PROJECT_OVERVIEW.md      This file
  README.md                Quick-start readme
```

## 3. Tech stack

- TypeScript + React 19 on the Vinext/Vite toolchain (`next`-style `app/`
  routing; build via `vinext build`).
- Babylon.js for 3D assemblies, exploded views, and joints.
- SVG for 2D vector CAD drawings and PDF visuals.
- Supabase (Postgres + Row Level Security) for auth, profiles, and
  admin-approved device binding.
- Windows Device Agent: native .NET helper on loopback `127.0.0.1:8750` that
  signs per-request attestation challenges (Ed25519 via pgsodium on the DB).
- Deployed to Cloudflare Workers via `wrangler` (see `.github/workflows/deploy.yml`).

## 4. Application areas

| Area | Purpose |
| --- | --- |
| Workspace (`app/page.tsx`) | Main CAD/CAM workspace with project library (open/delete). |
| 3D Studio | Width/height, system, handing, finish, glass, opening angle; assembly/exploded/cutaway views. |
| Project Schedule | Multiple openings with tags, locations, dimensions, quantities, systems, finishes, notes. |
| 2D Vector CAD | Construction-oriented dimensioned drawings, elevations, sections. |
| 1D Linear Nesting | Cut pieces onto stock bars with saw kerf, offcuts, scrap, weight, yield. |
| Quote / BOM | Aluminium, glass, hardware, gasket, labour, coating summary. |
| Fabricator Audit | Construction dossier review before release. |
| PDF Export | A4 dossier: cover, schedule, elevations, cutting list, materials, nesting, sequence, sign-off. |

Routes: `/` workspace · `/login` · `/admin` device administration ·
`/device-pending` · `/device-denied`.

## 5. Access control (device-bound)

The UI is never the authorization boundary. Access is enforced in the database:

- **hybrid_windows** (default): sign-in resolves a `windows_agent` enrollment
  keyed to the native agent's device id. The gate challenges the agent, the DB
  verifies the Ed25519 signature, and only approved + active accounts render.
  Devices start PENDING and are approved in `/admin`.
- **browser_legacy**: optional per-browser token mode (operator choice).
- Admin RPCs (`admin_list_devices`, `admin_device_action`, …) require the
  caller's own approved device **and** the `admin` role in `profiles`.
- The first administrator bootstraps via `become_first_admin` (shown as
  "Initialize this deployment" when no admin exists).
- Recovery for a revoked sole-admin device lives in
  `supabase/migrations/20260908000005_approve_admin_recovery.sql` (and the
  original `20260908000001_approve_initial_admin.sql`).

Client surface: `components/auth/access-gate.tsx` (gate state machine),
`components/auth/gate-screens.tsx`, `components/admin/admin-device-panel.tsx`,
`lib/device-*.ts`. See `docs/device-binding.md` for the full threat model and
workflows.

## 6. Supabase

```text
supabase\
  migrations\       20260906053907_remote_schema.sql (base snapshot)
                    20260907000000_device_binding.sql
                    20260908000000_hybrid_windows_device_binding.sql
                    20260908000001_approve_initial_admin.sql
                    20260908000002…00004   pgsodium enablement
                    20260908000005_approve_admin_recovery.sql
  schema.sql        Schema reference
```

Core tables: `organizations`, `door_projects`, `profiles` (role/status),
`user_devices` (status + attestation), `device_attestation_challenges`,
`device_audit_log`, `app_settings` (binding policy). RLS is enabled; device
status changes happen only through SECURITY DEFINER RPCs.

## 7. Windows Device Agent (`tools/FullAluDoor.DeviceAgent`)

Build/test/publish:

```powershell
cd tools
dotnet build FullAluDoor.DeviceAgent.sln
dotnet test  FullAluDoor.DeviceAgent.sln
dotnet publish FullAluDoor.DeviceAgent/FullAluDoor.DeviceAgent/FullAluDoor.DeviceAgent.csproj -c Release -o publish/agent
```

`FullAluDoor.DeviceAgent.exe --install` registers per-user autostart;
`--re-enroll`/`--uninstall --purge` manage identity. Loopback API:
`/health`, `/device/info`, `/device/sign`. Allowed origins and port are set in
`config.json` (`%ProgramData%\FullAluDoor Device Agent\`,
`%LocalAppData%\FullAluDoor Device Agent\`).

## 8. Commands

```powershell
npm run dev                 # vinext dev -H 0.0.0.0 -p 9898
npm run build               # vinext build
npm test                    # vitest run
npm run lint                # oxlint app lib
npm run format              # oxfmt
npm run deploy              # build + wrangler deploy (Cloudflare Workers)
```

Open `http://localhost:9898/`.

## 9. Engineering conventions

- All geometry dimensions are millimetres.
- World axes: X = width, Y = height, Z = depth.
- Default stock length 6000 mm; default blade kerf 3.5 mm; offcuts ≥ 500 mm are
  marked reusable.
- Rail bodies keep a 0.6 mm assembly gap at stile faces; only cleats and tie
  rods enter the hollow chambers (unit-tested against stile envelopes).

## 10. Configuration

Public Supabase values live in `.env` (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus service-role/server variables). Device
binding defaults to `hybrid_windows`; only reachable demo mode is when Supabase
is absent. `.dev.vars` is ignored for local Cloudflare development.
