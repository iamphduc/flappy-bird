import { describe, expect, it } from 'vitest';
import { causeText, formatPercent, formatRatio, formatSeconds } from './format.ts';

describe('format', () => {
  it('formats numbers for the stats screens', () => {
    expect(formatSeconds(622.2)).toBe('0.62');
    expect(formatSeconds(550)).toBe('0.55');
    expect(formatRatio(2 / 7)).toBe('0.29');
    expect(formatRatio(null)).toBe('-');
    expect(formatPercent(0.286)).toBe('29%');
    expect(formatPercent(null)).toBe('-');
  });

  it('death cause text', () => {
    expect(causeText('ground')).toBe('Hit the ground');
    expect(causeText('pipe-top')).toBe('Hit the top pipe');
    expect(causeText('pipe-bottom')).toBe('Hit the bottom pipe');
  });
});
