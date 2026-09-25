import { describe, expect, it } from 'vitest';
import { actionFromKey, actionFromPointer } from './input.ts';

describe('actionFromKey', () => {
  it('Space is a flap', () => {
    expect(actionFromKey({ code: 'Space', repeat: false })).toEqual({ type: 'flap', source: 'space' });
  });

  it('key repeat is ignored', () => {
    expect(actionFromKey({ code: 'Space', repeat: true })).toBeNull();
    expect(actionFromKey({ code: 'KeyP', repeat: true })).toBeNull();
  });

  it('P and Escape pause', () => {
    expect(actionFromKey({ code: 'KeyP', repeat: false })).toEqual({ type: 'pause' });
    expect(actionFromKey({ code: 'Escape', repeat: false })).toEqual({ type: 'pause' });
  });

  it('other keys are ignored', () => {
    expect(actionFromKey({ code: 'KeyA', repeat: false })).toBeNull();
    expect(actionFromKey({ code: 'Enter', repeat: false })).toBeNull();
  });
});

describe('actionFromPointer', () => {
  it('pointer type sets flap source', () => {
    expect(actionFromPointer({ pointerType: 'mouse' })).toEqual({ type: 'flap', source: 'click' });
    expect(actionFromPointer({ pointerType: 'touch' })).toEqual({ type: 'flap', source: 'tap' });
    expect(actionFromPointer({ pointerType: 'pen' })).toEqual({ type: 'flap', source: 'tap' });
  });

  it('unknown pointer type falls back to click', () => {
    expect(actionFromPointer({ pointerType: '' })).toEqual({ type: 'flap', source: 'click' });
  });
});
