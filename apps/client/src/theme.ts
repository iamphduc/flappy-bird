// Design tokens for the "Dusk Cabinet" arcade look (direction: see the header of styles/theme.css).
// Plain TS with no DOM, so the canvas code and the tests can read the same values.
// styles/theme.css mirrors every PALETTE key as --color-<kebab-key>; theme.test.ts keeps them in sync.

/** Pixel display font: marquee, headings, buttons, canvas text. */
export const PIXEL_FONT = '"Pixelify Sans", monospace';
/** Longer text (card lines, tables). Same family as PIXEL_FONT, used at weight 400. */
export const BODY_FONT = '"Pixelify Sans", monospace';

export const PALETTE = {
  /** Page background: the dusk-violet cabinet body. */
  bg: '#1d1640',
  /** Panels and the status display. */
  surface: '#2a2160',
  /** Raised or alternate rows inside a surface (table stripes, inputs). */
  surfaceAlt: '#362b78',
  /** Main text: warm arcade white. */
  text: '#fff6e0',
  /** Labels and secondary text. */
  textMuted: '#c3b8ec',
  /** Buttons: the game's pipe green. */
  accent: '#5ec639',
  /** Text on accent buttons. */
  accentText: '#14102e',
  /** Marquee title and big numbers: the bird's yellow. */
  highlight: '#ffd84a',
  /** Error text. */
  danger: '#ff8a94',
  /** :focus-visible ring. Used nowhere else, so it always reads as "focus". */
  focus: '#ff5ce1',
  /** Pixel borders and bezel edges. */
  border: '#7a68d6',
  /** Chart lines and dots: the game's sky cyan. */
  chartLine: '#6fe3f2',
  /** Hard drop shadows and the bezel's inner edge. */
  shadow: '#0e0a24',
  /** See-through dark layer for overlays on top of the game. */
  scrim: 'rgba(14, 10, 36, 0.78)',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** sRGB channel (0-255) to linear light, per WCAG 2.x. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb color: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => linear(parseInt(h, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x contrast ratio of two #rrggbb colors (1 to 21; order does not matter). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum ratio] for every color pair the UI puts together. */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [PaletteKey, PaletteKey, number]> = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surfaceAlt', 4.5],
  ['textMuted', 'bg', 4.5],
  ['textMuted', 'surface', 4.5],
  ['accentText', 'accent', 4.5],
  ['danger', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['highlight', 'bg', 4.5],
  ['highlight', 'surface', 4.5],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['chartLine', 'surface', 3],
  ['border', 'bg', 3],
];
