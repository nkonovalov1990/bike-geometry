import { BASE_KEYS, DEFAULTS, RIM_SIZES, isFieldKey, isValid, type Base, type FieldKey } from './geometry';
import { riderFrom, type Rider } from './fit';
import { BAR_LIMITS, BAR_PRESETS, BAR_STYLES, COCKPIT_LIMITS, DEFAULT_COCKPIT, type BarDims, type Cockpit } from './model3d';

const DIM_KEYS: Record<keyof BarDims, string> = { width: 'barWidth', reach: 'barReach', drop: 'barDrop', flare: 'barFlare', rise: 'barRise', backsweep: 'barBack', upsweep: 'barUp' };
export type State = { base: Base; locks: Set<FieldKey>; rider?: Rider; cockpit?: Cockpit; view?: '3d' };

// Full precision on purpose: rounding would make locked derived fields drift after reload.
export function encode(s: State): string {
  const p = new URLSearchParams();
  for (const k of BASE_KEYS) p.set(k, String(s.base[k]));
  if (s.locks.size) p.set('lock', [...s.locks].join(','));
  if (s.rider) {
    p.set('h', String(s.rider.height));
    if (s.rider.inseam !== undefined) p.set('inseam', String(s.rider.inseam));
  }
  const c = s.cockpit;
  if (c && c.bar !== DEFAULT_COCKPIT.bar) p.set('bar', c.bar);
  if (c) for (const k of Object.keys(BAR_LIMITS[c.bar]) as (keyof BarDims)[]) if (c.dims[k] !== BAR_PRESETS[c.bar][k]) p.set(DIM_KEYS[k], String(c.dims[k]));
  if (c && c.spacers !== DEFAULT_COCKPIT.spacers) p.set('spacers', String(c.spacers));
  if (c && c.stemLength !== DEFAULT_COCKPIT.stemLength) p.set('stem', String(c.stemLength));
  if (c && c.stemAngle !== DEFAULT_COCKPIT.stemAngle) p.set('stemAngle', String(c.stemAngle));
  if (s.view) p.set('view', s.view);
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
  const inRange = (k: keyof typeof COCKPIT_LIMITS, fallback: number, step = 1) => {
    const v = num(k === 'stemLength' ? 'stem' : k);
    const [lo, hi] = COCKPIT_LIMITS[k];
    return Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v / step) * step : fallback;
  };
  const bar = BAR_STYLES.find((x) => x === p.get('bar')) ?? DEFAULT_COCKPIT.bar;
  const dims = { ...BAR_PRESETS[bar] };
  for (const [k, [lo, hi]] of Object.entries(BAR_LIMITS[bar]) as [keyof BarDims, readonly [number, number]][]) {
    const v = num(DIM_KEYS[k]);
    if (v >= lo && v <= hi) dims[k] = v;
  }
  const cockpit: Cockpit = {
    bar,
    dims,
    spacers: inRange('spacers', DEFAULT_COCKPIT.spacers, 5),
    stemLength: inRange('stemLength', DEFAULT_COCKPIT.stemLength),
    stemAngle: inRange('stemAngle', DEFAULT_COCKPIT.stemAngle),
  };
  return {
    base: isValid(base) ? base : { ...DEFAULTS },
    locks,
    ...(rider && { rider }),
    ...((Object.keys(cockpit) as (keyof Cockpit)[]).some((k) => (k === 'dims' ? JSON.stringify(cockpit.dims) !== JSON.stringify(DEFAULT_COCKPIT.dims) : cockpit[k] !== DEFAULT_COCKPIT[k])) && { cockpit }),
    ...(p.get('view') === '3d' && { view: '3d' as const }),
  };
}
