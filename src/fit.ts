import { derived, type Base, type FieldKey } from './geometry';

export const TYPES = ['mtb', 'road', 'gravel', 'commute', 'folding', 'cargo', 'minivelo'] as const;
export type BikeType = (typeof TYPES)[number];
export type Rider = { height: number; inseam?: number }; // cm
type Range = [number, number] | null;

export const REF_HEIGHT = 178;

// Typical size-M ranges (rider 178 cm), in TYPES order, and how many mm each grows per cm of rider height.
export const FIT_RANGES = {
  stack: { k: 3, r: [[615, 640], [540, 580], [580, 610], [600, 650], null, [600, 660], [520, 580]] },
  reach: { k: 1.3, r: [[440, 480], [380, 395], [375, 390], [360, 390], null, [380, 420], [360, 390]] },
  effectiveTopTube: { k: 2, r: [[600, 630], [545, 560], [560, 580], [550, 590], null, [560, 620], [520, 570]] },
  seatTube: { k: 3, r: [[410, 450], [500, 540], [480, 520], [480, 520], null, [420, 500], [420, 500]] },
  wheelbase: { k: 1.5, r: [[1200, 1260], [980, 1000], [1020, 1060], [1050, 1100], [950, 1050], [1250, 1400], [980, 1050]] },
  totalLength: { k: 1.5, r: [[1950, 2050], [1660, 1690], [1730, 1780], [1740, 1800], [1450, 1600], [1800, 2000], [1450, 1550]] },
  frontCenter: { k: 1.5, r: [[760, 820], [580, 600], [610, 640], [620, 660], [550, 650], [600, 700], [560, 640]] },
  standover: { k: 4.7, r: [[730, 790], [780, 820], [780, 820], [700, 800], [450, 600], [650, 750], [650, 750]] },
} satisfies Partial<Record<FieldKey, { k: number; r: Range[] }>>;
export type FitKey = keyof typeof FIT_RANGES;
export const isFitKey = (k: string): k is FitKey => k in FIT_RANGES;

export const inseamMm = (r: Rider) => (r.inseam ?? 0.47 * r.height) * 10;

export function scaledRange(key: FitKey, type: BikeType, height: number): Range {
  const { k, r } = FIT_RANGES[key];
  const base = r[TYPES.indexOf(type)] as Range;
  return base && [base[0] + k * (height - REF_HEIGHT), base[1] + k * (height - REF_HEIGHT)];
}

export function riderFrom(height: number, inseam: number): Rider | undefined {
  if (!(height >= 100 && height <= 230)) return undefined;
  return inseam >= 40 && inseam <= 120 ? { height, inseam } : { height };
}

const ENVELOPE = { stack: 'Stack', reach: 'Reach', effectiveTopTube: 'Эфф. верхняя труба', wheelbase: 'Колёсная база', totalLength: 'Общая длина', frontCenter: 'Front center' } as const;
const mm = Math.round;

export function conflicts(b: Base, rider: Rider): Map<FieldKey, string> {
  const d = derived(b);
  const v = { ...b, ...d };
  const leg = inseamMm(rider);
  const out = new Map<FieldKey, string>();
  const clearance = leg - d.standover;
  if (clearance < 20) out.set('standover', `Зазор над рамой ${mm(clearance)} мм — нужно не меньше 20 мм`);
  const saddle = 0.883 * leg;
  if (b.seatTube > saddle - 70) out.set('seatTube', `Подседельная ${mm(b.seatTube)} мм длиннее допустимой ${mm(saddle - 70)} мм — седло не опустится достаточно низко`);
  else if (saddle - b.seatTube > 330) out.set('seatTube', `Штырь выйдет на ${mm(saddle - b.seatTube)} мм — рама мала для такого роста`);
  for (const key of Object.keys(ENVELOPE) as (keyof typeof ENVELOPE)[]) {
    const ranges = TYPES.map((t) => scaledRange(key, t, rider.height)).filter((r): r is [number, number] => r !== null);
    const lo = Math.min(...ranges.map((r) => r[0]));
    const hi = Math.max(...ranges.map((r) => r[1]));
    const label = `${ENVELOPE[key]} ${mm(v[key])}`;
    if (v[key] < lo) out.set(key, `${label} — меньше любой нормы для роста ${rider.height} см (≥ ${mm(lo)})`);
    else if (v[key] > hi) out.set(key, `${label} — больше любой нормы для роста ${rider.height} см (≤ ${mm(hi)})`);
  }
  return out;
}
