import 'server-only';
import { rgb, type PDFPage, type RGB } from 'pdf-lib';
import { LOGO_ASPECT_RATIO, LOGO_SHAPES, LOGO_VIEW_BOX } from './logoArt';

/**
 * Draws the official mark into a PDF as vector geometry.
 *
 * The alternative — rasterising the SVG and embedding a PNG — would need a
 * headless browser or a native image library, and would put a fixed-resolution
 * bitmap on a page people zoom into. Instead the artwork's own path data is
 * handed to pdf-lib, so the logo stays crisp at any size and the file stays
 * small.
 *
 * pdf-lib fills with the nonzero winding rule while the source declares
 * `fill-rule: evenodd`. That difference only matters where one subpath sits
 * inside another — the counters of letters like R and O. Every such pair in
 * this artwork is wound in opposite directions (checked across all 27 nested
 * subpaths), which makes the two rules agree here.
 */

function toRgb(hex: string): RGB {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

// Resolved once: the colour set is fixed and tiny, and this runs per export.
const SHAPES = LOGO_SHAPES.map((shape) => ({ d: shape.d, color: toRgb(shape.fill) }));

export interface DrawnLogo {
  width: number;
  height: number;
}

/**
 * Renders the logo with its top-left corner at (`x`, `top`), in PDF points.
 *
 * Only the height is specified; the width comes from the artwork's own aspect
 * ratio, so the mark can never be stretched.
 */
export function drawXlriLogo(
  page: PDFPage,
  { x, top, height }: { x: number; top: number; height: number },
): DrawnLogo {
  const scale = height / LOGO_VIEW_BOX.height;

  for (const shape of SHAPES) {
    // pdf-lib places the path's own origin at (x, y) and flips the y axis, so
    // `top` is the top edge and the artwork grows downwards from it.
    page.drawSvgPath(shape.d, { x, y: top, scale, color: shape.color });
  }

  return { width: height * LOGO_ASPECT_RATIO, height };
}

/** Brand colours reused by the report furniture, straight from the artwork. */
export const BRAND_PDF_COLOURS = {
  /** #1B4E9B — the shield field. */
  navy: toRgb('#1B4E9B'),
  /** #BCCF17 — the 75-years accent triangle. */
  lime: toRgb('#BCCF17'),
} as const;
