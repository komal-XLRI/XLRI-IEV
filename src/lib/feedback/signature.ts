import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Request signing between the Google Apps Script and the feedback webhook.
 *
 *   signature = hex( HMAC-SHA256( secret, `${timestamp}.${rawBody}` ) )
 *
 * sent as `X-IEV-Timestamp` (unix seconds) and `X-IEV-Signature`. The body is
 * signed exactly as sent, and the timestamp bounds how long a captured request
 * could be replayed; replays inside the window are harmless anyway because
 * responses are keyed on Google's response id.
 */
export const SIGNATURE_MAX_SKEW_SECONDS = 300;

export function signFeedbackPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

export function verifyFeedbackSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: Date;
}): SignatureCheck {
  const { secret, timestamp, signature, rawBody } = input;
  if (!timestamp || !signature) return { ok: false, reason: 'MISSING_SIGNATURE' };
  if (!/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: 'BAD_TIMESTAMP' };

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'STALE_TIMESTAMP' };
  }

  if (!/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: 'BAD_SIGNATURE' };

  const expected = Buffer.from(signFeedbackPayload(secret, timestamp, rawBody), 'hex');
  const given = Buffer.from(signature.toLowerCase(), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  return { ok: true };
}
