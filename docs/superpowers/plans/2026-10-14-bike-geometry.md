# Конструктор геометрии велосипеда — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Браузерный конструктор геометрии одной рамы: правка любого поля, замки, числовой решатель, SVG-чертёж, состояние в URL.

**Architecture:** Чистые функции `geometry` (базовый вектор → точки и производные) и `solver` (Гаусс–Ньютон с минимальной нормой по свободным базовым параметрам). `url` сериализует состояние в hash. `render` рисует SVG, а `main` связывает DOM полей со всем остальным. UI-фреймворка нет.

**Tech Stack:** Vite 8, TypeScript 7 (strict), Vitest 5, Node 22. Только dev-зависимости.

**Spec:** `docs/superpowers/specs/2026-10-14-bike-geometry-design.md`

## Global Constraints

- Ветка `rewrite`; все коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Единицы: только мм и градусы. Система координат: BB в (0,0), x вперёд, y вверх.
- Runtime-зависимостей нет: `npm install -D` только для `vite`, `typescript`, `vitest`.
- Точность решателя: `max|g| < 1e-6`, не больше 30 итераций, численный якобиан с h = 1e-4 в масштабированных единицах (угол ×10).
- Тексты интерфейса на русском.
- Старые `index.html`, `script.js` и `styles.css` удаляются. Paper.js не используется.
- Команда тестов: `npm test` (= `vitest run`).

## Review Focus

1. Нечисловой или пустой ввод в поле → под полем «Введите число», значение откатывается, состояние не меняется (Task 4, ручной шаг 6).
2. Закреплено производное поле (wheelbase), правится базовое, от которого оно зависит (reach) → закреплённое значение сохраняется (Task 2, тест `locked wheelbase survives reach edit`).
3. Правится базовый параметр, который решатель не трогает (rim), при закреплённом производном (trail) → подстраиваются свободные параметры (Task 2, тест `non-solvable edit keeps locked trail`).
4. Битый или частичный hash → валидные ключи применяются, мусор игнорируется; если итог невалиден — дефолты целиком (Task 3, тесты `garbage`, `invalid geometry`).
5. Правка, дающая физически невозможную раму (HTA 95°, отрицательная длина вилки) → ошибка `invalid`, состояние не меняется (Task 2, тесты `invalid …`; Task 4, ручной шаг 7).

---

### Task 1: Каркас проекта + `geometry`

**Files:**
- Delete: `index.html`, `script.js`, `styles.css`
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/geometry.ts`
- Test: `src/geometry.test.ts`

**Interfaces:**
- Consumes: —
- Produces (`src/geometry.ts`):
  - `BASE_KEYS`, `DERIVED_KEYS` (readonly tuples), типы `BaseKey`, `DerivedKey`, `FieldKey = BaseKey | DerivedKey`, `Base = Record<BaseKey, number>`, `Pt = {x:number;y:number}`
  - `SOLVABLE: readonly BaseKey[]`, `ANGLE_KEYS: ReadonlySet<FieldKey>`, `DEFAULTS: Base`
  - `isBaseKey(k: string): k is BaseKey`, `isFieldKey(k: string): k is FieldKey`
  - `points(b: Base): { bb, htTop, htBottom, crown, frontAxle, rearAxle, axisGround, seatTop: Pt; groundY: number; wheelRadius: number }`
  - `derived(b: Base): Record<DerivedKey, number>`
  - `field(b: Base, k: FieldKey): number`
  - `isValid(b: Base): boolean`

- [ ] **Step 1: Каркас**

```bash
git rm -q index.html script.js styles.css
npm init -y >/dev/null
npm install -D vite typescript vitest
mkdir -p src
```

В `package.json` замени `"scripts"` на:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "test": "vitest run"
},
```

и добавь `"type": "module"` и `"private": true`.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`.gitignore`:

```
node_modules
dist
```

