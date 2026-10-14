export const BASE_KEYS = ['stack', 'reach', 'headAngle', 'seatAngle', 'headTube', 'chainstay', 'bbDrop', 'forkOffset', 'lowerStack', 'seatTube', 'rim', 'tire'] as const;
export const DERIVED_KEYS = ['forkLength', 'trail', 'wheelbase', 'frontCenter', 'bbHeight', 'effectiveTopTube'] as const;
export type BaseKey = (typeof BASE_KEYS)[number];
export type DerivedKey = (typeof DERIVED_KEYS)[number];
export type FieldKey = BaseKey | DerivedKey;
export type Base = Record<BaseKey, number>;
export type Pt = { x: number; y: number };

// Base params the solver may change; the rest change only by direct input.
export const SOLVABLE: readonly BaseKey[] = ['stack', 'reach', 'headAngle', 'seatAngle', 'headTube', 'chainstay', 'bbDrop', 'forkOffset'];
export const ANGLE_KEYS: ReadonlySet<FieldKey> = new Set<FieldKey>(['headAngle', 'seatAngle']);

export const DEFAULTS: Base = {
  stack: 560, reach: 385, headAngle: 73, seatAngle: 73.5, headTube: 150, chainstay: 410,
  bbDrop: 70, forkOffset: 45, lowerStack: 10, seatTube: 520, rim: 622, tire: 28,
};

// ISO bead seat diameters for common wheel sizes.
export const RIM_SIZES: readonly { bsd: number; label: string }[] = [
  { bsd: 305, label: '16″' },
  { bsd: 406, label: '20″' },
  { bsd: 507, label: '24″' },
  { bsd: 559, label: '26″' },
  { bsd: 584, label: '27,5″ / 650b' },
  { bsd: 622, label: '29″ / 28″ / 700c' },
  { bsd: 686, label: '32″' },
];

export const isBaseKey = (k: string): k is BaseKey => (BASE_KEYS as readonly string[]).includes(k);
export const isFieldKey = (k: string): k is FieldKey => isBaseKey(k) || (DERIVED_KEYS as readonly string[]).includes(k);

const rad = (deg: number) => (deg * Math.PI) / 180;

// Distance along the steering axis from the head tube top to the foot of the perpendicular from the front axle.
function axisToAxle(b: Base): number {
  const a = rad(b.headAngle);
  return (b.stack + b.forkOffset * Math.cos(a) - b.bbDrop) / Math.sin(a);
}

export function points(b: Base) {
  const a = rad(b.headAngle);
  const s = rad(b.seatAngle);
  const u = { x: Math.cos(a), y: -Math.sin(a) }; // down the steering axis
  const along = (d: number): Pt => ({ x: b.reach + d * u.x, y: b.stack + d * u.y });
  const wheelRadius = b.rim / 2 + b.tire;
  const groundY = b.bbDrop - wheelRadius;
  const foot = along(axisToAxle(b));
  return {
    bb: { x: 0, y: 0 },
    htTop: along(0),
    htBottom: along(b.headTube),
    crown: along(b.headTube + b.lowerStack),
    frontAxle: { x: foot.x + b.forkOffset * Math.sin(a), y: b.bbDrop },
    rearAxle: { x: -Math.sqrt(b.chainstay ** 2 - b.bbDrop ** 2), y: b.bbDrop },
    axisGround: along((b.stack - groundY) / Math.sin(a)),
    seatTop: { x: -b.seatTube * Math.cos(s), y: b.seatTube * Math.sin(s) },
    groundY,
    wheelRadius,
  };
}

export function derived(b: Base): Record<DerivedKey, number> {
  const p = points(b);
  return {
    forkLength: axisToAxle(b) - b.headTube - b.lowerStack,
    trail: p.axisGround.x - p.frontAxle.x,
    wheelbase: p.frontAxle.x - p.rearAxle.x,
    frontCenter: p.frontAxle.x,
    bbHeight: p.wheelRadius - b.bbDrop,
    effectiveTopTube: b.reach + b.stack / Math.tan(rad(b.seatAngle)),
  };
}

export const field = (b: Base, k: FieldKey): number => (isBaseKey(k) ? b[k] : derived(b)[k]);

export function isValid(b: Base): boolean {
  if (!BASE_KEYS.every((k) => Number.isFinite(b[k]))) return false;
  if (![b.headAngle, b.seatAngle].every((a) => a > 45 && a <= 90)) return false;
  if (![b.headTube, b.chainstay, b.seatTube, b.rim, b.tire].every((v) => v > 0)) return false;
  if (b.chainstay <= Math.abs(b.bbDrop)) return false;
  const d = derived(b);
  return DERIVED_KEYS.every((k) => Number.isFinite(d[k])) && d.forkLength > 0 && d.bbHeight > 0;
}
