import { derived, points, type Base, type Pt } from './geometry';

const PAD = 40;
const f = (n: number) => n.toFixed(1);
// SVG y grows downward; geometry y grows upward.
const line = (a: Pt, b: Pt, cls: string) => `<line class="${cls}" x1="${f(a.x)}" y1="${f(-a.y)}" x2="${f(b.x)}" y2="${f(-b.y)}"/>`;

const num = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const text = (at: Pt, s: string, anchor: string) => `<text x="${f(at.x)}" y="${f(-at.y)}" text-anchor="${anchor}">${s}</text>`;
// Dimension line a→b with end ticks (perpendicular, ±12 mm) and a label.
function dim(a: Pt, b: Pt, label: string, at: Pt, anchor = 'middle'): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (-(b.y - a.y) / len) * 12, y: ((b.x - a.x) / len) * 12 };
  const tick = (p: Pt) => line({ x: p.x - n.x, y: p.y - n.y }, { x: p.x + n.x, y: p.y + n.y }, '');
  return line(a, b, '') + tick(a) + tick(b) + text(at, label, anchor);
}
// Arc around c from fromDeg to toDeg (degrees CCW from +x, geometry coords).
function arc(c: Pt, r: number, fromDeg: number, toDeg: number): string {
  const at = (d: number) => `${f(c.x + r * Math.cos((d * Math.PI) / 180))} ${f(-(c.y + r * Math.sin((d * Math.PI) / 180)))}`;
  // y is flipped for SVG, so a geometry-CCW sweep (toDeg > fromDeg) is sweep-flag 0.
  return `<path d="M ${at(fromDeg)} A ${r} ${r} 0 0 ${toDeg > fromDeg ? 0 : 1} ${at(toDeg)}"/>`;
}
const polar = (c: Pt, r: number, deg: number): Pt => ({ x: c.x + r * Math.cos((deg * Math.PI) / 180), y: c.y + r * Math.sin((deg * Math.PI) / 180) });

export function render(svg: SVGSVGElement, b: Base): void {
  const p = points(b);
  const R = p.wheelRadius;
  const stackX = p.htTop.x + 70;
  const minX = p.rearAxle.x - R - PAD;
  const maxX = Math.max(Math.max(p.frontAxle.x + R, p.axisGround.x) + PAD, stackX + 220);
  const d = derived(b);
  const reachY = Math.max(p.htTop.y, p.seatTop.y) + 60;
  const top = Math.max(p.htTop.y, p.seatTop.y, p.frontAxle.y + R, reachY + 60) + PAD;
  const bottom = p.groundY - 200;
  svg.setAttribute('viewBox', `${f(minX)} ${f(-top)} ${f(maxX - minX)} ${f(top - bottom)}`);
  const ground = (x: number): Pt => ({ x, y: p.groundY });
  const wheel = (c: Pt) => `<circle class="tire" cx="${f(c.x)}" cy="${f(-c.y)}" r="${f(b.rim / 2 + b.tire / 2)}" stroke-width="${b.tire}"/><circle class="rim" cx="${f(c.x)}" cy="${f(-c.y)}" r="${f(b.rim / 2)}"/>`;
  const ext = (a: Pt, c: Pt) => line(a, c, 'ext');
  const wbY = p.groundY - 70;
  const tlY = p.groundY - 150;
  const rearEdge = { x: p.rearAxle.x - R, y: p.rearAxle.y };
  const frontEdge = { x: p.frontAxle.x + R, y: p.frontAxle.y };
  const hta = -b.headAngle;
  const sta = 180 - b.seatAngle;
  svg.innerHTML = [
    line(ground(minX), ground(maxX), 'ground'),
    wheel(p.rearAxle),
    wheel(p.frontAxle),
    line(p.htTop, p.axisGround, 'axis'),
    line(p.axisGround, ground(p.frontAxle.x), 'trail'),
    line(p.rearAxle, p.bb, 'tube'),
    line(p.rearAxle, p.seatTop, 'tube'),
    line(p.bb, p.seatTop, 'tube'),
    line(p.seatTop, p.htTop, 'tube'),
    line(p.bb, p.htBottom, 'tube'),
    line(p.htTop, p.htBottom, 'tube'),
    line(p.htBottom, p.crown, 'fork'),
    line(p.crown, p.frontAxle, 'fork'),
    '<g class="dim">',
    ext(p.bb, { x: 0, y: reachY }), ext(p.htTop, { x: p.htTop.x, y: reachY }), ext(p.htTop, { x: stackX + 12, y: p.htTop.y }),
    ext(p.rearAxle, { x: p.rearAxle.x, y: wbY }), ext(p.frontAxle, { x: p.frontAxle.x, y: wbY }),
    ext(rearEdge, { x: rearEdge.x, y: tlY }), ext(frontEdge, { x: frontEdge.x, y: tlY }),
    dim({ x: stackX, y: 0 }, { x: stackX, y: b.stack }, `Stack ${num(b.stack)}`, { x: stackX + 20, y: b.stack / 2 }, 'start'),
    dim({ x: 0, y: reachY }, { x: b.reach, y: reachY }, `Reach ${num(b.reach)}`, { x: b.reach / 2, y: reachY + 20 }),
    arc(p.htTop, 90, 0, hta), text(polar(p.htTop, 125, hta / 2), `${num(b.headAngle)}°`, 'start'),
    arc(p.bb, 110, 180, sta), text(polar(p.bb, 145, (180 + sta) / 2), `${num(b.seatAngle)}°`, 'end'),
    text({ x: (p.axisGround.x + p.frontAxle.x) / 2, y: p.groundY - 35 }, `Trail ${num(d.trail)}`, 'middle'),
    dim({ x: 40, y: p.groundY }, { x: 40, y: 0 }, `BB ${num(d.bbHeight)}`, { x: 60, y: d.bbHeight / 2 }, 'start'),
    dim({ x: p.rearAxle.x, y: wbY }, { x: p.frontAxle.x, y: wbY }, `База ${num(d.wheelbase)}`, { x: d.wheelbase / 2 + p.rearAxle.x, y: wbY + 15 }),
    dim({ x: rearEdge.x, y: tlY }, { x: frontEdge.x, y: tlY }, `Длина ${num(d.totalLength)}`, { x: (rearEdge.x + frontEdge.x) / 2, y: tlY + 15 }),
    '</g>',
  ].join('');
}
