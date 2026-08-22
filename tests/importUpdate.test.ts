/**
 * Importing over records that already exist.
 *
 * The counters are not cosmetic: "created 12, updated 3" is how an
 * administrator finds out that a file they thought was new has replaced three
 * records, so the split has to survive the runner rather than being folded
 * into one total.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runImport } from '@/lib/import/runner';
import type { ImportSpec } from '@/lib/import/types';
import { ventureImport } from '@/services/import/specs';

const row = z.object({ name: z.string().min(1) });

/** A spec with no database behind it, so the runner is what is under test. */
function spec(overrides: Partial<ImportSpec<{ name: string }>> = {}): ImportSpec<{ name: string }> {
  return {
    key: 'things',
    title: 'Things',
    description: '',
    roles: ['ADMIN'],
    columns: [{ field: 'name', label: 'Name', required: true, example: 'A' }],
    schema: row,
    commit: async () => {},
    ...overrides,
  };
}

const CSV = 'Name\nAlpha\nBeta\n';

describe('create versus update accounting', () => {
  it('counts a commit that returns nothing as a creation', async () => {
    // Five of the six specs only ever create; making them say so would be
    // ceremony, so returning nothing has to keep meaning "created".
    const outcome = await runImport(spec(), CSV, { dryRun: false });

    expect(outcome.createdRows).toBe(2);
    expect(outcome.updatedRows).toBe(0);
    expect(outcome.results.map((result) => result.status)).toEqual(['created', 'created']);
  });

  it('counts a commit that reports an update separately', async () => {
    const outcome = await runImport(
      spec({ commit: async (parsed) => (parsed.name === 'Alpha' ? 'updated' : 'created') }),
      CSV,
      { dryRun: false },
    );

    expect(outcome.createdRows).toBe(1);
    expect(outcome.updatedRows).toBe(1);
    expect(outcome.results.map((result) => result.status)).toEqual(['updated', 'created']);
  });

  it('still fails one row alone when it throws', async () => {
    const outcome = await runImport(
      spec({
        commit: async (parsed) => {
          if (parsed.name === 'Alpha') throw new Error('nope');
          return 'updated';
        },
      }),
      CSV,
      { dryRun: false },
    );

    expect(outcome.failedRows).toBe(1);
    expect(outcome.updatedRows).toBe(1);
    expect(outcome.createdRows).toBe(0);
  });
});

describe('the dry run', () => {
  it('reports what would be replaced, and writes nothing', async () => {
    let commits = 0;

    const outcome = await runImport(
      spec({
        commit: async () => {
          commits += 1;
        },
        preview: async (parsed) =>
          parsed.name === 'Alpha' ? { action: 'updated', note: 'Will update "Alpha"' } : null,
      }),
      CSV,
      { dryRun: true },
    );

    expect(commits).toBe(0);
    expect(outcome.updatedRows).toBe(1);
    expect(outcome.results[0]!.notes).toEqual(['Will update "Alpha"']);
    expect(outcome.results[1]!.notes).toEqual([]);
  });

  it('falls back to a general note when the spec gives no wording', async () => {
    const outcome = await runImport(spec({ preview: async () => ({ action: 'updated' }) }), CSV, {
      dryRun: true,
    });

    expect(outcome.results[0]!.notes).toEqual(['Will replace an existing record']);
  });

  it('does not let a failing preview sink the row', async () => {
    // A preview is a courtesy. If the lookup breaks, the commit pass is what
    // reports the real problem, against the row it belongs to.
    const outcome = await runImport(
      spec({
        preview: async () => {
          throw new Error('lookup exploded');
        },
      }),
      CSV,
      { dryRun: true },
    );

    expect(outcome.validRows).toBe(2);
    expect(outcome.invalidRows).toBe(0);
    expect(outcome.fileErrors).toEqual([]);
  });
});

describe('venture status on an edit', () => {
  const base = { rollNumber: 'IEV101', ventureName: 'Kirana Connect' };

  it('leaves a blank status undefined so an edit cannot reinstate a paused venture', () => {
    // Defaulting a blank cell to ACTIVE would quietly restart every venture
    // that had been put on hold, which is the opposite of an edit.
    const parsed = ventureImport.schema.parse({ ...base, status: '' });
    expect((parsed as { status?: string }).status).toBeUndefined();
  });

  it('still reads a status that was written down', () => {
    const parsed = ventureImport.schema.parse({ ...base, status: 'On hold' });
    expect((parsed as { status?: string }).status).toBe('ON_HOLD');
  });
});
