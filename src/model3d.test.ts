import { describe, expect, it } from 'vitest';
import { DEFAULTS, points, type Base } from './geometry';
import { buildModel, type Part } from './model3d';

const get = <K extends Part['kind']>(m: Part[], id: string) => m.find((p) => p.id === id) as Extract<Part, { kind: K }>;

describe('buildModel', () => {
  const m = buildModel(DEFAULTS);
  const p = points(DEFAULTS);

  it('wheels sit on the axles with radii from the base params', () => {
    const f = get<'wheel'>(m, 'frontWheel'), r = get<'wheel'>(m, 'rearWheel');
    expect(f.center).toEqual([p.frontAxle.x, p.frontAxle.y, 0]);
    expect(r.center).toEqual([p.rearAxle.x, p.rearAxle.y, 0]);
    expect([f.rim, f.tire, r.rim, r.tire]).toEqual([622, 28, 622, 28]);
  });

  it('down tube goes from the BB to the head tube bottom', () => {
    expect(get<'tube'>(m, 'downTube').path).toEqual([[0, 0, 0], [p.htBottom.x, p.htBottom.y, 0]]);
  });

  it('fork legs end at the front axle, 50 mm either side', () => {
    expect(get<'tube'>(m, 'forkR').path.at(-1)).toEqual([p.frontAxle.x, p.frontAxle.y, 50]);
    expect(get<'tube'>(m, 'forkL').path.at(-1)).toEqual([p.frontAxle.x, p.frontAxle.y, -50]);
  });

  it('chainstays run from the dropouts (±67) to the BB shell (±35)', () => {
    expect(get<'tube'>(m, 'chainstayL').path).toEqual([[p.rearAxle.x, p.rearAxle.y, -67], [0, 0, -35]]);
  });

  it('saddle height follows the rider inseam along the seat line', () => {
    const top = get<'saddle'>(buildModel(DEFAULTS, { height: 178 }), 'saddle').top;
    expect(Math.hypot(top[0], top[1])).toBeCloseTo(0.883 * 836.6, 6);
    expect((Math.atan2(top[1], -top[0]) * 180) / Math.PI).toBeCloseTo(73.5, 9);
    const def = get<'saddle'>(m, 'saddle').top;
    expect(Math.hypot(def[0], def[1])).toBeCloseTo(720, 6);
  });

  it.each<[string, Base]>([
    ['default', DEFAULTS],
    ['mullet', { ...DEFAULTS, rimRear: 584 }],
    ['20 inch', { ...DEFAULTS, rimFront: 406, rimRear: 406, tireFront: 45, tireRear: 45 }],
  ])('%s: unique ids, all numbers finite', (_, b) => {
    const parts = buildModel(b, { height: 178 });
    expect(new Set(parts.map((x) => x.id)).size).toBe(parts.length);
    const nums = JSON.stringify(parts).match(/-?[\d.]+(e-?\d+)?|null/g)!;
    expect(nums).not.toContain('null');
  });
});
