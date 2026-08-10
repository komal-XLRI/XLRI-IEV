import { type NextRequest } from 'next/server';
import { errorResponse, jsonResponse } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/currentUser';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { buildTemplate, runImport } from '@/lib/import/runner';
import { getImportSpec } from '@/services/import/specs';
import { contentDisposition } from '@/lib/export/respond';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Max raw upload accepted, before parsing. */
const MAX_BYTES = 2 * 1024 * 1024;

/** `GET /api/import/students?template=1` — a blank CSV with the right headers. */
export async function GET(request: NextRequest, context: { params: Promise<{ spec: string }> }) {
  try {
    const actor = await requireAuth();
    const { spec: key } = await context.params;

    const spec = getImportSpec(key);
    if (!spec) throw new NotFoundError(`Unknown import "${key}"`);
    if (!spec.roles.includes(actor.role)) {
      throw new ForbiddenError('You do not have access to this import');
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

    const body = (await request.json().catch(() => null)) as {
      csv?: unknown;
      dryRun?: unknown;
    } | null;

    const csv = typeof body?.csv === 'string' ? body.csv : '';
    if (csv.trim() === '') {
      throw new ValidationError('Provide CSV content to import', { csv: 'No content supplied' });
    }
    if (Buffer.byteLength(csv, 'utf8') > MAX_BYTES) {
      throw new ValidationError('That file is too large. Split it into smaller batches.');
    }

    const dryRun = body?.dryRun !== false;
    const outcome = await runImport(spec, csv, { dryRun });

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
