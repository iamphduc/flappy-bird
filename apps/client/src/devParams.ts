export interface DevParams {
  seed?: number;
  flaps?: number[];
}

const MAX_UINT32 = 0xffffffff;

function parseNonNegativeInt(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

/** Reads `?seed=<uint32>&flaps=<comma list of step numbers>`. Bad values are left out. */
export function parseDevParams(search: string): DevParams {
  const params = new URLSearchParams(search);
  const result: DevParams = {};

  const seed = parseNonNegativeInt(params.get('seed') ?? '');
  if (seed !== null && seed <= MAX_UINT32) result.seed = seed;

  const flapsText = params.get('flaps');
  if (flapsText !== null) {
    const flaps = new Set<number>();
    for (const part of flapsText.split(',')) {
      const step = parseNonNegativeInt(part.trim());
      if (step !== null) flaps.add(step);
    }
    if (flaps.size > 0) result.flaps = [...flaps].sort((a, b) => a - b);
  }

  return result;
}
