import './style.css';
import { ANGLE_KEYS, BASE_KEYS, DERIVED_KEYS, RIM_SIZES, field, type FieldKey } from './geometry';
import { HELP, TYPE_LABELS } from './help';
import { render } from './render';
import { solve, type SolveError } from './solver';
import { decode, encode } from './url';

const LABELS: Record<FieldKey, string> = {
  stack: 'Stack, мм',
  reach: 'Reach, мм',
  headAngle: 'Угол рулевой, °',
  seatAngle: 'Угол подседельной, °',
  headTube: 'Длина рулевой, мм',
  chainstay: 'Перья, мм',
  bbDrop: 'BB drop, мм',
  forkOffset: 'Офсет вилки, мм',
  lowerStack: 'Нижний стек, мм',
  seatTube: 'Подседельная, мм',
  rim: 'Обод (BSD), мм',
  tire: 'Ширина шины, мм',
  forkLength: 'Вилка ось–коронка, мм',
  trail: 'Trail, мм',
  wheelbase: 'Колёсная база, мм',
  totalLength: 'Общая длина, мм',
  frontCenter: 'Front center, мм',
  bbHeight: 'Высота каретки, мм',
  effectiveTopTube: 'Эфф. верх. труба, мм',
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
const rows = new Map<FieldKey, { input: HTMLInputElement | HTMLSelectElement; lock: HTMLInputElement; error: HTMLElement }>();

function group(title: string, keys: readonly FieldKey[]) {
  const fs = document.createElement('fieldset');
  fs.innerHTML = `<legend>${title}</legend>`;
  for (const key of keys) {
    const row = document.createElement('div');
    row.className = 'row';
    const help = HELP[key];
    const control = key === 'rim'
      ? `<select id="f-rim" aria-describedby="tip-rim">${RIM_SIZES.map((r) => `<option value="${r.bsd}">${r.label} (${r.bsd})</option>`).join('')}</select>`
      : `<input id="f-${key}" type="number" step="${ANGLE_KEYS.has(key) ? 0.1 : 1}" aria-describedby="tip-${key}">`;
    const typical = (Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => `<li>${TYPE_LABELS[t]}: ${help.typical[t]}</li>`).join('');
    row.innerHTML = `<label for="f-${key}">${LABELS[key]}</label>
      ${control}
      <input type="checkbox" class="lock" title="Закрепить" aria-label="Закрепить: ${LABELS[key]}">
      <p class="error" role="alert"></p>
      <div class="tip" role="tooltip" id="tip-${key}"><b>${help.what}</b>
        <p>↑ Больше: ${help.more}</p><p>↓ Меньше: ${help.less}</p><ul>${typical}</ul></div>`;
    const tip = row.querySelector<HTMLElement>('.tip')!;
    const flip = () => { // measure while shown; open above when there is no room below
      tip.classList.add('measuring');
      tip.classList.toggle('up', row.getBoundingClientRect().bottom + tip.offsetHeight > innerHeight);
      tip.classList.remove('measuring');
    };
    row.querySelector('label')!.addEventListener('mouseenter', flip);
    row.addEventListener('focusin', flip);
    const input = row.querySelector<HTMLInputElement | HTMLSelectElement>('#f-' + key)!;
    const lock = row.querySelector<HTMLInputElement>('.lock')!;
    const error = row.querySelector<HTMLElement>('.error')!;
    rows.set(key, { input, lock, error });
    input.addEventListener('change', () => edit(key, input instanceof HTMLSelectElement ? Number(input.value) : input.valueAsNumber));
    lock.addEventListener('change', () => {
      if (lock.checked) state.locks.add(key);
      else state.locks.delete(key);
      for (const r of rows.values()) r.error.textContent = '';
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
    r.input.value = String(+field(state.base, key).toFixed(1)); // select: rim is always a listed value
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
window.addEventListener('hashchange', () => location.reload());