- [ ] **Step 2: Пишем падающие тесты** — `src/geometry.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULTS, derived, field, isValid, points, type Base } from './geometry';

const rad = (d: number) => (d * Math.PI) / 180;

describe('derived', () => {
  it('matches the hand calculation for defaults', () => {
    const d = derived(DEFAULTS);
    expect(d.forkLength).toBeCloseTo(366.147, 2);
    expect(d.trail).toBeCloseTo(56.587, 2);
    expect(d.wheelbase).toBeCloseTo(985.844, 2);
    expect(d.frontCenter).toBeCloseTo(581.864, 2);
    expect(d.bbHeight).toBeCloseTo(269, 6);
    expect(d.effectiveTopTube).toBeCloseTo(550.880, 2);
  });

  it('agrees with the textbook trail formula', () => {
    const b: Base = { ...DEFAULTS, headAngle: 71, forkOffset: 50 };
    const R = b.rim / 2 + b.tire;
    const a = rad(71);
    expect(derived(b).trail).toBeCloseTo((R * Math.cos(a) - 50) / Math.sin(a), 9);
  });

  it('vertical head tube gives trail = -offset', () => {
    const b: Base = { ...DEFAULTS, headAngle: 90 };
    expect(derived(b).trail).toBeCloseTo(-45, 9);
    expect(isValid(b)).toBe(true);
  });

  it('crown-to-axle distance is hypot(forkLength, offset)', () => {
    const p = points(DEFAULTS);
    const dist = Math.hypot(p.frontAxle.x - p.crown.x, p.frontAxle.y - p.crown.y);
    expect(dist).toBeCloseTo(Math.hypot(derived(DEFAULTS).forkLength, DEFAULTS.forkOffset), 9);
  });

  it('rear axle is chainstay away from BB at bbDrop height', () => {
    const p = points(DEFAULTS);
    expect(Math.hypot(p.rearAxle.x, p.rearAxle.y)).toBeCloseTo(410, 9);
    expect(p.rearAxle.y).toBe(70);
    expect(p.htTop).toEqual({ x: 385, y: 560 });
  });
});

describe('field', () => {
  it('reads base and derived values', () => {
    expect(field(DEFAULTS, 'stack')).toBe(560);
    expect(field(DEFAULTS, 'trail')).toBe(derived(DEFAULTS).trail);
  });
});

describe('isValid', () => {
  it('accepts defaults', () => expect(isValid(DEFAULTS)).toBe(true));
  it.each<[string, Partial<Base>]>([
    ['head angle at 45', { headAngle: 45 }],
    ['head angle above 90', { headAngle: 91 }],
    ['seat angle above 90', { seatAngle: 90.5 }],
    ['chainstay shorter than bb drop', { chainstay: 60 }],
    ['zero tire', { tire: 0 }],
    ['NaN stack', { stack: NaN }],
    ['negative fork length', { stack: 200 }],
    ['bb below ground', { bbDrop: 400 }],
  ])('rejects %s', (_, patch) => expect(isValid({ ...DEFAULTS, ...patch })).toBe(false));
});
```

- [ ] **Step 3: Запускаем — убеждаемся, что падает**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./geometry"`.

- [ ] **Step 4: Минимальная реализация** — `src/geometry.ts`

```ts
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
```

- [ ] **Step 5: Запускаем — зелёное**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, все тесты `geometry.test.ts` зелёные, tsc без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add -A
git commit -m "feat: project scaffold and frame geometry model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `solver`

**Files:**
- Create: `src/solver.ts`
- Test: `src/solver.test.ts`

**Interfaces:**
- Consumes: из `./geometry` — `ANGLE_KEYS`, `DERIVED_KEYS`, `SOLVABLE`, `field`, `isBaseKey`, `isValid`, типы `Base`, `BaseKey`, `FieldKey`.
- Produces (`src/solver.ts`):
  - `type SolveError = 'overconstrained' | 'unreachable' | 'invalid'`
  - `type SolveResult = { ok: true; base: Base } | { ok: false; error: SolveError }`
  - `solve(base: Base, edit: { key: FieldKey; value: number }, locks: ReadonlySet<FieldKey>): SolveResult` — входной `base` не мутирует.
  - `solveLinear(A: number[][], rhs: number[]): number[] | null`

