// three.js renderer for the 3D bike. Parts come from model3d.ts in millimetres
// (BB at origin, x forward, y up, +z drive side); the bike group is scaled ×0.001.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { pitchRadius, type Mat, type Part, type V3 } from './model3d';

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

const circle = (x: number, y: number, r: number) => new THREE.Path().absarc(x, y, r, 0, TAU, true);

/** Annular-sector window between arms of width armW (mm), outer edge swept by `skew` rad. */
function window_(r1: number, r2: number, a: number, span: number, armW: number, skew = 0) {
  const w = new THREE.Path();
  const i0 = a + armW / 2 / r1, i1 = a + span - armW / 2 / r1;
  const o0 = a + armW / 2 / r2 + skew, o1 = a + span - armW / 2 / r2 + skew;
  w.absarc(0, 0, r1, i0, i1, false);
  w.absarc(0, 0, r2, o1, o0, true);
  w.closePath();
  return w;
}

function buildDisc(p: Of<'disc'>, c: Ctx) {
  const R = p.diameter / 2;
  const geo = c.geos.get(`disc${R}`, () => {
    const s = new THREE.Shape().absarc(0, 0, R, 0, TAU, false);
    s.holes.push(circle(0, 0, 12));
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6;
      s.holes.push(circle(22 * Math.cos(a), 22 * Math.sin(a), 2.6)); // rotor bolts
      s.holes.push(window_(30, R - 18, a, TAU / 6, 9, 0.22));
    }
    for (let k = 0; k < 36; k++) {
      const a = ((k + 0.5) * TAU) / 36, r = k % 2 ? R - 7 : R - 12;
      s.holes.push(circle(r * Math.cos(a), r * Math.sin(a), 2));
    }
    return new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, -1);
  });
  const g = new THREE.Group();
  g.position.copy(vec(p.center));
  g.add(mesh(geo, c.mats.steel));
  const bolt = c.geos.get('rotorBolt', () => new THREE.CylinderGeometry(4, 4, 4, 6).rotateX(Math.PI / 2));
  for (let k = 0; k < 6; k++) {
    const b = mesh(bolt, c.mats.metal);
    const a = (k * TAU) / 6;
    b.position.set(22 * Math.cos(a), 22 * Math.sin(a), -2);
    g.add(b);
  }
  return g;
}

/** Sprocket outline: roller seats on the pitch circle, teeth rising ~3.8 mm above it. */
function toothed(teeth: number, rp: number) {
  const s = new THREE.Shape();
  const step = TAU / teeth, root = rp - 3.9, tip = rp + 3.8;
  const prof: [number, number][] = [[0, root], [0.14, root + 0.5], [0.28, rp + 0.4], [0.41, tip], [0.59, tip], [0.72, rp + 0.4], [0.86, root + 0.5]];
  for (let k = 0; k < teeth; k++) {
    for (const [f, r] of prof) {
      const a = (k + f) * step;
      if (k === 0 && f === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
      else s.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
  }
  s.closePath();
  return s;
}

function buildRing(p: Of<'ring'>, c: Ctx) {
  const rp = pitchRadius(p.teeth);
  const chainring = p.id.startsWith('chainring');
  const depth = chainring ? 3 : 2;
  const geo = c.geos.get(`ring${p.teeth}|${chainring}`, () => {
    const s = toothed(p.teeth, rp);
    if (chainring) {
      s.holes.push(circle(0, 0, 12));
      for (let k = 0; k < 5; k++) s.holes.push(window_(32, rp - 13, (k * TAU) / 5, TAU / 5, 14));
    } else {
      s.holes.push(circle(0, 0, 17.5));
      if (rp - 9 > 30) for (let k = 0; k < 5; k++) s.holes.push(window_(24, rp - 9, (k * TAU) / 5 + 0.3, TAU / 5, 8, 0.15));
    }
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 24 })
      .translate(0, 0, -depth / 2);
  });
  const g = new THREE.Group();
  g.position.copy(vec(p.center));
  g.add(mesh(geo, chainring ? c.mats.metal : c.mats.steel));
  if (chainring && p.teeth >= 40) {
    // Outer ring carries the spider, chainring bolts (BCD 110) and the spindle.
    const arm = c.geos.get('spiderArm', () => new RoundedBoxGeometry(48, 14, 6, 2, 2));
    const bolt = c.geos.get('ringBolt', () => new THREE.CylinderGeometry(5, 5, 12, 16).rotateX(Math.PI / 2));
    for (let k = 0; k < 5; k++) {
      const a = (k * TAU) / 5;
      const m = mesh(arm, c.mats.dark);
      m.position.set(32 * Math.cos(a), 32 * Math.sin(a), 4);
      m.rotation.z = a;
      const b = mesh(bolt, c.mats.steel);
      b.position.set(55 * Math.cos(a), 55 * Math.sin(a), 0);
      g.add(m, b);
    }
    g.add(zCyl(c, c.mats.dark, 24, 1, 9, 48));
    g.add(zCyl(c, c.mats.steel, 12, -p.center[2] - 52, -p.center[2] + 52, 32));
  }
  return g;
}

