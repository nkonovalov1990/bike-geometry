import { describe, expect, it } from 'vitest';
import { DEFAULTS, SOLVABLE, derived, type Base, type FieldKey } from './geometry';
import { solve, solveLinear, type SolveResult } from './solver';

const locks = (...k: FieldKey[]) => new Set<FieldKey>(k);
const ok = (r: SolveResult): Base => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.base;
};
const T0 = derived(DEFAULTS);

describe('solveLinear', () => {
  it('solves a 2x2 system', () => {
    const x = solveLinear([[2, 1], [1, 3]], [3, 5])!;
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });
  it('returns null for a singular matrix', () => {
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });
});

describe('solve', () => {
  it('base edit without locks changes only that field', () => {
    expect(ok(solve(DEFAULTS, { key: 'reach', value: 400 }, locks()))).toEqual({ ...DEFAULTS, reach: 400 });
  });

  it('total length edit reaches the target', () => {
    const b = ok(solve(DEFAULTS, { key: 'totalLength', value: 1700 }, locks()));
    expect(derived(b).totalLength).toBeCloseTo(1700, 6);
  });

  it('derived edit reaches the target, unrelated params stay', () => {
    const b = ok(solve(DEFAULTS, { key: 'trail', value: 60 }, locks()));
    expect(derived(b).trail).toBeCloseTo(60, 6);
    expect(b.stack).toBeCloseTo(560, 6);
    expect(b.reach).toBeCloseTo(385, 6);
    expect(b.seatAngle).toBeCloseTo(73.5, 6);
  });

  it('leaves params the targets do not depend on exactly untouched', () => {
    const b = ok(solve(DEFAULTS, { key: 'headAngle', value: 70 }, locks('trail')));
    expect(b.stack).toBe(560);
    expect(b.bbDrop).toBe(70);
    expect(b.reach).toBe(385);
    expect(derived(b).trail).toBeCloseTo(T0.trail, 6);
  });

  it('locked trail survives head angle edit; offset compensates', () => {
    const b = ok(solve(DEFAULTS, { key: 'headAngle', value: 72 }, locks('trail')));
    const a = (72 * Math.PI) / 180;
    expect(b.headAngle).toBe(72);
    expect(derived(b).trail).toBeCloseTo(T0.trail, 6);
    expect(b.forkOffset).toBeCloseTo(339 * Math.cos(a) - T0.trail * Math.sin(a), 4);
  });

  it('locked wheelbase survives reach edit', () => {
    const b = ok(solve(DEFAULTS, { key: 'reach', value: 400 }, locks('wheelbase')));
    expect(b.reach).toBe(400);
    expect(derived(b).wheelbase).toBeCloseTo(T0.wheelbase, 6);
  });

  it('non-solvable edit keeps locked trail', () => {
    const b = ok(solve(DEFAULTS, { key: 'rim', value: 584 }, locks('trail')));
    expect(b.rim).toBe(584);
    expect(derived(b).trail).toBeCloseTo(T0.trail, 6);
    expect(b.forkOffset).not.toBeCloseTo(45, 1);
  });

  it('overconstrained when every solvable param is locked', () => {
    expect(solve(DEFAULTS, { key: 'trail', value: 60 }, new Set(SOLVABLE))).toEqual({ ok: false, error: 'overconstrained' });
  });

  it('unreachable when only chainstay is free and wheelbase < frontCenter', () => {
    const l = new Set<FieldKey>(SOLVABLE.filter((k) => k !== 'chainstay'));
    expect(solve(DEFAULTS, { key: 'wheelbase', value: 500 }, l)).toEqual({ ok: false, error: 'unreachable' });
  });

  it('invalid for an impossible head angle', () => {
    expect(solve(DEFAULTS, { key: 'headAngle', value: 95 }, locks())).toEqual({ ok: false, error: 'invalid' });
  });

  it('invalid for a negative fork length target', () => {
    expect(solve(DEFAULTS, { key: 'forkLength', value: -50 }, locks('trail'))).toEqual({ ok: false, error: 'invalid' });
  });

  it('does not mutate the input', () => {
    const before = { ...DEFAULTS };
    solve(DEFAULTS, { key: 'trail', value: 60 }, locks('wheelbase'));
    expect(DEFAULTS).toEqual(before);
  });

  it('solves well under 50 ms', () => {
    const t = performance.now();
    solve(DEFAULTS, { key: 'trail', value: 60 }, locks('wheelbase', 'stack'));
    expect(performance.now() - t).toBeLessThan(50);
  });
});