- [ ] **Step 1: Пишем падающие тесты** — `src/solver.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULTS, SOLVABLE, derived, type Base, type FieldKey } from './geometry';
import { solve, solveLinear, type SolveResult } from './solver';

const locks = (...k: FieldKey[]) => new Set<FieldKey>(k);
const ok = (r: SolveResult): Base => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.base;
};
const T0 = derived(DEFAULTS);

describe('solveLinear', () => {
  it('solves a 2x2 system', () => {
    const x = solveLinear([[2, 1], [1, 3]], [3, 5])!;
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });
  it('returns null for a singular matrix', () => {
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });
});

describe('solve', () => {
  it('base edit without locks changes only that field', () => {
    expect(ok(solve(DEFAULTS, { key: 'reach', value: 400 }, locks()))).toEqual({ ...DEFAULTS, reach: 400 });
  });

  it('derived edit reaches the target, unrelated params stay', () => {
    const b = ok(solve(DEFAULTS, { key: 'trail', value: 60 }, locks()));
    expect(derived(b).trail).toBeCloseTo(60, 6);
    expect(b.stack).toBeCloseTo(560, 6);
    expect(b.reach).toBeCloseTo(385, 6);
    expect(b.seatAngle).toBeCloseTo(73.5, 6);
  });

  it('locked trail survives head angle edit; offset compensates', () => {
    const b = ok(solve(DEFAULTS, { key: 'headAngle', value: 72 }, locks('trail')));
    const a = (72 * Math.PI) / 180;
    expect(b.headAngle).toBe(72);
    expect(derived(b).trail).toBeCloseTo(T0.trail, 6);
    expect(b.forkOffset).toBeCloseTo(339 * Math.cos(a) - T0.trail * Math.sin(a), 4);
  });

  it('locked wheelbase survives reach edit', () => {
    const b = ok(solve(DEFAULTS, { key: 'reach', value: 400 }, locks('wheelbase')));
    expect(b.reach).toBe(400);
    expect(derived(b).wheelbase).toBeCloseTo(T0.wheelbase, 6);
  });

  it('non-solvable edit keeps locked trail', () => {
    const b = ok(solve(DEFAULTS, { key: 'rim', value: 584 }, locks('trail')));
    expect(b.rim).toBe(584);
    expect(derived(b).trail).toBeCloseTo(T0.trail, 6);
    expect(b.forkOffset).not.toBeCloseTo(45, 1);
  });

  it('overconstrained when every solvable param is locked', () => {
    expect(solve(DEFAULTS, { key: 'trail', value: 60 }, new Set(SOLVABLE))).toEqual({ ok: false, error: 'overconstrained' });
  });

  it('unreachable when only chainstay is free and wheelbase < frontCenter', () => {
    const l = new Set<FieldKey>(SOLVABLE.filter((k) => k !== 'chainstay'));
    expect(solve(DEFAULTS, { key: 'wheelbase', value: 500 }, l)).toEqual({ ok: false, error: 'unreachable' });
  });

  it('invalid for an impossible head angle', () => {
    expect(solve(DEFAULTS, { key: 'headAngle', value: 95 }, locks())).toEqual({ ok: false, error: 'invalid' });
  });

  it('invalid for a negative fork length target', () => {
    expect(solve(DEFAULTS, { key: 'forkLength', value: -50 }, locks('trail'))).toEqual({ ok: false, error: 'invalid' });
  });

  it('does not mutate the input', () => {
    const before = { ...DEFAULTS };
    solve(DEFAULTS, { key: 'trail', value: 60 }, locks('wheelbase'));
    expect(DEFAULTS).toEqual(before);
  });

  it('solves well under 50 ms', () => {
    const t = performance.now();
    solve(DEFAULTS, { key: 'trail', value: 60 }, locks('wheelbase', 'stack'));
    expect(performance.now() - t).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Запускаем — убеждаемся, что падает**

Run: `npx vitest run src/solver.test.ts`
Expected: FAIL — `Failed to resolve import "./solver"`.

- [ ] **Step 3: Минимальная реализация** — `src/solver.ts`

```ts
import { ANGLE_KEYS, DERIVED_KEYS, SOLVABLE, field, isBaseKey, isValid, type Base, type BaseKey, type FieldKey } from './geometry';

export type SolveError = 'overconstrained' | 'unreachable' | 'invalid';
export type SolveResult = { ok: true; base: Base } | { ok: false; error: SolveError };

const H = 1e-4;
// Solver works in scaled units so a min-norm step treats 1° like 10 mm.
const scale = (k: BaseKey) => (ANGLE_KEYS.has(k) ? 10 : 1);

