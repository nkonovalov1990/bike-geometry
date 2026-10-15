import { derived, points, type Base, type Pt } from './geometry';
import { inseamMm, type Rider } from './fit';

export type V3 = [number, number, number];
export type Mat = 'frame' | 'metal' | 'dark';
export type Part =
  | { kind: 'tube'; id: string; path: V3[]; r: [number, number]; mat: Mat }
  | { kind: 'wheel'; id: 'frontWheel' | 'rearWheel'; center: V3; rim: number; tire: number; spokes: number; flangeZ: number }
  | { kind: 'disc'; id: string; center: V3; diameter: number }
  | { kind: 'ring'; id: string; center: V3; teeth: number }
  | { kind: 'box'; id: string; center: V3; size: V3; mat: Mat }
  | { kind: 'bar'; id: 'bar'; center: V3; width: number; reach: number; drop: number }
  | { kind: 'saddle'; id: 'saddle'; top: V3; length: number; width: number }
  | { kind: 'chain'; id: 'chain'; path: V3[] };

const rad = (d: number) => (d * Math.PI) / 180;
const v = (p: Pt, z = 0): V3 => [p.x, p.y, z];
const add = (p: Pt, dir: Pt, k: number): Pt => ({ x: p.x + dir.x * k, y: p.y + dir.y * k });
export const pitchRadius = (teeth: number) => 12.7 / (2 * Math.sin(Math.PI / teeth));
const COGS = [34, 30, 27, 24, 21, 19, 17, 15, 13, 11];

const TAU = 2 * Math.PI;
const wrap = (a: number, from: number) => from + ((((a - from) % TAU) + TAU) % TAU); // a, as the first angle >= from

/** Closed chain loop (counter-clockwise): ring top -> external tangent -> round the back of the cog -> pulleys -> round the front of the ring. */
function chainPath(axle: Pt, R: number, r: number, pTop: Pt, pBot: Pt, ringZ: number, cogZ: number): V3[] {
  const L = Math.hypot(axle.x, axle.y), phi = Math.atan2(axle.y, axle.x), alpha = Math.acos((R - r) / L);
  // External tangent normals phi±alpha; the upper run is the one pointing up.
  const nu = Math.sin(phi - alpha) > Math.sin(phi + alpha) ? phi - alpha : phi + alpha;
  const tangentFrom = (q: Pt, c: Pt, rr: number, sign: number) => {
    const dx = q.x - c.x, dy = q.y - c.y;
    return Math.atan2(dy, dx) + sign * Math.acos(rr / Math.hypot(dx, dy));
  };
  const cogEnd = wrap(tangentFrom(pTop, axle, r, -1), nu);
  const ringStart = wrap(tangentFrom(pBot, { x: 0, y: 0 }, R, 1), nu);
  const arc = (c: Pt, rr: number, from: number, to: number, z: number): V3[] => {
    const n = Math.max(2, Math.ceil((to - from) / rad(10)));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = from + ((to - from) * i) / n;
      return [c.x + rr * Math.cos(t), c.y + rr * Math.sin(t), z] as V3;
    });
  };
  return [
    [R * Math.cos(nu), R * Math.sin(nu), ringZ],
    ...arc(axle, r, nu, cogEnd, cogZ), // the upper run is the segment ring top -> arc start
    v(pTop, cogZ),
    v(pBot, cogZ),
    ...arc({ x: 0, y: 0 }, R, ringStart, nu + TAU, ringZ),
  ];
}

