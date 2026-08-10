/**
 * OTP generation and verification primitives.
 *
 * The plaintext OTP exists only in memory long enough to be emailed. What is
 * persisted is an HMAC-SHA256 digest keyed with AUTH_SECRET, so a database
 * leak on its own does not let an attacker brute-force the (small) OTP space.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60;
/** Verification attempts allowed against a single OTP before it is burned. */
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
/** Minimum wait between two OTP requests for the same account. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Requests allowed inside one rolling window. */
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_REQUEST_WINDOW_SECONDS = 60 * 60;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET is missing or shorter than 32 characters');
  }
  return secret;
}

/**
 * Uniformly random numeric OTP. Rejection sampling avoids the modulo bias a
 * naive `value % 10` would introduce.
 */
export function generateOtp(length: number = OTP_LENGTH): string {
  const digits: string[] = [];
  const buffer = new Uint8Array(1);

  while (digits.length < length) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value >= 250) continue; // 250 = floor(256 / 10) * 10
    digits.push(String(value % 10));
  }

  return digits.join('');
}

export async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(otp));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison — a length-independent early return would leak. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyOtp(candidate: string, storedHash: string): Promise<boolean> {
  const candidateHash = await hashOtp(candidate);
  return safeEqual(candidateHash, storedHash);
}

export function otpExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
}
