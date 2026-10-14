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
  for (let iter = 0; iter <= 30; iter++) {
    const r = residual(b);
    if (!r.every(Number.isFinite)) return { ok: false, error: 'unreachable' };
    if (r.every((v) => Math.abs(v) < 1e-9)) return isValid(b) ? { ok: true, base: b } : { ok: false, error: 'invalid' };
    if (iter === 30) break; // final pass only checks the last step
    const J = r.map(() => vars.map(() => 0));
    vars.forEach((k, j) => {
      const dv = H / scale(k);
      const up = residual({ ...b, [k]: b[k] + dv });
      const down = residual({ ...b, [k]: b[k] - dv });
      r.forEach((_, i) => {
        const d = (up[i] - down[i]) / (2 * H);
        J[i][j] = Math.abs(d) < 1e-7 ? 0 : d; // drop central-difference noise
      });
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