function buildChain(p: Of<'chain'>, c: Ctx) {
  const pts = p.path.map(vec);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
  const total = cum[cum.length - 1]!;
  const at = (s: number) => {
    s = ((s % total) + total) % total;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const t = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
    return pts[i - 1]!.clone().lerp(pts[i]!, t);
  };
  const pitch = 12.7, n = Math.floor(total / pitch);
  const plates: THREE.Matrix4[] = [], rollers: THREE.Matrix4[] = [];
  const Z = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < n; k++) {
    const a = at(k * pitch), b = at((k + 1) * pitch);
    const dir = b.clone().sub(a).normalize();
    const side = Z.clone().addScaledVector(dir, -dir.z).normalize();
    const up = side.clone().cross(dir);
    const basis = new THREE.Matrix4().makeBasis(dir, up, side);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const off = k % 2 ? 3.7 : 2.6; // outer / inner plate pairs alternate
    for (const s of [-1, 1]) plates.push(basis.clone().setPosition(mid.clone().addScaledVector(side, s * off)));
    rollers.push(basis.clone().setPosition(a));
  }
  const g = new THREE.Group();
  g.add(instanced(c.geos.get('plate', () => new RoundedBoxGeometry(19, 7.5, 1, 2, 0.45)), c.mats.steel, plates));
  g.add(instanced(c.geos.get('roller', () => new THREE.CylinderGeometry(3.9, 3.9, 5, 12).rotateX(Math.PI / 2)), c.mats.spoke, rollers));
  g.add(instanced(c.geos.get('pin', () => new THREE.CylinderGeometry(1.8, 1.8, 9.6, 8).rotateX(Math.PI / 2)), c.mats.steel, rollers));
  return g;
}

