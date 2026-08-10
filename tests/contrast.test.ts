import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrast, checked rather than assumed.
 *
 * Designing two themes by eye reliably produces one that is fine and one with a
 * grey-on-grey label nobody notices until a user reports it. These tests read
 * the real token values out of globals.css, convert them to sRGB and apply the
 * WCAG formula, so both themes are held to the same measured floor and a future
 * palette tweak that dims a label below it fails here.
 *
 * Thresholds are the WCAG 2.1 AA ones: 4.5:1 for body text, 3:1 for large text
 * and for the boundaries of user-interface components (1.4.11).
 */

const CSS = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

/* ---- colour maths -------------------------------------------------------- */

function oklchToLinearRgb(lightness: number, chroma: number, hueDegrees: number): number[] {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

function hexToLinearRgb(hex: string): number[] {
  return [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
}

/**
 * The palette ramps declared in `@theme`, so a semantic token defined as
 * `var(--color-accent-500)` can still be scored. Without this such a token
 * would silently drop out of the map and its assertions would pass on
 * `undefined` — the failure mode this whole file exists to avoid.
 */
const PALETTE: Record<string, string> = Object.fromEntries(
  [...CSS.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
    match[1]!,
    match[2]!.trim(),
  ]),
);

function parseColour(value: string, depth = 0): number[] | null {
  const trimmed = value.trim();

  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(trimmed);
  if (alias && depth < 4) {
    const target = PALETTE[alias[1]!];
    return target ? parseColour(target, depth + 1) : null;
  }

  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(trimmed);
  if (oklch) return oklchToLinearRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return hexToLinearRgb(trimmed);

  // Anything left carries alpha and cannot be scored without knowing what is
  // behind it — overlays and shadows, which are not text.
  return null;
}

function luminance([r, g, b]: number[]): number {
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: number[], background: number[]): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---- token extraction ---------------------------------------------------- */

interface ThemeBlock {
  /** Tokens that resolve to a flat colour, ready to score. */
  colours: Record<string, number[]>;
  /** Every token the block declares, colour or not — for the parity check. */
  declared: string[];
}

/** Reads the token block that starts at `selector`, stopping at its closing brace. */
function tokensIn(selector: string): ThemeBlock {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`No ${selector} block in globals.css`);

  const open = CSS.indexOf('{', start);
  let depth = 1;
  let index = open + 1;
  while (depth > 0 && index < CSS.length) {
    if (CSS[index] === '{') depth += 1;
    else if (CSS[index] === '}') depth -= 1;
    index += 1;
  }

  const block = CSS.slice(open + 1, index - 1);
  const colours: Record<string, number[]> = {};
  const declared: string[] = [];

  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    declared.push(match[1]!);
    const colour = parseColour(match[2]!);
    if (colour) colours[match[1]!] = colour;
  }

  return { colours, declared };
}

// `:root` here is the first one — the light theme block. The `@theme` blocks
// above it declare palette ramps, not semantic tokens, and are skipped because
// the extractor is anchored on these two selectors.
const THEMES = {
  light: tokensIn('\n:root {'),
  dark: tokensIn("[data-theme='dark'] {"),
};

/**
 * Text pairings that must clear 4.5:1.
 *
 * Secondary text belongs here, not in the 3:1 list below. The distinction that
 * matters is not "is this important" but "is this made of words": 1.4.3 applies
 * to any text a reader is expected to read, and a page description, a column
 * label or a placeholder is text however quiet it is meant to look. Scoring
 * those against the 3:1 component floor is exactly how an interface ends up
 * technically passing and visibly faded.
 *
 * Each is measured against the *darkest* surface it can legitimately sit on,
 * not the lightest — a muted colour tuned on white goes thin the moment it
 * lands on a sunken panel or a hovered row.
 */
