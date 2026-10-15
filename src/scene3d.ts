// three.js renderer for the 3D bike. Parts come from model3d.ts in millimetres
// (BB at origin, x forward, y up, +z drive side); the bike group is scaled ×0.001.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Mat, Part, V3 } from './model3d';

type Of<K extends Part['kind']> = Extract<Part, { kind: K }>;
type Mats = ReturnType<typeof makeMats>;
type Ctx = { geos: Geos; mats: Mats; owned: THREE.Material[]; textures: THREE.Texture[] };

const Y = new THREE.Vector3(0, 1, 0);
const vec = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const TAU = Math.PI * 2;

// ---------- materials (live for the whole mount; colours follow the CSS theme) ----------

function makeMats() {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  return {
    frame: new THREE.MeshPhysicalMaterial({ metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    metal: std({ metalness: 0.85, roughness: 0.28 }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x26292f, metalness: 0.05, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    rubber: std({ color: 0x1e2024, metalness: 0, roughness: 0.88 }),
    rim: std({ color: 0x2b2e34, metalness: 0.7, roughness: 0.35 }),
    spoke: std({ color: 0x3c4048, metalness: 0.85, roughness: 0.3 }),
    steel: std({ color: 0xa4a9b2, metalness: 0.95, roughness: 0.22 }),
    floor: new THREE.ShadowMaterial({ opacity: 0.2 }),
  };
}

const partMat = (mats: Mats, m: Mat) => mats[m];

function cssColor(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ---------- geometry helpers ----------

/** Geometry cache for one update: repeated shapes share one geometry; all are disposed together. */
class Geos {
  private map = new Map<string, THREE.BufferGeometry>();
  private n = 0;
  get<T extends THREE.BufferGeometry>(key: string | null, make: () => T): T {
    const k = key ?? `#${this.n++}`;
    let g = this.map.get(k);
    if (!g) this.map.set(k, (g = make()));
    return g as T;
  }
  dispose() {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[]) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((x, i) => m.setMatrixAt(i, x));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Matrix that stretches a y-aligned unit-height object from a to b (radius scale r). */
function spanMatrix(a: THREE.Vector3, b: THREE.Vector3, r = 1) {
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, d.length(), r));
}

/** TubeGeometry whose radius follows radius(u), u ∈ [0,1] by arc length. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, radius: (u: number) => number, segs = 96, radial = 20) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i <= segs; i++) {
    const k = radius(i / segs) - 1;
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
      pos.setXYZ(n, pos.getX(n) + nor.getX(n) * k, pos.getY(n) + nor.getY(n) * k, pos.getZ(n) + nor.getZ(n) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Cylinder on the z axis spanning z0..z1. */
function zCyl(c: Ctx, mat: THREE.Material, r: number, z0: number, z1: number, segs = 48) {
  const h = Math.abs(z1 - z0);
  const m = mesh(c.geos.get(`zcyl${r}|${h}|${segs}`, () => new THREE.CylinderGeometry(r, r, h, segs).rotateX(Math.PI / 2)), mat);
  m.position.z = (z0 + z1) / 2;
  return m;
}

const sphere = (c: Ctx) => c.geos.get('sphere', () => new THREE.SphereGeometry(1, 32, 16));

// ---------- part builders ----------

function buildTube(p: Of<'tube'>, c: Ctx) {
  const g = new THREE.Group();
  const mat = partMat(c.mats, p.mat);
  const pts = p.path.map(vec);
  if (pts.length === 2) {
    const [a, b] = pts as [THREE.Vector3, THREE.Vector3];
    const len = a.distanceTo(b);
    const m = mesh(c.geos.get(`cyl${p.r[0]}|${p.r[1]}|${len.toFixed(2)}`, () => new THREE.CylinderGeometry(p.r[1], p.r[0], len, 40)), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    g.add(m);
  } else {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    g.add(mesh(c.geos.get(null, () => taperedTube(curve, (u) => p.r[0] + (p.r[1] - p.r[0]) * u, 96, 24)), mat));
  }
  // Rounded joints: a sphere of the local radius on each end of frame tubes.
  if (p.mat === 'frame' && p.id !== 'bbShell') {
    [0, pts.length - 1].forEach((i, k) => {
      const s = mesh(sphere(c), mat);
      s.position.copy(pts[i]!);
      s.scale.setScalar(p.r[k]!);
      g.add(s);
    });
  }
  return g;
}

function buildWheel(p: Of<'wheel'>, c: Ctx) {
  const g = new THREE.Group();
  g.position.copy(vec(p.center));
  const R = p.rim / 2;
  const { geos, mats } = c;

  // Rim: deep V section 25 × 20 mm, lathed around y then turned so the axle is z.
  const rimGeo = geos.get(`rim${R}`, () => {
    const prof: [number, number][] = [
      [-25, 0], [-24, 3.5], [-18, 7.5], [-8, 10], [0, 10], [1.2, 9.4], [1.2, 8], [-1, 7.2], [-1.5, 3],
      [-3, 0], [-1.5, -3], [-1, -7.2], [1.2, -8], [1.2, -9.4], [0, -10], [-8, -10], [-18, -7.5], [-24, -3.5], [-25, 0],
    ];
    return new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(R + r, z)), 160).rotateX(Math.PI / 2);
  });
  g.add(mesh(rimGeo, mats.rim));

  // Tyre and tread.
  const tr = p.tire / 2;
  g.add(mesh(geos.get(`tyre${R}|${tr}`, () => new THREE.TorusGeometry(R + tr, tr, 24, 160)), mats.rubber));
  const knobs = 180;
  const knobGeo = geos.get(`knob${p.tire}`, () => new RoundedBoxGeometry(5, 1.6, p.tire * 0.26, 1, 0.5));
  const knobMs: THREE.Matrix4[] = [];
  for (let i = 0; i < knobs; i++) {
    const a = (i / knobs) * TAU;
    for (const side of [-1, 1]) {
      const z = side * tr * 0.32;
      const rr = R + tr + Math.sqrt(tr * tr - z * z) - 0.3;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side * 0.5, a - Math.PI / 2, 'ZYX'));
      knobMs.push(new THREE.Matrix4().compose(new THREE.Vector3(rr * Math.cos(a + side * 0.008), rr * Math.sin(a + side * 0.008), z), q, new THREE.Vector3(1, 1, 1)));
    }
  }
  g.add(instanced(knobGeo, mats.rubber, knobMs));

  // Spokes, 2-cross: each side's spokes alternate leading/trailing; hub angle offset = cross·720°/spokes.
  const cross = 2, flangeR = 25, nippleR = R - 22;
  const offset = (cross * 4 * Math.PI) / p.spokes;
  const spokeMs: THREE.Matrix4[] = [], nippleMs: THREE.Matrix4[] = [];
  for (let i = 0; i < p.spokes; i++) {
    const side = i % 2 ? 1 : -1;
    const sign = Math.floor(i / 2) % 2 ? 1 : -1;
    const ra = (i / p.spokes) * TAU;
    const ha = ra + sign * offset;
    const hub = new THREE.Vector3(flangeR * Math.cos(ha), flangeR * Math.sin(ha), side * p.flangeZ);
    const rim = new THREE.Vector3(nippleR * Math.cos(ra), nippleR * Math.sin(ra), side * 1.5);
    spokeMs.push(spanMatrix(hub, rim, 1));
    const dir = rim.clone().sub(hub).normalize();
    nippleMs.push(spanMatrix(rim.clone().addScaledVector(dir, -4), rim.clone().addScaledVector(dir, 9), 1));
  }
  g.add(instanced(geos.get('spoke', () => new THREE.CylinderGeometry(1, 1, 1, 8)), mats.spoke, spokeMs));
  g.add(instanced(geos.get('nipple', () => new THREE.CylinderGeometry(2, 2, 1, 10)), mats.steel, nippleMs));

  // Hub: body, flanges, axle with end caps; freehub body for the cassette on the rear.
  const axle = p.id === 'rearWheel' ? 72 : 56;
  g.add(zCyl(c, mats.metal, 16, -p.flangeZ, p.flangeZ));
  for (const s of [-1, 1]) {
    g.add(zCyl(c, mats.metal, flangeR + 2, s * p.flangeZ - 2, s * p.flangeZ + 2, 64));
    g.add(zCyl(c, mats.dark, 11, s * p.flangeZ, s * (axle - 4), 32));
  }
  g.add(zCyl(c, mats.steel, 6, -axle - 4, axle + 4, 24));
  if (p.id === 'rearWheel') g.add(zCyl(c, mats.dark, 17, p.flangeZ, 62, 32));

  // Valve stem.
  const valve = mesh(geos.get('valve', () => new THREE.CylinderGeometry(3, 3, 40, 12)), mats.steel);
  valve.position.set(0, R - 22, 0);
  g.add(valve);
  return g;
}

