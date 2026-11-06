import { derived, points, type Base, type FieldKey } from './geometry';

export type MetricKey = 'trail' | 'wheelbase' | 'stackReach' | 'balance' | 'chainstay' | 'bbHeight' | 'seatAngle';
export type Metric = { key: MetricKey; field: FieldKey; title: string; min: number; max: number; left: string; right: string; value: number; shown: string; why: string };
export type Archetype = { name: string; v: Record<MetricKey, number> };

// Typical size-M values per archetype; the dots on each scale and the "looks like" guess.
export const ARCHETYPES: readonly Archetype[] = [
  { name: 'Road race', v: { trail: 57, wheelbase: 985, stackReach: 1.42, balance: 1.43, chainstay: 408, bbHeight: 268, seatAngle: 73.5 } },
  { name: 'Endurance', v: { trail: 62, wheelbase: 1010, stackReach: 1.53, balance: 1.47, chainstay: 418, bbHeight: 272, seatAngle: 73 } },
  { name: 'Gravel', v: { trail: 68, wheelbase: 1040, stackReach: 1.55, balance: 1.48, chainstay: 425, bbHeight: 280, seatAngle: 73.5 } },
  { name: 'City', v: { trail: 65, wheelbase: 1075, stackReach: 1.72, balance: 1.45, chainstay: 450, bbHeight: 290, seatAngle: 72 } },
  { name: 'XC MTB', v: { trail: 105, wheelbase: 1160, stackReach: 1.36, balance: 1.75, chainstay: 432, bbHeight: 320, seatAngle: 75.5 } },
  { name: 'Trail MTB', v: { trail: 120, wheelbase: 1230, stackReach: 1.33, balance: 1.85, chainstay: 440, bbHeight: 340, seatAngle: 77 } },
];

const rad = (d: number) => (d * Math.PI) / 180;
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

export function metrics(b: Base): Metric[] {
  const d = derived(b);
  const flop = d.trail * Math.sin(rad(b.headAngle)) * Math.cos(rad(b.headAngle));
  const sr = b.stack / b.reach;
  const bal = d.frontCenter / b.chainstay;
  return [
    { key: 'trail', field: 'trail', title: 'Steering', min: 40, max: 140, left: 'Быстрый, острый', right: 'Спокойный, держит курс', value: d.trail, shown: `trail ${fmt(d.trail)} · flop ${fmt(flop, 1)}`, why: 'Trail и flop: чем больше, тем сильнее руль сам возвращается прямо и тем ленивее входит в поворот.' },
    { key: 'wheelbase', field: 'wheelbase', title: 'Stability', min: 950, max: 1300, left: 'Вёрткий', right: 'Устойчивый на скорости', value: d.wheelbase, shown: `wheelbase ${fmt(d.wheelbase)}`, why: 'Длинная база гасит раскачку и держит на скорости, короткая — легче крутится на месте.' },
    { key: 'stackReach', field: 'stack', title: 'Position', min: 1.25, max: 1.85, left: 'Агрессивная, низкая', right: 'Прямая, комфортная', value: sr, shown: `stack/reach ${fmt(sr, 2)}`, why: 'Stack ÷ Reach: низкое значение — длинная и низкая посадка, высокое — короткая и прямая.' },
    { key: 'balance', field: 'frontCenter', title: 'Weight balance', min: 1.3, max: 2.0, left: 'Больше веса на перёд', right: 'Больше веса на зад', value: bal, shown: `front center / chainstay ${fmt(bal, 2)}`, why: 'Чем больше, тем легче поднять перёд, но переднее колесо надо загружать в поворотах.' },
    { key: 'chainstay', field: 'chainstay', title: 'Rear end', min: 395, max: 465, left: 'Игривый', right: 'Цепкий в подъём', value: b.chainstay, shown: `chainstay ${fmt(b.chainstay)}`, why: 'Короткие перья — легко поднять перёд и развернуть зад; длинные — тяга в подъёмах и место под груз.' },
    { key: 'bbHeight', field: 'bbHeight', title: 'Cornering', min: 250, max: 350, left: 'Низкий, «в велосипеде»', right: 'Клиренс над препятствиями', value: d.bbHeight, shown: `BB height ${fmt(d.bbHeight)}`, why: 'Низкая каретка стабильнее в поворотах, высокая реже цепляет педалями камни.' },
    { key: 'seatAngle', field: 'seatAngle', title: 'Pedaling', min: 70, max: 78, left: 'Расслабленно, назад', right: 'Над кареткой, в подъём', value: b.seatAngle, shown: `seat angle ${fmt(b.seatAngle, 1)}°`, why: 'Крутой угол ставит райдера над кареткой — удобнее крутить в гору.' },
  ];
}

/** Position on the metric's scale, clamped to 0..1. */
export const scalePos = (m: Pick<Metric, 'min' | 'max'>, v: number) => Math.min(1, Math.max(0, (v - m.min) / (m.max - m.min)));

/** Archetypes sorted by distance on the normalised scales, closest first. */
export function nearest(ms: Metric[]): Archetype[] {
  const dist = (a: Archetype) => Math.hypot(...ms.map((m) => scalePos(m, m.value) - scalePos(m, a.v[m.key])));
  return [...ARCHETYPES].sort((x, y) => dist(x) - dist(y));
}

// shortcut: toe = 172.5 mm crank + ~90 mm shoe ahead of the pedal axle, wheel straight; real overlap depends on shoe and steer angle.
export function toeClearance(b: Base): number {
  const p = points(b);
  return p.frontAxle.x - p.frontRadius - 172.5 - 90;
}
