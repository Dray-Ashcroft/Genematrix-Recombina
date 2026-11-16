(function() {
  /* ============================================================
     CONFIG
     ============================================================ */
  const canvas = document.getElementById('bioCanvas');
  const ctx = canvas.getContext('2d');

  let W, H, CX, CY;
  // Dish size adapts to the screen (set in resize); 220px max on large screens
  let dishRadius = 220;
  let dishInnerRadius = 200;
  const bacteriaCount = 16;      // starting colony size
  const MAX_BACTERIA = 44;       // colony cap — at the cap, old cells lyse to make room
  const GROW_RATE = [0.00045, 0.0009]; // fraction of birth length added per frame
  const DIVIDE_AT = 1.75;        // divide once length reaches this × birth length
  const particleCount = 60;

  /* ============================================================
     RECOGNITION-SITE SYSTEM (redesigned)
     ------------------------------------------------------------
     Earlier versions forced the student toward one hard-coded
     6-base "correct answer," which is not how restriction mapping
     actually works and is what made the exercise feel arbitrary.
     Real students should be free to select ANY 6 consecutive
     top-strand bases; the tool then checks that window against the
     real recognition sequences of EcoRI, BamHI, and HindII (as per
     the NCERT Class XII reference chart) and reports whichever
     enzyme, if any, would cut there. HindII's site is degenerate
     (Y = C or T, R = A or G), so matching uses IUPAC codes rather
     than a literal string comparison.

     The complementary (bottom) strand is derived automatically for
     biological accuracy but is never selectable — no pointer
     listeners are ever attached to it, so bases from different
     strands can never be combined into one selection.
     ============================================================ */
  const IUPAC = { A: 'A', T: 'T', G: 'G', C: 'C', R: 'AG', Y: 'CT', N: 'ATGC' };

  function complementOf(seq) {
    const map = { A: 'T', T: 'A', G: 'C', C: 'G', R: 'Y', Y: 'R', N: 'N' };
    return seq.split('').map(b => map[b] || 'N').join('');
  }

  function matchesPattern(fragment, pattern) {
    if (fragment.length !== pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      const allowed = IUPAC[pattern[i]] || pattern[i];
      if (!allowed.includes(fragment[i])) return false;
    }
    return true;
  }

  // cutAfter = how many bases (on the TOP strand, left to right) sit
  // before the cut. The bottom-strand cut mirrors it automatically
  // because every recognition site here is palindromic:
  // bottomCutAfter = pattern.length - cutAfter.
  const ENZYMES = [
    { name: 'EcoRI',  pattern: 'GAATTC', source: 'Escherichia coli strain RY13',        cutAfter: 1, endType: 'sticky' },
    { name: 'BamHI',  pattern: 'GGATCC', source: 'Bacillus amyloliquefaciens strain H', cutAfter: 1, endType: 'sticky' },
    { name: 'HindII', pattern: 'GTYRAC', source: 'Haemophilus influenzae strain Rd',    cutAfter: 3, endType: 'blunt'  },
  ];

  function findMatchingEnzyme(fragment) {
    return ENZYMES.find(e => matchesPattern(fragment, e.pattern)) || null;
  }

  // Positions strictly between the current picks' min and max that
  // AREN'T picked yet — i.e. the gap(s) still needed to complete a
  // contiguous run. The span-based selection rule (see onBaseClick)
  // deliberately allows tapping bases in any order, which means a
  // legitimate in-progress selection can have a temporary gap — e.g.
  // both ends of a site tapped before the middle. An earlier version
  // of this helper ("findStrayIndices") flagged exactly those
  // legitimate picks as if they were mistakes; this replaces that with
  // something actually useful: pointing at what still needs a tap,
  // never accusing a correct pick of being wrong. Pure function, no
  // side effects, shared by both stages' UI updates.
  function findGapIndices(selectedBases) {
    const indices = selectedBases.map(s => s.index);
    if (indices.length < 2) return new Set();
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    const picked = new Set(indices);
    const gaps = new Set();
    for (let i = minIdx; i <= maxIdx; i++) {
      if (!picked.has(i)) gaps.add(i);
    }
    return gaps;
  }

  // Single source of truth for "what does this enzyme's cut look like."
  // Used by the plasmid Restrict result, the Gene-of-Interest reference
  // card, and the gene cut result — so all three can never disagree
  // about the same enzyme's cut pattern or overhang.
  // Renders a strand's letters as a fixed-width grid with the cut
  // arrow inserted at its own reserved gap-slot — never as inline
  // text sharing the letters' natural flow. Because every gap between
  // letters is the same width whether or not it holds the arrow, the
  // top line's arrow (at its own cut position) and the bottom line's
  // arrow (at a DIFFERENT cut position, in general) can never drag
  // the surrounding letters out of column alignment with each other.
  function buildCutLineHtml(letters, cutAfter, arrowChar) {
    const gapIndex = cutAfter - 1;
    let html = '';
    for (let i = 0; i < letters.length; i++) {
      html += `<span class="cut-letter">${letters[i]}</span>`;
      if (i < letters.length - 1) {
        html += `<span class="cut-gap">${i === gapIndex ? arrowChar : ''}</span>`;
      }
    }
    return `<span class="cut-line">${html}</span>`;
  }

  function computeCutDisplay(enzyme) {
    const pattern = enzyme.pattern;
    const cutAfter = enzyme.cutAfter;
    const bottomPattern = complementOf(pattern);       // 3'→5', aligned under the top strand
    const bottomCutAfter = pattern.length - cutAfter;  // mirrored, since every site here is palindromic
    const overhang = pattern.slice(cutAfter, pattern.length - cutAfter); // '' for blunt enzymes
    const topCut = `${pattern.slice(0, cutAfter)}\u2193${pattern.slice(cutAfter)}`;
    const bottomCut = `${bottomPattern.slice(0, bottomCutAfter)}\u2191${bottomPattern.slice(bottomCutAfter)}`;
    const endLabel = enzyme.endType === 'blunt'
      ? 'Blunt end — no overhang'
      : `Sticky end — 5' overhang (${overhang})`;
    return { pattern, bottomPattern, cutAfter, bottomCutAfter, overhang, topCut, bottomCut, endLabel };
  }

  // Top strand, 5'→3': contains one real site for each of the three
  // enzymes above (GAATTC, GGATCC, GTTAAC — the last one satisfies
  // HindII's GTYRAC pattern), plus filler bases so the sites aren't
  // simply adjacent. Every base has a unique index, 0..25.
  const PLASMID = { seq: 'ATGAATTCTAGGATCCCGGTTAACTA' };
  PLASMID.complement = complementOf(PLASMID.seq); // bottom strand, 3'→5', aligned under the top strand

  const PLASMID_TEMPLATES = [PLASMID];

  // Gene-of-Interest DNA — a separate fragment the student must cut
  // with the SAME enzyme used on the plasmid, to produce a compatible
  // sticky end. One concrete template per enzyme (HindII's is a real
  // instantiation of its degenerate GTYRAC pattern), each with its
  // recognition site placed near a flank rather than in the middle of
  // the "gene," so the gene itself stays conceptually intact after
  // cutting. Looked up by enzyme name — never hard-coded to one enzyme.
  //
  // The prefix deliberately ends in "A", not "G": every one of these
  // enzymes' sites starts with G, and an earlier version's prefix also
  // ended in G, so the site's real leading G sat right next to a
  // look-alike decoy G. A selection could spell the right 6 letters
  // while actually starting one base too early (skipping the true
  // site's first base) — right letters, wrong (non-consecutive)
  // positions. Ending the prefix in A removes that trap entirely.
  const GENE_TEMPLATES = {
    EcoRI:  'ATCTAGAATTCTGACCGT',  // GAATTC at indices 5–10
    BamHI:  'ATCTAGGATCCTGACCGT',  // GGATCC at indices 5–10
    HindII: 'ATCTAGTTAACTGACCGT',  // GTTAAC at indices 5–10 (satisfies GTYRAC)
  };

  function getGeneSequence(enzymeName) {
    const seq = GENE_TEMPLATES[enzymeName];
    return { seq, complement: complementOf(seq) };
  }

  /* ============================================================
     STATE
     ============================================================ */
  const appState = {
    mode: 'IDLE',   // IDLE | CELL_SELECTED | PLASMID_ANALYSIS | SUCCESS | PLASMID_CUT | GENE_ANALYSIS | GENE_CUT | READY_FOR_INSERTION | STICKY_ENDS_ANNEALED | LIGATION_IN_PROGRESS | LIGATION_COMPLETE
    selectedIndex: -1,
    hoverIndex: -1,
    mouseX: 0, mouseY: 0,
    cellZoom: 0,     // 0→1 transition
    recombinantMode: false,           // true once "See Recombinants" has been clicked
    recombinantBacteriumIndex: -1,    // which bacterium was designated as carrying the recombinant plasmid
    transform: null,                  // transformation event state (plasmids entering cells by heat shock)
    selective: false,                 // true once ampicillin has been added to the plate
    smoothIdleTransition: false,      // one-shot flag: lets the "See Recombinants" zoom-out lerp smoothly instead of the normal instant-snap deselect
    panelOpen: false,
    selectedBases: [], // array of {index, base}, in selection order
    matchedEnzyme: null, // set by validateSelection() when the current selection is a real site
    plasmidCut: null,        // set once the plasmid is actually cut — { enzyme, recognitionSite, cutAfter, endType, overhang, source }
    geneSelectedBases: [],   // gene-stage equivalent of selectedBases
    geneMatchedEnzyme: null, // gene-stage equivalent of matchedEnzyme
    geneCut: null,           // set once the gene is actually cut, mirrors plasmidCut
    ligationRunId: 0,        // bumped whenever the ligation animation is (re)started or aborted, so stray setTimeout callbacks from a superseded run can recognize themselves as stale and no-op
    cutAnimRunId: 0,         // same pattern, for the restriction-cutting docking/split animation (plasmid and gene stages both use this)
  };

  const camera = { x: 0, y: 0, scale: 1, targetX: 0, targetY: 0, targetScale: 1 };

  const bacteria = [];
  const ambientParticles = [];

  /* ============================================================
     DOM REFS
     ============================================================ */
  const brand        = document.getElementById('brand');
  const hintOverlay  = document.getElementById('hint-overlay');
  const panel        = document.getElementById('analysis-panel');
  const panelTitle   = document.getElementById('panel-title');
  const panelSubtitle = document.getElementById('panel-subtitle');
  const seqBasesEl   = document.getElementById('seq-bases');
  const posRulerEl   = document.getElementById('pos-ruler');
  const seqBasesComplementEl = document.getElementById('seq-bases-complement');
  const strandScrollEl = document.getElementById('strand-scroll');
  const scrollLeftBtn  = document.getElementById('scroll-left');
  const scrollRightBtn = document.getElementById('scroll-right');
  const readoutEl    = document.getElementById('readout-seq');
  const plasmidEnzymeChip = document.getElementById('plasmid-enzyme-chip');
  const statusArea   = document.getElementById('status-area');
  const btnReset     = document.getElementById('btn-reset');
  const btnRestrict  = document.getElementById('btn-restrict');

  // Stage containers
  const stagePlasmid  = document.getElementById('stage-plasmid');
  const stageGene     = document.getElementById('stage-gene');
  const stageGeneCut  = document.getElementById('stage-gene-cut');
  const stageLigation = document.getElementById('stage-ligation');
  const stageRecombinantView = document.getElementById('stage-recombinant-view');
  const STAGES = { stagePlasmid, stageGene, stageGeneCut, stageLigation, stageRecombinantView };

  // Stage 1 extra: the "move on" row, shown only after a successful cut
  const plasmidNextRow = document.getElementById('plasmid-next-row');
  const btnGoToGene    = document.getElementById('btn-go-to-gene');

  // Stage 2 (Gene of Interest analysis)
  const referenceCard        = document.getElementById('plasmid-reference-card');
  const seqBasesGeneEl       = document.getElementById('seq-bases-gene');
  const posRulerGeneEl       = document.getElementById('pos-ruler-gene');
  const seqBasesComplementGeneEl = document.getElementById('seq-bases-complement-gene');
  const strandScrollGeneEl   = document.getElementById('strand-scroll-gene');
  const scrollLeftGeneBtn    = document.getElementById('scroll-left-gene');
  const scrollRightGeneBtn   = document.getElementById('scroll-right-gene');
  const readoutGeneEl        = document.getElementById('readout-seq-gene');
  const geneEnzymeChip       = document.getElementById('gene-enzyme-chip');
  const statusAreaGene       = document.getElementById('status-area-gene');
  const btnResetGene         = document.getElementById('btn-reset-gene');
  const btnCutGene           = document.getElementById('btn-cut-gene');

  // Stage 3 (Gene cut + comparison)
  const statusAreaGeneCut  = document.getElementById('status-area-gene-cut');
  const compareSection     = document.getElementById('compare-section');
  const comparePlasmidEnd  = document.getElementById('compare-plasmid-end');
  const compareGeneEnd     = document.getElementById('compare-gene-end');
  const compatibleStatus   = document.getElementById('compatible-status');
  const btnProceedLigation = document.getElementById('btn-proceed-ligation');

  // Stage 4 (insertion → annealing → ligation)
  const preInsertSection   = document.getElementById('pre-insert-section');
  const plasmidStickyDiagram = document.getElementById('plasmid-sticky-diagram');
  const geneStickyDiagram    = document.getElementById('gene-sticky-diagram');
  const junctionStickyDiagram = document.getElementById('junction-sticky-diagram');
  const plasmidStrandTop   = document.getElementById('plasmid-strand-top');
  const plasmidStrandBottom = document.getElementById('plasmid-strand-bottom');
  const geneStrandTop      = document.getElementById('gene-strand-top');
  const geneStrandBottom   = document.getElementById('gene-strand-bottom');
  const junctionSection    = document.getElementById('junction-section');
  const junctionLabel      = document.getElementById('junction-label');
  const junctionStrip      = document.getElementById('junction-strip');
  const junctionStrandTop  = document.getElementById('junction-strand-top');
  const junctionStrandBottom = document.getElementById('junction-strand-bottom');
  const ligaseChip         = document.getElementById('ligase-chip');
  const insertActionRow    = document.getElementById('insert-action-row');
  const ligateActionRow    = document.getElementById('ligate-action-row');
  const seeRecombinantsRow = document.getElementById('see-recombinants-row');
  const btnSeeRecombinants = document.getElementById('btn-see-recombinants');
  const recombinantStrandTop    = document.getElementById('recombinant-strand-top');
  const recombinantStrandBottom = document.getElementById('recombinant-strand-bottom');
  const btnInsertGene      = document.getElementById('btn-insert-gene');
  const btnSimulateLigation = document.getElementById('btn-simulate-ligation');
  const ligationStatus = document.getElementById('ligation-status');

  // Left/right scroll buttons — a swipe directly on the DNA strand was
  // landing on a base and registering as a mistouch/selection. These
  // buttons live outside .strand-scroll entirely, so scrolling never
  // touches the selectable bases at all.
  function wireScrollButtons(scrollEl, leftBtn, rightBtn) {
    const STEP = 130; // roughly 4 bases
    leftBtn.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      scrollEl.scrollBy({ left: -STEP, behavior: 'smooth' });
    });
    rightBtn.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      scrollEl.scrollBy({ left: STEP, behavior: 'smooth' });
    });
  }
  wireScrollButtons(strandScrollEl, scrollLeftBtn, scrollRightBtn);
  wireScrollButtons(strandScrollGeneEl, scrollLeftGeneBtn, scrollRightGeneBtn);

  /* ============================================================
     UTILITIES
     ============================================================ */
  function resize() {
    const container = document.getElementById('sim-container');
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    if (CX === undefined) {
      CX = W / 2; CY = H / 2;
      dishRadius = Math.max(120, Math.min(220, W / 2 - 14, H / 2 - 70));
      dishInnerRadius = dishRadius - Math.round(dishRadius * 0.09);
      window.__dishRadius = dishRadius;
    } else if (typeof updateDishLayout === 'function') {
      updateDishLayout(true);   // move dish + cells to the new free area
    }
    // Keep any cells that ended up outside a newly-smaller dish inside it
    for (const b of bacteria) {
      const dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy), lim = dishInnerRadius - 30;
      if (d > lim) { b.x = CX + dx / d * lim; b.y = CY + dy / d * lim; }
    }
    if (appState.selectedIndex < 0) {
      camera.targetX = CX; camera.x = CX;
      camera.targetY = CY; camera.y = CY;
    }
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function worldToScreen(wx, wy) {
    return { x: (wx - camera.x) * camera.scale + CX, y: (wy - camera.y) * camera.scale + CY };
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - CX) / camera.scale + camera.x, y: (sy - CY) / camera.scale + camera.y };
  }

  /* ============================================================
     INITIALISATION
     ============================================================ */
  function makeBacterium(x, y, birthLen, tmpl) {
    if (birthLen == null) birthLen = rand(18, 26);
    return {
        x, y,
        angle: Math.random() * Math.PI * 2,
        length: birthLen,
        birthLen,
        growRate: rand(GROW_RATE[0], GROW_RATE[1]),
        divP: 0,              // 0 = not dividing; 0→1 = septum pinching
        dying: 0,             // 0 = alive; 0→1 = lysing / fading out
        age: 0,
        recombinant: false,   // carries the recombinant plasmid (inherited by daughters)
        // Run-and-tumble swimming (E. coli chemotaxis-style motility)
        runT: rand(40, 200),
        tumbleT: 0,
        speed: rand(0.25, 0.55),
        flagPhase: Math.random() * Math.PI * 2,
        flagCount: Math.random() < 0.5 ? 1 : 2,
        width: rand(6, 10),
        vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3),
        va: rand(-0.015, 0.015),
        glowPhase: Math.random() * Math.PI * 2,
        glowSpeed: rand(0.02, 0.05),
        hue: rand(260, 290),
        opacity: rand(0.7, 0.95),
        trail: [],
        plasmid: { ...(tmpl || PLASMID_TEMPLATES[Math.floor(Math.random() * PLASMID_TEMPLATES.length)]) },
        plasmidPhase: Math.random() * Math.PI * 2,
        cytoTexture: Array.from({ length: 14 }, () => ({
          x: rand(-0.42, 0.42),
          y: rand(-0.42, 0.42),
          size: rand(0.6, 1.8),
          o: rand(0.05, 0.16),
        })),
      };
  }

  function initBacteria() {
    bacteria.length = 0;
    for (let i = 0; i < bacteriaCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (dishInnerRadius - 50);
      const b = makeBacterium(CX + Math.cos(angle) * dist, CY + Math.sin(angle) * dist);
      // Stagger cell-cycle stages so the colony doesn't divide in lockstep
      b.length = b.birthLen * rand(1, DIVIDE_AT - 0.05);
      bacteria.push(b);
    }
  }

  function initAmbientParticles() {
    ambientParticles.length = 0;
    for (let i = 0; i < particleCount; i++) {
      ambientParticles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: rand(-0.15, 0.15),
        vy: rand(-0.15, 0.15),
        size: rand(0.5, 2),
        opacity: rand(0.05, 0.25),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /* ============================================================
     SIMULATION UPDATE
     ============================================================ */
  // Is the colony "live" (dish visible, nothing selected)? Growth,
  // division and lysis only happen then, so the array never shifts
  // under a selected cell and the user actually sees the events.
  function colonyLive() {
    return appState.mode === 'IDLE' && appState.selectedIndex < 0 && appState.cellZoom < 0.05;
  }

  function divideBacterium(b) {
    const half = b.length / 2;
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    const off = half / 2 + 1;
    const d = makeBacterium(b.x + ca * off, b.y + sa * off, half, b.plasmid);
    d.angle = b.angle;
    d.hue = b.hue + rand(-4, 4);
    d.width = b.width; d.opacity = b.opacity; d.speed = b.speed;
    d.recombinant = b.recombinant;   // daughter inherits the plasmid → clonal spread
    d.plasmidType = b.plasmidType;
    d.vx = b.vx + ca * 0.35; d.vy = b.vy + sa * 0.35;
    d.runT = rand(20, 60);
    b.x -= ca * off; b.y -= sa * off;
    b.vx -= ca * 0.35; b.vy -= sa * 0.35;
    b.length = half; b.birthLen = half;
    b.divP = 0; b.age = 0;
    b.runT = rand(20, 60);
    b.trail.length = 0;
    bacteria.push(d);
  }

  function updateBacteria() {
    const live = colonyLive();
    const alive = bacteria.filter(b => !b.dying).length;

    for (const b of bacteria) {
      // ── Run-and-tumble motility ──
      if (b.tumbleT > 0) {
        b.tumbleT--;
        b.va += rand(-0.03, 0.03);          // flagella unbundle → cell spins in place
      } else {
        b.runT--;
        const thrust = 0.012 * b.speed * (b.divP > 0 ? 0.3 : 1);
        b.vx += Math.cos(b.angle) * thrust;  // swim forward along the rod's long axis
        b.vy += Math.sin(b.angle) * thrust;
        b.va += rand(-0.0015, 0.0015);
        if (b.runT <= 0) { b.tumbleT = rand(12, 30); b.runT = rand(60, 220); }
      }
      b.vx += rand(-0.004, 0.004);          // Brownian jitter
      b.vy += rand(-0.004, 0.004);
      b.vx *= 0.96; b.vy *= 0.96; b.va *= 0.9;
      b.x += b.vx; b.y += b.vy; b.angle += b.va;

      const dx = b.x - CX, dy = b.y - CY;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      if (d > dishInnerRadius - 30) {
        const nx = dx / d, ny = dy / d;
        b.vx -= nx * 0.05; b.vy -= ny * 0.05;
        // Turn away from the wall instead of grinding along it
        if (b.tumbleT <= 0 && (Math.cos(b.angle) * nx + Math.sin(b.angle) * ny) > 0.3) b.tumbleT = 15;
      }

      b.glowPhase += b.glowSpeed;
      b.plasmidPhase += 0.02;
      b.flagPhase += b.tumbleT > 0 ? 0.12 : 0.28;
      b.trail.push({ x: b.x, y: b.y, angle: b.angle });
      if (b.trail.length > 8) b.trail.shift();

      if (!live) continue;

      // ── Growth & binary fission ──
      if (b.dying) { b.dying += 0.012; continue; }
      if (appState.selective && !survives(b, appState.plate) && b.killAt && performance.now() > b.killAt) { b.dying = 0.001; b.divP = 0; continue; }
      if (appState.selective && !survives(b, appState.plate)) continue;   // antibiotic: sensitive cells can't grow
      b.age++;
      const growth = b.plasmidType && appState.selective ? 1.5 : 1;   // survivors spread into colonies
      if (b.divP > 0) {
        b.divP += 0.006;                    // septum pinches in
      } else if (b.length < b.birthLen * DIVIDE_AT) {
        b.length += b.birthLen * b.growRate * growth;
      } else if (alive < MAX_BACTERIA) {
        b.divP = 0.001;                     // start dividing
      }
    }

    if (!live) return;

    // Finish divisions (iterate a snapshot — divideBacterium pushes)
    const n = bacteria.length;
    for (let i = 0; i < n; i++) {
      const b = bacteria[i];
      if (b.divP >= 1 && !b.dying) divideBacterium(b);
    }

    // Turnover: over the cap, an old non-recombinant cell lyses
    const nowAlive = bacteria.filter(b => !b.dying).length;
    if (nowAlive > MAX_BACTERIA - 2 && Math.random() < 0.01) {
      const cands = bacteria.filter(b => !b.dying && !b.plasmidType && !b.protect && b.divP === 0);
      if (cands.length) {
        cands.sort((a, c) => c.age - a.age);
        cands[Math.floor(Math.random() * Math.min(5, cands.length))].dying = 0.001;
      }
    }
    // Remove fully lysed cells (safe: nothing is selected while live)
    for (let i = bacteria.length - 1; i >= 0; i--) {
      if (bacteria[i].dying >= 1) bacteria.splice(i, 1);
    }
  }

  function updateAmbientParticles() {
    for (const p of ambientParticles) {
      p.x += p.vx; p.y += p.vy;
      p.phase += 0.01;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    }
  }

  function updateCamera() {
    if (appState.selectedIndex >= 0) {
      const b = bacteria[appState.selectedIndex];
      camera.targetX = b.x;
      camera.targetY = b.y;
      camera.targetScale = 4.5;
    } else {
      camera.targetX = CX; camera.targetY = CY; camera.targetScale = 1;
    }
    camera.x += (camera.targetX - camera.x) * 0.035;
    camera.y += (camera.targetY - camera.y) * 0.035;
    camera.scale += (camera.targetScale - camera.scale) * 0.035;
  }

  function updateTransitions() {
    const target = (appState.mode === 'CELL_SELECTED' || PANEL_OPEN_MODES.includes(appState.mode)) ? 1 : 0;
    appState.cellZoom += (target - appState.cellZoom) * 0.05;
    if (appState.cellZoom < 0.001) appState.cellZoom = 0;
    if (appState.cellZoom > 0.999) appState.cellZoom = 1;
  }

  function updateHover() {
    if (appState.mode !== 'IDLE') { appState.hoverIndex = -1; return; }
    const w = screenToWorld(appState.mouseX, appState.mouseY);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < bacteria.length; i++) {
      const b = bacteria[i];
      if (b.dying) continue;
      const dx = w.x - b.x, dy = w.y - b.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < b.length && d < bestD) { bestD = d; best = i; }
    }
    appState.hoverIndex = best;
  }

  /* ============================================================
     HIT DETECTION
     ============================================================ */
  function getBacteriumAt(wx, wy) {
    for (let i = 0; i < bacteria.length; i++) {
      const b = bacteria[i];
      if (b.dying) continue;
      const dx = wx - b.x, dy = wy - b.y;
      const cos = Math.cos(-b.angle), sin = Math.sin(-b.angle);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (Math.abs(lx) < b.length/2 + 6 && Math.abs(ly) < b.width/2 + 6) return i;
    }
    return -1;
  }

  // Plasmid tap target — single source of truth.
  // ------------------------------------------------------------
  // drawMagnifiedCell() renders the magnified cell (and the plasmid
  // inside it) directly in SCREEN space: translate to screen center
  // (CX, CY), rotate by the bacterium's angle, then offset to the
  // plasmid's local position. It never goes through the world<->screen
  // camera transform used by the idle petri-dish view.
  //
  // The old isPlasmidHit() checked world-space coordinates instead
  // (via screenToWorld + the camera's pan/zoom), a completely
  // different coordinate system from what's actually drawn. The two
  // only ever lined up by coincidence, and would drift apart on other
  // screen sizes/aspect ratios or the moment camera parameters change.
  // getPlasmidScreenPos() below reuses drawMagnifiedCell's own formula,
  // so the hit test and the drawing can never disagree.
  const PLASMID_BASE_RADIUS = 28;
  const PLASMID_TAP_MARGIN = 14; // matches the animated dashed "tap here" ring

  // Where the magnified cell is drawn: centred in the space the panel leaves free
  const cellView = { x: 0, y: 0, len: 0, init: false };
  function cellFrameTarget() {
    let x = CX, y = CY, len = Math.min(W, H) * 0.55;
    const panelEl = document.getElementById('analysis-panel');
    if (appState.panelOpen && panelEl) {
      const r = panelEl.getBoundingClientRect();
      if (W > 768) { const free = Math.max(200, r.left); x = free / 2; len = Math.min(len, free * 0.78); }
      else { const free = Math.max(160, r.top); y = Math.max(70, free / 2 + 20); len = Math.min(len, W * 0.8, (free - 40) * 1.6); }
    }
    return { x, y, len };
  }
  function updateCellFrame() {
    const t = cellFrameTarget();
    if (!cellView.init) { Object.assign(cellView, t, { init: true }); return; }
    cellView.x += (t.x - cellView.x) * 0.12; cellView.y += (t.y - cellView.y) * 0.12; cellView.len += (t.len - cellView.len) * 0.12;
  }
  function getPlasmidScreenPos() {
    if (appState.selectedIndex < 0) return null;
    const cLen = cellView.len || Math.min(W, H) * 0.55;
    const localX = cLen * 0.22;
    const localY = 0;
    // The magnified cell is always drawn horizontal now (see
    // drawMagnifiedCell) — no rotation term here means this stays the
    // exact inverse of that rendering, whatever the bacterium's
    // underlying (untouched) dish angle happens to be.
    return { x: (cellView.x || CX) + localX, y: (cellView.y || CY) + localY };
  }

  function isPlasmidHit(sx, sy) {
    const pos = getPlasmidScreenPos();
    if (!pos) return false;
    const hitRadius = PLASMID_BASE_RADIUS + PLASMID_TAP_MARGIN;
    const dx = sx - pos.x, dy = sy - pos.y;
    return (dx * dx + dy * dy) < hitRadius * hitRadius;
  }

  /* ============================================================
     PANEL / SEQUENCE LOGIC
     ============================================================ */
  // Adds a small 1-based position number to a base bubble on ruler
  // ticks (every 5th position, plus the very first and last) — lets
  // the student count "which base is this" directly from the strand
  // instead of scrolling blind and losing track, which was the actual
  // root cause behind several rounds of selection confusion.
  // Ticks are positioned from the ACTUAL rendered base elements, not
  // from a second independently-computed flex/grid row. Each tick's
  // left offset and width are copied directly from its corresponding
  // .base element's real box (getBoundingClientRect, relative to the
  // ruler's own position) — the same coordinate the dotted pairing
  // guide (.base::after) is already centered on, so number, guide,
  // and nucleotide all share one source of truth for their X position.
  function buildPositionRuler(rulerEl, baseContainerEl, seqLength) {
    rulerEl.innerHTML = '';
    const rulerRect = rulerEl.getBoundingClientRect();
    const baseEls = baseContainerEl.children;
    for (let i = 0; i < seqLength; i++) {
      const oneBased = i + 1;
      const isTick = oneBased % 5 === 0 || i === 0 || i === seqLength - 1;
      if (!isTick) continue;
      const baseRect = baseEls[i].getBoundingClientRect();
      const span = document.createElement('span');
      span.className = 'pos-tick';
      span.textContent = String(oneBased);
      span.style.left = (baseRect.left - rulerRect.left) + 'px';
      span.style.width = baseRect.width + 'px';
      rulerEl.appendChild(span);
    }
  }


  // ---------- Plasmid regions shown on the base strip ----------
  // The 26-base strip shows three key stretches of the vector joined for
  // display: a non-coding stretch (EcoRI), part of tetR (BamHI) and part
  // of ampR (HindII). Matches MARKER_OF / the vector map.
  const PLASMID_REGIONS = [
    { from: 0, to: 8, id: 'none', label: 'non-coding' },
    { from: 9, to: 16, id: 'tetR', label: 'tetR gene' },
    { from: 17, to: 25, id: 'ampR', label: 'ampR gene' },
  ];
  const regionOf = i => PLASMID_REGIONS.find(r => i >= r.from && i <= r.to) || PLASMID_REGIONS[0];
  function buildRegionBand() {
    const band = document.getElementById('region-band');
    if (!band) return;
    band.innerHTML = '';
    const bandRect = band.getBoundingClientRect();
    const els = seqBasesEl.children;
    for (const r of PLASMID_REGIONS) {
      if (!els[r.from] || !els[r.to]) continue;
      const a = els[r.from].getBoundingClientRect(), z = els[r.to].getBoundingClientRect();
      const d = document.createElement('div');
      d.className = 'rb ' + r.id; d.dataset.id = r.id;
      d.style.left = (a.left - bandRect.left + 1) + 'px';
      d.style.width = (z.right - a.left - 2) + 'px';
      d.textContent = r.label;
      band.appendChild(d);
    }
    let note = document.getElementById('region-note');
    if (!note) {
      note = document.createElement('div'); note.id = 'region-note'; note.className = 'region-note';
      document.querySelector('#stage-plasmid .dna-sequence-container').appendChild(note);
    }
    updateRegionFeedback();
  }
  function updateRegionFeedback() {
    const note = document.getElementById('region-note');
    if (!note) return;
    const picked = appState.selectedBases.map(s => s.index);
    const ids = [...new Set(picked.map(i => regionOf(i).id))];
    document.querySelectorAll('#region-band .rb').forEach(el => el.classList.toggle('on', ids.includes(el.dataset.id)));
    let focus = null;
    if (!picked.length) {
      note.innerHTML = 'Coloured bands show where each base sits on the plasmid: <span class="g-tetR">tetR</span>, <span class="g-ampR">ampR</span> or non-coding DNA. Cutting inside a marker gene inactivates it once a gene is inserted.';
    } else if (ids.length > 1) {
      note.innerHTML = 'Your selection spans <b>two regions</b> — a restriction site is one continuous stretch of 6 bases.';
    } else {
      const id = ids[0]; focus = id === 'none' ? null : id;
      note.innerHTML = id === 'none'
        ? 'You are selecting in <b>non-coding DNA</b> — an insert here would leave <span class="g-ampR">ampR</span> and <span class="g-tetR">tetR</span> intact.'
        : `You are selecting inside the <span class="g-${id}">${id}</span> gene — an insert here would <b>inactivate ${id}</b> (insertional inactivation).`;
    }
    if (!appState.plasmidCut) {
      const vm = document.getElementById('vec-map');
      if (vm) renderMap('vec-map', 'vec-info', { size: 260, focusGene: focus, mode: 'pbr' });
    }
  }

  function buildSequenceUI() {
    if (appState.selectedIndex < 0) return;
    const b = bacteria[appState.selectedIndex];
    const seq = b.plasmid.seq;
    const comp = b.plasmid.complement;

    // Top strand — the ONLY selectable strand. Every nucleotide is a
    // real, uniquely-indexed object (index 0..seq.length-1), and that
    // index — not screen position — is what selection/validation uses.
    // No position is pre-marked as "the answer": the student is free
    // to test any 6-base window.
    seqBasesEl.innerHTML = '';
    for (let i = 0; i < seq.length; i++) {
      const span = document.createElement('span');
      span.className = 'base';
      span.textContent = seq[i];
      span.dataset.index = i;
      span.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        onBaseClick(i);
      });
      seqBasesEl.appendChild(span);
    }
    buildPositionRuler(posRulerEl, seqBasesEl, seq.length);
    requestAnimationFrame(buildRegionBand);   // after layout, like the ruler

    // Bottom (complementary) strand — rendered for biological accuracy
    // only. No pointer listeners are attached here, so these bases can
    // never be selected or mixed into a top-strand selection.
    seqBasesComplementEl.innerHTML = '';
    for (let i = 0; i < comp.length; i++) {
      const span = document.createElement('span');
      span.className = 'base-static';
      span.textContent = comp[i];
      seqBasesComplementEl.appendChild(span);
    }
  }

  function onBaseClick(index) {
    // Selection is only ever meant to be live during PLASMID_ANALYSIS.
    // (Broadened from checking only mode==='SUCCESS' — now that PLASMID_CUT
    // exists as its own mode sharing this same stage container, that
    // narrower check would stop guarding once the plasmid is actually cut.)
    if (appState.mode !== 'PLASMID_ANALYSIS') return;
    const b = bacteria[appState.selectedIndex];
    const base = b.plasmid.seq[index];
    const indices = appState.selectedBases.map(s => s.index);
    const existingIdx = indices.indexOf(index);

    if (existingIdx >= 0) {
      // Freely toggle off any pick — an earlier version of this fix
      // only allowed removing from either end, but that was needless:
      // the span rule below already guarantees the final 6 can't have
      // a gap, so mid-selection gaps are fine while still choosing.
      appState.selectedBases.splice(existingIdx, 1);
      updateSelectionUI();
      return;
    }

    if (appState.selectedBases.length >= 6) {
      statusArea.className = 'status-area show status-error';
      statusArea.textContent = 'Maximum 6 bases. Deselect one first.';
      setTimeout(() => { if (appState.selectedBases.length < 6) statusArea.className = ''; }, 1500);
      return;
    }

    // Reject a pick only if it would make a contiguous 6-base window
    // mathematically impossible — i.e. it plus the existing picks would
    // span more than 6 positions. This is deliberately more permissive
    // than "must extend from an end": it allows tapping bases in ANY
    // order (both ends first, then filling the middle, etc.), while
    // still guaranteeing — by pigeonhole, not by restricting order —
    // that 6 accepted picks can only ever be the same 6 consecutive
    // positions. A non-contiguous final selection remains impossible.
    if (indices.length > 0) {
      const span = Math.max(...indices, index) - Math.min(...indices, index) + 1;
      if (span > 6) {
        const existingGaps = findGapIndices(appState.selectedBases);
        statusArea.className = 'status-area show status-error';
        statusArea.textContent = existingGaps.size > 0
          ? 'Fill the pulsing gap in your current selection first'
          : 'That base is too far from your current picks for a 6-base site';
        setTimeout(() => { if (appState.selectedBases.length < 6) statusArea.className = ''; }, 1600);
        return;
      }
    }

    appState.selectedBases.push({ index, base });
    updateSelectionUI();

    if (appState.selectedBases.length === 6) {
      validateSelection();
    }
  }

  function updateSelectionUI() {
    const b = bacteria[appState.selectedIndex];
    if (!b) return;
    const seq = b.plasmid.seq;

    // Strand bubbles: a picked base empties out — its letter is removed
    // and reappears down in the tray — rather than staying visible with
    // a highlight. Any unpicked base sitting inside the current picks'
    // span pulses amber — that's the gap left to fill, since the
    // span-based selection rule allows filling a site's bases in any
    // order (e.g. both ends before the middle).
    const gapIndices = findGapIndices(appState.selectedBases);
    const baseEls = seqBasesEl.querySelectorAll('.base');
    baseEls.forEach((el, i) => {
      const isPicked = appState.selectedBases.some(s => s.index === i);
      el.className = 'base reg-' + regionOf(i).id;
      el.textContent = seq[i];
      if (isPicked) {
        el.classList.add('picked');
      } else if (gapIndices.has(i)) {
        el.classList.add('gap-needed');
      }
    });

    updateRegionFeedback();

    // Tray reads left-to-right in genomic order (5'→3'), regardless of
    // the order the bases were tapped in — the student picks freely,
    // the tool assembles the window correctly.
    const sorted = [...appState.selectedBases].sort((a, c) => a.index - c.index);
    readoutEl.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      if (i < sorted.length) {
        span.textContent = sorted[i].base;
        span.style.color = '#fff';
        span.style.textShadow = '0 0 8px rgba(180,140,255,0.5)';
      } else {
        span.className = 'empty-slot';
        span.textContent = '_';
      }
      span.style.margin = '0 2px';
      readoutEl.appendChild(span);
    }

    // Clear status if not full
    if (appState.selectedBases.length < 6) {
      statusArea.className = '';
      statusArea.textContent = '';
      btnRestrict.disabled = true;
      btnRestrict.textContent = 'Restrict';
      appState.matchedEnzyme = null;
    }
  }

  function validateSelection() {
    const sorted = [...appState.selectedBases].sort((a, c) => a.index - c.index);
    const indices = sorted.map(s => s.index);
    const isConsecutive = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
    const fragment = sorted.map(s => s.base).join('');

    if (!isConsecutive) {
      statusArea.className = 'status-area show status-error';
      statusArea.textContent = '✗ Bases must be consecutive — the red-outlined picks on the strand don\'t connect to the rest';
      btnRestrict.disabled = true;
      appState.matchedEnzyme = null;
      return;
    }

    const enzyme = findMatchingEnzyme(fragment);
    if (enzyme) {
      statusArea.className = 'status-area show status-success';
      statusArea.innerHTML =
        `✓ RECOGNITION SITE IDENTIFIED<br>` +
        `<strong style="font-size:15px;letter-spacing:3px;">${fragment}</strong><br>` +
        `<span style="font-size:10px;opacity:0.75">Cleaved by ${enzyme.name} — ${enzyme.source}</span>`;
      btnRestrict.disabled = false;
      appState.matchedEnzyme = enzyme;
      setMode('SUCCESS');
    } else {
      statusArea.className = 'status-area show status-error';
      statusArea.innerHTML =
        `✗ <strong>${fragment}</strong> is not a recognition site<br>` +
        `<span style="font-size:10px;opacity:0.7">for EcoRI, BamHI, or HindII</span>`;
      btnRestrict.disabled = true;
      appState.matchedEnzyme = null;
    }
  }

  /* ============================================================
     STAGE NAVIGATION HELPERS
     ============================================================ */
  function showStage(name) {
    Object.entries(STAGES).forEach(([key, el]) => {
      el.classList.toggle('stage-hidden', key !== name);
    });
  }

  function setPanelHeader(title, subtitle) {
    panelTitle.textContent = title;
    panelSubtitle.textContent = subtitle;
  }

  /* ============================================================
     GENE-OF-INTEREST STAGE
     ------------------------------------------------------------
     Mirrors the plasmid stage's own functions (buildSequenceUI /
     onBaseClick / updateSelectionUI / validateSelection) closely,
     on purpose: same interaction, same visual language, just a
     second DNA fragment and a second piece of state
     (geneSelectedBases / geneMatchedEnzyme instead of
     selectedBases / matchedEnzyme). Kept as separate functions
     rather than merged into one parameterized version so the
     already-stabilized plasmid flow can't be affected by anything
     added here.
     ============================================================ */
  // Shared by both the plasmid and gene stages (never run concurrently,
  // so one generation counter is enough): shows the restriction enzyme
  // docking at the recognition site, then animates the actual matched
  // letters splitting into a paired group and an overhang group — the
  // same real-DNA-letter technique already used for the Stage-3
  // ligation animation, applied here to cutting instead of sealing.
  // Blunt-cutting enzymes get two equally-colored groups (no overhang
  // to highlight); sticky-end enzymes get the overhang half in cyan,
  // matching the color language used everywhere else in the app.
  // ── Tiny Web Audio sound kit (no files) ──
  let audioCtx = null;
  function sfx(kind) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      if (kind === 'blip') {
        o.type = 'sine'; o.frequency.setValueAtTime(880, t);
        g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.start(t); o.stop(t + 0.07);
      } else if (kind === 'lock') {
        o.type = 'triangle'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(640, t + 0.12);
        g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.start(t); o.stop(t + 0.2);
      } else if (kind === 'seal') {
        o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1040, t + 0.15);
        g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.start(t); o.stop(t + 0.26);
      } else if (kind === 'snip') {
        o.type = 'square'; o.frequency.setValueAtTime(2400, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
        g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        o.start(t); o.stop(t + 0.08);
      }
    } catch (_) { /* audio is optional */ }
  }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

  // Restriction cut animation — double-stranded duplex with real
  // flanking bases. Sequence of events (all real biology):
  //   1. enzyme (a homodimer) slides along the DNA, scanning
  //   2. it recognises the palindromic site and clamps on; DNA kinks
  //   3. each subunit cuts one strand's backbone (staggered for sticky ends)
  //   4. hydrogen bonds in the overhang region melt; fragments part
  //   5. enzyme releases and diffuses away
  // ctxSeq/ctxStart (optional) = the strand the site was picked from
  // and the site's start index, so the flanks are the real neighbours.
  function runCutAnimation(chipEl, readoutContainerEl, enzyme, onComplete, ctxSeq, ctxStart) {
    appState.cutAnimRunId += 1;
    const runId = appState.cutAnimRunId;
    const alive = () => appState.cutAnimRunId === runId;
    const later = (ms, fn) => setTimeout(() => { if (alive()) fn(); }, ms);

    const cut = computeCutDisplay(enzyme);
    const L = enzyme.pattern.length;
    const FL = 2; // flanking bases each side
    let site = enzyme.pattern, lf = 'NN', rf = 'NN';
    if (ctxSeq && ctxStart != null && ctxStart >= 0) {
      site = ctxSeq.slice(ctxStart, ctxStart + L);
      lf = ctxSeq.slice(Math.max(0, ctxStart - FL), ctxStart).padStart(FL, '·');
      rf = ctxSeq.slice(ctxStart + L, ctxStart + L + FL).padEnd(FL, '·');
    }
    const top = (lf + site + rf).split('');
    const bot = top.map(c => (c === '·' ? '·' : complementOf(c)));
    const N = top.length;
    const topCutCol = FL + cut.cutAfter;        // first column of right fragment, top strand
    const botCutCol = FL + cut.bottomCutAfter;  // first column of right fragment, bottom strand
    const meltLo = Math.min(topCutCol, botCutCol), meltHi = Math.max(topCutCol, botCutCol);

    const cw = 20, padX = 22;               // px per base; room for 5'/3' labels
    const width = N * cw + padX * 2;
    const X = col => padX + col * cw;

    chipEl.className = 'enzyme-chip';       // legacy chip stays hidden
    readoutContainerEl.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'cutx';
    root.style.width = width + 'px';
    root.style.maxWidth = '100%';

    const fragL = document.createElement('div'); fragL.className = 'cutx-frag l';
    const fragR = document.createElement('div'); fragR.className = 'cutx-frag r';
    fragL.style.width = fragR.style.width = width + 'px';
    const meltLayer = document.createElement('div'); meltLayer.className = 'cutx-frag'; meltLayer.style.width = width + 'px';

    const letters = [];
    for (let c = 0; c < N; c++) {
      const isSite = c >= FL && c < FL + L;
      const inOH = c >= meltLo && c < meltHi;
      const mk = (ch, row, frag) => {
        const e = document.createElement('div');
        e.className = `cutx-b ${row}` + (isSite ? ' site' : '') + (inOH ? ' oh' : '');
        e.style.left = X(c) + 'px';
        e.textContent = ch;
        frag.appendChild(e);
        return e;
      };
      const tEl = mk(top[c], 'top', c < topCutCol ? fragL : fragR);
      const bEl = mk(bot[c], 'bot', c < botCutCol ? fragL : fragR);
      letters.push([tEl, bEl]);
      // H-bond rung: travels with a fragment if both bases do, else melts
      const rung = document.createElement('div');
      rung.style.left = (X(c) + cw / 2) + 'px';
      if (inOH) { rung.className = 'cutx-rung melt'; meltLayer.appendChild(rung); }
      else { rung.className = 'cutx-rung'; (c < topCutCol ? fragL : fragR).appendChild(rung); }
    }
    // Backbones, split at each strand's own cut point
    const bb = (row, from, to, frag) => {
      const e = document.createElement('div');
      e.className = `cutx-bb ${row}`;
      e.style.left = (X(from) + 2) + 'px';
      e.style.width = (X(to) - X(from) - 4) + 'px';
      frag.appendChild(e);
    };
    bb('top', 0, topCutCol, fragL); bb('top', topCutCol, N, fragR);
    bb('bot', 0, botCutCol, fragL); bb('bot', botCutCol, N, fragR);
    // Strand polarity labels
    const lab = (txt, left, topPx, frag) => {
      const e = document.createElement('div');
      e.className = 'cutx-end'; e.textContent = txt;
      e.style.left = left + 'px'; e.style.top = topPx + 'px';
      frag.appendChild(e);
    };
    lab("5'", 4, 38, fragL); lab("3'", 4, 70, fragL);
    lab("3'", width - 14, 38, fragR); lab("5'", width - 14, 70, fragR);

    // Enzyme clamp
    const enz = document.createElement('div');
    enz.className = 'cutx-enz';
    enz.style.width = (L * cw + 16) + 'px';
    enz.innerHTML = `<div class="cutx-lobe up"><span>${enzyme.name}</span></div><div class="cutx-lobe dn"></div>`;
    const siteLeft = X(FL);
    const startLeft = X(0) - L * cw - 20;
    enz.style.transform = `translateX(${startLeft}px)`;

    // Sparks at each strand's cut point
    const spark = (col, y) => {
      const e = document.createElement('div');
      e.className = 'cutx-spark';
      e.style.left = X(col) + 'px'; e.style.top = y + 'px';
      root.appendChild(e);
      return e;
    };
    const caption = document.createElement('div');
    caption.className = 'cutx-caption';

    root.append(meltLayer, fragL, fragR, enz);
    const sparkTop = spark(topCutCol, 47), sparkBot = spark(botCutCol, 79);
    root.appendChild(caption);
    readoutContainerEl.appendChild(root);
    const say = t => { caption.textContent = t; };

    // 1. Scan
    say(`${enzyme.name} scanning DNA…`);
    root.classList.add('searching');
    requestAnimationFrame(() => {
      if (!alive()) return;
      enz.style.opacity = '1';
      enz.style.transform = `translateX(${siteLeft}px)`;
    });
    // Light up bases as the clamp passes over them
    for (let c = 0; c < FL + L; c++) {
      later(250 + c * 120, () => {
        const [a, b] = letters[c];
        a.classList.add('scan'); b.classList.add('scan');
        if (c < FL) sfx('blip');
        setTimeout(() => { a.classList.remove('scan'); b.classList.remove('scan'); }, 220);
      });
    }
    // 2. Recognise + clamp
    later(1600, () => {
      root.classList.remove('searching');
      root.classList.add('locked', 'kink');
      say(`Site recognised — ${site}`);
      sfx('lock'); buzz(12);
    });
    // 3. Cleave — top strand, then bottom strand
    later(2200, () => {
      say(enzyme.endType === 'blunt' ? 'Cutting both strands' : 'Staggered cut');
      sparkTop.classList.add('go'); sfx('snip'); buzz(18);
      root.classList.add('shake');
    });
    later(2420, () => {
      sparkBot.classList.add('go'); sfx('snip'); buzz(18);
      root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
    });
    // 4. Melt overhang + separate; 5. release
    later(2750, () => {
      root.classList.remove('kink', 'locked');
      root.classList.add('split', 'release');
      enz.style.transition = 'transform 0.9s ease-in, opacity 0.9s ease-in';
      enz.style.transform = `translateX(${siteLeft}px) translateY(-10px) scale(0.9)`;
      enz.style.opacity = '0';
      say(enzyme.endType === 'blunt'
        ? 'Blunt ends — no overhang'
        : `Sticky ends — ${cut.overhang} overhangs`);
    });
    later(3900, onComplete);
  }

  function renderPlasmidCutResult() {
    const enzyme = appState.matchedEnzyme;
    if (!enzyme) return;
    const cut = computeCutDisplay(enzyme);

    // The one place appState.plasmidCut gets written — driven entirely
    // by whichever enzyme was actually matched, never hard-coded.
    appState.plasmidCut = {
      enzyme: enzyme.name,
      recognitionSite: enzyme.pattern,
      cutAfter: enzyme.cutAfter,
      endType: enzyme.endType,
      overhang: cut.overhang,
      source: enzyme.source,
    };

    statusArea.className = 'status-area show status-cut';
    statusArea.innerHTML =
      `\u2702 CUT COMPLETE — ${enzyme.name}<br>` +
      `<span style="font-size:13px; display:inline-block; margin:4px 0;">` +
      `5'-${buildCutLineHtml(cut.pattern.split(''), cut.cutAfter, '\u2193')}-3'<br>` +
      `3'-${buildCutLineHtml(cut.bottomPattern.split(''), cut.bottomCutAfter, '\u2191')}-5'` +
      `</span><br>` +
      `<span style="font-size:10px;opacity:0.75">${cut.endLabel} · ${enzyme.source}</span>`;

    btnRestrict.disabled = true;
    btnRestrict.textContent = 'Cut ✓';
    renderVectorCard();
    plasmidNextRow.style.display = 'flex';
  }

  function renderPlasmidReferenceCard() {
    if (!appState.plasmidCut) return;
    const enzyme = ENZYMES.find(e => e.name === appState.plasmidCut.enzyme);
    const cut = computeCutDisplay(enzyme);

    const overhangHtml = enzyme.endType === 'blunt'
      ? `<div class="reference-overhang">Blunt end — no overhang</div>`
      : `<div class="reference-overhang"><strong>${cut.overhang}</strong>Sticky End</div>`;

    referenceCard.innerHTML =
      `<div class="reference-enzyme">${enzyme.name}</div>` +
      `<div class="reference-cut-lines">5'-${buildCutLineHtml(cut.pattern.split(''), cut.cutAfter, '\u2193')}-3'<br>3'-${buildCutLineHtml(cut.bottomPattern.split(''), cut.bottomCutAfter, '\u2191')}-5'</div>` +
      overhangHtml;
  }

  function buildGeneSequenceUI() {
    if (!appState.plasmidCut) return;
    const { seq, complement } = getGeneSequence(appState.plasmidCut.enzyme);

    seqBasesGeneEl.innerHTML = '';
    for (let i = 0; i < seq.length; i++) {
      const span = document.createElement('span');
      span.className = 'base';
      span.textContent = seq[i];
      span.dataset.index = i;
      span.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        onGeneBaseClick(i);
      });
      seqBasesGeneEl.appendChild(span);
    }
    buildPositionRuler(posRulerGeneEl, seqBasesGeneEl, seq.length);

    seqBasesComplementGeneEl.innerHTML = '';
    for (let i = 0; i < complement.length; i++) {
      const span = document.createElement('span');
      span.className = 'base-static';
      span.textContent = complement[i];
      seqBasesComplementGeneEl.appendChild(span);
    }
  }

  function onGeneBaseClick(index) {
    // Only live during GENE_ANALYSIS, and only before a correct match
    // locks it — mirrors onBaseClick()'s plasmid-stage lock.
    if (appState.mode !== 'GENE_ANALYSIS' || appState.geneMatchedEnzyme) return;
    const { seq } = getGeneSequence(appState.plasmidCut.enzyme);
    const base = seq[index];
    const indices = appState.geneSelectedBases.map(s => s.index);
    const existingIdx = indices.indexOf(index);

    if (existingIdx >= 0) {
      // Freely toggle off any pick — see onBaseClick's identical comment.
      appState.geneSelectedBases.splice(existingIdx, 1);
      updateGeneSelectionUI();
      return;
    }

    if (appState.geneSelectedBases.length >= 6) {
      statusAreaGene.className = 'status-area show status-error';
      statusAreaGene.textContent = 'Maximum 6 bases. Deselect one first.';
      setTimeout(() => { if (appState.geneSelectedBases.length < 6) statusAreaGene.className = ''; }, 1500);
      return;
    }

    // Reject only if this pick would make a contiguous 6-base window
    // impossible (span > 6) — see onBaseClick's identical reasoning.
    // Any tap order is otherwise allowed.
    if (indices.length > 0) {
      const span = Math.max(...indices, index) - Math.min(...indices, index) + 1;
      if (span > 6) {
        const existingGaps = findGapIndices(appState.geneSelectedBases);
        statusAreaGene.className = 'status-area show status-error';
        statusAreaGene.textContent = existingGaps.size > 0
          ? 'Fill the pulsing gap in your current selection first'
          : 'That base is too far from your current picks for a 6-base site';
        setTimeout(() => { if (appState.geneSelectedBases.length < 6) statusAreaGene.className = ''; }, 1600);
        return;
      }
    }

    appState.geneSelectedBases.push({ index, base });
    updateGeneSelectionUI();

    if (appState.geneSelectedBases.length === 6) {
      validateGeneSelection();
    }
  }

  function updateGeneSelectionUI() {
    if (!appState.plasmidCut) return;
    const { seq } = getGeneSequence(appState.plasmidCut.enzyme);

    const gapIndices = findGapIndices(appState.geneSelectedBases);
    const baseEls = seqBasesGeneEl.querySelectorAll('.base');
    baseEls.forEach((el, i) => {
      const isPicked = appState.geneSelectedBases.some(s => s.index === i);
      el.className = 'base';
      el.textContent = seq[i];
      if (isPicked) {
        el.classList.add('picked');
      } else if (gapIndices.has(i)) {
        el.classList.add('gap-needed');
      }
    });

    const sorted = [...appState.geneSelectedBases].sort((a, c) => a.index - c.index);
    readoutGeneEl.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const span = document.createElement('span');
      if (i < sorted.length) {
        span.textContent = sorted[i].base;
        span.style.color = '#fff';
        span.style.textShadow = '0 0 8px rgba(180,140,255,0.5)';
      } else {
        span.className = 'empty-slot';
        span.textContent = '_';
      }
      span.style.margin = '0 2px';
      readoutGeneEl.appendChild(span);
    }

    if (appState.geneSelectedBases.length < 6) {
      statusAreaGene.className = '';
      statusAreaGene.textContent = '';
      btnCutGene.disabled = true;
      appState.geneMatchedEnzyme = null;
    }
  }

  function validateGeneSelection() {
    const requiredEnzyme = ENZYMES.find(e => e.name === appState.plasmidCut.enzyme);
    const sorted = [...appState.geneSelectedBases].sort((a, c) => a.index - c.index);
    const indices = sorted.map(s => s.index);
    const isConsecutive = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
    const fragment = sorted.map(s => s.base).join('');

    if (!isConsecutive) {
      statusAreaGene.className = 'status-area show status-error';
      statusAreaGene.textContent = '✗ Bases must be consecutive — the red-outlined picks on the strand don\'t connect to the rest';
      btnCutGene.disabled = true;
      appState.geneMatchedEnzyme = null;
      return;
    }

    // Unlike the open-ended plasmid check, the gene stage requires the
    // SAME enzyme identity as appState.plasmidCut — a valid site for a
    // different enzyme is explicitly wrong here, not just "not a site."
    const matched = findMatchingEnzyme(fragment);

    if (matched && matched.name === requiredEnzyme.name) {
      statusAreaGene.className = 'status-area show status-success';
      statusAreaGene.innerHTML =
        `✓ RECOGNITION SITE IDENTIFIED<br>` +
        `<strong style="font-size:15px;letter-spacing:3px;">${fragment}</strong><br>` +
        `<span style="font-size:10px;opacity:0.75">Same enzyme: ${matched.name}</span>`;
      btnCutGene.disabled = false;
      appState.geneMatchedEnzyme = matched;
    } else if (matched) {
      statusAreaGene.className = 'status-area show status-error';
      statusAreaGene.innerHTML =
        `✗ Wrong restriction site<br>` +
        `<span style="font-size:10px;opacity:0.75">That's a ${matched.name} site. Use the same restriction enzyme that was used to cut the plasmid (${requiredEnzyme.name}).</span>`;
      btnCutGene.disabled = true;
      appState.geneMatchedEnzyme = null;
    } else {
      statusAreaGene.className = 'status-area show status-error';
      statusAreaGene.textContent = `✗ This is not the recognition sequence for ${requiredEnzyme.name}.`;
      btnCutGene.disabled = true;
      appState.geneMatchedEnzyme = null;
    }
  }

  function renderGeneCutAndComparison() {
    const enzyme = appState.geneMatchedEnzyme;
    if (!enzyme || !appState.plasmidCut) return;
    const cut = computeCutDisplay(enzyme);

    appState.geneCut = {
      enzyme: enzyme.name,
      recognitionSite: enzyme.pattern,
      cutAfter: enzyme.cutAfter,
      endType: enzyme.endType,
      overhang: cut.overhang,
      source: enzyme.source,
    };

    statusAreaGeneCut.className = 'status-area show status-cut';
    statusAreaGeneCut.innerHTML =
      `\u2702 CUT COMPLETE — ${enzyme.name}<br>` +
      `<span style="font-size:13px; display:inline-block; margin:4px 0;">` +
      `5'-${buildCutLineHtml(cut.pattern.split(''), cut.cutAfter, '\u2193')}-3'<br>` +
      `3'-${buildCutLineHtml(cut.bottomPattern.split(''), cut.bottomCutAfter, '\u2191')}-5'` +
      `</span><br>` +
      `<span style="font-size:10px;opacity:0.75">${cut.endLabel}</span>`;

    compareSection.style.display = 'block';

    if (enzyme.endType === 'blunt') {
      comparePlasmidEnd.textContent = 'blunt';
      compareGeneEnd.textContent = 'blunt';
      compatibleStatus.className = 'status-area show status-cut';
      compatibleStatus.innerHTML =
        `✓ COMPATIBLE ENDS<br>` +
        `<span style="font-size:10px;opacity:0.75">Both DNA fragments were cut with the same restriction enzyme (${enzyme.name}), producing matching blunt ends — joinable by DNA ligase.</span>`;
    } else {
      comparePlasmidEnd.textContent = cut.overhang;
      compareGeneEnd.textContent = cut.overhang;
      compatibleStatus.className = 'status-area show status-cut';
      compatibleStatus.innerHTML =
        `✓ COMPATIBLE STICKY ENDS<br>` +
        `<span style="font-size:10px;opacity:0.75">Both DNA fragments were cut with the same restriction enzyme (${enzyme.name}), so their ${cut.overhang} overhangs can base-pair with each other.</span>`;
    }

    btnProceedLigation.disabled = false;
  }

  /* ============================================================
     STAGE 4 — INSERTION → STICKY-END ANNEALING → SIMULATED LIGATION
     ------------------------------------------------------------
     Everything here is driven by appState.plasmidCut / geneCut —
     the actual enzyme, overhang, and end type from the earlier
     stages — never hard-coded to one enzyme. Uses the SAME
     computeCutDisplay-derived data those stages already produced.
     ============================================================ */
  // Splits the already-computed, already-verified cut display at the
  // cut arrow to get each strand's two real halves — no new sequence
  // math, just reformatting data the app already trusts.
  // Locates the enzyme's recognition site within an actual sequence
  // string (reused from the same matchesPattern already trusted for
  // selection validation), so flanking context is found, not assumed.
  function findSiteIndex(seq, enzyme) {
    for (let i = 0; i <= seq.length - enzyme.pattern.length; i++) {
      if (matchesPattern(seq.slice(i, i + enzyme.pattern.length), enzyme.pattern)) return i;
    }
    return -1;
  }

  // Real bases immediately outside the recognition site, pulled
  // directly from the actual source sequence (PLASMID.seq or a
  // GENE_TEMPLATES entry) — never invented, never a placeholder word.
  function getFlankingContext(seq, enzyme, maxLen) {
    const siteIdx = findSiteIndex(seq, enzyme);
    if (siteIdx < 0) return { left: '', right: '', leftTrunc: false, rightTrunc: false };
    const siteEnd = siteIdx + enzyme.pattern.length;
    const leftStart = Math.max(0, siteIdx - maxLen);
    const rightEnd = Math.min(seq.length, siteEnd + maxLen);
    return {
      left: seq.slice(leftStart, siteIdx),
      right: seq.slice(siteEnd, rightEnd),
      leftTrunc: leftStart > 0,
      rightTrunc: rightEnd < seq.length,
    };
  }

  // A literal notched outline of a sticky end: two bars (top/bottom
  // strand), offset by the overhang width so the protruding strand
  // visibly steps out past the recessed one — the physical shape of
  // a sticky end, not just a color difference in a line of letters.
  // variant 'leftEnd': bottom strand protrudes on the RIGHT of the icon
  //   (matches a fragment's trailing end, e.g. plasmid's left vector arm).
  // variant 'rightEnd': top strand protrudes on the LEFT of the icon
  //   (matches a fragment's leading end, e.g. plasmid's right vector arm).
  function stickyStepSVG(variant, overhangLen, label) {
    const barH = 9, rowGap = 7, coreW = overhangLen > 0 ? 34 : 44, stepW = overhangLen > 0 ? 16 : 0;
    const totalW = coreW + stepW;
    const y1 = 4, y2 = y1 + barH + rowGap;
    const paired = 'rgba(215,210,255,0.85)', overhang = 'rgba(100,220,240,0.9)';
    let topRect, bottomRect;
    if (variant === 'leftEnd') {
      topRect = `<rect x="0" y="${y1}" width="${coreW}" height="${barH}" rx="2" fill="${paired}"/>`;
      bottomRect = `<rect x="0" y="${y2}" width="${coreW}" height="${barH}" rx="2" fill="${paired}"/>` +
        (stepW > 0 ? `<rect x="${coreW}" y="${y2}" width="${stepW}" height="${barH}" rx="2" fill="${overhang}"/>` : '');
    } else {
      topRect = (stepW > 0 ? `<rect x="0" y="${y1}" width="${stepW}" height="${barH}" rx="2" fill="${overhang}"/>` : '') +
        `<rect x="${stepW}" y="${y1}" width="${coreW}" height="${barH}" rx="2" fill="${paired}"/>`;
      bottomRect = `<rect x="${stepW}" y="${y2}" width="${coreW}" height="${barH}" rx="2" fill="${paired}"/>`;
    }
    const h = y2 + barH + 10;
    return `<svg viewBox="0 0 ${totalW} ${h}" width="${totalW}" height="${h}">` +
      topRect + bottomRect +
      `<text x="${totalW / 2}" y="${h - 1}" text-anchor="middle" class="step-caption">${label}</text></svg>`;
  }

  // The fully-annealed/ligated counterpart: no step at all — one
  // continuous double-stranded bar, showing that once the sticky ends
  // have paired (and the backbone is sealed), the notch is gone.
  function stickyMergedSVG(label) {
    const barH = 9, rowGap = 7, w = 60;
    const y1 = 4, y2 = y1 + barH + rowGap;
    const paired = 'rgba(215,210,255,0.85)';
    const h = y2 + barH + 10;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<rect x="0" y="${y1}" width="${w}" height="${barH}" rx="2" fill="${paired}"/>` +
      `<rect x="0" y="${y2}" width="${w}" height="${barH}" rx="2" fill="${paired}"/>` +
      `<text x="${w / 2}" y="${h - 1}" text-anchor="middle" class="step-caption">${label}</text></svg>`;
  }

  function getJunctionParts(enzyme) {
    const cut = computeCutDisplay(enzyme);
    // Use the REAL bases at the site, not the enzyme's recognition
    // pattern — degenerate patterns (HindII: GTYRAC) contain IUPAC
    // wildcards (Y = C/T, R = A/G) that are not actual nucleotides.
    const sIdx = findSiteIndex(PLASMID.seq, enzyme);
    const site = sIdx >= 0 ? PLASMID.seq.slice(sIdx, sIdx + enzyme.pattern.length) : cut.pattern;
    const siteBot = complementOf(site);
    const topLeft = site.slice(0, cut.cutAfter), topRight = site.slice(cut.cutAfter);
    const bottomLeft = siteBot.slice(0, cut.bottomCutAfter), bottomRight = siteBot.slice(cut.bottomCutAfter);
    // Plasmid body is long — a bounded, honestly-truncated real sample.
    // Gene template is short enough that left-flank + site + right-flank
    // covers the ENTIRE real sequence with nothing left out (verified:
    // 5 + 6 + 7 = 18 for every current enzyme's template).
    const plasmidFlank = getFlankingContext(PLASMID.seq, enzyme, 5);
    const geneFlank = getFlankingContext(GENE_TEMPLATES[enzyme.name], enzyme, 12);
    return {
      topLeft, topRight, bottomLeft, bottomRight,
      overhang: site.slice(cut.cutAfter, site.length - cut.cutAfter), endType: enzyme.endType,
      plasmidFlank, geneFlank,
    };
  }

  // Regenerated fresh at every animation step (rather than toggling a
  // class on a cached node) — simplest way to guarantee the nick
  // markers' sealed/unsealed state can never drift from what's shown.
  function renderJunctionView(sealedLeft, sealedRight, isCircular) {
    const enzyme = ENZYMES.find(e => e.name === appState.plasmidCut.enzyme);
    const p = getJunctionParts(enzyme);
    const ohLen = p.overhang.length;

    junctionStickyDiagram.innerHTML =
      stickyMergedSVG('JUNCTION 1') + stickyMergedSVG('JUNCTION 2');

    // A fully sealed circular plasmid has no free 5'/3' end at all — it
    // wraps back on itself. The "5'..."/"...3'" labels are only correct
    // while the molecule is genuinely linear (cut-open or mid-anneal);
    // once ligated, they're replaced with a loop indicator instead of
    // implying a loose end that no longer exists.
    const leftCap = isCircular ? '<span class="loop-icon">\u21bb</span>' : `<span class="body-ellipsis">5'\u2026</span>`;
    const rightCap = isCircular ? '<span class="loop-icon">\u21bb</span>' : `<span class="body-ellipsis">\u20263'</span>`;
    const leftCapBottom = isCircular ? '<span class="loop-icon">\u21bb</span>' : `<span class="body-ellipsis">3'\u2026</span>`;
    const rightCapBottom = isCircular ? '<span class="loop-icon">\u21bb</span>' : `<span class="body-ellipsis">\u20265'</span>`;

    // Once annealed, the sticky ends have found their complementary
    // partner and the whole junction is fully double-stranded — no
    // more asymmetry, unlike the separate pre-insertion fragments.
    // Built as ONE real top-strand string; the bottom strand is then
    // the direct, position-by-position complement of that EXACT
    // string — not reassembled from separately-derived label
    // fragments, which is what caused real base-pair mismatches
    // before this fix (verified: 4 of 31 positions were wrong).
    const segments = [
      { text: p.plasmidFlank.left, cls: 'paired' },
      { text: p.topLeft, cls: 'paired' },
      { nick: 0 },
      { text: p.topRight.slice(0, ohLen), cls: 'overhang' },
      { text: p.topRight.slice(ohLen), cls: 'paired' },
      { text: p.geneFlank.right, cls: 'paired' },
      { text: p.geneFlank.left, cls: 'paired' },
      { text: p.topLeft, cls: 'paired' },
      { nick: 1 },
      { text: p.topRight.slice(0, ohLen), cls: 'overhang' },
      { text: p.topRight.slice(ohLen), cls: 'paired' },
      { text: p.plasmidFlank.right, cls: 'paired' },
    ];
    const fullTop = segments.filter(s => !('nick' in s)).map(s => s.text).join('');
    const fullBottom = complementOf(fullTop);
    const sealedFlags = [sealedLeft, sealedRight];

    let topHtml = leftCap, bottomHtml = leftCapBottom, cursor = 0;
    for (const seg of segments) {
      if ('nick' in seg) {
        const nickSpan = `<span class="nick-inline${sealedFlags[seg.nick] ? ' sealed' : ''}"></span>`;
        topHtml += nickSpan;
        bottomHtml += nickSpan;
        continue;
      }
      if (seg.text.length === 0) continue; // blunt enzymes: zero-length overhang segment
      const topSlice = fullTop.slice(cursor, cursor + seg.text.length);
      const bottomSlice = fullBottom.slice(cursor, cursor + seg.text.length);
      topHtml += `<span class="${seg.cls}">${topSlice}</span>`;
      bottomHtml += `<span class="${seg.cls}">${bottomSlice}</span>`;
      cursor += seg.text.length;
    }
    topHtml += rightCap;
    bottomHtml += rightCapBottom;

    junctionStrandTop.innerHTML = topHtml;
    junctionStrandBottom.innerHTML = bottomHtml;
  }

  // Final showcase view, reached only via "See Recombinants". Reuses
  // getJunctionParts() — the exact same real data every other cut/
  // insertion/ligation view already draws from — and the same single
  // complementOf() construction that makes mismatched base-pairing
  // structurally impossible (proven earlier for renderJunctionView).
  // The only new thing here is which segments get colored red: the
  // gene's own actual contribution (everything between where the two
  // nicks used to be) rather than the paired/overhang distinction used
  // during the technical cut/anneal views.
  // What each marker gene looks like in this cell's plasmid, and what that
  // means for the colony on the current plate.
  function geneStates(type) {
    const e = curEnzyme(), bg = appState.screen === 'bgal' && appState.plated;
    const rec = type === 'recomb';
    if (bg) {
      return { mode: 'puc', genes: [
        { id: 'lacZ', ok: !rec, why: rec ? 'insert sits inside it' : 'uninterrupted' },
        { id: 'ampR', ok: true, why: 'intact' } ],
        pheno: rec ? { col: '#f3ecdc', txt: 'White colony — no β-galactosidase, X-gal stays colourless' }
                   : { col: '#4f7dff', txt: 'Blue colony — β-galactosidase cleaves X-gal to a blue pigment' } };
    }
    const m = rec ? MARKER_OF[e] : null;
    const genes = [{ id: 'ampR', ok: m !== 'ampR' }, { id: 'tetR', ok: m !== 'tetR' }]
      .map(g => ({ ...g, why: g.ok ? 'intact' : 'insert sits inside it' }));
    let pheno;
    if (!appState.plated) pheno = { col: '#b06bff', txt: 'Not screened yet — looks like every other colony' };
    else if (!m) pheno = { col: '#b06bff', txt: 'Grows on ampicillin and tetracycline' + (rec ? ' — indistinguishable from the empty vector' : '') };
    else pheno = { col: m === 'tetR' ? '#ff6b6b' : '#ff6b6b', txt: m === 'tetR' ? 'Grows on ampicillin, dies on tetracycline' : 'Grows on tetracycline, dies on ampicillin' };
    if (!rec && appState.plated) pheno = { col: '#b06bff', txt: 'Grows on both ampicillin and tetracycline' };
    return { mode: 'pbr', genes, pheno };
  }

  // Has a screen revealed which colonies are which? (EcoRI + antibiotics
  // finishes without a reveal, but the result is in — so DNA can be shown.)
  const identityKnown = () => !!appState.reveal || (appState.screen === 'abx' && appState.selStep === 3);

  function renderRecombinantPlasmidView() {
    const enzyme = ENZYMES.find(e => e.name === curEnzyme());
    const p = getJunctionParts(enzyme);
    const cell = bacteria[appState.selectedIndex] || {};
    const isVector = cell.plasmidType === 'vector';
    const strip = document.querySelector('#stage-recombinant-view .molecule-strip');
    if (!identityKnown()) {
      // Before screening, every transformed colony looks the same — keep the puzzle
      document.getElementById('recomb-label').textContent = 'Plasmid — identity unknown';
      document.getElementById('gs-card').innerHTML =
        `<div class="gs-type">Recombinant or empty vector?<span>This colony took up a plasmid, but both kinds look identical. Screen the plate (ampicillin / tetracycline, or blue–white) to find out — then tap it again.</span></div>`;
      strip.style.display = 'none';
      document.getElementById('recombinant-gene-caption').style.display = 'none';
      document.getElementById('gs-strip-note').innerHTML = '';
      renderMap('recomb-map', 'recomb-info', { size: 240, enzyme: curEnzyme(), mode: 'pbr' });
      document.getElementById('recomb-note').innerHTML = 'Where the cut was made decides which marker an insert would break.';
      document.getElementById('recombinant-status').innerHTML = 'TRANSFORMED — IDENTITY UNKNOWN<br><span style="font-size:10px;opacity:0.8">Screening reveals which colonies carry the gene of interest.</span>';
      return;
    }
    strip.style.display = '';
    const st = geneStates(isVector ? 'vector' : 'recomb');

    // Gene-state card
    document.getElementById('recomb-label').textContent = isVector ? 'Empty Vector (no insert)' : 'Recombinant Plasmid';
    document.getElementById('gs-card').innerHTML =
      `<div class="gs-type">${isVector ? 'Empty vector' : 'Recombinant plasmid'}<span>${isVector
        ? `The ${enzyme.name}-cut plasmid re-closed on itself during ligation — no gene inserted.`
        : `The gene of interest was ligated into the ${enzyme.name} site.`}</span></div>` +
      `<div class="gs-chips">${st.genes.map(g => `<span class="gs-chip ${g.ok ? 'ok' : 'x'}">${g.id} ${g.ok ? '✓ intact' : '✗ broken'}</span>`).join('')}</div>` +
      `<div class="gs-pheno"><span class="sw" style="background:${st.pheno.col}"></span>${st.pheno.txt}</div>`;

    // DNA as it was sealed during ligation
    const J = '<span class="junction-mark" title="sealed junction">|</span>';
    const segments = isVector ? [
      { text: p.plasmidFlank.left, cls: 'paired' },
      { text: p.topLeft + p.topRight, cls: 'site-restored' },
      { text: p.plasmidFlank.right, cls: 'paired' },
    ] : [
      { text: p.plasmidFlank.left, cls: 'paired' },
      { text: p.topLeft, cls: 'paired' },
      { text: p.topRight, cls: 'gene-highlight-red', mark: true },
      { text: p.geneFlank.right, cls: 'gene-highlight-red' },
      { text: p.geneFlank.left, cls: 'gene-highlight-red' },
      { text: p.topLeft, cls: 'gene-highlight-red' },
      { text: p.topRight, cls: 'paired', mark: true },
      { text: p.plasmidFlank.right, cls: 'paired' },
    ];
    const fullTop = segments.map(s => s.text).join('');
    const fullBottom = complementOf(fullTop);
    // Per-strand ownership. Top-strand junctions sit at the segment marks;
    // bottom-strand junctions (and the bottom half of the gene) are shifted
    // by the overhang length — staggered nicks, exactly as in ligation.
    const oh = isVector ? 0 : p.overhang.length;
    const topCls = [], topMarks = new Set();
    let cur = 0;
    for (const seg of segments) { if (seg.mark) topMarks.add(cur); for (let i = 0; i < seg.text.length; i++) topCls.push(seg.cls); cur += seg.text.length; }
    const markList = [...topMarks].sort((x, y) => x - y);
    const botMarks = new Set(markList.map(i => i + oh));
    const botCls = topCls.map((c, i) => isVector ? c : ((i >= markList[0] + oh && i < markList[1] + oh) ? 'gene-highlight-red' : 'paired'));
    const strandHtml = (seq, cls, marks) => {
      let h = '<span class="loop-icon">↻</span>', open = null;
      for (let i = 0; i < seq.length; i++) {
        if (marks.has(i)) { if (open) { h += '</span>'; open = null; } h += J; }
        if (cls[i] !== open) { if (open) h += '</span>'; h += `<span class="${cls[i]}">`; open = cls[i]; }
        h += seq[i];
      }
      if (open) h += '</span>';
      return h + '<span class="loop-icon">↻</span>';
    };
    const topHtml = strandHtml(fullTop, topCls, topMarks);
    const bottomHtml = strandHtml(fullBottom, botCls, botMarks);
    recombinantStrandTop.innerHTML = topHtml;
    recombinantStrandBottom.innerHTML = bottomHtml;
    document.getElementById('recombinant-gene-caption').style.display = isVector ? 'none' : '';
    document.getElementById('gs-strip-note').innerHTML = isVector
      ? `The two <b>${enzyme.name}</b> ends joined back to each other, restoring the <span class="site-restored">${p.topLeft + p.topRight}</span> site — so the marker gene stays intact.`
      : `<span class="junction-mark">|</span> marks where DNA ligase sealed each strand — on the bottom strand the joins are shifted by the ${p.overhang.length ? p.overhang.length + '-base overhang' : 'blunt cut (no shift)'}. Red = the gene of interest, now part of the plasmid.`;

    renderMap('recomb-map', 'recomb-info', { size: 240, enzyme: curEnzyme(), insert: !isVector, mode: st.mode });
    document.getElementById('recomb-note').innerHTML = isVector
      ? `No insert: <span class="ok">${st.genes.map(g => g.id).join(' ✓ ')} ✓</span> — every marker works.`
      : geneNote(curEnzyme(), st.mode);
    const status = document.getElementById('recombinant-status');
    status.innerHTML = isVector
      ? 'EMPTY VECTOR — NON-RECOMBINANT<br><span style="font-size:10px;opacity:0.8">This bacterium took up the plasmid, but without the gene of interest.</span>'
      : 'PLASMID + GENE OF INTEREST = RECOMBINANT PLASMID<br><span style="font-size:10px;opacity:0.8">This plasmid, carrying the inserted gene of interest, now exists inside this bacterium.</span>';
  }



  /* ============================================================
     LIGATION VIEW — one double-stranded molecule built from the
     SAME real sequences as the cut stage. Fragment ownership of every
     base is exact: top-strand nicks sit at t1/t2, bottom-strand nicks
     at b1/b2 = t + overhang length (staggered for sticky ends, flush
     for blunt). Overhang H-bonds form (anneal), then ligase seals the
     4 backbone nicks — the cut animation played backwards.
     ============================================================ */
  let ligx = null;
  // 3D helix controller, published by the module script once three.js loads
  const dna3d = () => (window.ArcDNA3D && window.ArcDNA3D.ready) ? window.ArcDNA3D : null;

  function buildLigationView() {
    const enzyme = ENZYMES.find(e => e.name === appState.plasmidCut.enzyme);
    const p = getJunctionParts(enzyme);
    const oh = p.overhang.length;
    const pl = p.plasmidFlank.left + p.topLeft;
    const gene = p.topRight + p.geneFlank.right + p.geneFlank.left + p.topLeft;
    const pr = p.topRight + p.plasmidFlank.right;
    const top = pl + gene + pr, bot = complementOf(top), N = top.length;
    const t1 = pl.length, t2 = t1 + gene.length, b1 = t1 + oh, b2 = t2 + oh;
    const fragOf = (c, strand) => {
      const a = strand === 'top' ? t1 : b1, b = strand === 'top' ? t2 : b2;
      return c < a ? 'pl' : c < b ? 'gene' : 'pr';
    };

    // Visible windows around each junction; the gene's middle collapses to "≈"
    const clamp = v => Math.max(0, Math.min(N - 1, v));
    let wins = [[clamp(t1 - 3), clamp(b1 + 2)], [clamp(t2 - 2), clamp(b2 + 2)]];
    if (wins[0][1] >= wins[1][0] - 1) wins = [[wins[0][0], wins[1][1]]];
    const cols = []; // {c} or {brk:true}
    wins.forEach((w, i) => {
      if (i) cols.push({ brk: true });
      for (let c = w[0]; c <= w[1]; c++) cols.push({ c });
    });

    const host = document.getElementById('ligx-host');
    const avail = Math.max(260, (document.getElementById('ligx-section').clientWidth || 320) - 28);
    const padX = 18;
    const cw = Math.max(12, Math.min(18, Math.floor((avail - padX * 2 - 52) / cols.length)));
    const width = cols.length * cw + padX * 2;
    const xOfIdx = i => padX + i * cw;
    const idxOfCol = new Map(cols.map((k, i) => [k.c, i]).filter(([c]) => c !== undefined));
    const brkIdx = cols.findIndex(k => k.brk);

    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'ligx apart';
    root.style.width = width + 'px'; root.style.maxWidth = '100%';
    const frags = {};
    for (const f of ['pl', 'gene', 'pr']) {
      const d = document.createElement('div');
      d.className = 'ligx-frag ' + f; d.style.width = width + 'px';
      frags[f] = d;
    }
    const hbLayer = document.createElement('div'); hbLayer.className = 'ligx-frag';
    const nickLayer = document.createElement('div'); nickLayer.className = 'ligx-frag';
    hbLayer.style.width = nickLayer.style.width = width + 'px';

    const mk = (cls, parent, css, text) => {
      const e = document.createElement('div'); e.className = cls;
      Object.assign(e.style, css); if (text != null) e.textContent = text;
      parent.appendChild(e); return e;
    };
    const hbonds = [];
    cols.forEach((k, i) => {
      const x = xOfIdx(i) + 'px', w = cw + 'px';
      if (k.brk) {
        mk('ligx-b top brk', frags.gene, { left: x, width: w }, '≈');
        mk('ligx-b bot brk', frags.gene, { left: x, width: w }, '≈');
        return;
      }
      const c = k.c, ft = fragOf(c, 'top'), fb = fragOf(c, 'bot');
      const ohCol = ft !== fb;   // single-stranded before annealing
      mk(`ligx-b top${ft === 'gene' ? ' gene' : ''}${ohCol ? ' oh' : ''}`, frags[ft], { left: x, width: w }, top[c]);
      mk(`ligx-b bot${fb === 'gene' ? ' gene' : ''}${ohCol ? ' oh' : ''}`, frags[fb], { left: x, width: w }, bot[c]);
      const rx = (xOfIdx(i) + cw / 2) + 'px';
      if (ohCol) hbonds.push({ el: mk('ligx-rung hb', hbLayer, { left: rx }), x: xOfIdx(i) + cw / 2, c });
      else mk('ligx-rung', frags[ft], { left: rx });
    });
    hbonds.sort((a, b) => a.x - b.x);

    // Backbones: one bar per fragment per strand per window, ends inset → visible nick gaps
    for (const strand of ['top', 'bot']) {
      let runStart = null, runFrag = null;
      const flush = endIdx => {
        if (runStart == null) return;
        mk(`ligx-bb ${strand}${runFrag === 'gene' ? ' gene' : ''}`, frags[runFrag],
          { left: (xOfIdx(runStart) + 2) + 'px', width: (xOfIdx(endIdx) - xOfIdx(runStart) - 4) + 'px' });
        runStart = null;
      };
      cols.forEach((k, i) => {
        const f = k.brk ? 'gene' : fragOf(k.c, strand);
        if (k.brk) { flush(i); return; }
        if (f !== runFrag || runStart == null) { flush(i); runStart = i; runFrag = f; }
      });
      flush(cols.length);
    }

    // Nick markers at the exact staggered boundaries
    const xAtCol = c => idxOfCol.has(c) ? xOfIdx(idxOfCol.get(c)) : null;
    const nicks = [
      { j: 0, strand: 'top', k: t1, x: xAtCol(t1) }, { j: 0, strand: 'bot', k: b1, x: xAtCol(b1) },
      { j: 1, strand: 'top', k: t2, x: xAtCol(t2) }, { j: 1, strand: 'bot', k: b2, x: xAtCol(b2) },
    ].filter(n => n.x != null);
    nicks.forEach(n => { n.el = mk('ligx-nick', nickLayer, { left: n.x + 'px', top: (n.strand === 'top' ? 33 : 91) + 'px' }); });

    // Ends + fragment tags
    const ends = [mk('ligx-end', frags.pl, { left: '2px', top: '36px' }, "5'"), mk('ligx-end', frags.pl, { left: '2px', top: '70px' }, "3'"),
      mk('ligx-end', frags.pr, { left: (width - 12) + 'px', top: '36px' }, "3'"), mk('ligx-end', frags.pr, { left: (width - 12) + 'px', top: '70px' }, "5'")];
    const tagX = f => {
      const idx = cols.map((k, i) => (!k.brk && fragOf(k.c, 'top') === f) || (k.brk && f === 'gene') ? i : -1).filter(i => i >= 0);
      return xOfIdx((idx[0] + idx[idx.length - 1]) / 2) + cw / 2;
    };
    mk('ligx-tag', frags.pl, { left: tagX('pl') + 'px' }, 'Plasmid');
    mk('ligx-tag gene', frags.gene, { left: tagX('gene') + 'px' }, 'Gene');
    mk('ligx-tag', frags.pr, { left: tagX('pr') + 'px' }, 'Plasmid');

    // DNA ligase clamp (same shape as the restriction enzyme, green = joining)
    const lig = mk('ligx-ligase', root, { width: (cw * (oh + 2)) + 'px' });
    lig.innerHTML = '<div class="lobe up"><span>LIGASE</span></div><div class="lobe dn"></div>';
    const caption = mk('ligx-caption', root, {});

    root.append(hbLayer, frags.pl, frags.gene, frags.pr, nickLayer);
    root.appendChild(lig); root.appendChild(caption);
    host.appendChild(root);

    const key = document.getElementById('ligx-key');
    key.innerHTML =
      `<div data-k="cut"><b>Cutting</b><span>Enzyme breaks the backbone → overhang base pairs let go</span></div>` +
      `<div data-k="anneal"><b>Annealing</b><span>Overhangs find their partners → base pairs form again</span></div>` +
      `<div data-k="seal"><b>Ligation</b><span>DNA ligase re-joins the backbone at each nick</span></div>`;

    // Hand the exact same molecule to the 3D helix (if three.js loaded)
    window.__arcLigModel = { top, bot, N, t1, t2, b1, b2, oh };
    const d3 = dna3d();
    const host3d = document.getElementById('dna3d-host');
    if (d3) { host3d.style.display = ''; d3.build(window.__arcLigModel); }
    else host3d.style.display = 'none';
    document.getElementById('lig-seq').open = !d3;   // 3D leads; letters view on demand

    ligx = { root, hbonds, nicks, lig, caption, ends, oh, cw, brkIdx, key,
      say(t) { caption.textContent = t; ligLive(t); },
      keyStep(k) {
        const order = ['cut', 'anneal', 'seal'], at = order.indexOf(k);
        key.querySelectorAll('div').forEach(d => {
          const i = order.indexOf(d.dataset.k);
          d.classList.toggle('on', i === at); d.classList.toggle('past', i < at);
        });
      } };
    return ligx;
  }

  function setLigationLabel(t) { document.getElementById('ligx-label').textContent = t; }
  // Stepper: n = current step (1..4); steps before n are done
  function setLigStep(n, state = 'on') {
    document.querySelectorAll('#lig-steps li').forEach(li => {
      const k = +li.dataset.s;
      li.className = k < n || (k === n && state === 'done') ? 'done' : k === n ? (state === 'next' ? 'next' : 'on') : '';
    });
  }
  function ligLive(t) {
    const el = document.getElementById('lig-live');
    if (el.textContent === t) return;
    el.classList.add('swap');
    setTimeout(() => { el.textContent = t; el.classList.remove('swap'); }, 180);
  }
  // Thin progress bar for the running animation (ms = how long it takes)
  function ligProgress(ms) {
    const bar = document.getElementById('lig-progress-bar');
    bar.style.transition = 'none'; bar.style.width = ms < 0 ? '100%' : '0%';   // 0 = idle, -1 = complete
    if (!(ms > 0)) return;
    void bar.offsetWidth;
    bar.style.transition = `width ${ms}ms linear`; bar.style.width = '100%';
  }
  function hideLegacyLigation() {
    preInsertSection.classList.add('stage-hidden');
    junctionSection.classList.add('stage-hidden');
    preInsertSection.style.display = 'none';   // legacy views — replaced by the ligx duplex
    junctionSection.style.display = 'none';
    ligaseChip.style.display = 'none';
  }
  function ligxAnnealNow() {
    ligx.root.classList.remove('apart'); ligx.root.classList.add('annealed');
    dna3d()?.state('annealed');
    ligx.hbonds.forEach(h => h.el.classList.add('on'));
  }

  function renderInsertionReady() {
    hideLegacyLigation();
    const v = buildLigationView();
    const p = getJunctionParts(ENZYMES.find(e => e.name === appState.plasmidCut.enzyme));
    setLigationLabel('Step 1 · Matching cut ends');
    setLigStep(1); ligProgress(0);
    seeRecombinantsRow.classList.add('stage-hidden');
    v.keyStep('cut');
    v.say(p.endType === 'blunt' ? 'Blunt ends — nothing to pair' : `Free sticky ends — ${p.overhang} on each`);

    ligationStatus.className = 'status-area show status-cut';
    ligationStatus.innerHTML = p.endType === 'blunt'
      ? `Both molecules were cut with <b>${appState.plasmidCut.enzyme}</b>, which leaves <b>blunt ends</b> — no overhangs, so nothing will base-pair across the join.`
      : `The plasmid and the gene were cut with the <b>same enzyme (${appState.plasmidCut.enzyme})</b>, so both carry the same <b>${p.overhang}</b> single-stranded overhang (glowing). ` +
        `Read them antiparallel and they are complementary — they can base-pair.`;
    insertActionRow.classList.remove('stage-hidden');
    ligateActionRow.classList.add('stage-hidden');
  }

  function performInsertion() {
    appState.ligationRunId += 1;
    const runId = appState.ligationRunId;
    const later = (ms, fn) => setTimeout(() => { if (appState.ligationRunId === runId && appState.mode === 'READY_FOR_INSERTION') fn(); }, ms);
    insertActionRow.classList.add('stage-hidden');
    hideLegacyLigation();
    if (!ligx) buildLigationView();
    setLigationLabel('Step 2 · Annealing');
    setLigStep(2);
    ligx.keyStep('anneal');
    ligationStatus.className = 'status-area show';
    ligationStatus.innerHTML = 'Annealing is spontaneous — no enzyme needed. Complementary bases find each other and form <b>hydrogen bonds</b> (dotted): <b>A·T makes 2, G·C makes 3</b>. Grey = carbon, blue = nitrogen, red = oxygen, orange = phosphorus.';

    const n = ligx.hbonds.length;
    const DRIFT = 2600, PER = 1150;
    const M = window.__arcLigModel;
    const hbCount = c => (M.top[c] === 'G' || M.top[c] === 'C') ? 3 : 2;
    const total = DRIFT + n * PER + 1400;
    ligProgress(total);
    ligx.say('The gene drifts into the opened plasmid…');
    later(80, () => { ligx.root.classList.remove('apart'); dna3d()?.together(); });
    later(DRIFT - 300, () => {
      ligx.say(n ? 'Overhang meets overhang — zooming in to the atoms' : 'Blunt ends touch — nothing to pair');
      if (n) dna3d()?.atomic(true);
    });
    ligx.hbonds.forEach((h, i) => later(DRIFT + i * PER, () => {
      h.el.classList.add('on'); dna3d()?.hbond(h.c); sfx('blip');
      ligx.say(`${M.top[h.c]}·${M.bot[h.c]} pair — ${hbCount(h.c)} hydrogen bonds  (${i + 1}/${n})`);
    }));
    later(DRIFT + n * PER + 200, () => {
      dna3d()?.atomic(false);
      ligx.root.classList.add('annealed'); dna3d()?.state('annealed'); buzz(10);
      ligx.say(n ? 'Annealed — but the backbone still has 4 gaps' : 'Ends aligned — the backbone has 4 gaps');
    });
    later(total, () => setMode('STICKY_ENDS_ANNEALED'));
  }

  function renderAnnealed() {
    hideLegacyLigation();
    if (!ligx) buildLigationView();
    ligxAnnealNow();
    ligx.keyStep('anneal');
    const blunt = ligx.oh === 0;
    setLigationLabel(blunt ? 'Blunt Ends Aligned' : 'Sticky Ends Annealed');
    setPanelHeader(blunt ? 'Blunt-End Joining' : 'Sticky-End Annealing', 'Backbone Nicks Remain');
    setLigationLabel(blunt ? 'Step 2 · Ends aligned' : 'Step 2 · Annealed');
    setLigStep(3, 'next'); ligProgress(0);
    ligx.say(blunt ? 'Ends aligned — 4 backbone nicks remain' : 'Annealed — 4 backbone nicks remain');
    ligationStatus.className = 'status-area show';
    ligationStatus.innerHTML = (blunt
      ? ``  +
        `No overhangs means no base pairing across the junction — blunt ends only touch, so ligation is less efficient.<br>`
      : `` +
        `Hydrogen bonds now hold the gene in place — but only weakly; warm it up and it would fall apart.<br>`) +
      `<span style="color:rgba(255,190,120,0.95);">● The pulsing amber dots are <b>nicks</b> — gaps in the sugar-phosphate backbone. There are 4: one in each strand at each junction, offset by the overhang length.</span>`;
    ligateActionRow.classList.remove('stage-hidden');
  }

  function runLigationAnimation() {
    appState.ligationRunId += 1;
    const runId = appState.ligationRunId;
    const later = (ms, fn) => setTimeout(() => { if (appState.ligationRunId === runId) fn(); }, ms);
    ligateActionRow.classList.add('stage-hidden');
    hideLegacyLigation();
    if (!ligx) buildLigationView();
    ligxAnnealNow();
    ligx.keyStep('seal');
    setLigationLabel('Step 3 · Ligation');
    setLigStep(3);
    ligationStatus.className = 'status-area show';
    ligationStatus.innerHTML = '<b>DNA ligase</b> uses energy from <b>ATP</b> to join the <b>3′-OH</b> of one nucleotide to the <b>5′-phosphate</b> of the next — forming the missing <b>phosphodiester bond</b> (green) in the backbone.';

    const { lig, nicks, cw } = ligx;
    const spark = n => {
      const e = document.createElement('div'); e.className = 'ligx-spark go';
      e.style.left = n.x + 'px'; e.style.top = (n.strand === 'top' ? 33 : 91) + 'px';
      ligx.root.appendChild(e); setTimeout(() => e.remove(), 500);
    };
    const TRAVEL = 1600, LOCK = 1300, SEAL = 1500, HOLD = 1000;
    const perJ = js => TRAVEL + LOCK + js.length * SEAL + HOLD;
    const groups = [0, 1].map(j => nicks.filter(n => n.j === j)).filter(g => g.length);
    const total = groups.reduce((a, g) => a + perJ(g), 0) + 1200;
    ligProgress(total);
    let sealedCount = 0;
    let t = 0;
    groups.forEach((js, gi) => {
      const j = js[0].j;
      const lo = Math.min(...js.map(n => n.x)), hi = Math.max(...js.map(n => n.x));
      later(t, () => {
        lig.classList.remove('locked');
        lig.style.width = ((hi - lo) + cw * 2) + 'px'; lig.style.left = (lo - cw) + 'px'; lig.style.opacity = '1';
        dna3d()?.atomic(false);
        dna3d()?.ligaseTo(js.map(n => n.k));
        ligx.say(`Ligase travels to junction ${j + 1} (plasmid ↔ gene)`);
      });
      later(t + TRAVEL, () => {
        lig.classList.add('locked'); dna3d()?.ligaseLock(true); sfx('lock');
        const kAvg = js.reduce((a, n) => a + n.k, 0) / js.length - 0.5;
        dna3d()?.atomic(true); dna3d()?.focusCol(kAvg, 6);
        ligx.say('Zoom in: a gap between a 3′-OH and a 5′-phosphate');
      });
      js.forEach((n, k) => later(t + TRAVEL + LOCK + k * SEAL, () => {
        n.el.classList.add('sealed'); spark(n); dna3d()?.seal(n.strand, n.k); sfx('seal'); buzz(14);
        sealedCount++;
        ligx.say(`Phosphodiester bond formed (O3′–P) — ${n.strand === 'top' ? 'top' : 'bottom'} strand, nick ${sealedCount} of 4`);
      }));
      later(t + perJ(js) - HOLD + 200, () => {
        lig.classList.remove('locked'); dna3d()?.ligaseLock(false); dna3d()?.atomic(false);
        if (gi === 0) ligx.say(`Junction ${j + 1} sealed — on to the other end of the gene`);
      });
      t += perJ(js);
    });
    later(t, () => { lig.style.opacity = '0'; dna3d()?.ligaseOff(); ligx.say('All 4 nicks sealed'); });
    later(t + 1200, () => setMode('LIGATION_COMPLETE'));
  }

  function renderLigationComplete() {
    hideLegacyLigation();
    if (!ligx) buildLigationView();
    ligxAnnealNow();
    ligx.nicks.forEach(n => n.el.classList.add('sealed'));
    ligx.root.classList.add('done');
    ligx.lig.style.opacity = '0';
    dna3d()?.state('done');
    ligx.ends.forEach(e => { e.textContent = '↻'; });
    ligx.keyStep('done');
    ligx.key.querySelectorAll('div').forEach(d => d.classList.add('past'));
    setLigationLabel('Step 4 · Recombinant DNA');
    setLigStep(4, 'done'); ligProgress(-1);
    ligx.say('The gene is now a permanent part of the plasmid');
    ligationStatus.className = 'status-area show';
    ligationStatus.innerHTML =
      `Both strands are continuous again, so the plasmid is a closed circle (↻) — now carrying the gene of interest. ` +
      `This is <b>recombinant DNA</b>. Next: get it into bacteria.`;
  }

  function openPanel() {
    appState.panelOpen = true;
    panel.classList.add('visible');
    buildSequenceUI();
    updateSelectionUI();
  }

  function closePanel() {
    appState.panelOpen = false;
    panel.classList.remove('visible');
    appState.selectedBases = [];
    appState.matchedEnzyme = null;
    appState.plasmidCut = null;
    appState.geneSelectedBases = [];
    appState.geneMatchedEnzyme = null;
    appState.geneCut = null;
    statusArea.className = '';
    statusArea.textContent = '';
    btnRestrict.disabled = true;
    btnRestrict.textContent = 'Restrict';
    plasmidNextRow.style.display = 'none';
    statusAreaGene.className = '';
    statusAreaGene.textContent = '';
    btnCutGene.disabled = true;
    statusAreaGeneCut.className = '';
    statusAreaGeneCut.textContent = '';
    compareSection.style.display = 'none';
    btnProceedLigation.disabled = true;
    ligationStatus.className = '';
    ligationStatus.textContent = '';
    appState.ligationRunId += 1; // invalidates any pending ligation-animation timers
    appState.cutAnimRunId += 1; // invalidates any pending cut-docking-animation timers
    ligx = null;
    document.getElementById('ligx-host').innerHTML = '';
    document.getElementById('dna3d-host').style.display = 'none';
    dna3d()?.clear();
    preInsertSection.classList.remove('stage-hidden');
    junctionSection.classList.add('stage-hidden');
    junctionStrip.classList.remove('sealed-glow');
    ligaseChip.style.display = 'none';
    ligaseChip.style.opacity = '0';
    insertActionRow.classList.remove('stage-hidden');
    ligateActionRow.classList.add('stage-hidden');
    showStage('stagePlasmid');
    setPanelHeader('Plasmid Analysis', 'Restriction Site Identification');
  }

  /* ============================================================
     MODE TRANSITIONS — single chokepoint
     ------------------------------------------------------------
     Previously appState.mode was written directly in ~5 separate
     places (the canvas pointerdown handler, validateSelection(),
     the old deselectAll(), the Reset button), each hand-rolling its
     own subset of the side effects (show/hide brand, hint overlay,
     open/close panel, snap the camera zoom). That duplication is
     exactly what makes adding new events risky — one call site gets
     updated, another is forgotten. setMode() is now the only place
     appState.mode is assigned; every transition's side effects live
     here once.

     SUCCESS is the one exception: it's a sub-state entered while the
     panel is already open (validateSelection() has already written
     the panel's content), so its case here is intentionally empty —
     included for completeness and so future code has one obvious
     place to route through rather than assigning appState.mode
     directly again.
     ============================================================ */
  // Every mode where the analysis panel is open and the camera should
  // stay zoomed into the cell. Shared by updateTransitions() (camera)
  // and the canvas pointerdown handler (outside-tap-to-close), so the
  // two can never disagree about which modes count as "panel open."
  const PANEL_OPEN_MODES = ['PLASMID_ANALYSIS', 'SUCCESS', 'PLASMID_CUT', 'GENE_ANALYSIS', 'GENE_CUT', 'READY_FOR_INSERTION', 'STICKY_ENDS_ANNEALED', 'LIGATION_IN_PROGRESS', 'LIGATION_COMPLETE', 'RECOMBINANT_PLASMID_VIEW'];

  function setMode(next, opts = {}) {
    appState.mode = next;

    switch (next) {
      case 'IDLE':
        appState.selectedIndex = -1;
        // Normally snaps instantly — deselecting should feel immediate.
        // The one exception is the "See Recombinants" transition, which
        // sets smoothIdleTransition first to let the existing per-frame
        // lerp (updateCamera) animate the zoom-out smoothly instead.
        if (!appState.smoothIdleTransition) appState.cellZoom = 0;
        appState.smoothIdleTransition = false;
        brand.classList.remove('hidden');
        hintOverlay.classList.remove('visible');
        closePanel();
        break;

      case 'CELL_SELECTED':
        brand.classList.add('hidden');
        hintOverlay.classList.remove('visible');
        closePanel(); // no-op if nothing was open — safe whether arriving fresh or backing out of the panel
        if (opts.armHint) {
          setTimeout(() => {
            if (appState.mode === 'CELL_SELECTED') hintOverlay.classList.add('visible');
          }, 800);
        }
        break;

      case 'PLASMID_ANALYSIS':
        hintOverlay.classList.remove('visible');
        showStage('stagePlasmid');
        renderVectorCard();
        openPanel();
        break;

      case 'SUCCESS':
        break;

      case 'PLASMID_CUT':
        // Enzyme docks and the recognition site visibly splits before
        // the final result renders — renderPlasmidCutResult() is now
        // the animation's completion callback, not called directly.
        btnRestrict.disabled = true;
        setPanelHeader('Plasmid Analysis', 'Cutting…');
        runCutAnimation(plasmidEnzymeChip, readoutEl, appState.matchedEnzyme, () => {
          renderPlasmidCutResult();
          setPanelHeader('Plasmid Analysis', 'Cut Complete');
        }, PLASMID.seq, Math.min(...appState.selectedBases.map(b => b.index)));
        break;

      case 'GENE_ANALYSIS':
        appState.geneSelectedBases = [];
        appState.geneMatchedEnzyme = null;
        showStage('stageGene');
        renderPlasmidReferenceCard();
        buildGeneSequenceUI();
        updateGeneSelectionUI();
        setPanelHeader('Gene of Interest', 'Find the Matching Recognition Site');
        break;

      case 'GENE_CUT':
        // Stage stays on stage-gene (where the readout/chip live) while
        // the cut animation plays — switching to stage-gene-cut early
        // would hide the very elements the animation runs on.
        btnCutGene.disabled = true;
        setPanelHeader('Gene of Interest', 'Cutting…');
        runCutAnimation(geneEnzymeChip, readoutGeneEl, appState.geneMatchedEnzyme, () => {
          showStage('stageGeneCut');
          renderGeneCutAndComparison();
          setPanelHeader('Gene of Interest', 'Cut & Compare Sticky Ends');
        }, getGeneSequence(appState.plasmidCut.enzyme).seq, Math.min(...appState.geneSelectedBases.map(b => b.index)));
        break;

      case 'READY_FOR_INSERTION':
        showStage('stageLigation');
        renderInsertionReady();
        setPanelHeader('Insert Gene of Interest', 'Bring the Compatible Ends Together');
        break;

      case 'STICKY_ENDS_ANNEALED':
        renderAnnealed(); // sets its own header (sticky vs blunt)
        break;

      case 'LIGATION_IN_PROGRESS':
        runLigationAnimation();
        setPanelHeader('DNA Ligation', 'Sealing the Backbone');
        break;

      case 'LIGATION_COMPLETE':
        renderLigationComplete();
        seeRecombinantsRow.classList.remove('stage-hidden');
        setPanelHeader('Recombinant DNA', 'Ligation Complete');
        break;

      case 'RECOMBINANT_PLASMID_VIEW': {
        hintOverlay.classList.remove('visible');
        showStage('stageRecombinantView');
        renderRecombinantPlasmidView();
        appState.panelOpen = true;           // this view never opened the panel before
        panel.classList.add('visible');
        panel.scrollTop = 0;
        const vec = (bacteria[appState.selectedIndex] || {}).plasmidType === 'vector';
        if (!identityKnown()) setPanelHeader('Transformed Bacterium', 'Identity Unknown — Screen to Find Out');
        else setPanelHeader(vec ? 'Non-recombinant Bacterium' : 'Recombinant Bacterium', vec ? 'Empty Vector — No Insert' : 'Exploring the Inserted Gene');
        break;
      }
    }
  }

  /* ============================================================
     EVENT HANDLERS
     ============================================================ */
  function isRecombinantCell(i) {
    return i >= 0 && i < bacteria.length && !!bacteria[i].recombinant;
  }

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', e => {
    const pos = getPointerPos(e);
    const w = screenToWorld(pos.x, pos.y);

    if (appState.mode === 'IDLE') {
      const idx = getBacteriumAt(w.x, w.y);
      if (idx >= 0) {
        appState.selectedIndex = idx;
        setMode('CELL_SELECTED', { armHint: true });
      }
    }
    else if (appState.mode === 'CELL_SELECTED') {
      if (isPlasmidHit(pos.x, pos.y)) {
        const sb = bacteria[appState.selectedIndex];
        if (appState.recombinantMode && sb && sb.plasmidType) {
          setMode('RECOMBINANT_PLASMID_VIEW');   // recombinant OR empty vector: show its DNA + gene state
        } else {
          setMode('PLASMID_ANALYSIS');
        }
      } else {
        const idx = getBacteriumAt(w.x, w.y);
        if (idx >= 0 && idx !== appState.selectedIndex) {
          appState.selectedIndex = idx;
        } else if (idx === -1) {
          setMode('IDLE');
        }
      }
    }
    else if (PANEL_OPEN_MODES.includes(appState.mode)) {
      // Click outside panel closes it on mobile, or deselects
      const idx = getBacteriumAt(w.x, w.y);
      if (idx === -1 && !isPlasmidHit(pos.x, pos.y)) {
        setMode('CELL_SELECTED');
      }
    }
  });

  canvas.addEventListener('pointermove', e => {
    const pos = getPointerPos(e);
    appState.mouseX = pos.x; appState.mouseY = pos.y;
  });

  btnReset.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    appState.cutAnimRunId += 1; // invalidate any in-flight cut animation before rebuilding the readout
    appState.selectedBases = [];
    appState.matchedEnzyme = null;
    setMode('PLASMID_ANALYSIS'); // openPanel() rebuilds the strand and updateSelectionUI() clears status/Restrict
  });

  btnRestrict.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (btnRestrict.disabled || !appState.matchedEnzyme) return;
    setMode('PLASMID_CUT');
  });

  btnGoToGene.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    setMode('GENE_ANALYSIS');
  });

  btnResetGene.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    appState.cutAnimRunId += 1; // invalidate any in-flight cut animation before rebuilding the readout
    setMode('GENE_ANALYSIS'); // re-enters the same case: fresh selection state, rebuilt UI
  });

  btnCutGene.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (btnCutGene.disabled || !appState.geneMatchedEnzyme) return;
    setMode('GENE_CUT');
  });

  btnProceedLigation.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (btnProceedLigation.disabled) return;
    setMode('READY_FOR_INSERTION');
  });

  btnInsertGene.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    performInsertion();
  });

  document.getElementById('btn-replay-ligation').addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    ligx = null;
    setMode('READY_FOR_INSERTION');
  });

  btnSimulateLigation.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    setMode('LIGATION_IN_PROGRESS');
  });

  btnSeeRecombinants.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    appState.recombinantMode = true;
    appState.expEnzyme = appState.plasmidCut ? appState.plasmidCut.enzyme : appState.expEnzyme;
    appState.smoothIdleTransition = true;
    setMode('IDLE');
    if (bacteria.some(b => b.plasmidType) || appState.plated) {
      // A previous experiment already transformed/selected this plate — start fresh
      appState.plate = null; appState.selective = false; appState.plated = false;
      appState.reveal = false; appState.bgalT = 0; appState.ampTint = 0;
      freePlasmids.length = 0;
      initBacteria();
    }
    startTransformation();
  });


  /* ============================================================
     VECTOR MODEL — pBR322 (simplified teaching map)
     ampR (β-lactamase) and tetR are the two selectable markers.
     Which one an insert inactivates depends on where the enzyme cuts:
       EcoRI  → outside both markers (no insertional inactivation)
       BamHI  → inside tetR  (as in pBR322)
       HindII → inside ampR  (placed there in this simplified map)
     For blue–white screening the same insert goes into lacZ of a
     pUC-type vector, where all three sites sit in the cloning region.
     ============================================================ */
  const MARKER_OF = { EcoRI: null, BamHI: 'tetR', HindII: 'ampR' };
  // The experiment's enzyme survives closePanel() (which clears plasmidCut)
  const curEnzyme = () => appState.plasmidCut ? appState.plasmidCut.enzyme : (appState.expEnzyme || null);
  const curMarker = () => MARKER_OF[curEnzyme()] || null;

  // ---------- Plasmid maps (pBR322 / pUC-type) ----------
  // Angles are degrees clockwise from the top; positions follow the real
  // pBR322 map (4,361 bp). HindII is placed in ampR for this teaching map.
  const MAPS = {
    pbr: {
      name: 'pBR322', bp: '4,361 bp',
      genes: [
        { id: 'tetR', a0: 7,   a1: 105, dir: 1,  col: '#5fd6a5', pos: '86–1,276 bp',
          full: 'Tetracycline resistance gene', text: 'Makes a membrane pump that pushes tetracycline out of the cell. A selectable marker.' },
        { id: 'rop',  a0: 158, a1: 174, dir: 1,  col: '#c9a2ff', pos: '1,915–2,106 bp',
          full: 'Rop protein gene', text: 'Rop keeps the plasmid copy number low (about 15–20 per cell).' },
        { id: 'ori',  a0: 200, a1: 218, dir: 0,  col: '#d7d2f2', pos: '≈2,535 bp',
          full: 'Origin of replication', text: 'Where copying of the plasmid begins — lets it replicate independently of the chromosome.' },
        { id: 'ampR', a0: 272, a1: 343, dir: -1, col: '#6aa8ff', pos: '3,293–4,153 bp · reverse strand',
          full: 'Ampicillin resistance gene (bla)', text: 'Makes β-lactamase, which destroys ampicillin. A selectable marker.' },
      ],
      sites: { EcoRI: { deg: 0, pos: '4,359 bp' }, BamHI: { deg: 31, pos: '375 bp' }, HindII: { deg: 298, pos: 'inside ampR (simplified)', lab: 318 } },
    },
    puc: {
      name: 'pUC-type', bp: '≈2,686 bp',
      genes: [
        { id: 'lacZ', a0: 18,  a1: 66,  dir: -1, col: '#f2c84b', pos: 'lacZα · cloning sites inside',
          full: 'lacZα (β-galactosidase fragment)', text: 'Makes β-galactosidase, which turns X-gal blue. The cloning sites sit inside it.' },
        { id: 'ori',  a0: 150, a1: 172, dir: 0,  col: '#d7d2f2', pos: 'pMB1 origin',
          full: 'Origin of replication', text: 'High-copy origin — hundreds of plasmid copies per cell.' },
        { id: 'ampR', a0: 218, a1: 333, dir: -1, col: '#6aa8ff', pos: 'reverse strand',
          full: 'Ampicillin resistance gene (bla)', text: 'Makes β-lactamase — selects for cells that carry the plasmid.' },
      ],
      sites: { EcoRI: { deg: 53, pos: 'cloning region', lab: 28 }, BamHI: { deg: 56, pos: 'cloning region', lab: 52 }, HindII: { deg: 58, pos: 'cloning region', lab: 76 } },
    },
  };

  function vectorMapSVG({ size = 120, enzyme = null, insert = false, mode = 'pbr', focusGene = null, interactive = false, active = null } = {}) {
    const M = MAPS[mode];
    const big = size >= 200;
    const VB = big ? 320 : 300, c = VB / 2, r = big ? 100 : 92, w = big ? 12 : 16;
    const pt = (deg, rr = r) => { const a = (deg - 90) * Math.PI / 180; return [c + Math.cos(a) * rr, c + Math.sin(a) * rr]; };
    const f1 = v => v.toFixed(1);
    const arcD = (a0, a1, rr = r) => {
      const [x0, y0] = pt(a0, rr), [x1, y1] = pt(a1, rr), large = (a1 - a0) > 180 ? 1 : 0;
      return `M${f1(x0)} ${f1(y0)} A${rr} ${rr} 0 ${large} 1 ${f1(x1)} ${f1(y1)}`;
    };
    // gene as an arrow: arc body + arrowhead in the reading direction
    const geneShape = (g, col, sw, extra = '') => {
      const head = g.dir ? Math.min(7, (g.a1 - g.a0) * 0.35) : 0;
      const s0 = g.dir < 0 ? g.a0 + head : g.a0, s1 = g.dir > 0 ? g.a1 - head : g.a1;
      let out = `<path d="${arcD(s0, s1)}" fill="none" stroke="${col}" stroke-width="${sw}" ${extra}/>`;
      if (g.dir) {
        const tip = g.dir > 0 ? g.a1 : g.a0, base = g.dir > 0 ? g.a1 - head : g.a0 + head;
        const [tx, ty] = pt(tip), [ox, oy] = pt(base, r + sw * 0.85), [ix, iy] = pt(base, r - sw * 0.85);
        out += `<path d="M${f1(ox)} ${f1(oy)} L${f1(tx)} ${f1(ty)} L${f1(ix)} ${f1(iy)} Z" fill="${col}" ${extra}/>`;
      }
      return out;
    };
    const hitGene = enzyme ? (mode === 'puc' ? 'lacZ' : MARKER_OF[enzyme]) : null;
    const pill = (x, y, txt, col, fs, on, anchor = 'middle') => {
      const tw = txt.length * fs * 0.6 + 12, th = fs + 9;
      const rx = anchor === 'start' ? x - 6 : anchor === 'end' ? x - tw + 6 : x - tw / 2;
      return (on ? `<rect x="${f1(rx)}" y="${f1(y - th / 2 - 1)}" width="${f1(tw)}" height="${f1(th)}" rx="${f1(th / 2)}" fill="rgba(14,12,34,0.92)" stroke="${col}" stroke-width="1.4"/>` : '') +
        `<text x="${f1(x)}" y="${f1(y + fs * 0.36)}" text-anchor="${anchor}" font-size="${fs}" font-weight="700" fill="${col}" font-family="'IBM Plex Sans',Roboto,sans-serif">${txt}</text>`;
    };

    const vbY = big ? 4 : 0, vbH = big ? VB - 30 : VB;   // trim unused space under the ring
    let out = `<svg class="vmap" width="${size}" height="${Math.round(size * vbH / VB)}" viewBox="0 ${vbY} ${VB} ${vbH}" role="img" aria-label="${M.name} plasmid map">`;
    out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(200,195,255,0.22)" stroke-width="${big ? 3 : 5}"/>`;
    // bp ticks (big map)
    if (big) for (let d = 0; d < 360; d += 30) { const [x0, y0] = pt(d, r - w - 2), [x1, y1] = pt(d, r - w - 6); out += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="rgba(200,195,255,0.25)" stroke-width="1"/>`; }

    for (const g of M.genes) {
      const broken = insert && hitGene === g.id;
      const on = active === g.id || focusGene === g.id;
      const dim = (focusGene && focusGene !== g.id) || (active && active !== g.id);
      const op = broken ? 0.4 : dim ? 0.45 : 1;
      out += `<g class="vf" data-feat="${g.id}" style="cursor:${interactive ? 'pointer' : 'default'}">`;
      if (interactive) out += `<path d="${arcD(g.a0, Math.max(g.a1, g.a0 + 14))}" fill="none" stroke="transparent" stroke-width="34"/>`;
      out += geneShape(g, g.col, on ? w * 1.35 : w, `opacity="${op}"` + (on ? ` style="filter:drop-shadow(0 0 6px ${g.col})"` : ''));
      if (big || g.id !== 'rop') {
        const mid = (g.a0 + g.a1) / 2;
        const [lx, ly] = pt(mid, r - w - (big ? 20 : 26));
        const label = g.id + (broken ? ' ✗' : '');
        out += pill(lx, ly, label, broken ? '#ff8a8a' : g.col, big ? (g.id === 'rop' || g.id === 'ori' ? 11 : 13) : 22, on && big);
      }
      out += `</g>`;
    }
    // restriction sites: tick through the ring + leader + label outside
    for (const [name, st] of Object.entries(M.sites)) {
      const sel = name === enzyme, on = active === name;
      if (!big && !sel) continue;
      const deg = st.deg, ldeg = big ? (st.lab != null ? st.lab : deg) : deg;
      const [t0x, t0y] = pt(deg, r - w), [t1x, t1y] = pt(deg, r + w);
      const col = sel || on ? '#ffffff' : 'rgba(225,220,255,0.75)';
      out += `<g class="vf" data-feat="${name}" style="cursor:${interactive ? 'pointer' : 'default'}">`;
      out += `<line x1="${f1(t0x)}" y1="${f1(t0y)}" x2="${f1(t1x)}" y2="${f1(t1y)}" stroke="${col}" stroke-width="${sel || on ? 3 : 2}" stroke-linecap="round"/>`;
      if (big) {
        const [ax, ay] = pt(deg, r + w + 2), [bx, by] = pt(ldeg, r + 26);
        out += `<path d="M${f1(ax)} ${f1(ay)} L${f1(bx)} ${f1(by)}" stroke="${col}" stroke-width="1" fill="none" opacity="0.7"/>`;
        const [lx, ly] = pt(ldeg, r + 33);
        const sx = Math.sin(ldeg * Math.PI / 180);
        const anchor = Math.abs(sx) < 0.25 ? 'middle' : sx > 0 ? 'start' : 'end';
        out += pill(lx, ly + (Math.abs(sx) < 0.25 ? (Math.cos(ldeg * Math.PI / 180) > 0 ? -4 : 6) : 0), name + (sel ? ' ✂' : ''), sel ? '#ffffff' : col, 13, on || sel, anchor);
        if (interactive) out += `<circle cx="${f1(lx)}" cy="${f1(ly)}" r="22" fill="transparent"/>`;
      } else {
        const [lx, ly] = pt(deg, r + w + 28);
        out += pill(lx, ly, name, '#ffffff', 22, false);
      }
      out += `</g>`;
    }
    if (insert && enzyme && M.sites[enzyme]) {
      const d = M.sites[enzyme].deg;
      out += `<path d="${arcD(d - 8, d + 8, r)}" fill="none" stroke="#ff6b6b" stroke-width="${w * 1.7}" stroke-linecap="round"/>`;
      if (big) { const [ix, iy] = pt(d, r - w - 22); out += pill(ix, iy, 'insert', '#ff8a8a', 11, true); }
    }
    if (big) {
      out += `<text x="${c}" y="${c - 2}" text-anchor="middle" font-size="17" font-weight="800" fill="#ece8ff" font-family="'IBM Plex Sans',Roboto,sans-serif">${M.name}</text>`;
      out += `<text x="${c}" y="${c + 16}" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(200,195,255,0.6)" font-family="'IBM Plex Sans',Roboto,sans-serif">${M.bp}${insert ? ' + insert' : ''}</text>`;
    }
    return out + '</svg>';
  }

  // Tap-to-explain: renders an interactive map with a callout panel
  function featureInfo(id, mode, insert) {
    const M = MAPS[mode], g = M.genes.find(x => x.id === id);
    const e = curEnzyme();
    if (g) {
      const hit = insert && e && (mode === 'puc' ? 'lacZ' : MARKER_OF[e]) === g.id;
      const siteHere = Object.keys(M.sites).filter(n => (mode === 'puc' ? g.id === 'lacZ' : MARKER_OF[n] === g.id));
      return `<div class="vi-h" style="color:${g.col}">${g.id}<span>${g.full}</span></div>` +
        `<div class="vi-t">${g.text}</div>` +
        (siteHere.length ? `<div class="vi-t">Cut site${siteHere.length > 1 ? 's' : ''} inside: <b>${siteHere.join(', ')}</b> — an insert there inactivates ${g.id}.</div>` : '') +
        (hit ? `<div class="vi-t x">Inactivated in this recombinant — the insert interrupts it.</div>` : '') +
        `<div class="vi-p">${g.pos}</div>`;
    }
    const en = ENZYMES.find(x => x.name === id), st = M.sites[id];
    if (!en || !st) return '';
    const L = en.pattern.length;
    const shown = en.pattern.slice(0, en.cutAfter) + '↓' + en.pattern.slice(en.cutAfter);
    const oh = en.endType === 'sticky' ? `sticky ends · ${en.pattern.slice(en.cutAfter, L - en.cutAfter)} overhang` : 'blunt ends';
    const inGene = mode === 'puc' ? 'lacZ' : MARKER_OF[id];
    return `<div class="vi-h" style="color:#fff">${id}<span>Restriction site · ${en.source}</span></div>` +
      `<div class="vi-t"><b class="mono">${shown}</b> · ${oh}${en.pattern !== 'GTYRAC' ? '' : ' (Y = C/T, R = A/G)'}</div>` +
      `<div class="vi-t">${inGene ? `Lies inside <b>${inGene}</b> → cloning here inactivates ${inGene} (insertional inactivation).` : 'Lies <b>outside both markers</b> → an insert leaves ampR and tetR working.'}</div>` +
      `<div class="vi-p">${st.pos}${id === e ? ' · your cut' : ''}</div>`;
  }
  function renderMap(hostId, infoId, opts) {
    const host = document.getElementById(hostId), info = document.getElementById(infoId);
    if (!host) return;
    const draw = active => {
      host.innerHTML = vectorMapSVG({ ...opts, interactive: true, active });
      if (info) {
        info.innerHTML = active ? featureInfo(active, opts.mode || 'pbr', opts.insert)
          : '<div class="vi-hint">Tap a gene or a cut site on the map for details</div>';
        info.classList.toggle('on', !!active);
      }
    };
    host.__active = null;
    draw(null);
    if (!host.__bound) {
      host.__bound = true;
      host.addEventListener('pointerdown', ev => {
        const f = ev.target.closest('[data-feat]');
        ev.stopPropagation();
        const id = f ? f.dataset.feat : null;
        host.__active = id && host.__active !== id ? id : null;   // tap again (or empty space) to close
        host.__draw(host.__active);
        if (host.__active) sfx('blip');
      });
    }
    host.__draw = draw;
  }

  function geneNote(enzyme, mode = 'pbr') {
    if (!enzyme) return 'Two <b>selectable markers</b>: <b>ampR</b> (ampicillin resistance) and <b>tetR</b> (tetracycline resistance). Pick a site to cut — where it lies decides which marker an insert will knock out.';
    if (mode === 'puc') return `<b>${enzyme}</b> cuts inside <b>lacZ</b> → an insert inactivates β-galactosidase.`;
    const m = MARKER_OF[enzyme];
    if (!m) return `<b>${enzyme}</b> cuts <b>outside both markers</b> → an insert leaves ampR and tetR working. No insertional inactivation.`;
    const other = m === 'tetR' ? 'ampR' : 'tetR';
    return `<b>${enzyme}</b> cuts <b>inside ${m}</b> → an insert here <b>inactivates ${m}</b> (insertional inactivation). Recombinants: <span class="ok">${other} ✓</span> <span class="x">${m} ✗</span>`;
  }
  function renderVectorCard() {
    const e = curEnzyme();
    renderMap('vec-map', 'vec-info', { size: 260, enzyme: e, mode: 'pbr' });
    document.getElementById('vec-note').innerHTML = geneNote(e);
  }

  /* ============================================================
     TRANSFORMATION + SELECTION
     ------------------------------------------------------------
     Transformation: recombinant plasmids are added to the plate,
     a heat shock (42 °C) makes membranes briefly leaky, and only a
     FEW cells actually take a plasmid up — real transformation is
     inefficient. Selection: ampicillin kills every cell without the
     plasmid (no ampR gene), leaving only the recombinant clone.
     ============================================================ */
  const freePlasmids = [];
  const dishBanner = document.getElementById('dish-banner');
  const btnAmp = document.getElementById('btn-amp');
  let bannerTimer = null;
  function banner(html, cls = '', ms = 4200) {
    dishBanner.className = cls;
    dishBanner.innerHTML = html;
    requestAnimationFrame(() => dishBanner.classList.add('show'));
    clearTimeout(bannerTimer);
    if (ms) bannerTimer = setTimeout(() => dishBanner.classList.remove('show'), ms);
  }

  function startTransformation() {
    const now = performance.now();
    appState.selRun = (appState.selRun || 0) + 1;     // invalidates timers from any earlier run
    selSheet.classList.remove('show');
    const pool = bacteria.filter(b => !b.dying && !b.recombinant);
    // Only a few cells take up a plasmid; ligation mixes contain both
    // recombinant plasmids and empty vectors that re-closed without the gene
    const nTake = Math.max(2, Math.min(4, Math.round(pool.length * 0.2)));
    const takers = [];
    while (takers.length < nTake && pool.length) takers.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    takers.forEach(b => { b.protect = true; });   // don't let overcrowding lyse a cell mid-uptake
    freePlasmids.length = 0;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * (dishInnerRadius - 40);
      freePlasmids.push({
        x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d,
        vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25), rot: Math.random() * 6.28, vr: rand(-0.03, 0.03),
        target: i < takers.length ? takers[i] : null,
        kind: i < takers.length ? (i < Math.ceil(takers.length / 2) ? 'recomb' : 'vector') : (Math.random() < 0.55 ? 'recomb' : 'vector'),
        state: 'drift', alpha: 0, enterT: 0,
      });
    }
    appState.transform = { start: now, takers, phase: 'add', heat: 0, done: false };
    appState.selective = false; appState.plate = null; appState.plated = false; appState.reveal = false; appState.bgalT = 0;
    appState.selStep = 0;
    btnAmp.classList.remove('show');
    setTimeout(() => banner('The ligation mix is added to the bacteria<small>Red rings = recombinant plasmids · plain rings = empty vectors that re-closed without the gene</small>', '', 5000), 900);
  }

  function updateTransformation() {
    const T = appState.transform;
    if (!T || T.done) return;
    const el = performance.now() - T.start;
    // Phase timeline
    if (T.phase === 'add' && el > 3200) {
      T.phase = 'heat';
      banner('Heat shock — 42 °C for a moment<small>Cell membranes become briefly leaky, letting plasmids slip inside</small>', 'heat', 3600);
      sfx('lock'); buzz(20);
    }
    if (T.phase === 'heat' && el > 4400) T.phase = 'uptake';
    T.heat += ((T.phase === 'heat' || (T.phase === 'uptake' && el < 6200) ? 1 : 0) - T.heat) * 0.05;

    for (const p of freePlasmids) {
      if (p.state === 'gone') continue;
      p.rot += p.vr;
      if (p.state === 'enter') {
        // shrink into the cell, riding along with it
        p.enterStart = p.enterStart || performance.now();
        p.enterT = Math.min(1, (performance.now() - p.enterStart) / 700);
        p.x += (p.target.x - p.x) * 0.2; p.y += (p.target.y - p.y) * 0.2;
        if (p.enterT >= 1) {
          p.state = 'gone';
          p.target.plasmidType = p.kind;
          p.target.recombinant = p.kind === 'recomb';
          p.target.uptake = 1; p.target.uptakeCol = p.kind === 'recomb' ? 'rgba(255,110,110,0.95)' : 'rgba(110,225,245,0.9)';
          p.target.length = Math.max(p.target.length, p.target.birthLen * (DIVIDE_AT - 0.15)); // clone starts soon
          if (appState.recombinantBacteriumIndex < 0 || !bacteria[appState.recombinantBacteriumIndex]?.recombinant)
            appState.recombinantBacteriumIndex = bacteria.indexOf(p.target);
          sfx('seal'); buzz(15);
        }
        continue;
      }
      p.alpha = Math.min(1, p.alpha + 0.02);
      if (p.target && (p.target.dying || !bacteria.includes(p.target))) p.target = null;
      if (T.phase === 'uptake' && p.target) {
        // steer toward the cell that will take it up
        const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy) || 1;
        p.vx += dx / d * 0.06; p.vy += dy / d * 0.06;
        if (d < 8) { p.state = 'enter'; p.vx = p.vy = 0; }
      } else {
        p.vx += rand(-0.02, 0.02); p.vy += rand(-0.02, 0.02);
      }
      p.vx *= 0.95; p.vy *= 0.95; p.x += p.vx; p.y += p.vy;
      const dx = p.x - CX, dy = p.y - CY, d = Math.hypot(dx, dy);
      if (d > dishInnerRadius - 20) { p.vx -= dx / d * 0.05; p.vy -= dy / d * 0.05; }
      // Plasmids that never got in are degraded / washed away
      if (!p.target && el > 7600) { p.alpha = Math.min(p.alpha, 1 - (el - 7600) / 1400); if (p.alpha <= 0) p.state = 'gone'; }
    }
    if (el > 8600 && !freePlasmids.some(p => p.state !== 'gone')) {
      T.done = true;
      const n = bacteria.filter(b => !b.dying).length, k = bacteria.filter(b => b.recombinant && !b.dying).length;
      banner(`Only ${T.takers.length} of ${n} cells took up a plasmid` +
        `<small>Some got the recombinant, some the empty vector — and they all look alike. How do we find the recombinants?</small>`, '', 6500);
      const run = appState.selRun;
      setTimeout(() => { if (run !== appState.selRun) return; appState.selStep = 0; renderSelSheet(); }, 2200);
    }
  }

  function drawFreePlasmids() {
    const a0 = 1 - appState.cellZoom;
    if (a0 <= 0.01 || !freePlasmids.length) return;
    for (const p of freePlasmids) {
      if (p.state === 'gone') continue;
      const sc = p.state === 'enter' ? 1 - p.enterT : 1;
      ctx.save();
      ctx.globalAlpha = a0 * p.alpha * (p.state === 'enter' ? 1 - p.enterT * 0.5 : 1);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sc, sc);
      ctx.shadowColor = 'rgba(100,220,240,0.8)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(110,225,245,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
      if (p.kind !== 'vector') {
        ctx.beginPath(); ctx.arc(0, 0, 5.5, -0.6, 0.6);           // the inserted gene
        ctx.strokeStyle = 'rgba(255,100,100,1)'; ctx.lineWidth = 2.2; ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawHeatAndAmp() {
    const a0 = 1 - appState.cellZoom;
    if (a0 <= 0.01) return;
    const T = appState.transform;
    if (T && T.heat > 0.01) {
      ctx.save(); ctx.globalAlpha = a0 * T.heat * 0.35;
      const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, dishInnerRadius);
      g.addColorStop(0, 'rgba(255,150,60,0.0)'); g.addColorStop(0.7, 'rgba(255,130,50,0.25)'); g.addColorStop(1, 'rgba(255,110,40,0.6)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, dishInnerRadius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (appState.selective && appState.plate) {
      appState.ampTint = Math.min(1, (appState.ampTint || 0) + 0.02);
      ctx.save(); ctx.globalAlpha = a0 * appState.ampTint * 0.22;
      ctx.fillStyle = appState.plate.tet && !appState.plate.amp ? 'rgba(120,225,200,1)' : appState.plate.xgal ? 'rgba(235,215,150,1)' : 'rgba(255,205,110,1)';
      ctx.beginPath(); ctx.arc(CX, CY, dishInnerRadius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  btnAmp.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (appState.selective) return;
    appState.selective = true;
    btnAmp.classList.remove('show');
    freePlasmids.forEach(p => { if (p.state === 'drift' && !p.target) p.state = 'gone'; });
    const now = performance.now();
    for (const b of bacteria) if (!b.recombinant && !b.dying) b.killAt = now + rand(500, 4200);
    banner('Ampicillin added to the plate<small>Only cells carrying the plasmid — with its ampicillin-resistance gene (ampR) — can survive</small>', 'amp', 5200);
    sfx('lock'); buzz(20);
    setTimeout(() => {
      banner(`Selection complete — every survivor is recombinant` +
        `<small>All are descendants of the few transformed cells. Tap one to see the inserted gene.</small>`, '', 7000);
    }, 6500);
  });


  /* ---------- Selection: antibiotic markers (pBR322) or blue–white (β-gal) ---------- */
  const hasAmpR = (b, mode) => !!b.plasmidType && !(b.plasmidType === 'recomb' && mode !== 'bgal' && curMarker() === 'ampR');
  const hasTetR = b => !!b.plasmidType && !(b.plasmidType === 'recomb' && curMarker() === 'tetR');
  function survives(b, plate) {
    if (!plate) return true;
    if (plate.amp && !hasAmpR(b, plate.xgal ? 'bgal' : 'abx')) return false;
    if (plate.tet && !hasTetR(b)) return false;
    return true;
  }
  const plateName = pl => [pl.amp && 'Ampicillin', pl.tet && 'Tetracycline', pl.xgal && 'X-gal'].filter(Boolean).join(' + ');
  // First plate uses the marker the insert did NOT touch; the replica tests the other one
  const firstDrug = () => curMarker() === 'ampR' ? 'tet' : 'amp';
  const secondDrug = () => firstDrug() === 'amp' ? 'tet' : 'amp';
  const drugName = d => d === 'amp' ? 'ampicillin' : 'tetracycline';
  appState.screen = 'abx';

  const selSheet = document.getElementById('sel-sheet');
  const selGo = document.getElementById('sel-go');
  function renderSelSheet() {
    const mode = appState.screen, step = appState.selStep, e = curEnzyme(), m = curMarker();
    document.querySelectorAll('#sel-tabs button').forEach(bt => {
      bt.classList.toggle('on', bt.dataset.m === mode); bt.disabled = appState.plated && bt.dataset.m !== mode;
    });
    document.getElementById('sel-map').innerHTML = vectorMapSVG({ size: 74, enzyme: e, insert: true, mode: mode === 'bgal' ? 'puc' : 'pbr' });
    const txt = document.getElementById('sel-text');
    selGo.className = ''; selGo.disabled = false;
    if (mode === 'abx') {
      const d1 = firstDrug(), d2 = secondDrug();
      if (step === 0) {
        txt.innerHTML = m
          ? `Insert sits in <b>${m}</b> → recombinants are <span class="ok">${m === 'tetR' ? 'ampR' : 'tetR'} ✓</span> <span class="x">${m} ✗</span>. First, plate on <b>${drugName(d1)}</b> to keep only transformed cells.`
          : `<b>${e}</b> cut outside both markers — recombinants stay <span class="ok">ampR ✓ tetR ✓</span>. Let's see if antibiotics can still find them.`;
        selGo.textContent = `Plate on ${drugName(d1)}`; if (d1 === 'tet') selGo.className = 'tet';
      } else if (step === 1) {
        txt.innerHTML = `Plating on <b>${drugName(d1)}</b>… cells with no plasmid die.`;
        selGo.textContent = 'Plating…'; selGo.disabled = true;
      } else if (step === 2) {
        txt.innerHTML = `Survivors all carry a plasmid — but recombinant and empty-vector colonies <b>look identical</b>. Copy them onto <b>${drugName(d2)}</b>.`;
        selGo.textContent = `Replica-plate onto ${drugName(d2)}`; if (d2 === 'tet') selGo.className = 'tet';
      } else {
        txt.innerHTML = m
          ? `Recombinants (red rings) grew on ${drugName(d1)} but <b>not</b> on ${drugName(d2)} — their <b>${m}</b> was inactivated by the insert.`
          : `Every colony grew on both plates — <b>${e}</b> didn't inactivate a marker. Try <b>blue–white screening</b> (↺ then the other tab).`;
        selGo.textContent = m ? 'Screening complete' : 'Try blue–white screening';
        selGo.className = 'done'; selGo.disabled = !!m;
      }
    } else {
      if (step === 0) {
        txt.innerHTML = `In a <b>lacZ vector</b> (pUC-type) the ${e || ''} site lies inside <b>lacZ</b>. Plate on <b>ampicillin + X-gal + IPTG</b>: β-galactosidase turns X-gal blue.`;
        selGo.textContent = 'Plate on amp + X-gal + IPTG';
      } else if (step === 1) {
        txt.innerHTML = 'Plating… untransformed cells die; colonies start developing colour.';
        selGo.textContent = 'Plating…'; selGo.disabled = true;
      } else {
        txt.innerHTML = `<b style="color:#8fb4ff">Blue</b> = lacZ works → empty vector. <b>White</b> = insert broke lacZ (<b>insertional inactivation</b>) → <span class="ok">recombinant</span>.`;
        selGo.textContent = 'Screening complete'; selGo.className = 'done'; selGo.disabled = true;
      }
    }
    // Legend once the screen has revealed which colonies are which
    const lg = document.getElementById('sel-legend');
    let legend = '';
    if (mode === 'bgal' && step >= 2) {
      legend = `<div class="lg"><span class="sw white"></span><span><b>White colonies</b> — recombinant · lacZ broken</span></div>` +
               `<div class="lg"><span class="sw blue"></span><span><b>Blue colonies</b> — empty vector · lacZ intact</span></div>`;
    } else if (mode === 'abx' && step === 3) {
      legend = m
        ? `<div class="lg"><span class="sw ring"></span><span><b>Red-ringed colonies</b> — recombinant · ${m} broken</span></div>` +
          `<div class="lg"><span class="sw purple"></span><span><b>Other colonies</b> — empty vector · ampR + tetR intact</span></div>`
        : `<div class="lg"><span class="sw purple"></span><span><b>All colonies look alike</b> — recombinant and empty vector both keep ampR + tetR</span></div>`;
    }
    if (legend) legend += `<div class="hint">Tap any colony, then its plasmid, to see the DNA it carries</div>`;
    lg.innerHTML = legend; lg.classList.toggle('on', !!legend);
    selSheet.classList.add('show');
  }

  function plate(pl, label) {
    appState.plate = pl; appState.selective = true; appState.plated = true; appState.ampTint = 0;
    freePlasmids.forEach(p => { if (p.state === 'drift' && !p.target) p.state = 'gone'; });
    const now = performance.now();
    for (const b of bacteria) if (!b.dying && !survives(b, pl)) b.killAt = now + rand(500, 3800);
    sfx('lock'); buzz(20);
  }

  selGo.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (selGo.disabled) return;
    const mode = appState.screen, step = appState.selStep;
    if (mode === 'abx' && step === 0) {
      const d1 = firstDrug();
      plate({ amp: d1 === 'amp', tet: d1 === 'tet' });
      banner(`Plated on ${drugName(d1)}<small>Only cells carrying a plasmid (with an intact ${d1 === 'amp' ? 'ampR' : 'tetR'}) survive — recombinant <i>and</i> empty vector</small>`, 'amp', 5200);
      appState.selStep = 1; renderSelSheet();
      const run = appState.selRun;
      setTimeout(() => { if (run !== appState.selRun) return; appState.selStep = 2; renderSelSheet(); }, 5600);
    } else if (mode === 'abx' && step === 2) {
      openReplica();
    } else if (mode === 'abx' && step === 3 && !curMarker()) {
      restartTransformation('bgal');
    } else if (mode === 'bgal' && step === 0) {
      plate({ amp: true, xgal: true });
      banner('Plated on ampicillin + X-gal + IPTG<small>IPTG switches lacZ on · β-galactosidase cleaves X-gal into a blue pigment</small>', 'amp', 5200);
      appState.selStep = 1; renderSelSheet();
      const t0 = performance.now(), run = appState.selRun;
      const tick = () => {
        if (run !== appState.selRun || appState.screen !== 'bgal' || !appState.plated) return;
        appState.bgalT = Math.min(1, Math.max(0, (performance.now() - t0 - 2500) / 3500));
        if (appState.bgalT < 1) requestAnimationFrame(tick);
        else { appState.reveal = true; appState.selStep = 2; renderSelSheet();
          banner('Blue–white screening done<small>White colonies = recombinant (lacZ inactivated) · blue = empty vector</small>', '', 6500); }
      };
      requestAnimationFrame(tick);
    }
  });
  document.querySelectorAll('#sel-tabs button').forEach(bt => bt.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (bt.disabled || appState.plated) return;
    appState.screen = bt.dataset.m; appState.selStep = 0; renderSelSheet();
  }));
  document.getElementById('sel-redo').addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    restartTransformation(appState.screen);
  });

  function restartTransformation(mode) {
    selSheet.classList.remove('show');
    appState.screen = mode || appState.screen;
    appState.plate = null; appState.selective = false; appState.plated = false; appState.reveal = false; appState.bgalT = 0; appState.ampTint = 0;
    freePlasmids.length = 0;
    initBacteria();
    startTransformation();
  }

  // ---------- Credits (© button beside the title) ----------
  {
    const cr = document.getElementById('credits');
    const open = e => { e.stopPropagation(); e.preventDefault(); cr.classList.add('show'); };
    const close = e => { if (e) { e.stopPropagation(); } cr.classList.remove('show'); };
    document.getElementById('credit-btn').addEventListener('pointerdown', open);
    document.getElementById('cr-close').addEventListener('pointerdown', e => { e.preventDefault(); close(e); });
    cr.addEventListener('pointerdown', e => { if (e.target === cr) close(e); else e.stopPropagation(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  // ---------- Replica plating: velvet pad copies the colony pattern ----------
  function openReplica() {
    const d1 = firstDrug(), d2 = secondDrug(), m = curMarker();
    const live = bacteria.filter(b => !b.dying && b.plasmidType);
    const pos = b => [50 + (b.x - CX) / dishInnerRadius * 40, 50 + (b.y - CY) / dishInnerRadius * 40];
    const colony = (b, cls) => { const [x, y] = pos(b); return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"/>`; };
    const lost = live.filter(b => !survives(b, { amp: d2 === 'amp', tet: d2 === 'tet' }));
    const kept = live.filter(b => survives(b, { amp: d2 === 'amp', tet: d2 === 'tet' }));
    const tint1 = d1 === 'amp' ? 'rgba(255,205,110,0.16)' : 'rgba(120,225,200,0.16)';
    const tint2 = d2 === 'amp' ? 'rgba(255,205,110,0.16)' : 'rgba(120,225,200,0.16)';
    const plateSvg = (x, tint, title, inner) => `
      <g transform="translate(${x},0)">
        <text x="50" y="7" text-anchor="middle" class="rp-t">${title}</text>
        <circle cx="50" cy="56" r="44" class="rp-dish"/><circle cx="50" cy="56" r="41" fill="${tint}"/>
        <g transform="translate(0,6)">${inner}</g>
      </g>`;
    const master = live.map(b => colony(b, 'rp-col' + (b.plasmidType === 'recomb' && m ? ' rp-rec' : ''))).join('');
    const replica = kept.map(b => colony(b, 'rp-col rp-late')).join('') +
      lost.map(b => { const [x, y] = pos(b); return `<circle class="rp-miss" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2"/>`; }).join('');
    document.getElementById('rep-title').textContent = `Replica plating · ${drugName(d1)} → ${drugName(d2)}`;
    document.getElementById('rep-plates').innerHTML = `
      <svg viewBox="0 0 220 112" id="rp-svg">
        <style>
          .rp-t{font:700 5.2px var(--font-sans);fill:rgba(215,205,255,.85);letter-spacing:.3px}
          .rp-dish{fill:rgba(255,255,255,.03);stroke:rgba(200,195,255,.35);stroke-width:1}
          .rp-col{fill:#efe6cf;stroke:rgba(0,0,0,.25);stroke-width:.4}
          .rp-late{opacity:0;transition:opacity .8s}
          #rp-svg.copied .rp-late{opacity:1}
          .rp-miss{fill:none;stroke:#ff6b6b;stroke-width:.9;stroke-dasharray:1.6 1.2;opacity:0;transition:opacity .6s}
          #rp-svg.found .rp-miss{opacity:1}
          #rp-svg.found .rp-rec{fill:#ff8a8a;stroke:#ff4d4d;stroke-width:.8}
          .rp-pad{fill:url(#velvet);stroke:rgba(230,220,255,.6);stroke-width:.8;opacity:0;transition:opacity .4s}
        </style>
        <defs><pattern id="velvet" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="rgba(170,140,255,.55)"/><path d="M0 2L2 0" stroke="rgba(255,255,255,.35)" stroke-width=".4"/></pattern></defs>
        ${plateSvg(0, tint1, 'MASTER · ' + drugName(d1).toUpperCase(), master)}
        ${plateSvg(120, tint2, 'REPLICA · ' + drugName(d2).toUpperCase(), replica)}
        <circle id="rp-pad" class="rp-pad" cx="50" cy="56" r="41"/>
      </svg>`;
    const cap = document.getElementById('rep-caption'), close = document.getElementById('rep-close');
    close.classList.remove('show');
    cap.innerHTML = 'A sterile <b>velvet pad</b> is pressed onto the master plate, picking up cells from every colony…';
    document.getElementById('replica').classList.add('show');
    const svg = document.getElementById('rp-svg'), pad = document.getElementById('rp-pad');
    // Move the pad in SVG user units (transform attribute), not CSS px — CSS
    // transforms on SVG children scale differently across mobile browsers.
    const movePad = (x0, x1, ms) => {
      const t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        pad.setAttribute('transform', `translate(${(x0 + (x1 - x0) * e).toFixed(2)} 0)`);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    pad.setAttribute('transform', 'translate(0 0)');
    setTimeout(() => { pad.style.opacity = '0.85'; }, 400);
    setTimeout(() => { movePad(0, 120, 1000); cap.innerHTML = `…then pressed onto a fresh <b>${drugName(d2)}</b> plate in the <b>same orientation</b>.`; }, 1600);
    setTimeout(() => { pad.style.opacity = '0'; svg.classList.add('copied'); sfx('blip'); cap.innerHTML = 'After incubation, colonies grow on the replica — except the ones that can\'t survive here.'; }, 3000);
    setTimeout(() => {
      svg.classList.add('found'); sfx('seal'); buzz(15);
      cap.innerHTML = m
        ? `<span class="x">${lost.length} colon${lost.length === 1 ? 'y' : 'ies'} missing</span> on ${drugName(d2)} → their <b>${m}</b> was inactivated by the insert. These are the <span class="ok">recombinants</span> — pick them from the <b>master plate</b> (red).`
        : `<b>No colonies missing.</b> The ${curEnzyme()} insert didn't disrupt either marker, so antibiotics can't tell recombinants apart.`;
      close.classList.add('show');
    }, 5200);
  }
  document.getElementById('rep-close').addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    document.getElementById('replica').classList.remove('show');
    appState.reveal = !!curMarker();
    appState.selStep = 3; renderSelSheet();
    if (curMarker()) banner('Recombinants identified<small>Red rings mark the colonies that died on the replica plate. Tap one to see its plasmid.</small>', '', 6500);
  });

  // ---------- Dish layout: make room for the selection sheet ----------
  // Wide screens dock the sheet on the right; phones keep it below the dish.
  // The dish (and every cell in it) glides to the free area instead of
  // being covered.
  function isWideLayout() { return W >= 700 && W > H * 1.1; }
  function dishTarget() {
    const wide = isWideLayout();
    document.body.classList.toggle('wide-dock', wide);
    const sheetOn = selSheet.classList.contains('show') && appState.mode === 'IDLE';
    let cx = W / 2, cy = H / 2, r = Math.max(120, Math.min(220, W / 2 - 14, H / 2 - 70));
    if (sheetOn && wide) {
      const areaW = W - 360 - 24;
      cx = areaW / 2 + 8; cy = H / 2 + 8;
      r = Math.max(110, Math.min(220, areaW / 2 - 20, H / 2 - 56));
    } else if (sheetOn) {
      const top = 64, bottom = selSheet.getBoundingClientRect().top - 30;
      cy = (top + bottom) / 2;
      r = Math.max(110, Math.min(220, W / 2 - 14, (bottom - top) / 2));
    }
    return { cx, cy, r };
  }
  function applyDish(cx, cy, r) {
    const oldCX = CX, oldCY = CY, k = r / dishRadius;
    if (Math.abs(cx - oldCX) < 0.01 && Math.abs(cy - oldCY) < 0.01 && Math.abs(k - 1) < 1e-4) return;
    const mv = o => { o.x = cx + (o.x - oldCX) * k; o.y = cy + (o.y - oldCY) * k; };
    for (const b of bacteria) { mv(b); b.trail.forEach(mv); }
    freePlasmids.forEach(mv);
    CX = cx; CY = cy; dishRadius = r;
    dishInnerRadius = r - Math.round(r * 0.09);
    window.__dishRadius = r;
    if (appState.selectedIndex < 0) { camera.targetX = camera.x = CX; camera.targetY = camera.y = CY; }
  }
  function updateDishLayout(snap) {
    if (!W || appState.selectedIndex >= 0) return;   // never move the dish under a zoomed cell
    const t = dishTarget(), f = snap ? 1 : 0.08;
    applyDish(CX + (t.cx - CX) * f, CY + (t.cy - CY) * f, dishRadius + (t.r - dishRadius) * f);
  }

  // Banner / sheet only make sense on the dish view
  function syncDishUi() {
    const onDish = appState.mode === 'IDLE' && appState.cellZoom < 0.3;
    dishBanner.style.visibility = onDish ? '' : 'hidden';
    btnAmp.style.visibility = 'hidden';
    selSheet.style.visibility = onDish ? '' : 'hidden';
  }

  /* ============================================================
     RENDER — IDLE / PETRI DISH
     ============================================================ */
  function drawPetriDish() {
    const alpha = 1 - appState.cellZoom;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Background
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H));
    g.addColorStop(0, '#0a0a18'); g.addColorStop(0.4, '#050510'); g.addColorStop(1, '#020205');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Dish shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 25;
    ctx.beginPath(); ctx.arc(CX, CY, dishRadius, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.restore();

    // Liquid
    ctx.beginPath(); ctx.arc(CX, CY, dishInnerRadius, 0, Math.PI*2);
    const lg = ctx.createRadialGradient(CX-30, CY-30, 10, CX, CY, dishInnerRadius);
    lg.addColorStop(0, 'rgba(30,25,60,0.25)'); lg.addColorStop(0.5, 'rgba(20,20,50,0.15)'); lg.addColorStop(1, 'rgba(15,15,40,0.3)');
    ctx.fillStyle = lg; ctx.fill();

    // Glass rim
    ctx.beginPath(); ctx.arc(CX, CY, dishRadius, 0, Math.PI*2);
    const rg = ctx.createRadialGradient(CX, CY, dishInnerRadius, CX, CY, dishRadius);
    rg.addColorStop(0, 'rgba(200,210,255,0.02)'); rg.addColorStop(0.5, 'rgba(180,190,240,0.08)');
    rg.addColorStop(0.85, 'rgba(160,170,230,0.15)'); rg.addColorStop(1, 'rgba(140,150,220,0.25)');
    ctx.fillStyle = rg; ctx.fill();
    ctx.beginPath(); ctx.arc(CX, CY, dishRadius, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(200,210,255,0.15)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, dishInnerRadius, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(180,190,240,0.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, dishRadius-5, -2.8, -1.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();

    ctx.restore();
  }

  function drawIdleBacteria() {
    const alpha = 1 - appState.cellZoom;
    if (alpha <= 0.01) return;
    for (let i = 0; i < bacteria.length; i++) {
      const b = bacteria[i];
      const isSelected = (appState.selectedIndex === i);
      const dim = (appState.selectedIndex >= 0 && !isSelected) ? 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;

      for (let j = 0; j < b.trail.length - 1; j++) {
        const t = b.trail[j];
        const a = (j / b.trail.length) * 0.06 * dim;
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle);
        drawRodShape(0, 0, b.length, b.width, `rgba(180,100,255,${a})`);
        ctx.restore();
      }

      ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      const fade = b.dying ? Math.max(0, 1 - b.dying) : 1;
      const look = cellLook(b);
      const hue = look.hue;
      const dd = dim * fade;

      // Flagella — trail from the rear pole and beat as the cell swims
      drawFlagella(b, dd, hue);

      if (b.divP > 0) {
        // Binary fission: two daughter rods, waist pinching, then parting
        const p = Math.min(1, b.divP);
        const half = b.length / 2;
        const gap = p * 3;
        const dl = half + (1 - p) * b.width * 0.6;   // overlap early → reads as one constricting rod
        drawBacteriumBody(b, -half / 2 - gap / 2, dl, hue, dd, isSelected, look);
        drawBacteriumBody(b,  half / 2 + gap / 2, dl, hue, dd, isSelected, look);
        // Septum line
        ctx.beginPath();
        ctx.moveTo(0, -b.width / 2 * (1 - p)); ctx.lineTo(0, b.width / 2 * (1 - p));
        ctx.strokeStyle = `hsla(${hue+30},80%,80%,${0.5 * (1 - p) * dd})`;
        ctx.lineWidth = 1; ctx.stroke();
      } else {
        drawBacteriumBody(b, 0, b.length, hue, dd, isSelected, look);
      }
      if (b.dying) {
        // Lysis: membrane bursts into a faint ring of debris
        ctx.beginPath();
        ctx.arc(0, 0, b.length * 0.4 + b.dying * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue},60%,70%,${0.25 * (1 - b.dying) * dim})`;
        ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();

      // Recombinant bacterium marker — subtle dashed red ring, shown
      // only after "See Recombinants" and only on the one designated
      // bacterium. Purely additive; every other bacterium's rendering
      // above is completely unchanged.
      if (b.uptake > 0) {
        // membrane "opening" pulse at the moment the plasmid enters
        ctx.save(); ctx.globalAlpha = alpha * b.uptake;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.length * 0.6 + (1 - b.uptake) * 18, 0, Math.PI * 2);
        ctx.strokeStyle = b.uptakeCol || 'rgba(110,225,245,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
        b.uptake = Math.max(0, b.uptake - 0.015);
      }
      if (appState.reveal && b.recombinant && !b.dying) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(b.x, b.y);
        ctx.beginPath();
        ctx.arc(0, 0, b.length * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 90, 90, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Cell colour: identity stays hidden until a screen reveals it.
  // β-gal plate: empty vector (lacZ intact) → blue; recombinant (lacZ broken) → white.
  function cellLook(b) {
    if (appState.bgalT > 0 && b.plasmidType) {
      const t = appState.bgalT;
      return b.plasmidType === 'vector' ? { hue: 222, sat: 1 + 0.15 * t, light: 6 * t } : { hue: t > 0.3 ? 48 : b.hue, sat: 1 - 0.88 * t, light: 30 * t };
    }
    if (appState.reveal && b.recombinant) return { hue: 335, sat: 1, light: 0 };
    return { hue: b.hue, sat: 1, light: 0 };
  }

  function drawBacteriumBody(b, ox, len, hue, dim, isSelected, look = { sat: 1, light: 0 }) {
    ctx.save();
    ctx.translate(ox, 0);
    const S = v => Math.round(v * look.sat), Lt = v => Math.min(92, v + look.light);
    const glowInt = 0.4 + Math.sin(b.glowPhase) * 0.15;
    ctx.shadowColor = `hsla(${hue},${S(80)}%,${Lt(60)}%,${glowInt*dim})`;
    ctx.shadowBlur = isSelected ? 35 : 20;
    const grad = ctx.createLinearGradient(-len/2, 0, len/2, 0);
    grad.addColorStop(0, `hsla(${hue},${S(60)}%,${Lt(25)}%,${b.opacity*0.6*dim})`);
    grad.addColorStop(0.3, `hsla(${hue},${S(70)}%,${Lt(40)}%,${b.opacity*0.85*dim})`);
    grad.addColorStop(0.5, `hsla(${hue+10},${S(75)}%,${Lt(55)}%,${b.opacity*dim})`);
    grad.addColorStop(0.7, `hsla(${hue},${S(70)}%,${Lt(40)}%,${b.opacity*0.85*dim})`);
    grad.addColorStop(1, `hsla(${hue},${S(60)}%,${Lt(25)}%,${b.opacity*0.6*dim})`);
    drawRodShape(0, 0, len, b.width, grad, true);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `hsla(${hue+20},60%,70%,${0.25*dim})`;
    ctx.lineWidth = 0.8;
    drawRodOutline(0, 0, len-2, b.width-2);
    ctx.beginPath();
    ctx.ellipse(-2, -1, len*0.25, b.width*0.25, 0, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${hue+15},70%,65%,${0.3*dim})`;
    ctx.fill();
    ctx.restore();
  }

  function drawFlagella(b, dim, hue) {
    const rear = -b.length / 2 + 1;
    const fLen = b.length * 1.1;
    const tumbling = b.tumbleT > 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = `hsla(${hue+20},70%,75%,${0.35*dim})`;
    for (let k = 0; k < b.flagCount; k++) {
      const yOff = b.flagCount === 2 ? (k ? 1 : -1) * b.width * 0.22 : 0;
      // During a tumble the bundle flies apart → flagella splay outward
      const splay = (tumbling ? 0.9 : 0.12) * (b.flagCount === 2 ? (k ? 1 : -1) : 1);
      ctx.beginPath();
      ctx.moveTo(rear, yOff);
      for (let s = 1; s <= 14; s++) {
        const t = s / 14;
        const x = rear - t * fLen;
        const amp = 1.6 + t * 1.8;
        const y = yOff + Math.sin(b.flagPhase + k * 1.7 - t * 9) * amp + splay * t * fLen * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawColonyHud() {
    const a = 1 - appState.cellZoom;
    if (a < 0.5) return;
    const alive = bacteria.filter(b => !b.dying);
    const rec = alive.filter(b => b.recombinant).length;
    const dividing = alive.filter(b => b.divP > 0).length;
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.font = '500 11px "IBM Plex Sans", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(190,175,240,0.8)';
    let line = `Cells ${alive.length}  ·  Dividing ${dividing}`;
    // Identity stays hidden until a screen reveals it — no spoilers in the counter
    if (appState.recombinantMode && appState.reveal) line += `  ·  Recombinant ${rec}`;
    if (appState.plate) line += '  ·  ' + plateName(appState.plate);
    ctx.fillText(line, CX, CY + dishRadius + 26);
    ctx.restore();
  }

  function drawRodShape(x, y, len, wid, fill, doFill) {
    const r = wid / 2;
    ctx.beginPath();
    ctx.moveTo(x - len/2 + r, y - wid/2);
    ctx.lineTo(x + len/2 - r, y - wid/2);
    ctx.arc(x + len/2 - r, y, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x - len/2 + r, y + wid/2);
    ctx.arc(x - len/2 + r, y, r, Math.PI/2, -Math.PI/2);
    ctx.closePath();
    if (doFill) { ctx.fillStyle = fill; ctx.fill(); }
    else { ctx.strokeStyle = fill; ctx.stroke(); }
  }
  function drawRodOutline(x, y, len, wid) {
    const r = wid / 2;
    ctx.beginPath();
    ctx.moveTo(x - len/2 + r, y - wid/2);
    ctx.lineTo(x + len/2 - r, y - wid/2);
    ctx.arc(x + len/2 - r, y, r, -Math.PI/2, Math.PI/2);
    ctx.lineTo(x - len/2 + r, y + wid/2);
    ctx.arc(x - len/2 + r, y, r, Math.PI/2, -Math.PI/2);
    ctx.closePath();
    ctx.stroke();
  }

  /* ============================================================
     RENDER — MAGNIFIED CELL VIEW
     ============================================================ */
  function drawMagnifiedCell() {
    const t = appState.cellZoom;
    if (t < 0.01) return;
    ctx.save();
    ctx.globalAlpha = t;

    // Pitch black background with subtle vignette
    ctx.fillStyle = '#05050A';
    ctx.fillRect(0, 0, W, H);

    // Ambient particles (purple, minimal)
    for (const p of ambientParticles) {
      const pulse = 0.5 + Math.sin(p.phase) * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fillStyle = `rgba(160, 130, 220, ${p.opacity * pulse * 0.4})`;
      ctx.fill();
    }

    // Draw the selected bacterium at large scale
    if (appState.selectedIndex >= 0) {
      const b = bacteria[appState.selectedIndex];
      // Actually, let's draw in screen space centered
      const cx = cellView.x;
      const cy = cellView.y;
      const cLen = cellView.len;
      const cWid = cLen * 0.45;

      ctx.save();
      ctx.translate(cx, cy);
      // Always horizontal in the magnified view, regardless of the
      // bacterium's random orientation in the dish — b.angle itself is
      // untouched and still drives petri-dish movement/rendering.

      // ── Cell Membrane ──
      ctx.beginPath();
      const cr = cWid / 2;
      ctx.moveTo(-cLen/2 + cr, -cWid/2);
      ctx.lineTo(cLen/2 - cr, -cWid/2);
      ctx.arc(cLen/2 - cr, 0, cr, -Math.PI/2, Math.PI/2);
      ctx.lineTo(-cLen/2 + cr, cWid/2);
      ctx.arc(-cLen/2 + cr, 0, cr, Math.PI/2, -Math.PI/2);
      ctx.closePath();

      // Membrane glow
      ctx.shadowColor = 'rgba(160, 120, 255, 0.5)';
      ctx.shadowBlur = 40;
      ctx.strokeStyle = 'rgba(180, 140, 255, 0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner membrane
      ctx.beginPath();
      ctx.moveTo(-cLen/2 + cr + 4, -cWid/2 + 4);
      ctx.lineTo(cLen/2 - cr - 4, -cWid/2 + 4);
      ctx.arc(cLen/2 - cr - 4, 0, cr - 4, -Math.PI/2, Math.PI/2);
      ctx.lineTo(-cLen/2 + cr + 4, cWid/2 - 4);
      ctx.arc(-cLen/2 + cr + 4, 0, cr - 4, Math.PI/2, -Math.PI/2);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(140, 110, 220, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── Cytoplasm (dark translucent) ──
      ctx.beginPath();
      ctx.moveTo(-cLen/2 + cr + 6, -cWid/2 + 6);
      ctx.lineTo(cLen/2 - cr - 6, -cWid/2 + 6);
      ctx.arc(cLen/2 - cr - 6, 0, cr - 6, -Math.PI/2, Math.PI/2);
      ctx.lineTo(-cLen/2 + cr + 6, cWid/2 - 6);
      ctx.arc(-cLen/2 + cr + 6, 0, cr - 6, Math.PI/2, -Math.PI/2);
      ctx.closePath();
      const cytoGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, cLen * 0.5);
      cytoGrad.addColorStop(0, 'rgba(25, 20, 50, 0.35)');
      cytoGrad.addColorStop(1, 'rgba(15, 12, 30, 0.55)');
      ctx.fillStyle = cytoGrad;
      ctx.fill();

      // Soft directional highlight — simulated light source, glass-like
      // volumetric feel rather than a flat fill.
      ctx.save();
      ctx.moveTo(-cLen/2 + cr + 6, -cWid/2 + 6);
      ctx.lineTo(cLen/2 - cr - 6, -cWid/2 + 6);
      ctx.arc(cLen/2 - cr - 6, 0, cr - 6, -Math.PI/2, Math.PI/2);
      ctx.lineTo(-cLen/2 + cr + 6, cWid/2 - 6);
      ctx.arc(-cLen/2 + cr + 6, 0, cr - 6, Math.PI/2, -Math.PI/2);
      ctx.closePath();
      ctx.clip();
      const lightGrad = ctx.createRadialGradient(
        -cLen * 0.18, -cWid * 0.24, 4,
        -cLen * 0.18, -cWid * 0.24, cLen * 0.45
      );
      lightGrad.addColorStop(0, 'rgba(205, 195, 255, 0.10)');
      lightGrad.addColorStop(1, 'rgba(205, 195, 255, 0)');
      ctx.fillStyle = lightGrad;
      ctx.fillRect(-cLen/2, -cWid/2, cLen, cWid);
      // Faint stable-seeded molecular texture — not organelles, just
      // enough graininess to break up the flat gradient.
      for (const spot of b.cytoTexture) {
        ctx.beginPath();
        ctx.arc(spot.x * cLen, spot.y * cWid, spot.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(170, 150, 220, ${spot.o})`;
        ctx.fill();
      }
      ctx.restore();

      // ── Nucleoid (chromosomal DNA) ──
      // Textbook "rosette" model: the circular chromosome is compacted
      // into a dense core from which ~14 independent supercoiled loop
      // domains radiate. Each loop is a plectoneme — two DNA duplex arms
      // twisted around each other, closing in a small end-loop — with a
      // few nucleoid-associated proteins (HU, H-NS) bound along it. No
      // membrane: only a soft diffuse boundary. Loops sway/twist slowly.
      ctx.save();
      ctx.translate(-cLen * 0.28, 0);
      const baseRX = cLen * 0.19;
      const baseRY = cWid * 0.33;
      const ry = baseRY / baseRX;
      const tNow = performance.now() / 1000;
      if (!b.nucleoidLoops) {
        const n = 11;
        b.nucleoidLoops = Array.from({ length: n }, (_, k) => ({
          ang: (k / n) * Math.PI * 2 + rand(-0.22, 0.22),
          len: rand(0.62, 1.04),
          bend: rand(-0.6, 0.6),
          w: rand(0.7, 1.1),
          ph: Math.random() * Math.PI * 2,
          sw: rand(0.35, 0.75),
          prot: [rand(0.25, 0.75)],
        }));
      }
      // Diffuse region (no membrane)
      const halo = ctx.createRadialGradient(0, 0, baseRX * 0.1, 0, 0, baseRX * 1.25);
      halo.addColorStop(0, 'rgba(150, 110, 235, 0.30)');
      halo.addColorStop(0.45, 'rgba(110, 80, 190, 0.12)');
      halo.addColorStop(1, 'rgba(90, 60, 160, 0)');
      ctx.save(); ctx.scale(1, ry);
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, baseRX * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const pt = (x, y) => [x, y * ry];
      const protPts = [];
      {   // own scope: helper names here must not clash with the plasmid code below
      // ── One continuous circular chromosome ──
      // Build a single closed centreline: out along loop k, back to the
      // core, along the core to loop k+1, … — no free ends anywhere.
      const loops = [...b.nucleoidLoops].sort((p, q) => p.ang - q.ang);
      const r0 = baseRX * 0.15;
      const C = [];
      const cub = (p0, p1, p2, p3, u) => { const v = 1 - u; return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3; };
      loops.forEach((L, k) => {
        const sway = Math.sin(tNow * L.sw + L.ph) * 0.12;
        const th = L.ang + sway, spread = 0.2 + 0.08 * L.w, r1 = baseRX * L.len, wob = 0.3 + L.bend * 0.25;
        const [ax, ay] = pt(Math.cos(L.ang - spread) * r0, Math.sin(L.ang - spread) * r0);
        const [bx, by] = pt(Math.cos(L.ang + spread) * r0, Math.sin(L.ang + spread) * r0);
        const [tx, ty] = pt(Math.cos(th) * r1, Math.sin(th) * r1);
        const [c1x, c1y] = pt(Math.cos(th - wob) * r1, Math.sin(th - wob) * r1);
        const [c2x, c2y] = pt(Math.cos(th + wob) * r1, Math.sin(th + wob) * r1);
        for (let i = 0; i < 36; i++) { const u = i / 36; C.push([cub(ax, c1x, c1x, tx, u), cub(ay, c1y, c1y, ty, u)]); }
        for (let i = 0; i < 36; i++) { const u = i / 36; C.push([cub(tx, c2x, c2x, bx, u), cub(ty, c2y, c2y, by, u)]); }
        // short hop along the core to the next loop's start
        const next = loops[(k + 1) % loops.length], a0 = L.ang + spread;
        let a1 = next.ang - (0.2 + 0.08 * next.w); if (a1 < a0) a1 += Math.PI * 2;
        for (let i = 0; i < 6; i++) { const aa = a0 + (a1 - a0) * i / 6; C.push(pt(Math.cos(aa) * r0, Math.sin(aa) * r0)); }
      });
      // resample by arc length (≈1 px steps) so the helix is even
      const cum = [0]; for (let i = 1; i <= C.length; i++) { const p0 = C[i - 1], p1 = C[i % C.length]; cum.push(cum[i - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); }
      const total = cum[cum.length - 1];
      const at = d => { d = ((d % total) + total) % total; let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; } const p0 = C[lo], p1 = C[(lo + 1) % C.length], f = (d - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1); return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]; };
      const step = 1.1, Nn = Math.ceil(total / step);
      const S = []; for (let i = 0; i < Nn; i++) S.push(at(i * step));
      // ── Continuous double helix along it ──
      const ropeH = Math.max(5, baseRY * 0.26);
      const amp = ropeH * 0.5, lambda = ropeH * 2.4;           // one turn ≈ 2.4 × width
      const phase = tNow * 1.4;                                 // slow twisting
      const s1 = [], s2 = [];
      for (let i = 0; i < Nn; i++) {
        const pA = S[(i - 1 + Nn) % Nn], pB = S[(i + 1) % Nn];
        let nx = -(pB[1] - pA[1]), ny = pB[0] - pA[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const th = (i * step / lambda) * Math.PI * 2 + phase, o = Math.sin(th) * amp, z = Math.cos(th);
        s1.push([S[i][0] + nx * o, S[i][1] + ny * o, z]); s2.push([S[i][0] - nx * o, S[i][1] - ny * o, -z]);
      }
      // base-pair rungs (10 per turn), coloured A/T/G/C like the 3D helix
      const RUNG = ['#ff4a4a', '#f4dc3c', '#5fd84a', '#a066ff'];
      const every = Math.max(2, Math.round(lambda / 10 / step));
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.8, ropeH * 0.12);
      for (let i = 0; i < Nn; i += every) {
        const h = (i * 2654435761 + (b.hue | 0) * 97) >>> 0;   // stable pseudo-sequence
        ctx.strokeStyle = RUNG[h % 4]; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(s1[i][0], s1[i][1]); ctx.lineTo(s2[i][0], s2[i][1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // backbones: back halves first (dim), then front halves (bright) — strands cross correctly
      const bbW = Math.max(1.1, ropeH * 0.24);
      const drawPass = front => {
        for (const st of [s1, s2]) {
          ctx.beginPath(); let pen = false;
          for (let i = 0; i <= Nn; i++) {
            const q = st[i % Nn], isFront = q[2] > 0;
            if (isFront === front) { if (!pen) { ctx.moveTo(q[0], q[1]); pen = true; } else ctx.lineTo(q[0], q[1]); }
            else if (pen) { ctx.lineTo(q[0], q[1]); pen = false; }
          }
          ctx.stroke();
        }
      };
      ctx.lineWidth = bbW;
      ctx.strokeStyle = 'rgba(52, 104, 196, 0.85)'; drawPass(false);
      ctx.shadowColor = 'rgba(110, 170, 255, 0.6)'; ctx.shadowBlur = 3;
      ctx.strokeStyle = '#6fa8ff'; drawPass(true);
      ctx.shadowBlur = 0;
      ctx.lineWidth = bbW * 0.35; ctx.strokeStyle = 'rgba(210, 230, 255, 0.55)'; drawPass(true);   // highlight
      // proteins bound along the DNA
      loops.forEach((L, k) => { const d = (k + L.prot[0]) / loops.length * total; protPts.push([...at(d), 1]); });
      }
      // Dense core where the loops are anchored
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRX * 0.32);
      core.addColorStop(0, 'rgba(225, 205, 255, 0.55)');
      core.addColorStop(0.5, 'rgba(160, 120, 240, 0.32)');
      core.addColorStop(1, 'rgba(120, 85, 210, 0)');
      ctx.save(); ctx.scale(1, ry);
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, baseRX * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Nucleoid-associated proteins (HU / H-NS) bound to the loops
      for (const [px, py, dpt] of protPts) {
        ctx.beginPath(); ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 196, 120, ${0.6 * dpt})`; ctx.fill();
      }
      const blobPts = [{ x: 0, y: -baseRY * 1.02 }];   // top extent, used by the label below

      // Label — position is now a FIXED worst-case bound, not computed
      // per-bacterium. nucleoidSeed is hard-generated in [0.72, 1.28]
      // (see initBacteria), so baseRY * 1.28 * 1.1 (halo scale) is the
      // mathematically proven ceiling for ANY bacterium's shape — not
      // an estimate of this one. The label sits past that ceiling with
      // a further fixed margin, so it is structurally impossible for
      // any bacterium's random seeds to produce an overlap; this no
      // longer depends on which bacterium is selected at all. The tick
      // line still reaches for this bacterium's actual rendered top
      // (haloTopY) so it visually connects rather than floating with
      // an oversized, inconsistent gap.
      const blobTopY = Math.min(...blobPts.map(p => p.y));
      const haloTopY = blobTopY * 1.05;
      const worstCaseTopY = -baseRY * 1.2;   // loops reach ≤ 1.02 × baseRY plus their end-loop
      const labelY = worstCaseTopY - 24;

      ctx.strokeStyle = 'rgba(150, 130, 200, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, labelY + 8);
      ctx.lineTo(0, haloTopY - 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160, 145, 215, 0.55)';
      ctx.font = '600 9px "IBM Plex Sans", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NUCLEOID', 0, labelY);
      ctx.restore();

      // ── Plasmid ──
      const plasmidX = cLen * 0.22;
      const plasmidY = 0;
      const plasmidR = PLASMID_BASE_RADIUS;
      const pulse = 1 + Math.sin(b.plasmidPhase) * 0.06;
      const pr = plasmidR * pulse;

      ctx.save();
      ctx.translate(plasmidX, plasmidY);

      // Plasmid glow
      ctx.shadowColor = 'rgba(100, 220, 240, 0.5)';
      ctx.shadowBlur = 30;

      // Double-stranded circular DNA
      const amp = 3.5;
      const freq = 10;

      // Strand 1
      ctx.beginPath();
      for (let a = 0; a <= Math.PI*2 + 0.05; a += 0.04) {
        const twist = Math.sin(a * freq) * amp;
        const rr = pr + twist;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(120, 220, 240, 0.75)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Strand 2
      ctx.beginPath();
      for (let a = 0; a <= Math.PI*2 + 0.05; a += 0.04) {
        const twist = Math.sin(a * freq + Math.PI) * amp;
        const rr = pr - 3.5 + twist;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(160, 140, 255, 0.6)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Base-pair rungs
      ctx.shadowBlur = 0;
      for (let a = 0; a < Math.PI*2; a += 0.3) {
        const t1 = Math.sin(a * freq) * amp;
        const t2 = Math.sin(a * freq + Math.PI) * amp;
        const x1 = Math.cos(a) * (pr + t1);
        const y1 = Math.sin(a) * (pr + t1);
        const x2 = Math.cos(a) * (pr - 3.5 + t2);
        const y2 = Math.sin(a) * (pr - 3.5 + t2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(180, 200, 255, 0.3)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Inner glow
      ctx.beginPath();
      ctx.arc(0, 0, pr * 0.45, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(100, 200, 255, 0.06)';
      ctx.fill();

      // Gene of Interest highlight — redraws the SAME two strand paths
      // (identical twist formulas to strand1/strand2 above) within the
      // gene's angular range, in red, so the highlight is genuinely
      // part of the double helix geometry rather than a separate
      // overlay shape. Shown on BOTH strands, since the inserted gene
      // is double-stranded DNA like the rest of the plasmid. No
      // sequence data touched — purely a visual marker.
      if (appState.recombinantMode && isRecombinantCell(appState.selectedIndex) && identityKnown()) {
        const geneStart = -0.35, geneEnd = 0.35;
        ctx.beginPath();
        for (let a = geneStart; a <= geneEnd; a += 0.02) {
          const twist = Math.sin(a * freq) * amp;
          const rr = pr + twist;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (a === geneStart) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 70, 70, 0.95)';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        for (let a = geneStart; a <= geneEnd; a += 0.02) {
          const twist = Math.sin(a * freq + Math.PI) * amp;
          const rr = pr - 3.5 + twist;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (a === geneStart) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 70, 70, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Clickable halo (when in CELL_SELECTED) — radius matches
      // isPlasmidHit()'s actual tap margin, not an independent guess.
      if (appState.mode === 'CELL_SELECTED') {
        ctx.beginPath();
        ctx.arc(0, 0, PLASMID_BASE_RADIUS + PLASMID_TAP_MARGIN, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(100, 220, 240, ${0.2 + Math.sin(Date.now() * 0.004) * 0.1})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // Plasmid label — outside the cell membrane, not underneath the
      // plasmid inside it. A short tick crosses the boundary so it
      // still reads as attached to the plasmid, not a floating caption.
      const plasmidLabelY = cWid / 2 + 18;
      ctx.strokeStyle = 'rgba(100, 220, 240, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plasmidX, plasmidY + pr + 4);
      ctx.lineTo(plasmidX, plasmidLabelY - 8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120, 220, 240, 0.7)';
      ctx.font = '600 10px "IBM Plex Sans", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '2px';
      ctx.fillText('PLASMID', plasmidX, plasmidLabelY);

      ctx.restore();
    }

    ctx.restore();
  }

  /* ============================================================
     MAIN LOOP
     ============================================================ */
  function animate() {
    ctx.clearRect(0, 0, W, H);

    updateCellFrame();
    updateDishLayout();
    updateBacteria();
    updateTransformation();
    syncDishUi();
    updateAmbientParticles();
    updateCamera();
    updateTransitions();
    updateHover();

    // Background transition
    const dishAlpha = 1 - appState.cellZoom;
    if (dishAlpha > 0) {
      drawPetriDish();
      drawHeatAndAmp();
      drawIdleBacteria();
      drawFreePlasmids();
      drawColonyHud();
    }

    if (appState.cellZoom > 0) {
      drawMagnifiedCell();
    }

    // Hover ring in idle mode
    if (appState.hoverIndex >= 0 && dishAlpha > 0.5) {
      const b = bacteria[appState.hoverIndex];
      const sp = worldToScreen(b.x, b.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, (b.length * 0.7) * camera.scale, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(180, 140, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  /* ============================================================
     STARTUP
     ============================================================ */
  resize();
  initBacteria();
  initAmbientParticles();
  animate();

  window.addEventListener('resize', resize);
})();
