import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards against a component class being shadowed by a generated utility.
 *
 * Tailwind emits a `text-<name>` / `bg-<name>` / `border-<name>` utility for
 * every `--color-<name>` in the theme, and it emits `@layer utilities` *after*
 * `@layer components`. So a hand-written `.text-secondary` in the components
 * layer loses to the utility generated from `--color-secondary` — silently, with
 * no build warning and no failing assertion anywhere.
 *
 * That is not hypothetical. The type scale used to be named `.text-secondary`,
 * `.text-caption`, `.text-muted` and so on; `--color-secondary` is the secondary
 * *button fill*, which is pure white in light mode. Every page description,
 * hint, caption and helper line in the application was being painted white on
 * white — and the token-level contrast tests could not see it, because the
 * tokens themselves were all correct. Only what the components resolved to was
 * wrong.
 *
 * The fix was to move the scale into a `type-*` namespace Tailwind does not
 * generate into. This test keeps it there.
 */

const CSS = readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');

/** Utility prefixes Tailwind derives from a `--color-*` theme entry. */
const COLOUR_UTILITY_PREFIXES = [
  'text',
  'bg',
  'border',
  'fill',
  'stroke',
  'ring',
  'outline',
  'divide',
  'accent',
  'caret',
  'decoration',
  'shadow',
  'from',
  'via',
  'to',
];

/** Every colour name the theme exposes, via `@theme` or the `@theme inline` bridge. */
const colourNames = new Set(
  [...CSS.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((match) => match[1]!),
);

/** Every class the stylesheet defines by hand inside `@layer components`. */
function componentClasses(): string[] {
  const start = CSS.indexOf('@layer components');
  expect(start, 'globals.css should declare an @layer components block').toBeGreaterThan(-1);

  const open = CSS.indexOf('{', start);
  let depth = 1;
  let index = open + 1;
  while (depth > 0 && index < CSS.length) {
    if (CSS[index] === '{') depth += 1;
    else if (CSS[index] === '}') depth -= 1;
    index += 1;
  }

  const block = CSS.slice(open + 1, index - 1);
  return [...new Set([...block.matchAll(/^\s*\.([a-z0-9-]+)\s*\{/gm)].map((m) => m[1]!))];
}

describe('component classes cannot be shadowed by generated utilities', () => {
  const classes = componentClasses();

  it('finds the component classes to check', () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuous — the same failure mode this file exists to catch.
    expect(classes.length).toBeGreaterThanOrEqual(8);
    expect(classes).toContain('type-secondary');
  });

  it('exposes colour names to collide with', () => {
    expect(colourNames.size).toBeGreaterThan(50);
    expect(colourNames).toContain('secondary');
    expect(colourNames).toContain('muted');
  });

  it.each(componentClasses())('.%s does not collide with a colour utility', (className) => {
    const collision = COLOUR_UTILITY_PREFIXES.map((prefix) => `${prefix}-`)
      .filter((prefix) => className.startsWith(prefix))
      .map((prefix) => className.slice(prefix.length))
      .find((suffix) => colourNames.has(suffix));

    expect(
      collision,
      `.${className} shares a name with the utility generated from --color-${collision}. ` +
        'Tailwind emits @layer utilities after @layer components, so the generated ' +
        'rule wins and this class silently paints the wrong colour. Rename it out ' +
        'of the utility namespace (the type scale uses `type-*`).',
    ).toBeUndefined();
  });
});

/**
 * The other half of the same guard: nothing may go on *using* the retired
 * names. A stale `text-caption` would simply resolve to nothing (or, worse, to
 * a colour utility if a matching token is ever added).
 */
describe('retired class names are gone from the source', () => {
  const RETIRED = [
    'text-page-title',
    'text-section-title',
    'text-card-title',
    'text-body',
    'text-secondary',
    'text-caption',
    'text-overline',
    'text-muted',
  ];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  const files = sourceFiles(join(__dirname, '..', 'src'));

  it('scans the whole source tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(RETIRED)('no file still uses "%s"', (name) => {
    // Negative lookahead for `-` so `text-muted-foreground` and
    // `text-secondary-foreground` — both real, correct token utilities — pass.
    const pattern = new RegExp(`(?<![-\\w])${name}(?![-\\w])`);
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.replace(/.*[\\/]src[\\/]/, 'src/'))).toEqual([]);
  });
});
