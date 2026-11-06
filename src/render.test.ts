import { describe, expect, it } from 'vitest';
import { DEFAULTS, DERIVED_KEYS, BASE_KEYS, derived, points } from './geometry';
import { segments } from './render';

const len = (s: ReturnType<typeof segments>[number]) => ('line' in s ? Math.hypot(s.line[1].x - s.line[0].x, s.line[1].y - s.line[0].y) : NaN);

describe('segments', () => {
  it('every field has something to highlight', () => {
    for (const k of [...BASE_KEYS, ...DERIVED_KEYS]) expect(segments(DEFAULTS, k).length).toBeGreaterThan(0);
  });
  it('lengths match the values they stand for', () => {
    const d = derived(DEFAULTS);
    const one = (k: Parameters<typeof segments>[1]) => len(segments(DEFAULTS, k)[0]!);
    expect(one('stack')).toBeCloseTo(DEFAULTS.stack);
    expect(one('reach')).toBeCloseTo(DEFAULTS.reach);
    expect(one('headTube')).toBeCloseTo(DEFAULTS.headTube);
    expect(one('chainstay')).toBeCloseTo(DEFAULTS.chainstay);
    expect(one('forkOffset')).toBeCloseTo(DEFAULTS.forkOffset);
    expect(one('forkLength')).toBeCloseTo(d.forkLength);
    expect(one('trail')).toBeCloseTo(d.trail);
    expect(one('wheelbase')).toBeCloseTo(d.wheelbase);
    expect(one('totalLength')).toBeCloseTo(d.totalLength);
    expect(one('frontCenter')).toBeCloseTo(d.frontCenter);
    expect(one('bbHeight')).toBeCloseTo(d.bbHeight);
    expect(one('effectiveTopTube')).toBeCloseTo(d.effectiveTopTube);
    expect(one('standover')).toBeCloseTo(d.standover);
    expect(one('seatTube')).toBeCloseTo(DEFAULTS.seatTube);
  });
  it('tyre circle is the outer radius', () => {
    const s = segments(DEFAULTS, 'tireFront')[0]!;
    expect('circle' in s && s.circle[1]).toBeCloseTo(points(DEFAULTS).frontRadius);
  });
});