/** Bar-tape bump texture: diagonal stripes so the tape reads as a helical wrap. */
function tapeTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  if (x) {
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = '#000';
    x.lineWidth = 6;
    for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildBar(p: Of<'bar'>, c: Ctx) {
  const g = new THREE.Group();
  g.position.copy(vec(p.center));
  const hw = p.width / 2, rc = p.reach, dr = p.drop;
  const side = (s: number): THREE.Vector3[] => ([
    [0, 0, hw * 0.45], [3, 0, hw * 0.8], [rc * 0.55, -2, hw * 0.97], [rc, -dr * 0.22, hw],
    [rc * 0.9, -dr * 0.62, hw], [rc * 0.45, -dr * 0.93, hw], [-10, -dr, hw], [-45, -dr - 2, hw],
  ] as V3[]).map(([x, y, z]) => new THREE.Vector3(x, y, s * z));
  const curve = new THREE.CatmullRomCurve3([...side(-1).reverse(), new THREE.Vector3(), ...side(1)], false, 'centripetal');
  const L = curve.getLength();
  const radius = (u: number) => {
    const d = Math.abs(u - 0.5) * L; // Ø31.8 clamp area → Ø24
    const t = THREE.MathUtils.smoothstep(d, 25, 70);
    return 15.9 + (12 - 15.9) * t;
  };
  g.add(mesh(c.geos.get(null, () => taperedTube(curve, radius, 240, 24)), c.mats.metal));

  // Tape: same curve from the shoulders to the ends, a little thicker.
  const u0 = 0.5 + 75 / L, u1 = 1 - 3 / L;
  for (const s of [-1, 1]) {
    const samples = Array.from({ length: 60 }, (_, i) => {
      const u = u0 + ((u1 - u0) * i) / 59;
      return curve.getPointAt(s > 0 ? u : 1 - u);
    });
    const sub = new THREE.CatmullRomCurve3(samples);
    const len = sub.getLength();
    const tex = tapeTexture();
    tex.repeat.set(len / 9, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.75, bumpMap: tex, bumpScale: 2 });
    c.textures.push(tex);
    c.owned.push(mat);
    g.add(mesh(c.geos.get(null, () => new THREE.TubeGeometry(sub, 160, 14.6, 18, false)), mat));
    const plug = mesh(sphere(c), c.mats.rubber);
    plug.position.copy(samples[samples.length - 1]!);
    plug.scale.setScalar(14.6);
    g.add(plug);

    // Brake/shift hood on the front of the bend, lever blade hanging down the drop.
    const hood = mesh(c.geos.get('hood', () => new RoundedBoxGeometry(52, 30, 26, 4, 10)), c.mats.rubber);
    hood.position.set(rc + 8, -4, s * hw);
    hood.rotation.z = 0.25;
    const horn = mesh(sphere(c), c.mats.rubber);
    horn.position.set(rc + 30, 12, s * hw);
    horn.scale.set(9, 11, 11);
    const lever = new THREE.CatmullRomCurve3([new THREE.Vector3(rc + 30, -10, s * hw), new THREE.Vector3(rc + 36, -50, s * hw), new THREE.Vector3(rc + 18, -dr * 0.82, s * hw)]);
    const blade = mesh(c.geos.get(null, () => taperedTube(lever, (u) => 5.5 - 2 * u, 48, 12)), c.mats.metal);
    g.add(hood, horn, blade);
  }
  g.add(zCyl(c, c.mats.dark, 20, -22, 22, 40)); // stem clamp
  return g;
}

function buildSaddle(p: Of<'saddle'>, c: Ctx) {
  const L = p.length, W = p.width;
  const geo = c.geos.get(`saddle${L}|${W}`, () => {
    const s = new THREE.SphereGeometry(1, 72, 36).rotateZ(Math.PI / 2); // poles at tail and nose
    const pos = s.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (x + 1) / 2; // 0 tail → 1 nose
      const hw = THREE.MathUtils.lerp(W / 2, 22, THREE.MathUtils.smoothstep(t, 0.32, 0.78));
      const kick = 9 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.3)) + 3 * THREE.MathUtils.smoothstep(t, 0.85, 1);
      pos.setXYZ(i, (x * L) / 2, y * (y > 0 ? 14 : 20) + kick - 14, z * hw);
    }
    s.computeVertexNormals();
    return s;
  });
  const g = new THREE.Group();
  g.position.copy(vec(p.top));
  g.add(mesh(geo, c.mats.dark));
  for (const s of [-1, 1]) {
    const rail = new THREE.CatmullRomCurve3(([
      [L * 0.38, -14, 10], [L * 0.24, -34, 20], [0, -40, 23], [-L * 0.22, -40, 25], [-L * 0.37, -22, W * 0.3],
    ] as V3[]).map(([x, y, z]) => new THREE.Vector3(x, y, s * z)));
    g.add(mesh(c.geos.get(null, () => new THREE.TubeGeometry(rail, 48, 3.5, 10, false)), c.mats.steel));
  }
  const clamp = mesh(c.geos.get('saddleClamp', () => new RoundedBoxGeometry(55, 12, 50, 3, 4)), c.mats.metal);
  clamp.position.set(0, -44, 0);
  g.add(clamp);
  return g;
}

function build(p: Part, c: Ctx): THREE.Object3D {
  switch (p.kind) {
    case 'tube': return buildTube(p, c);
    case 'wheel': return buildWheel(p, c);
    case 'disc': return buildDisc(p, c);
    case 'ring': return buildRing(p, c);
    case 'chain': return buildChain(p, c);
    case 'bar': return buildBar(p, c);
    case 'saddle': return buildSaddle(p, c);
    case 'box': return buildBox(p, c);
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
  sun.shadow.camera.updateProjectionMatrix();
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
        bike.add(o);
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
