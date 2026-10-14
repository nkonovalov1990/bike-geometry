import { describe, expect, it } from 'vitest';
import { DEFAULTS, RIM_SIZES, derived, field, isValid, points, type Base } from './geometry';

const rad = (d: number) => (d * Math.PI) / 180;

describe('derived', () => {
  it('matches the hand calculation for defaults', () => {
    const d = derived(DEFAULTS);
    expect(d.forkLength).toBeCloseTo(366.147, 2);
    expect(d.trail).toBeCloseTo(56.587, 2);
    expect(d.wheelbase).toBeCloseTo(985.844, 2);
    expect(d.totalLength).toBeCloseTo(1663.844, 2);
    expect(d.frontCenter).toBeCloseTo(581.864, 2);
    expect(d.bbHeight).toBeCloseTo(269, 6);
    expect(d.effectiveTopTube).toBeCloseTo(550.880, 2);
    expect(d.chainstayAngle).toBeCloseTo(9.830, 3);
    expect(d.topTubeAngle).toBeCloseTo(6.577, 3);
    expect(d.standover).toBeCloseTo(798.3, 1);
  });

  it('agrees with the textbook trail formula', () => {
    const b: Base = { ...DEFAULTS, headAngle: 71, forkOffset: 50 };
    const R = b.rimFront / 2 + b.tireFront;
    const a = rad(71);
    expect(derived(b).trail).toBeCloseTo((R * Math.cos(a) - 50) / Math.sin(a), 9);
  });

  it('vertical head tube gives trail = -offset', () => {
    const b: Base = { ...DEFAULTS, headAngle: 90 };
    expect(derived(b).trail).toBeCloseTo(-45, 9);
    expect(isValid(b)).toBe(true);
  });

  it('crown-to-axle distance is hypot(forkLength, offset)', () => {
    const p = points(DEFAULTS);
    const dist = Math.hypot(p.frontAxle.x - p.crown.x, p.frontAxle.y - p.crown.y);
    expect(dist).toBeCloseTo(Math.hypot(derived(DEFAULTS).forkLength, DEFAULTS.forkOffset), 9);
  });

  it('rear axle is chainstay away from BB at bbDrop height', () => {
    const p = points(DEFAULTS);
    expect(Math.hypot(p.rearAxle.x, p.rearAxle.y)).toBeCloseTo(410, 9);
    expect(p.rearAxle.y).toBe(70);
    expect(p.htTop).toEqual({ x: 385, y: 560 });
  });
});

describe('field', () => {
  it('reads base and derived values', () => {
    expect(field(DEFAULTS, 'stack')).toBe(560);
    expect(field(DEFAULTS, 'trail')).toBe(derived(DEFAULTS).trail);
  });
});

describe('isValid', () => {
  it('accepts defaults', () => expect(isValid(DEFAULTS)).toBe(true));
  it.each<[string, Partial<Base>]>([
    ['head angle at 45', { headAngle: 45 }],
    ['head angle above 90', { headAngle: 91 }],
    ['seat angle above 90', { seatAngle: 90.5 }],
    ['chainstay shorter than bb drop', { chainstay: 60 }],
    ['zero tire', { tireFront: 0 }],
    ['NaN stack', { stack: NaN }],
    ['negative fork length', { stack: 200 }],
    ['bb below ground', { bbDrop: 400 }],
  ])('rejects %s', (_, patch) => expect(isValid({ ...DEFAULTS, ...patch })).toBe(false));
});

describe('RIM_SIZES', () => {
  it.each(RIM_SIZES)('$label ($bsd) is valid', ({ bsd }) => {
    expect(isValid({ ...DEFAULTS, rimFront: bsd })).toBe(true);
    expect(isValid({ ...DEFAULTS, rimRear: bsd })).toBe(true);
  });
});

describe('separate wheels', () => {
  it('mullet 29/27.5: front axle higher, BB lower, trail unchanged', () => {
    const b = { ...DEFAULTS, rimRear: 584 };
    const p = points(b), d = derived(b);
    expect(p.frontAxle.y).toBeCloseTo(89, 9);
    expect(p.rearAxle.y).toBe(70);
    expect(d.bbHeight).toBeCloseTo(250, 9);
    expect(d.trail).toBeCloseTo(derived(DEFAULTS).trail, 9);
    expect(d.totalLength).toBeCloseTo(d.wheelbase + 339 + 320, 9);
    expect(isValid(b)).toBe(true);
  });
});