export function solve(base: Base, edit: { key: FieldKey; value: number }, locks: ReadonlySet<FieldKey>): SolveResult {
  let b: Base = { ...base };
  if (isBaseKey(edit.key)) b[edit.key] = edit.value;
  const vars = SOLVABLE.filter((k) => k !== edit.key && !locks.has(k));
  const targets: [FieldKey, number][] = DERIVED_KEYS.filter((k) => k !== edit.key && locks.has(k)).map((k) => [k, field(base, k)]);
  if (!isBaseKey(edit.key)) targets.push([edit.key, edit.value]);
  if (targets.length > vars.length) return { ok: false, error: 'overconstrained' };

  const residual = (x: Base) => targets.map(([k, v]) => field(x, k) - v);
  for (let iter = 0; iter < 30; iter++) {
    const r = residual(b);
    if (!r.every(Number.isFinite)) return { ok: false, error: 'unreachable' };
    if (r.every((v) => Math.abs(v) < 1e-6)) return isValid(b) ? { ok: true, base: b } : { ok: false, error: 'invalid' };
    const J = r.map(() => vars.map(() => 0));
    vars.forEach((k, j) => {
      const dv = H / scale(k);
      const up = residual({ ...b, [k]: b[k] + dv });
      const down = residual({ ...b, [k]: b[k] - dv });
      r.forEach((_, i) => (J[i][j] = (up[i] - down[i]) / (2 * H)));
    });
    // Min-norm Gauss-Newton step: dx = Jᵀ (J Jᵀ)⁻¹ (−r)
    const JJt = J.map((ri) => J.map((rj) => ri.reduce((s, v, k) => s + v * rj[k], 0)));
    const y = solveLinear(JJt, r.map((v) => -v));
    if (!y) return { ok: false, error: 'overconstrained' };
    const next = { ...b };
    vars.forEach((k, j) => (next[k] += J.reduce((s, row, i) => s + row[j] * y[i], 0) / scale(k)));
    b = next;
  }
  return { ok: false, error: 'unreachable' };
}

// Gaussian elimination with partial pivoting; null when the matrix is singular.
export function solveLinear(A: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const M = A.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-12)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
```

- [ ] **Step 4: Запускаем — зелёное**

Run: `npm test && npx tsc --noEmit`
Expected: PASS (geometry + solver), tsc без ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/solver.ts src/solver.test.ts
git commit -m "feat: min-norm Gauss-Newton solver with field locks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `url`

**Files:**
- Create: `src/url.ts`
- Test: `src/url.test.ts`

**Interfaces:**
- Consumes: из `./geometry` — `BASE_KEYS`, `DEFAULTS`, `isFieldKey`, `isValid`, типы `Base`, `FieldKey`.
- Produces (`src/url.ts`):
  - `type State = { base: Base; locks: Set<FieldKey> }`
  - `encode(s: State): string` — строка, начинающаяся с `#`
  - `decode(hash: string): State`

- [ ] **Step 1: Пишем падающие тесты** — `src/url.test.ts`

```ts
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
});
```

- [ ] **Step 2: Запускаем — убеждаемся, что падает**

Run: `npx vitest run src/url.test.ts`
Expected: FAIL — `Failed to resolve import "./url"`.

- [ ] **Step 3: Минимальная реализация** — `src/url.ts`

```ts
import { BASE_KEYS, DEFAULTS, isFieldKey, isValid, type Base, type FieldKey } from './geometry';

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
    if (Number.isFinite(v)) base[k] = v;
  }
  const locks = new Set((p.get('lock') ?? '').split(',').filter(isFieldKey));
  return { base: isValid(base) ? base : { ...DEFAULTS }, locks };
}
```

- [ ] **Step 4: Запускаем — зелёное**

Run: `npm test && npx tsc --noEmit`
Expected: PASS (geometry + solver + url), tsc без ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/url.ts src/url.test.ts
git commit -m "feat: encode/decode state in URL hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Чертёж и UI (`render`, `main`, `index.html`, `style.css`)

Юнит-тестов нет (по спеке). Проверка ручная во встроенном браузере, шаги ниже обязательны.

**Files:**
- Create: `index.html`, `src/style.css`, `src/render.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `points`, `BASE_KEYS`, `DERIVED_KEYS`, `ANGLE_KEYS`, `field`, `FieldKey`, `Base`, `Pt` из `./geometry`; `solve`, `SolveError` из `./solver`; `decode`, `encode` из `./url`.
- Produces: `render(svg: SVGSVGElement, b: Base): void` в `src/render.ts`; рабочая страница.

- [ ] **Step 1: `index.html`** (в корне)

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Геометрия велосипеда</title>
  </head>
  <body>
    <main class="app">
      <form id="fields" class="fields"></form>
      <svg id="drawing" class="drawing" role="img" aria-label="Чертёж рамы сбоку"></svg>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/render.ts`**

