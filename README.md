<p align="center">
  <img src="banner/repository-banner.png" alt="GeneMatrix Recombina banner" width="100%">
</p>

<h1 align="center">GeneMatrix Recombina</h1>

<p align="center"><i>An interactive recombinant DNA laboratory — from restriction cut to recombinant selection</i></p>

<p align="center"><b><a href="https://genematrix-recombina.stark-kodex.workers.dev/">Initiate Gene Modification</a></b></p>

<p align="center">
  <a href="#about">About</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#stages">Stages</a> ·
  <a href="#controls">Controls</a> ·
  <a href="#technology">Technology</a> ·
  <a href="#credits">Credits</a> ·
  <a href="#license">License</a>
</p>

---

## About

GeneMatrix Recombina lets students make recombinant DNA step by step. Cut a plasmid and a gene with the same enzyme, join them with DNA ligase, and watch it happen on a 3D DNA helix.

Then put the new DNA into bacteria and find which colonies took it up — using antibiotic markers or blue–white screening.

## Screenshots

<table>
  <tr>
    <td width="50%" align="center"><img src="screenshots/Meet%20Genematrix.png" alt="Meet GeneMatrix" width="100%"><br><sub><b>1 · Meet GeneMatrix</b></sub></td>
    <td width="50%" align="center"><img src="screenshots/Explore%20Plasmid%20PBR322.png" alt="Explore plasmid pBR322" width="100%"><br><sub><b>2 · Explore pBR322</b></sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="screenshots/Visualise%20Ligation.png" alt="Visualise ligation" width="100%"><br><sub><b>3 · Visualise Ligation</b></sub></td>
    <td width="50%" align="center"><img src="screenshots/Spot%20Recombinants.png" alt="Spot recombinants" width="100%"><br><sub><b>4 · Spot Recombinants</b></sub></td>
  </tr>
</table>

<details>
<summary><b>More screenshots</b></summary>
<br>
<table>
  <tr>
    <td width="50%" align="center"><img src="screenshots/Gene%20Recombination.png" alt="Gene recombination" width="100%"><br><sub><b>5 · Gene Recombination</b></sub></td>
    <td width="50%" align="center"><img src="screenshots/Replica%20Plating.png" alt="Replica plating" width="100%"><br><sub><b>6 · Replica Plating</b></sub></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="screenshots/Explore%20in%20Unique%20way.png" alt="Explore in a unique way" width="100%"><br><sub><b>7 · Explore in a Unique Way</b></sub></td>
    <td width="50%"></td>
  </tr>
</table>
</details>

## Stages

| Stage | What You See | Tap to Explore |
| --- | --- | --- |
| Living Dish | 3D agar plate flies down into a dish of swimming, dividing *E. coli* | A bacterium, then its glowing plasmid |
| Plasmid Analysis | pBR322 map with ampR, tetR, ori, rop; base strip coloured by gene region | Any 6 bases; any gene or cut site on the map |
| Restriction Cut | Enzyme scans the duplex, clamps the site and makes a staggered or blunt cut | Restrict |
| Gene of Interest | Gene cut with the same enzyme; matching sticky ends compared | 6 bases, then Cut |
| Ligation | 3D helix; atomic zoom shows A·T (2) and G·C (3) hydrogen bonds; ligase seals 4 nicks | Bring the ends together · Seal with DNA ligase · Atoms |
| Transformation | Heat shock at 42 °C; only a few cells take up a plasmid | Put it into bacteria |
| Selection | Ampicillin / tetracycline plating with replica plating, or blue–white screening | Plate · Replica-plate · method tabs |
| Recombinants | Colony legend; each colony's ligated DNA and marker-gene state | A colony, then its plasmid |

**Concepts:** Restriction enzymes · Sticky and blunt ends · Annealing · Hydrogen bonds · Phosphodiester bond · DNA ligase · Vector pBR322 · Transformation · Selectable markers · Insertional inactivation · Replica plating · Blue–white screening · Nucleoid

## Controls

| Control | Function |
| --- | --- |
| Tap a cell | Zoom into the bacterium; tap its plasmid to analyse the DNA |
| Tap bases | Select a 6-base restriction site on the top strand |
| Tap the map | Show details for a gene or cut site; tap again to close |
| Drag the helix | Rotate the 3D DNA; Atoms switches to the ball-and-stick view |
| Method tabs · ↺ | Choose antibiotic or blue–white screening; repeat the transformation |
| © | Credits for the project, 3D models and data |

## Technology

HTML · CSS · JavaScript · Canvas 2D · three.js · WebGL · Web Audio · Cloudflare Pages

<details>
<summary><b>Project files</b></summary>

| File | Contents |
| --- | --- |
| `index.html` | Page structure, font links, three.js import map |
| `css/style.css` | All styles and layouts |
| `js/app.js` | Dish, cutting, ligation, transformation, selection, colony views |
| `js/hero.js` | 3D agar-plate intro |
| `js/dna3d.js` | 3D double helix and atomic view |
| `assets/petri-dish.glb` | Agar plate model (meshopt-compressed) |
| `banner/` · `screenshots/` | README images |

</details>

## Credits

| Contributor | Role |
| --- | --- |
| Sai Prasad, M.Sc. Agri. Entomology, ASRB NET | Project Designer |
| Claude Opus 5.5 | Development |
| OpenAI GPT Luna 5.7 | Image Generation |
| Perplexity Sonar 2 | Scientific Reasoning |

<details>
<summary><b>3D models</b></summary>

| Asset | Model | Creator | Licence |
| --- | --- | --- | --- |
| Intro plate | [Microbial Culture (petri dish – agar plate)](https://sketchfab.com/3d-models/microbial-culture-petri-dish-agar-plate-a760d477c4564ac98d38ce11c5be8215) | Ioannis Stavridis | CC BY 4.0 |
| Helix style reference | [DNA](https://sketchfab.com/3d-models/dna-547d42f6c0184232a945051b6952a39e) | LucasPresoto | CC BY 4.0 |
| Atomic view reference | [dna](https://sketchfab.com/3d-models/dna-eee1f1afd4fb4cb2983f04cc122e1bf3) | andrey6475u | CC BY 4.0 |

The intro plate was modified (agar recoloured, hidden parts removed, compressed). Atomic geometry follows PDB 1BNA (Drew & Dickerson, 1981) with standard base frames (Olson et al., 2001). All models used under CC BY 4.0 with attribution.

</details>

<details>
<summary><b>Libraries and fonts</b></summary>

| Component | Licence |
| --- | --- |
| three.js r170 | MIT |
| IBM Plex Sans · IBM Plex Mono | SIL Open Font License 1.1 |
| Roboto · Roboto Mono (fallback) | SIL Open Font License 1.1 |

</details>

## Releases

| Release | Title | Date |
| --- | --- | --- |
| RC I | Living Lab | 16 Nov 2026 |

## License

Released under the GNU General Public License v3.0 — see [LICENSE](LICENSE).

---

<p align="center"><sub><a href="https://github.com/Dray-Ashcroft/Genematrix-Recombina">GitHub</a> · Codeberg | Hosted on Cloudflare Pages</sub></p>
