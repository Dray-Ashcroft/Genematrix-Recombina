# Arc – Genetrix · RC I

### *Living Lab — from restriction cut to recombinant selection*

**Release:** RC I  ·  **Date:** 16 Nov 2026  ·  **File:** `index.html` (single file, 3D plate model embedded)

---

## Highlights

| Area | What changed |
| --- | --- |
| 3D intro | Agar plate with cream colonies (embedded GLB, 1.1 MB, was 62 MB); drag to spin, tap to fly down into the dish |
| Living dish | Binary fission, run-and-tumble swimming, flagella, lysis at colony cap; dish fits phone screens |
| Restriction cut | Double-stranded view: enzyme scans, clamps, kinks DNA, staggered cut, overhang base pairs melt, enzyme releases |
| Ligation | Reverse of cutting: gene drifts in, overhangs anneal, ligase seals 4 staggered nicks; step tracker 1–4 and narration card |
| 3D DNA helix | Right-handed B-DNA built from the real sequence, a letter on every base, plasmid (blue) and gene (red) backbones |
| Atomic zoom | Ball-and-stick view from 1BNA geometry: A·T = 2 and G·C = 3 hydrogen bonds; ligase forms the O3′–P phosphodiester bond |
| Transformation | Heat shock at 42 °C; ligation mix of recombinant plasmids and empty vectors; only a few cells take one up |
| Selection | pBR322 map with ampR and tetR; insertional inactivation; plating and replica plating; β-gal blue–white screening |

## Selection by enzyme

| Enzyme | Cut site | Recombinant phenotype | Found by |
| --- | --- | --- | --- |
| BamHI | Inside tetR | ampR ✓ · tetR ✗ | Ampicillin plate → tetracycline replica |
| HindII | Inside ampR (simplified map) | tetR ✓ · ampR ✗ | Tetracycline plate → ampicillin replica |
| EcoRI | Outside both markers | ampR ✓ · tetR ✓ | Not by antibiotics — use blue–white (lacZ) |

**Concepts:** Restriction enzymes · Sticky and blunt ends · Annealing · Hydrogen bonds · Phosphodiester bond · DNA ligase · Transformation · Selectable markers · Insertional inactivation · Replica plating · Blue–white screening

<details>
<summary><b>Fixes</b></summary>

| Fix | Detail |
| --- | --- |
| Nick positions | Top- and bottom-strand nicks are now offset by the overhang length (were in the same column) |
| Degenerate site | HindII showed IUPAC letters (GTYRAC); now shows the real bases (GTTAAC) |
| Recombinant view | Tapping a recombinant cell's plasmid no longer fails after returning to the dish |
| Small screens | Dish no longer overflows 390 px wide phones |
| Repeat transformation | Restarting while plating no longer lets an old timer skip ahead or reopen the selection panel |
| Second experiment | Starts from a fresh, untransformed colony instead of mixing in earlier transformants |
| Tab icon | Built-in icon; no more missing-favicon request |

</details>

## Credits

| Contributor | Role |
| --- | --- |
| Sai Prasad, M.Sc. Agri. Entomology, ASRB NET | Project Designer |
| Claude Opus 5.5 | Development |

<details>
<summary><b>3D models and data</b></summary>

| Asset | Source | Licence |
| --- | --- | --- |
| Agar plate (intro) | Sketchfab model, modified: red agar replaced, internals removed, compressed | Check model page (CC BY requires credit) |
| DNA atomic geometry | PDB 1BNA, Drew & Dickerson (1981); standard base frames, Olson et al. (2001) | Public domain (PDB) |
| three.js | jsDelivr CDN, v0.170.0 | MIT |

</details>

---

<p align="center"><sub>GitHub · Codeberg | Hosted on Cloudflare</sub></p>