```ts
import { points, type Base, type Pt } from './geometry';

const PAD = 40;
const f = (n: number) => n.toFixed(1);
// SVG y grows downward; geometry y grows upward.
const line = (a: Pt, b: Pt, cls: string) => `<line class="${cls}" x1="${f(a.x)}" y1="${f(-a.y)}" x2="${f(b.x)}" y2="${f(-b.y)}"/>`;

export function render(svg: SVGSVGElement, b: Base): void {
  const p = points(b);
  const R = p.wheelRadius;
  const minX = p.rearAxle.x - R - PAD;
  const maxX = Math.max(p.frontAxle.x + R, p.axisGround.x) + PAD;
  const top = Math.max(p.htTop.y, p.seatTop.y, p.frontAxle.y + R) + PAD;
  const bottom = p.groundY - PAD;
  svg.setAttribute('viewBox', `${f(minX)} ${f(-top)} ${f(maxX - minX)} ${f(top - bottom)}`);
  const ground = (x: number): Pt => ({ x, y: p.groundY });
  const wheel = (c: Pt) => `<circle class="wheel" cx="${f(c.x)}" cy="${f(-c.y)}" r="${f(R)}"/>`;
  svg.innerHTML = [
    line(ground(minX), ground(maxX), 'ground'),
    wheel(p.rearAxle),
    wheel(p.frontAxle),
    line(p.htTop, p.axisGround, 'axis'),
    line(p.axisGround, ground(p.frontAxle.x), 'trail'),
    line(p.rearAxle, p.bb, 'tube'),
    line(p.rearAxle, p.seatTop, 'tube'),
    line(p.bb, p.seatTop, 'tube'),
    line(p.seatTop, p.htTop, 'tube'),
    line(p.bb, p.htBottom, 'tube'),
    line(p.htTop, p.htBottom, 'tube'),
    line(p.htBottom, p.crown, 'fork'),
    line(p.crown, p.frontAxle, 'fork'),
  ].join('');
}
```

- [ ] **Step 3: `src/main.ts`**

```ts
import './style.css';
import { ANGLE_KEYS, BASE_KEYS, DERIVED_KEYS, field, type FieldKey } from './geometry';
import { render } from './render';
import { solve, type SolveError } from './solver';
import { decode, encode } from './url';

const LABELS: Record<FieldKey, string> = {
  stack: 'Stack, мм',
  reach: 'Reach, мм',
  headAngle: 'Угол рулевой, °',
  seatAngle: 'Угол подседельной (эфф.), °',
  headTube: 'Длина рулевой, мм',
  chainstay: 'Перья, мм',
  bbDrop: 'BB drop, мм',
  forkOffset: 'Офсет вилки, мм',
  lowerStack: 'Нижний стек колонки, мм',
  seatTube: 'Подседельная, мм',
  rim: 'Обод (BSD), мм',
  tire: 'Шина, мм',
  forkLength: 'Вилка ось–коронка, мм',
  trail: 'Trail, мм',
  wheelbase: 'Колёсная база, мм',
  frontCenter: 'Front center, мм',
  bbHeight: 'Высота каретки, мм',
  effectiveTopTube: 'Эфф. верхняя труба, мм',
};

const ERRORS: Record<SolveError | 'nan', string> = {
  overconstrained: 'Слишком много замков — нечем подстроиться',
  unreachable: 'Недостижимо при текущих замках',
  invalid: 'Получается невозможная геометрия',
  nan: 'Введите число',
};

const state = decode(location.hash);
const form = document.querySelector<HTMLFormElement>('#fields')!;
const svg = document.querySelector<SVGSVGElement>('#drawing')!;
const rows = new Map<FieldKey, { input: HTMLInputElement; lock: HTMLInputElement; error: HTMLElement }>();

function group(title: string, keys: readonly FieldKey[]) {
  const fs = document.createElement('fieldset');
  fs.innerHTML = `<legend>${title}</legend>`;
  for (const key of keys) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label for="f-${key}">${LABELS[key]}</label>
      <input id="f-${key}" type="number" step="${ANGLE_KEYS.has(key) ? 0.1 : 1}">
      <input type="checkbox" class="lock" title="Закрепить" aria-label="Закрепить: ${LABELS[key]}">
      <p class="error" role="alert"></p>`;
    const [input, lock] = row.querySelectorAll('input');
    const error = row.querySelector<HTMLElement>('.error')!;
    rows.set(key, { input, lock, error });
    input.addEventListener('change', () => edit(key, input.valueAsNumber));
    lock.addEventListener('change', () => {
      if (lock.checked) state.locks.add(key);
      else state.locks.delete(key);
      update();
    });
    fs.append(row);
  }
  form.append(fs);
}

