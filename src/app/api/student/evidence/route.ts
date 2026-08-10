import { type NextRequest } from 'next/server';
import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { requireRole } from '@/lib/auth/currentUser';
import { registerEvidenceSchema } from '@/validators/submissions';
import { registerEvidence } from '@/services/evidence/evidenceService';
import { serialize } from '@/lib/utils/serialize';

export const runtime = 'nodejs';

/** Records metadata for an upload Cloudinary has already accepted. */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireRole('STUDENT');

  const body = await request.json().catch(() => ({}));
  const input = registerEvidenceSchema.parse(body);

  const evidence = await registerEvidence(input, user.userId);
  return jsonResponse({ evidence: serialize(evidence) }, { status: 201 });
});
