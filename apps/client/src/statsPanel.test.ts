import { describe, expect, it } from 'vitest';
import { splitLine } from './statsPanel.ts';

describe('splitLine', () => {
  it('splits a headline line into label and value that join back to the same text', () => {
    for (const [line, label, value] of [
      ['Games: 3', 'Games:', '3'],
      ['Average score: 1.33', 'Average score:', '1.33'],
      ['Wasted flaps: 12%', 'Wasted flaps:', '12%'],
      ['Deaths: 3 ground, 0 top pipe, 0 bottom pipe', 'Deaths:', '3 ground, 0 top pipe, 0 bottom pipe'],
    ] as const) {
      const parts = splitLine(line);
      expect(parts).toEqual({ label, value });
      expect(`${parts!.label} ${parts!.value}`).toBe(line);
    }
  });

  it('leaves a line with no "label: value" shape alone', () => {
    expect(splitLine('No complete games yet - play a game first')).toBeNull();
    expect(splitLine('Games:')).toBeNull();
    expect(splitLine(': 3')).toBeNull();
  });
});
