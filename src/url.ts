import { BASE_KEYS, DEFAULTS, RIM_SIZES, isFieldKey, isValid, type Base, type FieldKey } from './geometry';
import { riderFrom, type Rider } from './fit';

export type State = { base: Base; locks: Set<FieldKey>; rider?: Rider };

// Full precision on purpose: rounding would make locked derived fields drift after reload.
export function encode(s: State): string {
  const p = new URLSearchParams();
  for (const k of BASE_KEYS) p.set(k, String(s.base[k]));
  if (s.locks.size) p.set('lock', [...s.locks].join(','));
  if (s.rider) {
    p.set('h', String(s.rider.height));
    if (s.rider.inseam !== undefined) p.set('inseam', String(s.rider.inseam));
  }
  return `#${p}`;
}

export function decode(hash: string): State {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const num = (k: string) => {
    const raw = p.get(k)?.trim();
    return raw ? Number(raw) : NaN;
  };
  const base = { ...DEFAULTS };
  for (const k of BASE_KEYS) {
    const v = num(k);
    if (Number.isFinite(v) && (!k.startsWith('rim') || RIM_SIZES.some((r) => r.bsd === v))) base[k] = v;
  }
  const locks = new Set((p.get('lock') ?? '').split(',').filter(isFieldKey));
  const rider = riderFrom(num('h'), num('inseam'));
  return { base: isValid(base) ? base : { ...DEFAULTS }, locks, ...(rider && { rider }) };
}
