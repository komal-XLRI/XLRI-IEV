import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/currentUser';
import { resolveEvidenceLink } from '@/services/evidence/evidenceService';
import { objectId } from '@/validators/common';

export const runtime = 'nodejs';

/**
 * Opens one evidence file.
 *
 * Every reader comes through here rather than through the Cloudinary URL the
 * upload returned. Two things make that necessary: the account refuses to
 * deliver PDFs over a public URL — the browser gets `401 deny or ACL failure`
 * and shows nothing — and a public URL cannot be taken back, so a link pasted
 * into a chat would outlive the reader's right to read it.
 *
 * The redirect target is signed and expires in minutes, and who may follow it
 * is decided per request, against the database, by `resolveEvidenceLink`.
 *
 * `?download=1` saves the file instead of displaying it.
 */
export const GET = withErrorHandling(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireAuth();
    const { id } = await context.params;

    const download = request.nextUrl.searchParams.get('download') === '1';

    const link = await resolveEvidenceLink(objectId.parse(id), user, { download });

    // Never cached: the target expires, and the permission behind it can be
    // withdrawn between one request and the next.
    return NextResponse.redirect(link.url, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  },
);
