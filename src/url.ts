import { BASE_KEYS, DEFAULTS, RIM_SIZES, isFieldKey, isValid, type Base, type FieldKey } from './geometry';

export type State = { base: Base; locks: Set<FieldKey> };

// Full precision on purpose: rounding would make locked derived fields drift after reload.
export function encode(s: State): string {
  const p = new URLSearchParams();
  for (const k of BASE_KEYS) p.set(k, String(s.base[k]));
  if (s.locks.size) p.set('lock', [...s.locks].join(','));
  return `#${p}`;
}

export function decode(hash: string): State {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const base = { ...DEFAULTS };
  for (const k of BASE_KEYS) {
    const raw = p.get(k)?.trim();
    const v = raw ? Number(raw) : NaN;
    if (Number.isFinite(v) && (k !== 'rim' || RIM_SIZES.some((r) => r.bsd === v))) base[k] = v;
  }
  const locks = new Set((p.get('lock') ?? '').split(',').filter(isFieldKey));
  return { base: isValid(base) ? base : { ...DEFAULTS }, locks };
}
