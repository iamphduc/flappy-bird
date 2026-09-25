export type FlapSource = 'space' | 'click' | 'tap';

export type Action = { type: 'flap'; source: FlapSource } | { type: 'pause' };

/** Maps a keydown to a game action. Non-game keys give `null` and are never recorded. */
export function actionFromKey({ code, repeat }: { code: string; repeat: boolean }): Action | null {
  if (repeat) return null;
  if (code === 'Space') return { type: 'flap', source: 'space' };
  if (code === 'KeyP' || code === 'Escape') return { type: 'pause' };
  return null;
}

/** Maps a pointerdown to a flap: touch and pen are taps, mouse (or unknown) is a click. */
export function actionFromPointer({ pointerType }: { pointerType: string }): Action {
  const source = pointerType === 'touch' || pointerType === 'pen' ? 'tap' : 'click';
  return { type: 'flap', source };
}
