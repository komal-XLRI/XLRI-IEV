import { type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/currentUser';
import { buildExportResponse } from '@/lib/export/respond';
import { isExportFormat, type ExportFormat } from '@/lib/export/types';
import { buildDataset } from '@/services/export/registry';
import { parseReportFilters } from '@/validators/reportFilters';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One endpoint serves every report and record list in every format:
 *
 *   GET /api/export/student-progress?format=xlsx&termId=…&facultyId=…&sortBy=…
 *
 * The filters are parsed with the same schema the pages use, so an export
 * reproduces exactly what was on screen. Authorisation and scope clamping
 * happen inside `buildDataset`.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ dataset: string }> }) {
  try {
    const actor = await requireAuth();
    const { dataset } = await context.params;

    const searchParams = request.nextUrl.searchParams;
    const rawFormat = searchParams.get('format') ?? 'xlsx';

    if (!isExportFormat(rawFormat)) {
      throw new ValidationError('Unsupported export format', {
        format: 'Expected one of: xlsx, csv, pdf, print',
      });
    }
    const format: ExportFormat = rawFormat;

    const filters = parseReportFilters(searchParams);
    const built = await buildDataset(dataset, actor, filters);

    logger.info('Export generated', {
      dataset,
      format,
      rows: built.rows.length,
      userId: actor.userId,
      role: actor.role,
    });

    // ?raw=1 yields a bare grid, suitable for feeding back to the importer.
    const raw = searchParams.get('raw') === '1';

    return buildExportResponse(built, format, { raw });
  } catch (error) {
    return errorResponse(error);
  }
}
