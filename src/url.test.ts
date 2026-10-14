import { describe, expect, it } from 'vitest';
import { DEFAULTS, type FieldKey } from './geometry';
import { decode, encode, type State } from './url';

describe('url', () => {
  it('round-trips exactly, including float noise and locks', () => {
    const s: State = { base: { ...DEFAULTS, reach: 401.123456789012, headAngle: 72.85669755288275 }, locks: new Set<FieldKey>(['trail', 'stack']) };
    const hash = encode(s);
    expect(hash.startsWith('#')).toBe(true);
    expect(decode(hash)).toEqual(s);
  });

  it('empty hash gives defaults without locks', () => {
    expect(decode('')).toEqual({ base: DEFAULTS, locks: new Set() });
  });

  it('garbage values are ignored, valid ones applied', () => {
    expect(decode('#stack=abc&reach=400&tire=').base).toEqual({ ...DEFAULTS, reach: 400 });
  });

  it('invalid geometry falls back to defaults entirely', () => {
    expect(decode('#reach=400&chainstay=10').base).toEqual(DEFAULTS);
  });

  it('unknown lock keys are ignored', () => {
    expect(decode('#lock=trail,bogus,').locks).toEqual(new Set(['trail']));
  });

  it('rim outside the listed sizes is ignored', () => {
    expect(decode('#rim=600&reach=400').base).toEqual({ ...DEFAULTS, reach: 400 });
    expect(decode('#rim=584').base.rim).toBe(584);
  });
});
