# FullAluDoor

Fabrication-aware aluminium door configurator MVP built with TypeScript, React/Vinext and Babylon.js. It is ready for Supabase authentication/data and a later Vercel deployment.

## Run locally

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 9898
```

Open `http://localhost:9898`.

## Source package

- `reference/catalogs/` — Alumex Advance Profile Book source PDF.
- `reference/profiles/alumex/` — archival copy of the complete DXF library and manifests.
- `public/profiles/alumex/` — browser-loadable copy of all 192 DXF profiles.
- `reference/sketchup-prototype/` — earlier SketchUp research model/script.

The PDF is large and should be managed with Git LFS before the first remote push.

## Geometry contract

All dimensions are millimetres. World axes are X = width, Y = height, Z = depth. The viewer parses closed LWPOLYLINE loops and bulge arcs from the original DXFs, triangulates the wall sections and hollow chambers, and extrudes them along each member axis.

Rail bodies terminate with a 0.6 mm assembly gap at both stile faces. Following Alumex Group 08 page 03, only the internal angle cleats and threaded tie rods intentionally enter the hollow chambers. Unit tests enforce zero rail-body overlap with the stile envelopes. Machine-ready end drilling, cleat-hole coordinates and nesting remain gated until physical sample measurements confirm the catalog details.
