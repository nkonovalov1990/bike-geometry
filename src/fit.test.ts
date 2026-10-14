import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './geometry';
import { conflicts, inseamMm, riderFrom, scaledRange } from './fit';

describe('fit', () => {
  it('scales ranges by k mm per cm from 178', () => {
    expect(scaledRange('stack', 'road', 188)).toEqual([570, 610]);
    expect(scaledRange('reach', 'mtb', 168)).toEqual([427, 467]);
    expect(scaledRange('stack', 'folding', 188)).toBeNull();
  });
  it('estimated inseam is 0.47 × height', () => {
    expect(inseamMm({ height: 178 })).toBeCloseTo(836.6, 6);
    expect(inseamMm({ height: 178, inseam: 80 })).toBe(800);
  });
  it('default frame fits a 178 cm rider', () => {
    expect([...conflicts(DEFAULTS, { height: 178 })]).toEqual([]);
  });
  it('standover conflict for a 160 cm rider', () => {
    const c = conflicts(DEFAULTS, { height: 160 });
    expect(c.get('standover')).toMatch(/^Зазор над рамой -46 мм — нужно не меньше 20 мм$/);
  });
  it('envelope conflict when a frame is too small for 195 cm', () => {
    expect(conflicts(DEFAULTS, { height: 195 }).get('stack')).toBe('Stack 560 — меньше любой нормы для роста 195 см (≥ 571)');
  });
  it('seat tube too long and too short', () => {
    expect(conflicts({ ...DEFAULTS, seatTube: 700 }, { height: 178 }).get('seatTube')).toMatch(/^Подседельная 700 мм длиннее допустимой 669 мм/);
    expect(conflicts(DEFAULTS, { height: 210 }).get('seatTube')).toMatch(/^Штырь выйдет на 352 мм/);
  });
  it('riderFrom validates', () => {
    expect(riderFrom(178, NaN)).toEqual({ height: 178 });
    expect(riderFrom(178, 82)).toEqual({ height: 178, inseam: 82 });
    expect(riderFrom(178, 200)).toEqual({ height: 178 });
    expect(riderFrom(90, 82)).toBeUndefined();
    expect(riderFrom(NaN, 82)).toBeUndefined();
  });
  it('flags stack above the envelope for a short rider', () => {
    expect(conflicts(DEFAULTS, { height: 100 }).get('stack')).toBe('Stack 560 — больше любой нормы для роста 100 см (≤ 426)');
  });
});