function buildBox(p: Of<'box'>, c: Ctx) {
  const [w, h, d] = p.size;
  const r = Math.min(w, h, d) * 0.3;
  const m = mesh(c.geos.get(`box${p.size.join('|')}`, () => new RoundedBoxGeometry(w, h, d, 4, r)), partMat(c.mats, p.mat));
  m.position.copy(vec(p.center));
  return m;
}

function build(p: Part, c: Ctx): THREE.Object3D | null {
  switch (p.kind) {
    case 'tube': return buildTube(p, c);
    case 'wheel': return buildWheel(p, c);
    case 'box': return buildBox(p, c);
    default: return null;
  }
}

// ---------- scene ----------

export function mount(container: HTMLElement): { update(parts: Part[]): void; dispose(): void } {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    container.textContent = '3D недоступно в этом браузере';
    return { update() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.background = new THREE.Color();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(2.4, 1.2, 3.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.6;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI / 2 - 0.04; // never below the floor

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.1);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -1.4;
  sun.shadow.camera.right = sun.shadow.camera.top = 1.4;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 10;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 4;
  scene.add(hemi, sun, sun.target);

  const mats = makeMats();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), mats.floor);
  floor.receiveShadow = true;
  scene.add(floor);

  const bike = new THREE.Group();
  bike.scale.setScalar(0.001);
  scene.add(bike);

  let geos = new Geos();
  let owned: THREE.Material[] = [];
  let textures: THREE.Texture[] = [];
  let framed = false;

  // Render on demand: one frame per request; damping keeps requesting via controls' 'change'.
  let frame = 0;
  const render = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      controls.update();
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener('change', render);

  const applyTheme = () => {
    const panel = new THREE.Color(cssColor('--panel', '#ffffff'));
    (scene.background as THREE.Color).copy(panel);
    mats.frame.color.set(cssColor('--frame', '#2b5fd9'));
    mats.metal.color.set(cssColor('--ink-2', '#6b7385'));
    const dark = panel.getHSL({ h: 0, s: 0, l: 0 }).l < 0.3;
    mats.floor.opacity = dark ? 0.45 : 0.18;
    hemi.groundColor.copy(panel);
    hemi.intensity = dark ? 0.8 : 1.1;
    render();
  };
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', applyTheme);
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  applyTheme();

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clear = () => {
    bike.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    bike.clear();
    geos.dispose();
    owned.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    geos = new Geos();
    owned = [];
    textures = [];
  };

  const frameView = (box: THREE.Box3) => {
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const fov = Math.min(vfov, 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect));
    const dist = (radius / Math.sin(fov / 2)) * 1.02;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(0.72, 0.32, 1).normalize(), dist);
    camera.updateProjectionMatrix();
  };

  return {
    update(parts) {
      clear();
      const ctx: Ctx = { geos, mats, owned, textures };
      for (const p of parts) {
        const o = build(p, ctx);
        if (o) bike.add(o);
      }
      // Floor touches the lowest tyre; light and shadow box follow the bike.
      const lows = parts.flatMap((p) => (p.kind === 'wheel' ? [p.center[1] - p.rim / 2 - p.tire] : []));
      floor.position.y = (lows.length ? Math.min(...lows) : 0) * 0.001;
      const box = new THREE.Box3().setFromObject(bike);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        sun.target.position.copy(center);
        sun.position.copy(center).add(new THREE.Vector3(1.2, 3.5, 1.8));
        if (!framed) { frameView(box); framed = true; }
      }
      controls.update();
      render();
    },
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      media.removeEventListener('change', applyTheme);
      controls.removeEventListener('change', render);
      controls.dispose();
      clear();
      Object.values(mats).forEach((m) => m.dispose());
      floor.geometry.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
