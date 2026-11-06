import { describe, expect, it } from 'vitest';
import { metrics, nearest, scalePos, toeClearance } from './character';
import { DEFAULTS, derived, points, type Base } from './geometry';

// Size L hardtail from a published chart (29″ × 54 mm).
const MTB: Base = { ...DEFAULTS, stack: 614, reach: 460, headAngle: 69, seatAngle: 73, headTube: 170, chainstay: 470, bbDrop: 70, forkOffset: 50, lowerStack: 2, seatTube: 520, tireFront: 54, tireRear: 54 };

describe('character', () => {
  it('metrics come from the geometry', () => {
    const m = Object.fromEntries(metrics(DEFAULTS).map((x) => [x.key, x.value]));
    const d = derived(DEFAULTS);
    expect(m.trail).toBeCloseTo(d.trail);
    expect(m.stackReach).toBeCloseTo(DEFAULTS.stack / DEFAULTS.reach);
    expect(m.balance).toBeCloseTo(d.frontCenter / DEFAULTS.chainstay);
  });

  it('scale position is clamped', () => {
    expect(scalePos({ min: 0, max: 10 }, 5)).toBe(0.5);
    expect(scalePos({ min: 0, max: 10 }, -3)).toBe(0);
    expect(scalePos({ min: 0, max: 10 }, 30)).toBe(1);
  });

  it('a road default looks like a road bike, a hardtail like an MTB', () => {
    expect(['Road race', 'Endurance', 'Gravel']).toContain(nearest(metrics(DEFAULTS))[0]!.name);
    expect(nearest(metrics(MTB))[0]!.name).toMatch(/MTB/);
  });

  it('toe clearance = horizontal gap from BB to tyre minus crank and shoe', () => {
    const p = points(DEFAULTS);
    expect(toeClearance(DEFAULTS)).toBeCloseTo(p.frontAxle.x - p.frontRadius - 262.5);
    expect(toeClearance({ ...DEFAULTS, reach: 340 })).toBeLessThan(toeClearance(DEFAULTS));
  });
});
