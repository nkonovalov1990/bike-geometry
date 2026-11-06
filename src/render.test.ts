import { describe, expect, it } from 'vitest';
import { DERIVED_KEYS, BASE_KEYS, derived, points } from './geometry';
import { ROAD } from './testing';
import { segments } from './render';

const len = (s: ReturnType<typeof segments>[number]) => ('line' in s ? Math.hypot(s.line[1].x - s.line[0].x, s.line[1].y - s.line[0].y) : NaN);

describe('segments', () => {
  it('every field has something to highlight', () => {
    for (const k of [...BASE_KEYS, ...DERIVED_KEYS]) expect(segments(ROAD, k).length).toBeGreaterThan(0);
  });
  it('lengths match the values they stand for', () => {
    const d = derived(ROAD);
    const one = (k: Parameters<typeof segments>[1]) => len(segments(ROAD, k)[0]!);
    expect(one('stack')).toBeCloseTo(ROAD.stack);
    expect(one('reach')).toBeCloseTo(ROAD.reach);
    expect(one('headTube')).toBeCloseTo(ROAD.headTube);
    expect(one('chainstay')).toBeCloseTo(ROAD.chainstay);
    expect(one('forkOffset')).toBeCloseTo(ROAD.forkOffset);
    expect(one('forkLength')).toBeCloseTo(d.forkLength);
    expect(one('trail')).toBeCloseTo(d.trail);
    expect(one('wheelbase')).toBeCloseTo(d.wheelbase);
    expect(one('totalLength')).toBeCloseTo(d.totalLength);
    expect(one('frontCenter')).toBeCloseTo(d.frontCenter);
    expect(one('bbHeight')).toBeCloseTo(d.bbHeight);
    expect(one('effectiveTopTube')).toBeCloseTo(d.effectiveTopTube);
    expect(one('standover')).toBeCloseTo(d.standover);
    expect(one('seatTube')).toBeCloseTo(ROAD.seatTube);
  });
  it('tyre circle is the outer radius', () => {
    const s = segments(ROAD, 'tireFront')[0]!;
    expect('circle' in s && s.circle[1]).toBeCloseTo(points(ROAD).frontRadius);
  });
});
