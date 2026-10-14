import { points, type Base, type Pt } from './geometry';

const PAD = 40;
const f = (n: number) => n.toFixed(1);
// SVG y grows downward; geometry y grows upward.
const line = (a: Pt, b: Pt, cls: string) => `<line class="${cls}" x1="${f(a.x)}" y1="${f(-a.y)}" x2="${f(b.x)}" y2="${f(-b.y)}"/>`;

export function render(svg: SVGSVGElement, b: Base): void {
  const p = points(b);
  const R = p.wheelRadius;
  const minX = p.rearAxle.x - R - PAD;
  const maxX = Math.max(p.frontAxle.x + R, p.axisGround.x) + PAD;
  const top = Math.max(p.htTop.y, p.seatTop.y, p.frontAxle.y + R) + PAD;
  const bottom = p.groundY - PAD;
  svg.setAttribute('viewBox', `${f(minX)} ${f(-top)} ${f(maxX - minX)} ${f(top - bottom)}`);
  const ground = (x: number): Pt => ({ x, y: p.groundY });
  const wheel = (c: Pt) => `<circle class="wheel" cx="${f(c.x)}" cy="${f(-c.y)}" r="${f(R)}"/>`;
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
  ].join('');
}
