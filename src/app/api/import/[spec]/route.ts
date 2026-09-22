import { type NextRequest } from 'next/server';
import { errorResponse, jsonResponse } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/currentUser';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { buildTemplate, buildTemplateWorkbook, runImport } from '@/lib/import/runner';
import { readImportUpload } from '@/lib/import/readUpload';
import { getImportSpec } from '@/services/import/specs';
import { contentDisposition } from '@/lib/export/respond';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Max raw upload accepted, before parsing. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * `GET /api/import/students` — a template with the right headers and an
 * example row. `?format=xlsx` returns the same thing as a workbook, which is
 * what most people will fill in.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ spec: string }> }) {
  try {
    const actor = await requireAuth();
    const { spec: key } = await context.params;

    const spec = getImportSpec(key);
    if (!spec) throw new NotFoundError(`Unknown import "${key}"`);
    if (!spec.roles.includes(actor.role)) {
      throw new ForbiddenError('You do not have access to this import');
    }

    const format = request.nextUrl.searchParams.get('format');

    if (format === 'xlsx') {
      const workbook = await buildTemplateWorkbook(spec);

      return new Response(new Uint8Array(workbook), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': contentDisposition(`${key}-import-template.xlsx`, false),
          'Cache-Control': 'no-store',
        },
      });
    }

    const csv = buildTemplate(spec);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': contentDisposition(`${key}-import-template.csv`, false),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * `POST /api/import/students` with `{ csv, dryRun }`.
 *
 * A dry run validates and reports without writing, which is what the preview
 * step uses. The same endpoint then commits with `dryRun: false`, so what is
 * previewed is exactly what runs.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ spec: string }> }) {
  try {
    const actor = await requireAuth();
    const { spec: key } = await context.params;

    const spec = getImportSpec(key);
    if (!spec) throw new NotFoundError(`Unknown import "${key}"`);
    if (!spec.roles.includes(actor.role)) {
      throw new ForbiddenError('You do not have access to this import');
    }

    // Two ways in, one parser. A pasted block arrives as JSON; an uploaded
    // file arrives as multipart, because a spreadsheet is binary and would not
    // survive being stringified.
    let source: string | string[][];
    let dryRun: boolean;

    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');

      if (!(file instanceof File)) {
        throw new ValidationError('Attach a file to import');
      }
      if (file.size === 0) {
        throw new ValidationError('That file is empty');
      }
      if (file.size > MAX_BYTES) {
        throw new ValidationError('That file is too large. Split it into smaller batches.');
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      source = (await readImportUpload(bytes)).grid;
      dryRun = form.get('dryRun') !== 'false';
    } else {
      const body = (await request.json().catch(() => null)) as {
        csv?: unknown;
        dryRun?: unknown;
      } | null;

      const csv = typeof body?.csv === 'string' ? body.csv : '';
      if (csv.trim() === '') {
        throw new ValidationError('Provide rows to import', { csv: 'No content supplied' });
      }
      if (Buffer.byteLength(csv, 'utf8') > MAX_BYTES) {
        throw new ValidationError('That file is too large. Split it into smaller batches.');
      }

      source = csv;
      dryRun = body?.dryRun !== false;
    }

    // Everything the import was started with that is not a column. A spec
    // reads only the keys it knows about, and validates them itself — this is
    // a query string, so it is exactly as trustworthy as one.
    const params: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== 'format') params[key] = value;
    });

    const outcome = await runImport(spec, source, {
      dryRun,
      context: { actorId: actor.userId, params },
    });

    logger.info('Import run', {
      spec: key,
      dryRun,
      totalRows: outcome.totalRows,
      created: outcome.createdRows,
      invalid: outcome.invalidRows,
      failed: outcome.failedRows,
      userId: actor.userId,
    });

    return jsonResponse(outcome);
  } catch (error) {
    return errorResponse(error);
  }
}
