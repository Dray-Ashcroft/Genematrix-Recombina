const hero = document.getElementById('hero');
let dismissed = false;
function dismiss() {
  if (dismissed) return;
  dismissed = true;
  hero.classList.add('gone');
  setTimeout(() => hero.remove(), 1000);
}
// Safety net: never trap the user behind a spinner
const bail = setTimeout(() => { if (!hero.classList.contains('ready')) dismiss(); }, 12000);

try {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  hero.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  // Theme-coloured rim lights so the dish sits in the app's purple/cyan palette
  const rimA = new THREE.PointLight(0x9a6bff, 6, 0, 0); rimA.position.set(-300, 120, -200); scene.add(rimA);
  const rimB = new THREE.PointLight(0x5fe0f5, 3, 0, 0); rimB.position.set(300, 80, 220); scene.add(rimB);

  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 1, 6000);
  const pivot = new THREE.Group(); scene.add(pivot);

  const gltf = await new Promise((res, rej) => {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    // Agar plate model (meshopt-compressed GLB) lives in assets/
    l.load('assets/petri-dish.glb', res, undefined, rej);
  });
  const model = gltf.scene;
  // Clean look: smooth straw-coloured LB agar + glossy cream colonies
  // (the source model's wobbly red blood-agar mesh is stripped out)
  model.traverse(o => {
    if (o.isMesh && !/Glass|Cylinder/.test(o.name)) {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0xcfc2a2, roughness: 0.62, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 0.55 });
    }
  });
  const agar = new THREE.Mesh(
    new THREE.CylinderGeometry(166, 168, 12, 160, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xb98a36, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.6 }));
  agar.position.set(10.5, -5.5, 6.5);   // fills the dish; top surface just under the colonies
  model.add(agar);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);            // centre the dish on the pivot
  pivot.add(model);
  const R = Math.max(size.x, size.z) / 2;

  // Hero framing: 3/4 view; distance chosen so the dish fills ~78% of the narrow side
  const fitDist = frac => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return R / Math.tan(Math.min(vFov, hFov) / 2) / frac;
  };
  const heroPos = () => { const d = fitDist(innerHeight < 560 ? 0.72 : 0.95); return new THREE.Vector3(0, d * 0.62, d * 0.78); };
  // Top-down end pose: dish radius on screen ≈ 2D dish radius (220px)
  const topPos = () => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const d = R / Math.tan(vFov / 2) * (innerHeight / 2) / (window.__dishRadius || 220);
    return new THREE.Vector3(0, d, 0.001);
  };
  // On short (landscape) screens, lift the plate so the caption + button sit below it
  const liftView = () => {
    const lift = innerHeight < 560 ? Math.round(innerHeight * 0.12) : 0;
    if (lift) camera.setViewOffset(innerWidth, innerHeight, 0, lift, innerWidth, innerHeight); else camera.clearViewOffset();
  };
  liftView();
  camera.position.copy(heroPos()); camera.lookAt(0, 0, 0);

  // Drag to spin; tap (little movement) to enter
  let spinVel = 0.0025, dragging = false, lastX = 0, downX = 0, downY = 0, flying = false;
  hero.addEventListener('pointerdown', e => { dragging = true; lastX = downX = e.clientX; downY = e.clientY; hero.setPointerCapture(e.pointerId); });
  hero.addEventListener('pointermove', e => {
    if (!dragging || flying) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    pivot.rotation.y += dx * 0.008; spinVel = dx * 0.0008;
  });
  hero.addEventListener('pointerup', e => {
    dragging = false;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 8) enter();
  });

  let flyT = 0, flyStart = 0, from = null, fromRot = 0;
  function enter() {
    if (flying || !hero.classList.contains('ready')) return;
    flying = true; hero.classList.add('flying');
    from = camera.position.clone(); fromRot = pivot.rotation.y % (Math.PI * 2);
    flyStart = performance.now();
  }
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    liftView();
    if (!flying) camera.position.copy(heroPos());
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (dismissed && hero.classList.contains('gone') && flyT >= 1) { renderer.setAnimationLoop(null); renderer.dispose(); return; }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (!flying) {
      if (!dragging) { spinVel += (0.0025 - spinVel) * 0.02; pivot.rotation.y += spinVel; }
      pivot.position.y = Math.sin(t * 0.9) * R * 0.015;          // gentle float
      pivot.rotation.x = Math.sin(t * 0.6) * 0.03;
    } else {
      flyT = Math.min(1, (performance.now() - flyStart) / 1600);
      const k = ease(flyT);
      camera.position.lerpVectors(from, topPos(), k);
      pivot.rotation.y = fromRot * (1 - k);
      pivot.position.y *= 0.9; pivot.rotation.x *= 0.9;
      if (flyT > 0.82) dismiss();                                 // crossfade into the 2D dish
    }
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  });

  clearTimeout(bail);
  hero.classList.add('ready');
} catch (err) {
  console.warn('3D intro skipped:', err);
  dismiss();
}
