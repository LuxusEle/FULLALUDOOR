# FullAluDoor — Workspace Overview

## 1. Repository Layout

This workspace root contains the FullAluDoor application and its supporting
Supabase migration folder.

```text
D:\FULLALUDOOR\
  PROJECT_OVERVIEW.md   This file — workspace-level overview
  FULLALUDOOR\          Main application project (its own git repository)
  supabase\             Supabase CLI migrations folder
  .venv\                Local Python virtual environment (tooling)
```

## 2. Main Application — `FULLALUDOOR\`

FullAluDoor is a fabrication-aware aluminium door and window design workspace.
It combines parametric opening configuration, 3D visualization, 2D CAD-style
drawings, aluminium profile cut lists, linear bar nesting, commercial quoting,
fabrication checks, and cutting-plane PDF export in one browser application.
It targets aluminium fabricators, estimators, workshop teams, and architectural
coordination workflows.

Key characteristics:

- TypeScript + React 19 application built with the Vinext/Vite toolchain.
- Babylon.js for 3D visualization of assemblies, exploded views, and joints.
- SVG for 2D vector CAD drawings and PDF visuals.
- Local aluminium profile definitions loaded from `public/profiles/alumex/`
  (all 192 DXF profiles, browser-loadable).
- A live project state drives everything: opening schedule, geometry, cut lists,
  nesting, quotes, and the printable manufacturing dossier — no separate data
  entry before PDF export.

### Core capabilities

| Area | Purpose |
| --- | --- |
| 3D Studio | Configure width/height, system, handing, finish, glass, and opening angle; view assembly/exploded/cutaway modes. |
| Project Schedule | Manage multiple openings with tags, locations, dimensions, quantities, systems, finishes, notes. |
| 2D Vector CAD | Construction-oriented dimensioned drawings, elevations, and sections. |
| 1D Linear Nesting | Nest profile cut pieces onto stock bars with saw kerf, offcuts, scrap, weight, yield. |
| Commercial Quote / BOM | Material and fabrication summary: aluminium, glass, hardware, gasket, labour, coating. |
| Fabricator Audit | Construction dossier review of geometry, joints, sections, and checks before release. |
| PDF Export | A4 print dossier: cover, schedule, elevations, cutting list, materials, nesting, cut sequence, sign-off. |

### Key source areas

```text
app\            Application entry, global project state, 3D viewer, print styles
components\     Project schedule, 2D CAD, nesting, quote, audit, print document
lib\            Door model, nesting engine, BOM engine, manufacturing dossier,
                DXF parsing / SVG paths, axonometric helpers, shared types,
                Supabase client, unit tests (*.test.ts)
public\profiles\alumex\   Browser-loadable DXF profile library (192 profiles)
reference\      Catalogues, archived profile data and prototypes
supabase\schema.sql        Supabase database schema reference
```

### Engineering conventions

- All geometry dimensions are millimetres.
- World axes: X = width, Y = height, Z = depth.
- Default stock length 6000 mm; default blade kerf 3.5 mm; offcuts ≥ 500 mm are
  marked reusable.

### Local development

```powershell
cd D:\FULLALUDOOR\FULLALUDOOR
npm ci
npm run dev -- --host 127.0.0.1 --port 9898
```

Open `http://localhost:9898/`.

Validation: `npm run lint`, `npm test`, `npm run build`.

> See `FULLALUDOOR\PROJECT_OVERVIEW.md` for the detailed, in-project overview.

## 3. Supabase — `supabase\`

Root-level Supabase CLI workspace for database migrations.

```text
supabase\
  migrations\
    20260906053907_remote_schema.sql   Remote schema snapshot (currently empty)
```

The application itself ships a schema reference at
`FULLALUDOOR\supabase\schema.sql`, which defines:

- `organizations` — owner-scoped tenant records.
- `door_projects` — JSONB project configurations owned by an organization.
- Row-level security policies scoping access to the owning user/organization.

Supabase integration is intended for future authentication and shared project
persistence. Configure the public Supabase environment values before enabling
those features.

## 4. Relationship Between Folders

```text
Supabase CLI schema (supabase\)  <--->  app schema reference (FULLALUDOOR\supabase\schema.sql)
                                              |
                                              v
                         FullAluDoor application (FULLALUDOOR\)
                              client-side state + future cloud persistence
```
