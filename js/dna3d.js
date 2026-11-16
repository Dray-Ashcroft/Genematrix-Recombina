let THREE;
try { THREE = await import('three'); } catch (e) { console.warn('3D helix unavailable:', e); }
if (THREE) {
  const BASE_COL = { A: 0xff4a4a, T: 0xf4dc3c, G: 0x5fd84a, C: 0xa066ff };
  const BB_COL = { pl: 0x3d8bff, pr: 0x3d8bff, gene: 0xff7a7a };
  const RISE = 1.0, R = 2.0, TWIST = 37 * Math.PI / 180, GROOVE = 130 * Math.PI / 180;
  // ---- Atomic (ball-and-stick) templates ----
  // Sugar-phosphate backbone from the 1BNA crystal structure (Drew & Dickerson,
  // B-DNA dodecamer CGCGAATTCGCG), bases in the standard reference frame
  // (Olson et al. 2001). Stacked at 37° twist / 3.38 Å rise, consecutive
  // nucleotides join with a 1.60 Å O3'–P phosphodiester bond. Strand II is the
  // dyad (180° about x) copy → antiparallel. Right-handed B-DNA.
  const ATOMIC = {"tpl":{"A":[["P","P",0.42,9.62,-1.46],["OP1","O",-0.09,11.01,-1.45],["OP2","O",1.69,9.41,-0.75],["O5'","O",-0.7,8.67,-0.84],["C5'","C",-2.04,8.72,-1.35],["C4'","C",-2.75,7.58,-0.69],["O4'","O",-2.08,6.37,-1.01],["C3'","C",-2.77,7.63,0.81],["O3'","O",-4.01,8.17,1.27],["C2'","C",-2.55,6.19,1.25],["C1'","C",-2.46,5.41,-0.04],["N9","N",-1.29,4.5,0],["C8","C",0.02,4.9,0],["N7","N",0.88,3.9,0],["C5","C",0.07,2.77,0],["C6","C",0.37,1.4,0],["N6","N",1.61,0.91,0],["N1","N",-0.67,0.53,0],["C2","C",-1.91,1.02,0],["N3","N",-2.32,2.29,0],["C4","C",-1.27,3.12,0]],"T":[["P","P",0.42,9.62,-1.46],["OP1","O",-0.09,11.01,-1.45],["OP2","O",1.69,9.41,-0.75],["O5'","O",-0.7,8.67,-0.84],["C5'","C",-2.04,8.72,-1.35],["C4'","C",-2.75,7.58,-0.69],["O4'","O",-2.08,6.37,-1.01],["C3'","C",-2.77,7.63,0.81],["O3'","O",-4.01,8.17,1.27],["C2'","C",-2.55,6.19,1.25],["C1'","C",-2.46,5.41,-0.04],["N1","N",-1.28,4.5,0],["C2","C",-1.46,3.13,0],["O2","O",-2.56,2.61,0],["N3","N",-0.3,2.41,0],["C4","C",0.99,2.9,0],["O4","O",1.94,2.12,0],["C5","C",1.11,4.34,0],["C7","C",2.47,4.96,0.0],["C6","C",-0.02,5.06,0]],"G":[["P","P",0.42,9.62,-1.46],["OP1","O",-0.09,11.01,-1.45],["OP2","O",1.69,9.41,-0.75],["O5'","O",-0.7,8.67,-0.84],["C5'","C",-2.04,8.72,-1.35],["C4'","C",-2.75,7.58,-0.69],["O4'","O",-2.08,6.37,-1.01],["C3'","C",-2.77,7.63,0.81],["O3'","O",-4.01,8.17,1.27],["C2'","C",-2.55,6.19,1.25],["C1'","C",-2.46,5.41,-0.04],["N9","N",-1.29,4.55,0],["C8","C",0.02,4.96,0],["N7","N",0.87,3.97,0],["C5","C",0.07,2.83,0],["C6","C",0.42,1.46,0],["O6","O",1.55,0.95,0],["N1","N",-0.7,0.64,0],["C2","C",-2.0,1.09,0],["N2","N",-2.95,0.14,-0.0],["N3","N",-2.34,2.36,0.0],["C4","C",-1.26,3.18,0]],"C":[["P","P",0.42,9.62,-1.46],["OP1","O",-0.09,11.01,-1.45],["OP2","O",1.69,9.41,-0.75],["O5'","O",-0.7,8.67,-0.84],["C5'","C",-2.04,8.72,-1.35],["C4'","C",-2.75,7.58,-0.69],["O4'","O",-2.08,6.37,-1.01],["C3'","C",-2.77,7.63,0.81],["O3'","O",-4.01,8.17,1.27],["C2'","C",-2.55,6.19,1.25],["C1'","C",-2.46,5.41,-0.04],["N1","N",-1.28,4.54,0],["C2","C",-1.47,3.16,0],["O2","O",-2.63,2.71,0.0],["N3","N",-0.39,2.34,0],["C4","C",0.84,2.87,0],["N4","N",1.88,2.03,0.0],["C5","C",1.06,4.28,0],["C6","C",-0.02,5.07,0]]},"bonds":{"A":[[0,1],[0,2],[0,3],[3,4],[4,5],[5,6],[5,7],[6,10],[7,8],[7,9],[9,10],[10,11],[11,12],[11,20],[12,13],[13,14],[14,15],[14,20],[15,16],[15,17],[17,18],[18,19],[19,20]],"T":[[0,1],[0,2],[0,3],[3,4],[4,5],[5,6],[5,7],[6,10],[7,8],[7,9],[9,10],[10,11],[11,12],[11,19],[12,13],[12,14],[14,15],[15,16],[15,17],[17,18],[17,19]],"G":[[0,1],[0,2],[0,3],[3,4],[4,5],[5,6],[5,7],[6,10],[7,8],[7,9],[9,10],[10,11],[11,12],[11,21],[12,13],[13,14],[14,15],[14,21],[15,16],[15,17],[17,18],[18,19],[18,20],[20,21]],"C":[[0,1],[0,2],[0,3],[3,4],[4,5],[5,6],[5,7],[6,10],[7,8],[7,9],[9,10],[10,11],[11,12],[11,18],[12,13],[12,14],[14,15],[15,16],[15,17],[17,18]]}};
  const ANG = RISE / 3.38;                       // Å → scene units (1 bp rise = 1 unit)
  const ATOM_OFF = -115 * Math.PI / 180;         // aligns strand-I C1' with the cartoon strand
  const EL_COL = { N: 0x4f7dff, O: 0xff4040, P: 0xffa024 };
  const C_COL = { pl: 0xa9bdd9, pr: 0xa9bdd9, gene: 0xe0a6a6 };   // carbon tinted by origin
  const HB_ATOMS = { A: [['N6', 'O4'], ['N1', 'N3']], T: [['O4', 'N6'], ['N3', 'N1']],
                     G: [['O6', 'N4'], ['N1', 'N3'], ['N2', 'O2']], C: [['N4', 'O6'], ['N3', 'N1'], ['O2', 'N2']] };
  const APART = 4.2;

  // Procedural bump texture → the knobbly "sugar-phosphate" look of the reference model
  const bumpTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * 128, y = Math.random() * 128, r = 2 + Math.random() * 5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  try { await Promise.race([document.fonts.load('700 44px "IBM Plex Sans"'), new Promise(r => setTimeout(r, 2500))]); } catch (_) {}
  const letterTex = {};
  for (const L of 'ATGC') {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '700 44px "IBM Plex Sans", Roboto, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(10,8,30,0.9)'; g.strokeText(L, 32, 35);
    g.fillStyle = '#ffffff'; g.fillText(L, 32, 35);
    letterTex[L] = new THREE.CanvasTexture(c);
  }
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();

  let renderer, scene, camera, host, root, built = null, running = false;
  const clock = new THREE.Clock();
  const cam = { fx: 0, tx: 0, dist: 30, tdist: 30 };
  let spin = 0, spinVel = 0.004, dragging = false, lastX = 0;

  function ensureRenderer() {
    if (renderer) return true;
    host = document.getElementById('dna3d-host');
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { console.warn('WebGL unavailable', e); return false; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.prepend(renderer.domElement);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x1a1030, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 10, 12); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9a6bff, 1.4); rim.position.set(-8, -4, -10); scene.add(rim);
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientY + e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (!dragging) return; const v = e.clientY + e.clientX; const d = v - lastX; lastX = v; spin += d * 0.012; spinVel = d * 0.0012; });
    el.addEventListener('pointerup', () => { dragging = false; });
    return true;
  }
  function resize() {
    const w = host.clientWidth || 320, h = host.clientHeight || 240;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  // Distance so that `span` world units across fit the view width
  const distFor = span => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return Math.max((span / 2) / Math.tan(hFov / 2), (R * 2 + 3) / 2 / Math.tan(vFov / 2));
  };

  const helixPt = (strand, sIdx, N) => {
    const th = sIdx * TWIST + (strand === 'bot' ? GROOVE : 0);
    return new THREE.Vector3((sIdx - (N - 1) / 2) * RISE, R * Math.cos(th), R * Math.sin(th));
  };
  const xOf = (sIdx, N) => (sIdx - (N - 1) / 2) * RISE;

  function cylinderBetween(a, b, radius, mat) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10, 1), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  }
  function tube(strand, s0, s1, N, radius, mat) {
    const pts = []; const steps = Math.max(4, Math.ceil((s1 - s0) * 10));
    for (let i = 0; i <= steps; i++) pts.push(helixPt(strand, s0 + (s1 - s0) * i / steps, N));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, steps, radius, 12, false);
    const m = new THREE.Mesh(geo, mat);
    // round caps
    for (const p of [pts[0], pts[pts.length - 1]]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), mat); cap.position.copy(p); m.add(cap);
    }
    return m;
  }
  const bbMat = (frag) => {
    const t = bumpTex.clone(); t.needsUpdate = true; t.repeat.set(8, 1);
    return new THREE.MeshPhysicalMaterial({ color: BB_COL[frag], roughness: 0.35, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, bumpMap: t, bumpScale: 2.2, transparent: true });
  };

  function clear() {
    if (root) { root.traverse(o => { o.geometry?.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); scene.remove(root); }
    root = null; built = null;
  }

  function build(m) {
    if (!ensureRenderer()) return;
    clear();
    const { top, bot, N, t1, t2, b1, b2 } = m;
    const fragOf = (c, st) => { const a = st === 'top' ? t1 : b1, b = st === 'top' ? t2 : b2; return c < a ? 'pl' : c < b ? 'gene' : 'pr'; };
    root = new THREE.Group(); scene.add(root);
    const spinner = new THREE.Group(); root.add(spinner);   // rotates about the helix axis
    const frags = { pl: new THREE.Group(), gene: new THREE.Group(), pr: new THREE.Group() };
    Object.values(frags).forEach(g => spinner.add(g));
    const mats = { pl: bbMat('pl'), gene: bbMat('gene'), pr: bbMat('pr') };
    const halfMat = {};
    for (const L of 'ATGC') halfMat[L] = new THREE.MeshPhysicalMaterial({ color: BASE_COL[L], roughness: 0.4, clearcoat: 0.4, bumpMap: bumpTex, bumpScale: 1.2, transparent: true });
    const ohMat = {}; // overhang halves glow cyan until paired
    for (const L of 'ATGC') ohMat[L] = new THREE.MeshPhysicalMaterial({ color: BASE_COL[L], roughness: 0.4, emissive: 0x30d8f0, emissiveIntensity: 0.9, transparent: true });
    const hbMat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.85 });

    const letters = [], hbonds = new Map(), ohHalves = [], halves = [];
    for (let c = 0; c < N; c++) {
      const pA = helixPt('top', c, N), pB = helixPt('bot', c, N);
      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(pB, pA).normalize();
      const gap = 0.16;
      const fT = fragOf(c, 'top'), fB = fragOf(c, 'bot'), oh = fT !== fB;
      const hA = cylinderBetween(pA, mid.clone().addScaledVector(dir, -gap), 0.26, oh ? ohMat[top[c]] : halfMat[top[c]]);
      const hB = cylinderBetween(pB, mid.clone().addScaledVector(dir, gap), 0.26, oh ? ohMat[bot[c]] : halfMat[bot[c]]);
      frags[fT].add(hA); frags[fB].add(hB); halves.push(hA, hB);
      if (oh) ohHalves.push(hA, hB);
      // H-bond link at the centre of the pair
      const hb = cylinderBetween(mid.clone().addScaledVector(dir, -gap), mid.clone().addScaledVector(dir, gap), 0.09, hbMat);
      if (oh) { hb.visible = false; hbonds.set(c, hb); spinner.add(hb); } else frags[fT].add(hb);
      // Letters, one per base, on the outer part of each half-rung
      for (const [st, p, L, f] of [['top', pA, top[c], fT], ['bot', pB, bot[c], fB]]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTex[L], depthTest: false, transparent: true }));
        sp.position.copy(p).lerp(mid, 0.5); sp.scale.setScalar(0.95); sp.renderOrder = 10;
        frags[f].add(sp); letters.push(sp);
      }
    }
    // Backbones: one tube per fragment per strand; fragment ends stop short → visible nicks
    const runs = st => { const out = []; let s = 0; for (let c = 1; c <= N; c++) { if (c === N || fragOf(c, st) !== fragOf(s, st)) { out.push([s, c - 1, fragOf(s, st)]); s = c; } } return out; };
    for (const st of ['top', 'bot']) for (const [a, b, f] of runs(st)) frags[f].add(tube(st, a - 0.5 + 0.2, b + 0.5 - 0.2, N, 0.34, mats[f]));


    // ---------- Atomic layer (hidden until zoomed in) ----------
    const atomPos = (strand, c, x, y, z) => {
      if (strand === 'bot') { y = -y; z = -z; }                     // dyad copy → antiparallel strand
      const a = c * TWIST + ATOM_OFF, ca = Math.cos(a), sa = Math.sin(a);
      return new THREE.Vector3(z * ANG + (c - (N - 1) / 2) * RISE, (x * ca - y * sa) * ANG, (x * sa + y * ca) * ANG);
    };
    const nt = {};   // `${strand}${c}` → { name: Vector3 }
    for (let c = 0; c < N; c++) for (const [st, base] of [['top', top[c]], ['bot', bot[c]]]) {
      const tpl = ATOMIC.tpl[base], P = {};
      tpl.forEach(([nm, el, x, y, z], i) => { P[nm] = atomPos(st, c, x, y, z); P['#' + i] = { el, nm }; });
      nt[st + c] = P;
    }
    const atomGroups = {};
    const sphereGeo = new THREE.SphereGeometry(1, 12, 8), cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
    const atomMats = [];
    const mkMat = col => { const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0 }); atomMats.push(m); return m; };
    const bondMat = mkMat(0xd8d4ec), dotMat = mkMat(0x9fefff);
    const cylMatrix = (a, b, r) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      return new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(r, len, r));
    };
    const sphMatrix = (p, r) => new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r));
    const RAD = { C: 0.36 * ANG, N: 0.36 * ANG, O: 0.36 * ANG, P: 0.5 * ANG }, BR = 0.13 * ANG;
    for (const f of ['pl', 'gene', 'pr']) {
      const byEl = { C: [], N: [], O: [], P: [] }, bonds = [];
      for (let c = 0; c < N; c++) for (const st of ['top', 'bot']) {
        if (fragOf(c, st) !== f) continue;
        const P = nt[st + c], base = st === 'top' ? top[c] : bot[c];
        ATOMIC.tpl[base].forEach(([nm, el]) => byEl[el].push(P[nm]));
        ATOMIC.bonds[base].forEach(([i, j]) => bonds.push([P[ATOMIC.tpl[base][i][0]], P[ATOMIC.tpl[base][j][0]]]));
        // phosphodiester link to the next nucleotide on the same strand (same fragment only)
        if (c + 1 < N && fragOf(c + 1, st) === f) {
          const Q = nt[st + (c + 1)];
          bonds.push(st === 'top' ? [P["O3'"], Q.P] : [P.P, Q["O3'"]]);
        }
      }
      const g = new THREE.Group();
      for (const el of ['C', 'N', 'O', 'P']) {
        if (!byEl[el].length) continue;
        const im = new THREE.InstancedMesh(sphereGeo, mkMat(el === 'C' ? C_COL[f] : EL_COL[el]), byEl[el].length);
        byEl[el].forEach((p, i) => im.setMatrixAt(i, sphMatrix(p, RAD[el])));
        g.add(im);
      }
      const ib = new THREE.InstancedMesh(cylGeo, bondMat, bonds.length);
      bonds.forEach(([a, b], i) => ib.setMatrixAt(i, cylMatrix(a, b, BR)));
      g.add(ib);
      // Watson–Crick H-bonds as dotted lines for pairs already inside this fragment
      const dots = [];
      for (let c = 0; c < N; c++) {
        if (fragOf(c, 'top') !== f || fragOf(c, 'bot') !== f) continue;
        for (const [a, b] of HB_ATOMS[top[c]]) {
          const A = nt['top' + c][a], B = nt['bot' + c][b];
          for (let k = 1; k <= 4; k++) dots.push(A.clone().lerp(B, k / 5));
        }
      }
      if (dots.length) {
        const id = new THREE.InstancedMesh(sphereGeo, dotMat, dots.length);
        dots.forEach((p, i) => id.setMatrixAt(i, sphMatrix(p, 0.07 * ANG * 1.4)));
        g.add(id);
      }
      g.visible = false; frags[f].add(g); atomGroups[f] = g;
    }
    // Overhang H-bonds (form during annealing) — per column, in the spinner
    const ohDots = new Map();
    for (const c of hbonds.keys()) {
      const pts = [];
      for (const [a, b] of HB_ATOMS[top[c]]) { const A = nt['top' + c][a], B = nt['bot' + c][b]; for (let k = 1; k <= 4; k++) pts.push(A.clone().lerp(B, k / 5)); }
      const id = new THREE.InstancedMesh(sphereGeo, dotMat, pts.length);
      pts.forEach((p, i) => id.setMatrixAt(i, sphMatrix(p, 0.07 * ANG * 1.4)));
      id.visible = false; spinner.add(id); ohDots.set(c, id);
    }
    // Nick bonds: the missing O3'–P phosphodiester bonds; ligase creates them
    const sealBonds = new Map(), nickAtomPos = new Map();
    for (const [st, k] of [['top', t1], ['bot', b1], ['top', t2], ['bot', b2]]) {
      const a = st === 'top' ? nt['top' + (k - 1)]["O3'"] : nt['bot' + (k - 1)].P;
      const b = st === 'top' ? nt['top' + k].P : nt['bot' + k]["O3'"];
      const mat = new THREE.MeshStandardMaterial({ color: 0x8cffc0, emissive: 0x2fd890, emissiveIntensity: 1.4, transparent: true, opacity: 0 });
      atomMats.push(mat);
      const mesh = new THREE.Mesh(cylGeo, mat); mesh.matrixAutoUpdate = false;
      mesh.userData = { a, b, grow: 0, on: false };
      mesh.visible = false; spinner.add(mesh); sealBonds.set(st + k, mesh);
      nickAtomPos.set(st + k, a.clone().lerp(b, 0.5));
    }
    const cartoonMats = [...Object.values(halfMat), ...Object.values(ohMat), hbMat, ...Object.values(mats)];
    // Nick markers (amber) at the exact staggered boundaries
    const nickMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb050, transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
    const nicks = new Map();
    for (const [st, k] of [['top', t1], ['bot', b1], ['top', t2], ['bot', b2]]) {
      const sp = new THREE.Sprite(nickMat.clone()); sp.position.copy(helixPt(st, k - 0.5, N));
      sp.scale.setScalar(1.3); sp.visible = false; sp.renderOrder = 12; spinner.add(sp);
      nicks.set(st + k, { sp, st, k, sealed: false, cartoonPos: sp.position.clone(), atomPos: nickAtomPos.get(st + k) });
    }
    // DNA ligase: a translucent green clamp ring around the helix
    const ligase = new THREE.Mesh(new THREE.TorusGeometry(R + 0.8, 0.42, 16, 48),
      new THREE.MeshPhysicalMaterial({ color: 0x5fe0a0, emissive: 0x1f8a5a, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.3, transmission: 0.2 }));
    ligase.rotation.set(0.25, Math.PI / 2 - 0.6, 0); ligase.visible = false; root.add(ligase);

    built = { m, frags, spinner, letters, hbonds, ohHalves, halfMat, nicks, ligase, mats, N,
      atom: { a: 0, aT: 0, groups: atomGroups, mats: atomMats, ohDots, sealBonds, cartoonMats, halves: [], manual: false },
      apart: 1, apartT: 1, lig: { x: 0, tx: 0, s: 1, ts: 1, o: 0, to: 0 }, flashes: [], done: false };
    built.atom.halves = halves;
    syncAtomChip();
    resize();
    overview();
    cam.fx = cam.tx; cam.dist = cam.tdist;   // open on the full wide shot, no zoom-in
    start();
  }

  function overview() { if (!built) return; cam.tx = 0; cam.tdist = distFor(built.apartT ? built.N * RISE + APART * 2 + 3 : built.N * RISE * 0.85 + 1); }
  function focus(x, span) { cam.tx = x; cam.tdist = distFor(span); }

  function flash(pos, color) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(pos); sp.renderOrder = 13; built.spinner.add(sp);
    built.flashes.push({ sp, t: 0 });
  }

  function pairHalves() { // overhang halves stop glowing once paired
    for (const h of built.ohHalves) {
      const L = Object.keys(BASE_COL).find(k => h.material.color.getHex() === BASE_COL[k]);
      if (L) h.material = built.halfMat[L];
    }
  }

  const api = {
    ready: true,
    build,
    clear() { clear(); },
    together() { if (!built) return; built.apartT = 0; overview(); },
    hbond(c) {
      if (!built) return; const hb = built.hbonds.get(c); if (!hb) return;
      hb.visible = true; flash(hb.position, 0x9fefff);
      const d = built.atom.ohDots.get(c); if (d) d.visible = true;
      focus(xOf(c, built.N), built.atom.aT > 0.5 ? 6 : 12);
    },
    // Zoom between the coloured-ladder overview and the ball-and-stick atomic view
    atomic(on, x, span) {
      if (!built) return;
      built.atom.aT = on ? 1 : 0; syncAtomChip();
      if (x != null) focus(x, span || (on ? 6 : 12));
    },
    focusCol(c, span) { if (built) focus(xOf(c, built.N), span); },
    state(st) {
      if (!built) return;
      if (st === 'annealed' || st === 'done') {
        built.apartT = 0; built.apart = Math.min(built.apart, 0.001);
        built.hbonds.forEach(h => { h.visible = true; }); pairHalves();
        built.atom.ohDots.forEach(d => { d.visible = true; });
        built.nicks.forEach(n => { n.sp.visible = !n.sealed; });
        if (st === 'annealed') overview();
      }
      if (st === 'done') {
        built.nicks.forEach(n => { n.sealed = true; n.sp.visible = false; });
        built.atom.sealBonds.forEach(b => { b.visible = true; b.userData.on = true; b.userData.grow = 1; });
        built.ligase.visible = false; built.lig.to = 0; built.done = true; overview();
      }
    },
    ligaseTo(ks) {
      if (!built) return;
      const x = ks.reduce((a, k) => a + xOf(k - 0.5, built.N), 0) / ks.length;
      built.lig.tx = x; if (!built.ligase.visible) { built.lig.x = x - 8; built.ligase.visible = true; }
      built.lig.to = 1; built.lig.ts = 1.15;
      focus(x, 11);
    },
    ligaseLock(on) { if (built) built.lig.ts = on ? 0.82 : 1.15; },
    seal(strand, k) {
      if (!built) return; const n = built.nicks.get(strand + k); if (!n || n.sealed) return;
      n.sealed = true; n.sp.visible = false;
      // bridge the gap in the backbone with the plasmid/gene colour of the left side
      const leftFrag = strand === 'top' ? (k === built.m.t1 ? 'pl' : 'gene') : (k === built.m.b1 ? 'pl' : 'gene');
      const bridge = tube(strand, k - 0.5 - 0.32, k - 0.5 + 0.32, built.N, 0.34,
        new THREE.MeshPhysicalMaterial({ color: 0x8cffc0, emissive: 0x2fd890, emissiveIntensity: 1.2, roughness: 0.3 }));
      bridge.userData.cool = { t: 0, to: BB_COL[leftFrag] };
      bridge.material.transparent = true; built.atom.cartoonMats.push(bridge.material);
      const sb = built.atom.sealBonds.get(strand + k);
      if (sb) { sb.visible = true; sb.userData.on = true; sb.userData.grow = 0; }
      built.spinner.add(bridge); built.bridges = (built.bridges || []).concat(bridge);
      flash(built.atom.a > 0.5 ? n.atomPos : n.cartoonPos, 0x8cffc0);
    },
    ligaseOff() { if (built) { built.lig.to = 0; overview(); } },
  };
  window.ArcDNA3D = api;
  // "Atoms" chip: lets students switch to the atomic view any time
  function syncAtomChip() {
    const chip = document.getElementById('dna3d-atoms'); if (!chip || !built) return;
    chip.classList.toggle('on', built.atom.aT > 0.5);
  }
  document.getElementById('dna3d-atoms')?.addEventListener('pointerdown', e => {
    e.stopPropagation(); e.preventDefault();
    if (!built) return;
    const on = built.atom.aT < 0.5;
    api.atomic(on, on ? cam.tx : null, 7);
    if (!on) overview();
  });
  // If the ligation stage was opened before three.js finished loading, catch up
  if (window.__arcLigModel && document.getElementById('ligx-host')?.childElementCount) {
    document.getElementById('dna3d-host').style.display = '';
    build(window.__arcLigModel);
  }

  function start() { if (running) return; running = true; clock.getDelta(); requestAnimationFrame(loop); }
  const tmp = new THREE.Vector3();
  function loop() {
    if (!built || !host.offsetParent) { running = false; return; }   // stop when hidden
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const b = built;
    if (host.clientWidth && Math.abs(renderer.domElement.width / renderer.getPixelRatio() - host.clientWidth) > 1) resize();
    // fragments drift together
    b.apart += (b.apartT - b.apart) * Math.min(1, dt * 1.1);
    b.frags.pl.position.x = -APART * b.apart; b.frags.pr.position.x = APART * b.apart;
    b.frags.gene.position.y = Math.sin(t * 1.3) * 0.25 * b.apart;
    // spin about the helix axis (drag to control)
    if (!dragging) { spinVel += (0.004 - spinVel) * 0.02; spin += spinVel; }
    b.spinner.rotation.x = spin;
    // overhang glow pulse
    for (const h of b.ohHalves) if (h.material.emissiveIntensity !== undefined && h.material.emissive && h.material.emissive.getHex()) h.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.35;
    // nick pulse
    b.nicks.forEach(n => { if (n.sp.visible) n.sp.scale.setScalar(1.1 + Math.sin(t * 5) * 0.35); });
    // ligase
    const L = b.lig;
    L.x += (L.tx - L.x) * Math.min(1, dt * 1.8); L.s += (L.ts - L.s) * Math.min(1, dt * 10); L.o += (L.to - L.o) * Math.min(1, dt * 4);
    b.ligase.position.x = L.x; b.ligase.scale.setScalar(L.s); b.ligase.material.opacity = 0.55 * L.o * (1 - 0.65 * b.atom.a);
    if (L.o < 0.02 && L.to === 0) b.ligase.visible = false;
    // seal bridges cool from bright green to the backbone colour
    (b.bridges || []).forEach(br => { const c = br.userData.cool; if (c.t < 1) { c.t = Math.min(1, c.t + dt * 0.8); br.material.emissiveIntensity = 1.2 * (1 - c.t); br.material.color.lerpColors(new THREE.Color(0x8cffc0), new THREE.Color(b.done ? 0x8cffc0 : c.to), c.t); } });
    // done: backbone gently glows
    if (b.done) for (const k of ['pl', 'gene', 'pr']) { b.mats[k].emissive.setHex(BB_COL[k]); b.mats[k].emissiveIntensity = 0.18 + Math.sin(t * 2) * 0.1; }
    // flashes
    b.flashes = b.flashes.filter(f => { f.t += dt * 2.2; f.sp.scale.setScalar(0.5 + f.t * 3); f.sp.material.opacity = Math.max(0, 1 - f.t); if (f.t >= 1) { b.spinner.remove(f.sp); return false; } return true; });
    // atomic ↔ cartoon cross-fade
    const A = b.atom;
    A.a += (A.aT - A.a) * Math.min(1, dt * 2.2);
    const atomOn = A.a > 0.01;
    for (const g of Object.values(A.groups)) g.visible = atomOn;
    for (const m of A.mats) if (m.userData.keep !== true) m.opacity = A.a;
    for (const m of A.cartoonMats) m.opacity = 1 - A.a * (m === b.mats.pl || m === b.mats.gene || m === b.mats.pr ? 0.8 : 1);
    for (const h of A.halves) h.visible = A.a < 0.98;
    b.nicks.forEach(n => { if (n.atomPos) n.sp.position.lerpVectors(n.cartoonPos, n.atomPos, A.a); n.sp.scale.multiplyScalar(1 - A.a * 0.55); });
    // phosphodiester bonds grow in when ligase seals a nick
    A.sealBonds.forEach(sb => {
      if (!sb.userData.on) return;
      sb.userData.grow = Math.min(1, sb.userData.grow + dt * 1.5);
      const { a, b: bb } = sb.userData, g = sb.userData.grow;
      const end = a.clone().lerp(bb, g), d = new THREE.Vector3().subVectors(end, a), len = Math.max(1e-4, d.length());
      sb.matrix.compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), new THREE.Vector3(0.16 * ANG, len, 0.16 * ANG));
      sb.material.opacity = Math.max(A.a, 0);
      sb.material.emissiveIntensity = 1.4 * (1 - g * 0.6);
    });
    // letters on the far side of the helix fade back
    for (const sp of b.letters) { sp.getWorldPosition(tmp); sp.material.opacity = (tmp.z > -0.3 ? 1 : 0.18) * (1 - A.a * 0.25); }
    // camera
    cam.fx += (cam.tx - cam.fx) * Math.min(1, dt * 1.4); cam.dist += (cam.tdist - cam.dist) * Math.min(1, dt * 1.4);
    camera.position.set(cam.fx, cam.dist * 0.12, cam.dist); camera.lookAt(cam.fx, 0, 0);
    renderer.render(scene, camera);
  }
  // restart the loop when the panel becomes visible again
  setInterval(() => { if (built && !running && host && host.offsetParent) start(); }, 500);
}
