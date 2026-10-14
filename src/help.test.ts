import { describe, expect, it } from 'vitest';
import { HELP, helpHtml } from './help';

describe('helpHtml', () => {
  it('without rider shows size-M ranges from FIT_RANGES', () => {
    const html = helpHtml('stack');
    expect(html).toContain('<li>Шоссе: 540–580</li>');
    expect(html).not.toContain('Для роста');
    expect(HELP.seatTube.typical.folding).toBe('—');
  });
  it('scales height-dependent ranges, estimate note', () => {
    const html = helpHtml('stack', { height: 188 });
    expect(html).toContain('<li>Шоссе: 570–610</li>');
    expect(html).toContain('Для роста 188 см (ноги 88 см, оценка)');
  });
  it('height-independent fields keep their ranges and say so', () => {
    const html = helpHtml('headAngle', { height: 188, inseam: 90 });
    expect(html).toContain('72,5–73,5°');
    expect(html).toContain('Для роста 188 см (ноги 90 см) — от роста не зависит');
  });
  it('puts the conflict first', () => {
    expect(helpHtml('standover', { height: 160 }, 'Зазор над рамой -46 мм')).toMatch(/^<p class="issue">⚠ Зазор над рамой -46 мм<\/p>/);
  });
});
