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
