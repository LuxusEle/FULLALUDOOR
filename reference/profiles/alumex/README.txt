Alumex Complete DXF Profile Library
===================================

Source: Alumex-Student-Profile-Book-Student.pdf

DXF files included: 192 unique, standalone dimensioned profiles
- Catalogue-traced architectural/profile sections: 125
- Parametric Group 16 sections generated directly from tabulated dimensions: 67
- Additional section IDs referenced only in assembly drawings: 5 (listed separately; no reliable standalone DXF in the book)

Total profile/section identifiers accounted for: 197

Why the final count differs from the earlier 132-file test
-----------------------------------------------------------
The first test covered mainly dimensioned architectural profile pages and contained four duplicate page variants. This complete pass de-duplicates identical section numbers and also includes Group 16 Round Pipe & Plate, Rectangular/Square Pipe, Equal/Unequal Angle, and Single/Double Channel tables. Those table families are generated parametrically, which is faster and more dimensionally exact than raster tracing.

DXF units
---------
Millimetres. Geometry is on the PROFILE layer. INFO text is on a separate layer.

Accuracy
--------
- PARAMETRIC Group 16 sections: built directly from catalogue A/B/T/OUT/IN/R values. Where an angle radius is not tabulated, a sharp inside DXF corner is used and noted in the manifest.
- Catalogue-traced sections: reconstructed from the vector/raster catalogue drawings and dimension-calibrated. Suitable for SketchUp/CAD libraries, estimating, visualisation, and layout.
- Not extrusion-die CAD. Verify critical mating, machining, die, gasket, screw-port, and tolerance dimensions against an official engineering drawing or physical profile before manufacturing.

Files
-----
individual/                 192 unique DXFs
manifest.csv                Source page, dimensions, method, confidence
assembly_referenced_only.csv 5 identifiers that cannot be reliably isolated as standalone profiles from this student book
Alumex_All_Profiles_Master.dxf All 192 profiles arranged on a grid
