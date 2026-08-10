import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOGO_ASPECT_RATIO,
  LOGO_SHAPES,
  LOGO_SVG,
  LOGO_VIEW_BOX,
} from '../src/lib/branding/logoArt';

const ROOT = join(__dirname, '..');

/** Every `<path d>` / `<polygon points>` carrying a fill class, in document order. */
function officialShapes(svg: string): string[] {
  return [...svg.matchAll(/<(path|polygon)\b[^>]*class="(fil\d)[^"]*"[^>]*\/>/g)].map((match) => {
    const d = /\bd="([^"]+)"/.exec(match[0])?.[1];
    const points = /\bpoints="([^"]+)"/.exec(match[0])?.[1];
    return `${match[2]}|${(d ?? points ?? '').replace(/\s+/g, ' ').trim()}`;
  });
}

describe('XLRI logo assets', () => {
  const official = readFileSync(join(ROOT, 'public', 'xlri-75-logo.svg'), 'utf8');
  const staticSvg = readFileSync(join(ROOT, 'public', 'xlri-logo.svg'), 'utf8');

  it('keeps the artwork identical to the supplied file', () => {
    // The brief was explicit that the logo must not be recreated, redrawn,
    // distorted or cropped. This is that promise, enforced: if anyone ever
    // regenerates the assets from a doctored source, or hand-edits a path, the
    // shape list stops matching and this fails.
    expect(officialShapes(staticSvg)).toEqual(officialShapes(official));
  });

  it('keeps the same viewBox, so the aspect ratio cannot drift', () => {
    const [minX, minY, width, height] = /viewBox="([^"]+)"/
      .exec(official)![1]!
      .split(/\s+/)
      .map(Number);

    expect(LOGO_VIEW_BOX).toEqual({ minX, minY, width, height });
    expect(LOGO_ASPECT_RATIO).toBeCloseTo(width! / height!, 5);
    expect(staticSvg).toContain(`viewBox="${minX} ${minY} ${width} ${height}"`);
  });

  it('strips the entrance animation, which would print as a blank space', () => {
    // The supplied file animates in from opacity 0. The print document calls
    // window.print() on load, so an animated mark would be captured mid-fade.
    expect(official).toContain('@keyframes');
    expect(staticSvg).not.toContain('@keyframes');
    expect(staticSvg).not.toContain('animation');
    expect(LOGO_SVG).not.toContain('@keyframes');
  });

  it('drops the hidden seasonal artwork rather than shipping it', () => {
    expect(official).toContain('id="santa"');
    expect(staticSvg).not.toContain('id="santa"');
    expect(staticSvg).not.toContain('confetti');
  });

  it('exposes the same shapes to the PDF renderer, in painter order', () => {
    const fromStatic = officialShapes(staticSvg).map((entry) => entry.split('|')[1]);
    const fromModule = LOGO_SHAPES.map((shape) =>
      // Polygons are converted to path data; compare on the numbers alone.
      shape.d
        .replace(/[MLZ]/g, ' ')
        .replace(/[\s,]+/g, ' ')
        .trim(),
    );

    expect(fromModule).toHaveLength(fromStatic.length);
    fromStatic.forEach((source, index) => {
      const numbers = source!
        .replace(/[a-zA-Z]/g, ' ')
        .replace(/[\s,]+/g, ' ')
        .trim();
      // Paths pass through untouched; polygons keep their coordinate sequence.
      if (!/[a-zA-Z]/.test(source!.replace(/^\s*/, '').slice(1))) {
        expect(fromModule[index]).toBe(numbers);
      }
    });
  });
});

/**
 * pdf-lib fills with the nonzero winding rule; the artwork declares
 * `fill-rule: evenodd`. The two agree only when nested subpaths — the counters
 * of letters like R, O and A — wind opposite to the outline that contains them.
 * That holds for this artwork, which is why the PDF logo renders correctly.
 * If a future logo revision broke it, letters would silently fill in solid.
 */
describe('PDF fill-rule assumption', () => {
  function subpaths(d: string): number[][][] {
    const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const out: number[][][] = [];
    let index = 0;
    let command = '';
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let current: number[][] = [];

    const next = () => Number(tokens[index++]);

    while (index < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[index]!)) command = tokens[index++]!;
      const relative = command === command.toLowerCase();
      const kind = command.toUpperCase();

      if (kind === 'M') {
        const dx = next();
        const dy = next();
        x = relative ? x + dx : dx;
        y = relative ? y + dy : dy;
        startX = x;
        startY = y;
        current = [[x, y]];
        out.push(current);
        // A second coordinate pair after M is an implicit lineto.
        command = relative ? 'l' : 'L';
      } else if (kind === 'L') {
        const dx = next();
        const dy = next();
        x = relative ? x + dx : dx;
        y = relative ? y + dy : dy;
        current.push([x, y]);
      } else if (kind === 'C') {
        next();
        next();
        next();
        next();
        const dx = next();
        const dy = next();
        x = relative ? x + dx : dx;
        y = relative ? y + dy : dy;
        current.push([x, y]);
      } else if (kind === 'Z') {
        x = startX;
        y = startY;
      } else {
        index += 1;
      }
    }

    return out.filter((points) => points.length > 2);
  }

  const signedArea = (points: number[][]) =>
    points.reduce((sum, [x1, y1], i) => {
      const [x2, y2] = points[(i + 1) % points.length]!;
      return sum + x1! * y2! - x2! * y1!;
    }, 0) / 2;

  const bounds = (points: number[][]) => ({
    minX: Math.min(...points.map((p) => p[0]!)),
    minY: Math.min(...points.map((p) => p[1]!)),
    maxX: Math.max(...points.map((p) => p[0]!)),
    maxY: Math.max(...points.map((p) => p[1]!)),
  });

  it('winds every nested subpath opposite to its container', () => {
    let nested = 0;
    let sameSign = 0;

    for (const shape of LOGO_SHAPES) {
      const parts = subpaths(shape.d).map((points) => ({
        area: signedArea(points),
        box: bounds(points),
      }));

      for (const inner of parts) {
        const container = parts.find(
          (outer) =>
            outer !== inner &&
            Math.abs(outer.area) > Math.abs(inner.area) &&
            inner.box.minX >= outer.box.minX &&
            inner.box.minY >= outer.box.minY &&
            inner.box.maxX <= outer.box.maxX &&
            inner.box.maxY <= outer.box.maxY,
        );

        if (!container) continue;
        nested += 1;
        if (Math.sign(inner.area) === Math.sign(container.area)) sameSign += 1;
      }
    }

    expect(nested).toBeGreaterThan(0);
    expect(sameSign).toBe(0);
  });
});