const BODY_TEXT: Array<[string, string]> = [
  ['--foreground', '--background'],
  ['--foreground', '--surface'],
  ['--foreground', '--surface-raised'],
  ['--foreground', '--surface-sunken'],
  ['--foreground', '--muted'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--surface'],
  ['--muted-foreground', '--surface-raised'],
  ['--muted-foreground', '--surface-sunken'],
  ['--muted-foreground', '--muted'],
  ['--muted-foreground', '--table-row-alt'],
  ['--muted-foreground', '--table-row-hover'],

  // The overline/eyebrow colour: section labels, KPI captions, menu headings.
  ['--subtle-foreground', '--surface'],
  ['--subtle-foreground', '--background'],
  ['--subtle-foreground', '--surface-raised'],
  ['--subtle-foreground', '--surface-sunken'],

  // A placeholder is a readable hint, not decoration.
  ['--input-placeholder', '--input'],

  // Navigation group headings, and the strapline under the mark.
  ['--sidebar-section', '--sidebar'],
  ['--primary-foreground', '--primary'],
  ['--primary', '--surface'],
  ['--primary', '--background'],
  ['--primary-soft-foreground', '--primary-soft'],
  ['--secondary-foreground', '--secondary'],
  ['--success-soft-foreground', '--success-soft'],
  ['--warning-soft-foreground', '--warning-soft'],
  ['--danger-soft-foreground', '--danger-soft'],
  ['--info-soft-foreground', '--info-soft'],
  ['--success-foreground', '--success'],
  ['--warning-foreground', '--warning'],
  ['--danger-foreground', '--danger'],
  ['--info-foreground', '--info'],
  ['--sidebar-foreground', '--sidebar'],
  ['--sidebar-muted', '--sidebar'],
  ['--sidebar-active-foreground', '--sidebar-active'],
  ['--sidebar-foreground', '--sidebar-hover'],
  ['--header-foreground', '--header'],
  ['--table-header-foreground', '--table-header'],
  ['--foreground', '--table-row-alt'],
  ['--foreground', '--table-row-hover'],
  ['--foreground', '--input'],
  ['--accent-foreground', '--accent'],
];

/** Non-text UI boundaries, held to the 1.4.11 floor of 3:1. */
const UI_ELEMENTS: Array<[string, string]> = [
  // `--input-border` is the boundary that identifies *any* control — inputs,
  // selects, secondary buttons, menu triggers, pagination, radio options. It
  // appears on every surface the app has, including dialogs (which sit on
  // `surface-raised`) and the sunken panels inside them.
  ['--input-border', '--background'],
  ['--input-border', '--surface'],
  ['--input-border', '--surface-raised'],
  ['--input-border', '--surface-sunken'],
  ['--input-border', '--input'],
  ['--input-border', '--muted'],
  ['--border-strong', '--surface'],
  ['--border-strong', '--surface-raised'],

  ['--ring', '--background'],
  ['--ring', '--surface'],
  ['--chart-1', '--surface'],
  ['--chart-2', '--surface'],
  ['--chart-3', '--surface'],
  ['--chart-4', '--surface'],
  ['--chart-5', '--surface'],
  ['--sidebar-marker', '--sidebar-active'],
  ['--sidebar-marker', '--sidebar'],
];

/**
 * Dividers, held to a *band* rather than a floor.
 *
 * WCAG says nothing about a rule between two blocks of content, which is why
 * these drifted to 1.3:1 and card edges dissolved into the page. But the
 * opposite failure is just as real: push a divider to 3:1 and every card,
 * table row and menu is boxed in like a spreadsheet. The band is the design
 * constraint written down — present, and quieter than any control outline.
 */
const SEPARATORS: Array<[string, string]> = [
  ['--border', '--surface'],
  ['--border', '--background'],
  ['--border', '--surface-raised'],
  ['--sidebar-border', '--sidebar'],
  ['--header-border', '--header'],
  ['--chart-track', '--surface'],
  ['--skeleton', '--surface'],
];

describe.each(Object.entries(THEMES))('%s theme', (themeName, block) => {
  const tokens = block.colours;

  it('declares every token the other theme declares', () => {
    // Compares declared names, not just the parseable ones: a token that only
    // one theme defines is the bug this catches, and `transparent` or a length
    // is still a token that must exist in both.
    const other = themeName === 'light' ? THEMES.dark : THEMES.light;
    expect([...block.declared].sort()).toEqual([...other.declared].sort());
  });

  it('resolves every token these tests measure', () => {
    // A token that failed to parse would be `undefined`, and an assertion on
    // `undefined` yields NaN — which compares false and so looks like a genuine
    // failure, or worse, passes silently if the comparison is inverted. Catch it
    // here instead.
    const referenced = new Set([...BODY_TEXT, ...UI_ELEMENTS, ...SEPARATORS].flat());
    const unresolved = [...referenced].filter((token) => !Array.isArray(tokens[token]));
    expect(unresolved).toEqual([]);
  });

  it.each(BODY_TEXT)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(tokens[foreground]!, tokens[background]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_ELEMENTS)('%s on %s reaches 3:1', (foreground, background) => {
    expect(contrast(tokens[foreground]!, tokens[background]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(SEPARATORS)('%s on %s is visible but stays quiet', (foreground, background) => {
    const ratio = contrast(tokens[foreground]!, tokens[background]!);
    expect(ratio).toBeGreaterThanOrEqual(1.35);
    expect(ratio).toBeLessThanOrEqual(2.4);
  });

  it('separates the card from the canvas so surfaces are distinguishable', () => {
    // Not a WCAG rule, but a dark theme where every panel is the same value is
    // the usual way "designed properly" fails in practice.
    const separation = Math.abs(
      luminance(tokens['--surface']!) - luminance(tokens['--background']!),
    );
    expect(separation).toBeGreaterThan(0.002);
  });
});