function edit(key: FieldKey, value: number) {
  const result = Number.isFinite(value) ? solve(state.base, { key, value }, state.locks) : ({ ok: false, error: 'nan' } as const);
  for (const r of rows.values()) r.error.textContent = '';
  if (result.ok) state.base = result.base;
  else rows.get(key)!.error.textContent = ERRORS[result.error];
  update(); // also reverts the input on error
}

function update() {
  for (const [key, r] of rows) {
    r.input.value = String(+field(state.base, key).toFixed(1));
    r.input.disabled = state.locks.has(key);
    r.lock.checked = state.locks.has(key);
  }
  render(svg, state.base);
  history.replaceState(null, '', encode(state));
}

group('Базовые', BASE_KEYS);
group('Производные', DERIVED_KEYS);
form.addEventListener('submit', (e) => e.preventDefault());
update();
```

- [ ] **Step 4: `src/style.css`**

```css
:root {
  --bg: #f6f7f9;
  --panel: #ffffff;
  --ink: #1d2330;
  --ink-2: #6b7385;
  --line: #d9dde5;
  --frame: #2b5fd9;
  --accent: #e0662b;
  --danger: #c62828;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #12151b;
    --panel: #1b2029;
    --ink: #e6e9ef;
    --ink-2: #9aa3b5;
    --line: #2e3542;
    --frame: #6e9bff;
    --accent: #ff8a50;
    --danger: #ff6b6b;
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
  --bg: #12151b;
  --panel: #1b2029;
  --ink: #e6e9ef;
  --ink-2: #9aa3b5;
  --line: #2e3542;
  --frame: #6e9bff;
  --accent: #ff8a50;
  --danger: #ff6b6b;
  color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
.app { display: grid; grid-template-columns: 340px 1fr; gap: 16px; padding: 16px; min-height: 100vh; align-items: start; }
.fields { display: grid; gap: 12px; }
fieldset { margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
legend { font-weight: 600; padding: 0 4px; }
.row { display: grid; grid-template-columns: 1fr 96px auto; gap: 4px 8px; align-items: center; padding: 3px 0; }
.row input[type='number'] { width: 100%; padding: 4px 6px; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; }
.row input:disabled { opacity: 0.6; }
.error { grid-column: 1 / -1; margin: 0; color: var(--danger); font-size: 12px; }
.error:empty { display: none; }
.drawing { position: sticky; top: 16px; width: 100%; max-height: calc(100vh - 32px); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.drawing line { stroke-linecap: round; }
.tube { stroke: var(--frame); stroke-width: 8; }
.fork { stroke: var(--frame); stroke-width: 6; }
.wheel { fill: none; stroke: var(--ink-2); stroke-width: 4; }
.ground { stroke: var(--ink-2); stroke-width: 2; }
.axis { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 12 8; }
.trail { stroke: var(--accent); stroke-width: 6; }
@media (max-width: 760px) {
  .app { grid-template-columns: 1fr; }
  .drawing { position: static; order: -1; }
}
```

- [ ] **Step 5: Сборка и тесты**

Run: `npm test && npm run build`
Expected: все тесты PASS, `tsc --noEmit` без ошибок, `vite build` создаёт `dist/`.

- [ ] **Step 6: Ручная проверка — ввод и ошибки** (`npm run dev`, открыть во встроенном браузере)

1. Видно 12 базовых и 6 производных полей и чертёж (два колеса, рама, вилка, пунктир оси руления, оранжевый отрезок trail).
2. Reach 385 → 400: меняются reach, wheelbase, front center, ETT, чертёж сдвигается; URL-hash содержит `reach=400`.
3. Trail → 60: значение 60, угол рулевой и офсет изменились.
4. Закрепить trail (поле disabled), угол рулевой 73 → 71: trail остаётся прежним, офсет вырос.
5. Закрепить все 8 решаемых базовых и править производное → «Слишком много замков…» под полем.
6. Очистить любое незакреплённое поле и нажать Enter → «Введите число», значение вернулось.
7. Угол рулевой = 95 → «Получается невозможная геометрия», ничего не изменилось.
8. Перезагрузить страницу: значения и замки те же.
9. Тёмная тема (colorScheme dark) и ширина 375px: всё читаемо, горизонтального скролла нет.

- [ ] **Step 7: Коммит**

```bash
git add index.html src/main.ts src/render.ts src/style.css
git commit -m "feat: SVG drawing and field editor UI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
