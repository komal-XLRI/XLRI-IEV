import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { env } from '@/config/env';
import { errorResponse } from '@/lib/api/response';
import { verifyFeedbackSignature } from '@/lib/feedback/signature';
import { googleFormFeedbackPayloadSchema } from '@/validators/mentorFeedback';
import { ingestGoogleFormFeedback } from '@/services/ventures/mentorFeedbackService';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A Form response is text; anything this large is not one. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Receives Google Form responses from the Apps Script.
 *
 * Not a session route — the caller is Google, not a signed-in user — so the
 * HMAC signature is the authentication. Nothing is read from the database
 * until it verifies. Status codes tell the script what to do:
 *
 *   200  stored (or updated)             — done
 *   4xx  refused, and will be again      — do not retry; see the sync log
 *   5xx  failed on our side              — retry later
 */
export async function POST(request: NextRequest) {
  try {
    const secret = env().FEEDBACK_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('Feedback webhook called but FEEDBACK_WEBHOOK_SECRET is not set');
      return NextResponse.json(
        { ok: false, reason: 'NOT_CONFIGURED', message: 'Feedback sync is not configured.' },
        { status: 503 },
      );
    }

    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, reason: 'TOO_LARGE' }, { status: 413 });
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, reason: 'TOO_LARGE' }, { status: 413 });
    }

    const check = verifyFeedbackSignature({
      secret,
      timestamp: request.headers.get('x-iev-timestamp'),
      signature: request.headers.get('x-iev-signature'),
      rawBody,
    });
    if (!check.ok) {
      logger.warn('Feedback webhook signature rejected', { reason: check.reason });
      return NextResponse.json({ ok: false, reason: check.reason }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, reason: 'BAD_JSON' }, { status: 400 });
    }

    const parsed = googleFormFeedbackPayloadSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn('Feedback webhook payload invalid', {
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return NextResponse.json({ ok: false, reason: 'BAD_PAYLOAD' }, { status: 400 });
    }

    const result = await ingestGoogleFormFeedback(parsed.data);

    if (result.status === 200) {
      revalidatePath('/admin/venture-activities', 'layout');
      revalidatePath('/student', 'layout');
    }

    return NextResponse.json(
      {
        ok: result.status === 200,
        outcome: result.outcome,
        reason: result.reason,
        message: result.message,
        stageCompleted: result.stageCompleted ?? false,
      },
      { status: result.status },
    );
  } catch (error) {
    logger.error('Feedback webhook failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error);
  }
}
