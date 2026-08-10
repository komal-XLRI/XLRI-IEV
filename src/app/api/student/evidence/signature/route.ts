import { type NextRequest } from 'next/server';
import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { requireRole } from '@/lib/auth/currentUser';
import { requestUploadSignatureSchema } from '@/validators/submissions';
import { requestUploadSignature } from '@/services/evidence/evidenceService';

export const runtime = 'nodejs';

/**
 * Issues a Cloudinary upload signature for one file.
 *
 * Authentication → role → schema → ownership → file policy are all checked in
 * the service before any signature is produced.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireRole('STUDENT');

  const body = await request.json().catch(() => ({}));
  const input = requestUploadSignatureSchema.parse(body);

  const signature = await requestUploadSignature(input, user.userId);
  return jsonResponse(signature);
});
