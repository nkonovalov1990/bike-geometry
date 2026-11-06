import { derived, points, type Base, type FieldKey, type Pt } from './geometry';

const PAD = 40;
const f = (n: number) => n.toFixed(1);
// SVG y grows downward; geometry y grows upward.
const line = (a: Pt, b: Pt, cls: string) => `<line class="${cls}" x1="${f(a.x)}" y1="${f(-a.y)}" x2="${f(b.x)}" y2="${f(-b.y)}"/>`;

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const text = (at: Pt, s: string, anchor: string, key = '') =>
  `<text${key ? ` class="dim-label" data-key="${key}" tabindex="0"` : ''} x="${f(at.x)}" y="${f(-at.y)}" text-anchor="${anchor}">${s}</text>`;
// Dimension line a→b with end ticks (perpendicular, ±12 mm) and a label.
function dim(a: Pt, b: Pt, label: string, at: Pt, anchor: string, key: string): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (-(b.y - a.y) / len) * 12, y: ((b.x - a.x) / len) * 12 };
  const tick = (p: Pt) => line({ x: p.x - n.x, y: p.y - n.y }, { x: p.x + n.x, y: p.y + n.y }, '');
  return line(a, b, '') + tick(a) + tick(b) + text(at, label, anchor, key);
}
// Arc around c from fromDeg to toDeg (degrees CCW from +x, geometry coords).
function arc(c: Pt, r: number, fromDeg: number, toDeg: number): string {
  const at = (d: number) => `${f(c.x + r * Math.cos((d * Math.PI) / 180))} ${f(-(c.y + r * Math.sin((d * Math.PI) / 180)))}`;
  // y is flipped for SVG, so a geometry-CCW sweep (toDeg > fromDeg) is sweep-flag 0.
  return `<path d="M ${at(fromDeg)} A ${r} ${r} 0 0 ${toDeg > fromDeg ? 0 : 1} ${at(toDeg)}"/>`;
}
const polar = (c: Pt, r: number, deg: number): Pt => ({ x: c.x + r * Math.cos((deg * Math.PI) / 180), y: c.y + r * Math.sin((deg * Math.PI) / 180) });

export function render(svg: SVGSVGElement, b: Base, warn: ReadonlySet<FieldKey> = new Set()): void {
  const p = points(b);
  const { frontRadius: Rf, rearRadius: Rr } = p;
  const stackX = Math.max(p.frontAxle.x + Rf, p.axisGround.x) + 50;
  const minX = p.rearAxle.x - Rr - PAD;
  const maxX = Math.max(Math.max(p.frontAxle.x + Rf, p.axisGround.x) + PAD, stackX + 320);
  const d = derived(b);
  const reachY = Math.max(p.htTop.y, p.seatTop.y) + 60;
  const top = Math.max(p.htTop.y, p.seatTop.y, p.frontAxle.y + Rf, reachY + 60) + PAD;
  const bottom = p.groundY - 200;
  svg.setAttribute('viewBox', `${f(minX)} ${f(-top)} ${f(maxX - minX)} ${f(top - bottom)}`);
  const ground = (x: number): Pt => ({ x, y: p.groundY });
  const wheel = (c: Pt, rim: number, tire: number) => `<circle class="tire" cx="${f(c.x)}" cy="${f(-c.y)}" r="${f(rim / 2 + tire / 2)}" stroke-width="${tire}"/><circle class="rim" cx="${f(c.x)}" cy="${f(-c.y)}" r="${f(rim / 2)}"/>`;
  const ext = (a: Pt, c: Pt) => line(a, c, 'ext');
  const wbY = p.groundY - 70;
  const tlY = p.groundY - 150;
  const rearEdge = { x: p.rearAxle.x - Rr, y: p.rearAxle.y };
  const frontEdge = { x: p.frontAxle.x + Rf, y: p.frontAxle.y };
  const hta = -b.headAngle;
  const sta = 180 - b.seatAngle;
  svg.innerHTML = [
    line(ground(minX), ground(maxX), 'ground'),
    wheel(p.rearAxle, b.rimRear, b.tireRear),
    wheel(p.frontAxle, b.rimFront, b.tireFront),
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
    dim({ x: stackX, y: 0 }, { x: stackX, y: b.stack }, `Stack ${num(b.stack)}`, { x: stackX + 20, y: b.stack / 2 }, 'start', 'stack'),
    dim({ x: 0, y: reachY }, { x: b.reach, y: reachY }, `Reach ${num(b.reach)}`, { x: b.reach / 2, y: reachY + 20 }, 'middle', 'reach'),
    arc(p.htTop, 90, 0, hta), text(polar(p.htTop, 125, hta / 2), `${num(b.headAngle)}°`, 'start', 'headAngle'),
    arc(p.bb, 110, 180, sta), text(polar(p.bb, 145, (180 + sta) / 2), `${num(b.seatAngle)}°`, 'end', 'seatAngle'),
    text({ x: (p.axisGround.x + p.frontAxle.x) / 2, y: p.groundY - 35 }, `Trail ${num(d.trail)}`, 'middle', 'trail'),
    dim({ x: 40, y: p.groundY }, { x: 40, y: 0 }, `BB Height ${num(d.bbHeight)}`, { x: 60, y: p.groundY / 2 }, 'start', 'bbHeight'),
    ext(p.rearAxle, { x: p.rearAxle.x + 170, y: p.rearAxle.y }), arc(p.rearAxle, 130, 0, -d.chainstayAngle), (() => { const csAt = polar(p.rearAxle, 200, -d.chainstayAngle); return text({ x: csAt.x, y: csAt.y - 45 }, `${num(d.chainstayAngle)}°`, 'middle', 'chainstayAngle'); })(),
    ext(p.seatTop, { x: p.seatTop.x + 170, y: p.seatTop.y }), arc(p.seatTop, 120, 0, d.topTubeAngle), (() => { const ttAt = polar(p.seatTop, 160, 0); return text({ x: ttAt.x, y: ttAt.y - 40 }, `${num(d.topTubeAngle)}°`, 'middle', 'topTubeAngle'); })(),
    (() => { const mid = { x: (p.seatTop.x + p.htTop.x) / 2, y: (p.seatTop.y + p.htTop.y) / 2 }; return dim({ x: mid.x, y: p.groundY }, mid, `Standover ${num(d.standover)}`, { x: mid.x + 20, y: (p.groundY + mid.y) / 2 }, 'start', 'standover'); })(),
    dim({ x: p.rearAxle.x, y: wbY }, { x: p.frontAxle.x, y: wbY }, `Wheelbase ${num(d.wheelbase)}`, { x: d.wheelbase / 2 + p.rearAxle.x, y: wbY + 15 }, 'middle', 'wheelbase'),
    dim({ x: rearEdge.x, y: tlY }, { x: frontEdge.x, y: tlY }, `Length ${num(d.totalLength)}`, { x: (rearEdge.x + frontEdge.x) / 2, y: tlY + 15 }, 'middle', 'totalLength'),
    '</g>',
  ].join('');
  for (const el of svg.querySelectorAll<SVGElement>('[data-key]')) el.classList.toggle('warn', warn.has(el.dataset.key as FieldKey));
}

