import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { errorResponse, jsonResponse } from '@/lib/api/response';
import { requireAdmin } from '@/lib/auth/currentUser';
import { ValidationError } from '@/lib/errors';
import { isValidObjectId } from '@/lib/utils/ids';
import { uploadStageFeedbackSheet } from '@/services/ventures/stageFeedbackSheetService';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Max raw upload accepted, before parsing. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * `POST /api/stage-feedback-sheets` — multipart with `ventureActivityId`,
 * `title` and `file`. A route rather than a server action because a workbook
 * can be larger than the 1 MB a server action accepts.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdmin();
    const form = await request.formData();

    const ventureActivityId = form.get('ventureActivityId');
    const title = form.get('title');
    const file = form.get('file');

    if (typeof ventureActivityId !== 'string' || !isValidObjectId(ventureActivityId)) {
      throw new ValidationError('Upload the sheet from a stage page');
    }
    if (!(file instanceof File)) throw new ValidationError('Choose an Excel file to upload');
    if (file.size === 0) throw new ValidationError('That file is empty');
    if (file.size > MAX_BYTES) throw new ValidationError('That file is larger than 5 MB');

    const name =
      (typeof title === 'string' ? title.trim() : '') || file.name.replace(/\.[^.]+$/, '');

    const summary = await uploadStageFeedbackSheet({
      ventureActivityId,
      title: name.slice(0, 200),
      fileName: file.name.slice(0, 300) || 'feedback.xlsx',
      bytes: new Uint8Array(await file.arrayBuffer()),
      actorId: actor.userId,
    });

    logger.info('Stage feedback sheet uploaded', {
      ventureActivityId,
      totalRows: summary.totalRows,
      matchedRows: summary.matchedRows,
      userId: actor.userId,
    });

    revalidatePath(`/admin/venture-activities/${ventureActivityId}`);
    revalidatePath('/student', 'layout');

    return jsonResponse(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
