import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { requireRole } from '@/lib/auth/currentUser';
import { deleteEvidence } from '@/services/evidence/evidenceService';
import { objectId } from '@/validators/common';

export const runtime = 'nodejs';

export const DELETE = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole('STUDENT');
    const { id } = await context.params;

    await deleteEvidence(objectId.parse(id), user.userId);
    return jsonResponse({ ok: true });
  },
);
