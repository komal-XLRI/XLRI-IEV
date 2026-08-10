/**
 * Derives the embeddable logo assets from the official artwork.
 *
 *   public/xlri-75-logo.svg   (input, kept byte-for-byte as supplied)
 *     -> public/xlri-logo.svg          static SVG used by the app UI
 *     -> src/lib/branding/logoArt.ts   the same markup as a string, plus the
 *                                      per-shape path data the PDF renderer needs
 *
 * Nothing is redrawn, rescaled or recoloured: every `d`/`points` value and the
 * viewBox are copied verbatim. What is removed is only the parts that cannot
 * survive the target medium —
 *
 *   - the CSS entrance animations, which start at `opacity: 0`. A print window
 *     calls `window.print()` on load, so an animated logo would be captured
 *     mid-fade or entirely invisible on paper.
 *   - the two `display:none` seasonal groups (santa, trees, gifts, confetti),
 *     which never render anyway and are not institutional branding.
 *   - the unused `<defs>` filters and mask.
 *
 * Run with: npx tsx --tsconfig tsconfig.scripts.json scripts/build-logo-assets.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'public', 'xlri-75-logo.svg');

/** The five fill classes CorelDRAW emitted, with the official brand colours. */
const FILL_COLOURS: Record<string, string> = {
  fil0: '#1B4E9B', // XLRI blue — shield field and the lower wordmark
  fil1: '#D4EDFC', // pale blue — the interlocking X strokes
  fil2: '#FEFEFE', // white — star, "75" numerals, cut-outs
  fil3: '#9D9E9E', // grey — XLRI wordmark, rule
  fil4: '#BCCF17', // lime — the accent triangle
};

/** Classes that exist only to drive an animation; the fill classes are kept. */
const ANIMATION_CLASSES = new Set([
  'logoEnter',
  'shieldGroup',
  'wordmarkGroup',
  'taglineGroup',
  'dividerGrow',
  'accentPop',
  'revealRect',
  'iconsEnter',
  'introOverlay',
]);

/** Removes `<tag ...id="id"...>…</tag>`, counting nested `<tag>` opens. */
function dropElementById(svg: string, tag: string, id: string): string {
  const openPattern = new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`);
  const start = openPattern.exec(svg);
  if (!start) return svg;

  const scanner = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
  scanner.lastIndex = start.index + start[0].length;

  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(svg)) !== null) {
    if (match[0].startsWith(`</${tag}`)) depth -= 1;
    else if (match[1] !== '/') depth += 1;

    if (depth === 0) {
      return svg.slice(0, start.index) + svg.slice(scanner.lastIndex);
    }
  }

  throw new Error(`Unbalanced <${tag} id="${id}"> in the source SVG`);
}

function stripAnimationClasses(svg: string): string {
  return svg.replace(/class="([^"]*)"/g, (whole, value: string) => {
    const kept = value
      .split(/\s+/)
      .filter((name) => name.length > 0 && !ANIMATION_CLASSES.has(name));

    return kept.length > 0 ? `class="${kept.join(' ')}"` : '';
  });
}

// ---------------------------------------------------------------------------
// 1. Static SVG
// ---------------------------------------------------------------------------

const source = readFileSync(SOURCE, 'utf8');

const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1];
if (!viewBox) throw new Error('Source SVG has no viewBox');

let art = source;
art = art.replace(/<\?xml[^>]*\?>\s*/, '');
art = art.replace(/<!DOCTYPE[^>]*>\s*/, '');
art = art.replace(/<!--[\s\S]*?-->\s*/g, '');
art = art.replace(/<defs>[\s\S]*?<\/defs>\s*/, '');
art = art.replace(/<metadata[^>]*\/>\s*/, '');
art = dropElementById(art, 'g', 'seasonal-bg');
art = dropElementById(art, 'g', 'intro-doodle');
art = stripAnimationClasses(art);
art = art.replace(/\s{2,}/g, ' ').replace(/>\s+</g, '><');

// Re-open with our own root so the static asset carries an accessible name and
// scales to whatever box it is placed in.
const innerStart = art.indexOf('>', art.indexOf('<svg')) + 1;
const inner = art.slice(innerStart, art.lastIndexOf('</svg>'));

const style = Object.entries(FILL_COLOURS)
  .map(([className, colour]) => `.${className}{fill:${colour}}`)
  .join('');

const staticSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="xlri-logo-title" preserveAspectRatio="xMidYMid meet" style="shape-rendering:geometricPrecision;fill-rule:evenodd;clip-rule:evenodd"><title id="xlri-logo-title">XLRI Xavier School of Management — 75 years</title><style>${style}</style>${inner}</svg>`;

writeFileSync(join(ROOT, 'public', 'xlri-logo.svg'), `${staticSvg}\n`, 'utf8');

// ---------------------------------------------------------------------------
// 1b. App icon
// ---------------------------------------------------------------------------
// A favicon has to be square and the mark is 2.4:1, so it is letterboxed on a
// white tile — padded, never cropped, and never squashed to fit.

const [, , sourceWidth, sourceHeight] = viewBox.split(/\s+/).map(Number) as [
  number,
  number,
  number,
  number,
];

const ICON_BOX = 512;
const ICON_PADDING = 44;
const iconScale = (ICON_BOX - ICON_PADDING * 2) / sourceWidth;
const iconOffsetY = (ICON_BOX - sourceHeight * iconScale) / 2;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_BOX} ${ICON_BOX}" role="img" aria-label="XLRI IEV Activity Tracker" style="fill-rule:evenodd;clip-rule:evenodd"><style>${style}</style><rect width="${ICON_BOX}" height="${ICON_BOX}" rx="96" fill="#FFFFFF"/><rect x="8" y="8" width="${ICON_BOX - 16}" height="${ICON_BOX - 16}" rx="88" fill="none" stroke="#1B4E9B" stroke-width="16"/><g transform="translate(${ICON_PADDING} ${iconOffsetY.toFixed(2)}) scale(${iconScale.toFixed(6)})">${inner}</g></svg>`;

