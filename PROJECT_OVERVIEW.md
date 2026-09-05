# FullAluDoor Project Overview

## 1. Project Summary

FullAluDoor is a fabrication-aware aluminium door and window design workspace. It combines parametric opening configuration, 3D visualization, 2D CAD-style drawings, aluminium profile cut lists, linear bar nesting, commercial quoting, fabrication checks, and cutting-plane PDF export in one browser application.

The project is designed for aluminium fabricators, estimators, workshop teams, and architectural coordination workflows.

## 2. Core Capabilities

### 3D Studio

- Configure opening width and height.
- Select aluminium system typology.
- Set handing, finish, glass type, and opening angle.
- View assembly, exploded, and joint cutaway modes.
- Review geometry and fabrication invariants.

### Project Schedule

- Manage multiple door and window openings.
- Store project tags, locations, dimensions, quantities, systems, finishes, and notes.
- Select an opening to load it into the 3D studio.

### 2D Vector CAD

- Display construction-oriented opening drawings.
- Show dimensions, elevations, sections, and profile references.
- Use the same project opening data as the fabrication calculations.

### 1D Linear Nesting

- Group cut pieces by aluminium profile.
- Nest pieces onto standard stock bars.
- Apply the configured saw kerf.
- Calculate used length, remaining offcut, reusable offcut, scrap, weight, and yield.
- Display workshop labels and exportable cut information.

### Commercial Quote and BOM

- Calculate project-level material and fabrication information.
- Present aluminium, glass, hardware, gasket, labour, and coating data.
- Provide a client-facing commercial summary.

### Fabricator Audit

- Review geometry, profile references, joints, sections, and fabrication checks.
- Inspect the project as a construction dossier before production release.

### Cutting-Plane PDF Export

The global **Export PDF** action creates a browser-printable manufacturing dossier containing:

1. Project cover and revision metadata.
2. Opening and geometry schedule.
3. Dimensioned opening elevation visuals.
4. Aluminium profile cutting list.
5. Glass and material schedule.
6. Hardware schedule.
7. Colour-coded linear nesting visuals.
8. Bar-by-bar cut sequence, angles, kerf, offcuts, and disposition.
9. Fabrication release notes and sign-off information.

The PDF uses the live project state. No separate data entry is required before export.

## 3. Technology Stack

- TypeScript
- React 19
- Vinext and Vite
- Babylon.js for 3D visualization
- SVG for vector drawings and PDF visuals
- Zod for configuration validation
- Vitest for unit tests
- Oxlint for linting
- Supabase client package for future authentication and data integration
- Cloudflare/Wrangler tooling for deployment workflows

## 4. Important Project Paths

```text
app/
  door-designer.tsx        Main workspace and global project state
  door-viewer.tsx          Babylon.js 3D viewer
  globals.css              Application and print/PDF styles
  page.tsx                 Application entry page

components/
  project-schedule.tsx     Multi-opening project schedule
  vector-cad-drawings.tsx  2D construction drawing workspace
  nesting-view.tsx         Linear bar nesting and workshop labels
  commercial-quote.tsx     Commercial quote and BOM
  fabrication-audit-report.tsx
                           Fabricator audit and construction dossier
        cutting-plane-print-document.tsx
                                                                                                         Printable cutting-plane PDF document
        manufacturing-dossier.ts
                                                                                                         Live manufacturing dossier transformer

lib/
  door-model.ts            Door geometry, cut lists, glass and hardware
  nesting-engine.ts        Stock-bar nesting, kerf and offcut calculations
  axonometric-bar.ts       3D bar and profile geometry helpers
  dxf-profile.ts           DXF profile parsing
  dxf-svg-paths.ts         DXF-to-SVG drawing paths
  types.ts                 Shared domain types

public/profiles/alumex/    Browser-loadable Alumex DXF profile library
reference/                 Catalogues, archived profile data and prototypes
supabase/schema.sql        Supabase database schema reference
```

## 5. Main Data Flow

```text
Project metadata + opening schedule
        |
        v
Opening configuration and validation
        |
        v
Door geometry derivation
        |
        +--> Cut list
        +--> Glass panels
        +--> Hardware schedule
        +--> 3D and 2D drawings
        |
        v
Project-wide cut aggregation
        |
        v
Linear bar nesting
        |
        +--> Stock bars
        +--> Kerf waste
        +--> Reusable offcuts
        +--> Scrap waste
        +--> Yield and material weight
        |
        v
Cutting-plane PDF export
```

## 6. Local Development

### Requirements

- Node.js `22.13.0` or newer.
- npm.
- The project `.env` file with the required public Supabase values when Supabase-backed features are used.

### Install

```powershell
cd D:\FULLALUDOOR\FULLALUDOOR
npm ci
```

### Run the development server

```powershell
npm run dev -- --host 127.0.0.1 --port 9898
```

Open:

```text
http://localhost:9898/
```

### Production checks

```powershell
npm run lint
npm test
npm run build
```

## 7. PDF Export Workflow

1. Start the application.
2. Configure or review the project openings.
3. Confirm dimensions, systems, finishes, and quantities.
4. Click **Export PDF** in the top action bar.
5. In the browser print dialog, select A4 paper and **Save as PDF**.
6. Review the cutting list, visual elevations, nesting bars, offcuts, and release notes before issuing the document.

The exported visuals are generated as vector SVG elements, so dimensions and bar layouts remain sharp in the saved PDF.

## 8. Engineering Assumptions

- All geometry dimensions are in millimetres.
- World axes are X = width, Y = height, and Z = depth.
- Standard stock length is 6000 mm unless changed in the nesting engine.
- Default blade kerf is 3.5 mm.
- Offcuts of 500 mm or more are marked reusable.
- Aluminium profile weights and dimensions are sourced from the local profile definitions.
- Production release still requires physical measurement confirmation for drilling, cleat-hole coordinates, and other machine-specific preparation details.

## 9. Validation Status

The current project validation commands are:

- Unit tests: 34 tests passing.
- Lint: passing.
- Production build: passing.

The build may report a large-client-chunk warning from the current toolchain. This is a performance warning and does not prevent the application from running.

## 10. Production Readiness Notes

Before production deployment or workshop release:

- Confirm all project dimensions against approved site measurements.
- Confirm the correct Alumex profile catalogue revision.
- Verify profile weights and stock availability.
- Validate drilling, cleat, lock, hinge, and hardware preparation against physical samples.
- Review reusable offcuts before purchasing new stock.
- Keep generated PDFs under project revision control.
- Configure Supabase authentication and storage policies before enabling shared project persistence.
