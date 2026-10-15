import { describe, expect, it } from 'vitest';
import { DEFAULTS, points, type Base } from './geometry';
import { BAR_LIMITS, BAR_PRESETS, BAR_STYLES, DEFAULT_COCKPIT, buildModel, pitchRadius, type Cockpit, type Part } from './model3d';

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

  it('chain (sampled along its segments) stays out of the chainring and cog pitch circles by at most 1 mm', () => {
    const path = get<'chain'>(m, 'chain').path;
    const R = pitchRadius(50), r = pitchRadius(17);
    for (let i = 1; i < path.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, y = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t;
        expect(Math.hypot(x, y)).toBeGreaterThan(R - 1);
        expect(Math.hypot(x - p.rearAxle.x, y - p.rearAxle.y)).toBeGreaterThan(r - 1);
      }
    }
  });

  it('pedal spindles stick out to z = ±72', () => {
    expect(get<'tube'>(m, 'pedalAxleR').path.at(-1)![2]).toBe(72);
    expect(get<'tube'>(m, 'pedalAxleL').path.at(-1)![2]).toBe(-72);
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

  describe('cockpit', () => {
    const a = (DEFAULTS.headAngle * Math.PI) / 180;
    const up = [-Math.cos(a), Math.sin(a)];
    const at = (k: number) => [p.htTop.x + up[0]! * k, p.htTop.y + up[1]! * k];
    const bar = (c: Partial<Cockpit>) => buildModel(DEFAULTS, undefined, { ...DEFAULT_COCKPIT, ...(c.bar && { dims: BAR_PRESETS[c.bar] }), ...c });

    it.each([0, 20, 45])('spacers %i: stem clamp is spacers+20 above the head tube, steerer ends at spacers+40', (spacers) => {
      const parts = bar({ spacers });
      const stem = get<'tube'>(parts, 'stem').path[0]!;
      expect(stem[0]).toBeCloseTo(at(spacers + 20)[0]!, 6);
      expect(stem[1]).toBeCloseTo(at(spacers + 20)[1]!, 6);
      const top = get<'tube'>(parts, 'steerer').path.at(-1)!;
      expect([top[0], top[1]]).toEqual([expect.closeTo(at(spacers + 40)[0]!, 6), expect.closeTo(at(spacers + 40)[1]!, 6)]);
      const cap = get<'tube'>(parts, 'topCap').path;
      expect(cap[0]).toEqual(top);
      expect(Math.hypot(cap[1]![0] - cap[0]![0], cap[1]![1] - cap[0]![1])).toBeCloseTo(5, 6);
    });

    it('spacer rings: 25 mm is 10 + 10 + 5 stacked from the head tube; 0 has none', () => {
      const rings = bar({ spacers: 25 }).filter((x) => x.id.startsWith('spacer')) as Extract<Part, { kind: 'tube' }>[];
      const heights = rings.map((r) => Math.hypot(r.path[1]![0] - r.path[0]![0], r.path[1]![1] - r.path[0]![1]));
      expect(heights.map((h) => +h.toFixed(6))).toEqual([10, 10, 5]);
      expect(heights.reduce((x, y) => x + y)).toBeCloseTo(25, 6);
      expect(rings[0]!.path[0]![0]).toBeCloseTo(p.htTop.x, 6);
      expect(bar({ spacers: 0 }).filter((x) => x.id.startsWith('spacer'))).toHaveLength(0);
    });

    it.each<[number, number]>([[100, -6], [120, 10]])('stem length %i, angle %i: end = clamp + length * (cos, sin)', (stemLength, stemAngle) => {
      const parts = bar({ stemLength, stemAngle });
      const [c, e] = get<'tube'>(parts, 'stem').path as [number, number, number][];
      const th = ((90 - DEFAULTS.headAngle + stemAngle) * Math.PI) / 180;
      expect(e[0] - c![0]).toBeCloseTo(stemLength * Math.cos(th), 6);
      expect(e[1] - c![1]).toBeCloseTo(stemLength * Math.sin(th), 6);
      expect(get<'bar'>(parts, 'bar').center).toEqual(e);
    });

    it('bar presets', () => {
      const pick = (style: Cockpit['bar']) => {
        const { width, reach, drop, flare, rise, backsweep, upsweep } = get<'bar'>(bar({ bar: style }), 'bar');
        return { width, reach, drop, flare, rise, backsweep, upsweep };
      };
      expect(pick('road')).toEqual({ width: 420, reach: 80, drop: 125, flare: 0, rise: 0, backsweep: 0, upsweep: 0 });
      expect(pick('gravel')).toMatchObject({ width: 440, reach: 75, drop: 115, flare: 16 });
      expect(pick('flat')).toMatchObject({ width: 720, rise: 0, backsweep: 9, upsweep: 0 });
      expect(pick('riser')).toMatchObject({ width: 780, rise: 30, backsweep: 9, upsweep: 5 });
    });

    it('bar part reflects custom dims', () => {
      expect(get<'bar'>(bar({ bar: 'road', dims: { ...BAR_PRESETS.road, width: 400, drop: 140 } }), 'bar')).toMatchObject({ width: 400, drop: 140, reach: 80 });
    });

    it.each(BAR_STYLES.flatMap((s) => ['lo', 'hi'].map((e) => [s, e] as const)))('%s bar dims at %s limits: finite', (style, end) => {
      const dims = { ...BAR_PRESETS[style] };
      for (const [k, [lo, hi]] of Object.entries(BAR_LIMITS[style])) dims[k as keyof typeof dims] = end === 'lo' ? lo : hi;
      const parts = bar({ bar: style, dims });
      expect(JSON.stringify(parts).match(/null/g)).toBeNull();
    });

    it.each(BAR_STYLES.flatMap((s) => [-17, 17].map((stemAngle) => [s, stemAngle] as const)))('%s, stem angle %i, extremes: unique ids, finite', (style, stemAngle) => {
      const parts = bar({ bar: style, spacers: 60, stemLength: 140, stemAngle });
      expect(new Set(parts.map((x) => x.id)).size).toBe(parts.length);
      expect(JSON.stringify(parts).match(/null/g)).toBeNull();
    });
  });
});