export function buildModel(b: Base, rider?: Rider): Part[] {
  const p = points(b);
  const d = derived(b);
  const a = rad(b.headAngle), s = rad(b.seatAngle);
  const up: Pt = { x: -Math.cos(a), y: Math.sin(a) }; // up the steering axis
  const seat: Pt = { x: -Math.cos(s), y: Math.sin(s) }; // up the seat line from BB
  const onSeat = (dist: number): Pt => add(p.bb, seat, dist);
  const parts: Part[] = [];
  const tube = (id: string, path: V3[], r: [number, number], mat: Mat = 'frame') => parts.push({ kind: 'tube', id, path, r, mat });

  // Frame
  tube('headTube', [v(p.htTop), v(p.htBottom)], [20, 25]);
  tube('topTube', [v(p.seatTop), v(p.htTop)], [17, 17]);
  tube('downTube', [v(p.bb), v(p.htBottom)], [24, 24]);
  tube('seatTube', [v(p.bb), v(p.seatTop)], [16, 16]);
  tube('bbShell', [[0, 0, -34], [0, 0, 34]], [23, 23]);
  const junction = onSeat(b.seatTube - 40);
  for (const [side, z] of [['R', 1], ['L', -1]] as const) {
    tube(`chainstay${side}`, [v(p.rearAxle, 67 * z), [0, 0, 35 * z]], [11, 8]);
    tube(`seatstay${side}`, [v(p.rearAxle, 67 * z), v(junction, 10 * z)], [8, 8]);
    parts.push({ kind: 'box', id: `dropout${side}`, center: v(p.rearAxle, 67 * z), size: [40, 30, 8], mat: 'frame' });
    // Fork: straight down the steering axis, then bends forward to the axle.
    const bend = add(p.crown, { x: -up.x, y: -up.y }, 0.6 * d.forkLength);
    tube(`fork${side}`, [v(p.crown, 50 * z), v(bend, 50 * z), v(p.frontAxle, 50 * z)], [16, 9]);
  }
  parts.push({ kind: 'box', id: 'forkCrown', center: v(p.crown), size: [40, 30, 120], mat: 'frame' });

  // Cockpit
  const spacerTop = add(p.htTop, up, 20);
  const clamp = add(p.htTop, up, 40);
  tube('spacers', [v(p.htTop), v(spacerTop)], [20, 20], 'dark');
  tube('steerer', [v(p.crown), v(add(p.htTop, up, 60))], [14, 14], 'metal');
  const stemAngle = Math.PI / 2 - a - rad(6); // −6° to the perpendicular of the steerer
  const stemEnd = add(clamp, { x: Math.cos(stemAngle), y: Math.sin(stemAngle) }, 100);
  tube('stem', [v(clamp), v(stemEnd)], [16, 16], 'dark');
  parts.push({ kind: 'bar', id: 'bar', center: v(stemEnd), width: 420, reach: 80, drop: 125 });

  // Wheels and brakes
  parts.push({ kind: 'wheel', id: 'frontWheel', center: v(p.frontAxle), rim: b.rimFront, tire: b.tireFront, spokes: 28, flangeZ: 35 });
  parts.push({ kind: 'wheel', id: 'rearWheel', center: v(p.rearAxle), rim: b.rimRear, tire: b.tireRear, spokes: 28, flangeZ: 35 });
  parts.push({ kind: 'disc', id: 'discFront', center: v(p.frontAxle, -50), diameter: 160 });
  parts.push({ kind: 'disc', id: 'discRear', center: v(p.rearAxle, -62), diameter: 160 });
  parts.push({ kind: 'box', id: 'caliperFront', center: [p.frontAxle.x - 55, p.frontAxle.y + 45, -58], size: [50, 30, 25], mat: 'metal' });
  parts.push({ kind: 'box', id: 'caliperRear', center: [p.rearAxle.x + 60, p.rearAxle.y + 40, -70], size: [50, 30, 25], mat: 'metal' });

  // Drivetrain
  parts.push({ kind: 'ring', id: 'chainring50', center: [0, 0, 47], teeth: 50 });
  parts.push({ kind: 'ring', id: 'chainring34', center: [0, 0, 40], teeth: 34 });
  COGS.forEach((t, i) => parts.push({ kind: 'ring', id: `cog${t}`, center: v(p.rearAxle, 20 + (i * 40) / (COGS.length - 1)), teeth: t }));
  const crankDir = { x: Math.cos(rad(-30)), y: Math.sin(rad(-30)) };
  const rightEnd = add(p.bb, crankDir, 172.5), leftEnd = add(p.bb, crankDir, -172.5);
  tube('crankR', [[0, 0, 52], v(rightEnd, 52)], [12, 9], 'metal');
  tube('crankL', [[0, 0, -52], v(leftEnd, -52)], [12, 9], 'metal');
  tube('pedalAxleR', [v(rightEnd, 52), v(rightEnd, 72)], [5, 5], 'metal');
  tube('pedalAxleL', [v(leftEnd, -52), v(leftEnd, -72)], [5, 5], 'metal');
  parts.push({ kind: 'box', id: 'pedalR', center: v(rightEnd, 107), size: [90, 15, 70], mat: 'dark' });
  parts.push({ kind: 'box', id: 'pedalL', center: v(leftEnd, -107), size: [90, 15, 70], mat: 'dark' });
  const pulleyTop: Pt = { x: p.rearAxle.x + 10, y: p.rearAxle.y - 45 };
  const pulleyBottom: Pt = { x: p.rearAxle.x + 10, y: p.rearAxle.y - 95 };
  parts.push({ kind: 'box', id: 'derailleur', center: [pulleyTop.x, (pulleyTop.y + pulleyBottom.y) / 2, 55], size: [25, 80, 12], mat: 'metal' });
  const ring = pitchRadius(50), cog = pitchRadius(17), cogZ = 20 + (6 * 40) / (COGS.length - 1);
  parts.push({ kind: 'chain', id: 'chain', path: chainPath(p.rearAxle, ring, cog, pulleyTop, pulleyBottom, 47, cogZ) });

  // Seat
  const saddleDist = rider ? 0.883 * inseamMm(rider) : b.seatTube + 200;
  tube('seatpost', [v(onSeat(b.seatTube - 60)), v(onSeat(saddleDist - 40))], [13.6, 13.6], 'metal');
  parts.push({ kind: 'saddle', id: 'saddle', top: v(onSeat(saddleDist)), length: 270, width: 140 });
  return parts;
}