writeFileSync(join(ROOT, 'src', 'app', 'icon.svg'), `${iconSvg}\n`, 'utf8');

// ---------------------------------------------------------------------------
// 2. Shape data for the PDF renderer
// ---------------------------------------------------------------------------

/** `"x,y x,y …"` -> `"M x y L x y … Z"`, an exact format change, not a redraw. */
function polygonToPath(points: string): string {
  const numbers = points
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const segments: string[] = [];

  for (let index = 0; index + 1 < numbers.length; index += 2) {
    segments.push(`${index === 0 ? 'M' : 'L'} ${numbers[index]} ${numbers[index + 1]}`);
  }

  return `${segments.join(' ')} Z`;
}

interface Shape {
  fill: string;
  d: string;
}

const shapes: Shape[] = [];
const elementPattern = /<(path|polygon)\b([^>]*)\/>/g;
let element: RegExpExecArray | null;

while ((element = elementPattern.exec(staticSvg)) !== null) {
  const [, tag, attributes] = element;
  const className = /class="([^"]*)"/.exec(attributes ?? '')?.[1]?.trim();
  const colour = className ? FILL_COLOURS[className] : undefined;
  if (!colour) continue;

  if (tag === 'path') {
    const d = /\bd="([^"]+)"/.exec(attributes ?? '')?.[1];
    if (d) shapes.push({ fill: colour, d });
  } else {
    const points = /\bpoints="([^"]+)"/.exec(attributes ?? '')?.[1];
    if (points) shapes.push({ fill: colour, d: polygonToPath(points) });
  }
}

if (shapes.length === 0) throw new Error('No logo shapes were extracted');

const [minX, minY, boxWidth, boxHeight] = viewBox.split(/\s+/).map(Number) as [
  number,
  number,
  number,
  number,
];

const generated = `// Generated by scripts/build-logo-assets.ts — do not edit by hand.
//
// Derived from public/xlri-75-logo.svg. Path data is copied verbatim from the
// official artwork; only the animation layers were removed. See the script for
// why an animated logo cannot be used for print or PDF.

/** The artwork's own coordinate system, so nothing has to be re-measured. */
export const LOGO_VIEW_BOX = {
  minX: ${minX},
  minY: ${minY},
  width: ${boxWidth},
  height: ${boxHeight},
} as const;

export const LOGO_ASPECT_RATIO = ${(boxWidth / boxHeight).toFixed(6)};

export interface LogoShape {
  /** Hex fill, straight from the brand palette. */
  readonly fill: string;
  /** SVG path data in the viewBox coordinate system. */
  readonly d: string;
}

/** Painter's order: later shapes sit on top of earlier ones. */
export const LOGO_SHAPES: readonly LogoShape[] = ${JSON.stringify(shapes, null, 2)};

/** Self-contained static markup, for inlining into standalone HTML documents. */
export const LOGO_SVG = ${JSON.stringify(staticSvg)};
`;

writeFileSync(join(ROOT, 'src', 'lib', 'branding', 'logoArt.ts'), generated, 'utf8');

console.log(
  `xlri-logo.svg: ${staticSvg.length} bytes (from ${source.length}), ${shapes.length} shapes extracted`,
);
