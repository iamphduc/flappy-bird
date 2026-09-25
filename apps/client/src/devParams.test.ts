import { describe, expect, it } from 'vitest';
import { parseDevParams } from './devParams.ts';

describe('parseDevParams', () => {
  it('parses seed and flaps', () => {
    expect(parseDevParams('?seed=42&flaps=30,10,20,10')).toEqual({ seed: 42, flaps: [10, 20, 30] });
    expect(parseDevParams('?seed=4294967295')).toEqual({ seed: 4294967295 });
    expect(parseDevParams('seed=0&flaps=0')).toEqual({ seed: 0, flaps: [0] });
  });

  it('ignores bad values', () => {
    expect(parseDevParams('')).toEqual({});
    expect(parseDevParams('?seed=-1')).toEqual({});
    expect(parseDevParams('?seed=1.5')).toEqual({});
    expect(parseDevParams('?seed=abc')).toEqual({});
    expect(parseDevParams('?seed=')).toEqual({});
    expect(parseDevParams('?seed=4294967296')).toEqual({});
    expect(parseDevParams('?flaps=5,-3,2.5,x,,1')).toEqual({ flaps: [1, 5] });
    expect(parseDevParams('?flaps=a,b')).toEqual({});
  });
});