export type Shape = { line: [Pt, Pt] } | { circle: [Pt, number] };
/** What a field measures on the drawing: the segment (or circle) to light up while it is hovered or focused. */
export function segments(b: Base, k: FieldKey): Shape[] {
  const p = points(b);
  const g = (x: number): Pt => ({ x, y: p.groundY });
  const L = (a: Pt, c: Pt): Shape => ({ line: [a, c] });
  const u = { x: Math.cos((b.headAngle * Math.PI) / 180), y: -Math.sin((b.headAngle * Math.PI) / 180) };
  const t = (p.frontAxle.x - p.htTop.x) * u.x + (p.frontAxle.y - p.htTop.y) * u.y;
  const foot = { x: p.htTop.x + t * u.x, y: p.htTop.y + t * u.y }; // front axle projected on the steering axis
  const mid = { x: (p.seatTop.x + p.htTop.x) / 2, y: (p.seatTop.y + p.htTop.y) / 2 };
  const map: Record<FieldKey, Shape[]> = {
    stack: [L({ x: p.htTop.x, y: 0 }, p.htTop)],
    reach: [L({ x: 0, y: p.htTop.y }, p.htTop)],
    headAngle: [L(p.htTop, p.axisGround)],
    seatAngle: [L(p.bb, p.seatTop)],
    headTube: [L(p.htTop, p.htBottom)],
    chainstay: [L(p.rearAxle, p.bb)],
    bbDrop: [L(p.rearAxle, { x: 0, y: p.rearAxle.y }), L({ x: 0, y: p.rearAxle.y }, p.bb)],
    forkOffset: [L(foot, p.frontAxle)],
    lowerStack: [L(p.htBottom, p.crown)],
    seatTube: [L(p.bb, p.seatTop)],
    rimFront: [{ circle: [p.frontAxle, b.rimFront / 2] }],
    rimRear: [{ circle: [p.rearAxle, b.rimRear / 2] }],
    tireFront: [{ circle: [p.frontAxle, p.frontRadius] }],
    tireRear: [{ circle: [p.rearAxle, p.rearRadius] }],
    forkLength: [L(p.crown, foot)],
    trail: [L(p.axisGround, g(p.frontAxle.x))],
    wheelbase: [L(g(p.rearAxle.x), g(p.frontAxle.x))],
    totalLength: [L(g(p.rearAxle.x - p.rearRadius), g(p.frontAxle.x + p.frontRadius))],
    frontCenter: [L(p.bb, p.frontAxle)],
    bbHeight: [L(g(0), p.bb)],
    chainstayAngle: [L(p.rearAxle, p.bb)],
    effectiveTopTube: [L({ x: -p.htTop.y / Math.tan((b.seatAngle * Math.PI) / 180), y: p.htTop.y }, p.htTop)],
    topTubeAngle: [L(p.seatTop, p.htTop)],
    standover: [L(g(mid.x), mid)],
  };
  return map[k];
}

/** Draws (or clears, with null) the highlight for a field on an already rendered drawing. */
export function highlight(svg: SVGSVGElement, b: Base, k: FieldKey | null): void {
  svg.querySelector('.hl')?.remove();
  svg.classList.toggle('focus', !!k);
  for (const el of svg.querySelectorAll<SVGElement>('[data-key]')) el.classList.toggle('on', el.dataset.key === k);
  if (!k) return;
  const dot = (q: Pt) => `<circle class="pt" cx="${f(q.x)}" cy="${f(-q.y)}" r="9"/>`;
  const svgOf = (s: Shape) => ('line' in s ? line(s.line[0], s.line[1], '') + s.line.map(dot).join('') : `<circle cx="${f(s.circle[0].x)}" cy="${f(-s.circle[0].y)}" r="${f(s.circle[1])}"/>`);
  svg.insertAdjacentHTML('beforeend', `<g class="hl" aria-hidden="true">${segments(b, k).map(svgOf).join('')}</g>`);
}
