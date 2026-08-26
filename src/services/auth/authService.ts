import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { User } from '@/models';
import { logger } from '@/lib/logger';
import { RateLimitError, UnauthorizedError } from '@/lib/errors';
import { sendEmail } from '@/lib/email/provider';
import { otpEmail } from '@/lib/email/templates';
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_REQUEST_WINDOW_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  generateOtp,
  hashOtp,
  isMasterOtp,
  otpExpiryFrom,
  verifyOtp,
} from '@/lib/auth/otp';
import { createSessionToken, type SessionUser } from '@/lib/auth/session';
import { env } from '@/config/env';

/**
 * Same response whether or not the email belongs to a real account. Accounts
 * are created by Admin, so an enumerable "no such user" reply would leak the
 * programme roster.
 */
export interface RequestOtpResult {
  ok: true;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export async function requestOtp(rawEmail: string): Promise<RequestOtpResult> {
  await connectToDatabase();

  const email = rawEmail.trim().toLowerCase();
  const now = new Date();

  const generic: RequestOtpResult = {
    ok: true,
    cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    expiresInSeconds: OTP_TTL_SECONDS,
  };

  const user = await User.findOne({ email })
    .select(
      '+otpHash +otpExpiresAt +otpAttempts +otpLastSentAt +otpRequestCount +otpRequestWindowStart',
    )
    .exec();

  if (!user) {
    logger.info('OTP requested for unknown email', { email });
    return generic;
  }

  if (user.status !== 'ACTIVE') {
    logger.warn('OTP requested for non-active account', { email, status: user.status });
    return generic;
  }

  // Cooldown between consecutive requests.
  if (user.otpLastSentAt) {
    const elapsed = (now.getTime() - user.otpLastSentAt.getTime()) / 1000;
    if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
      throw new RateLimitError(
        'An OTP was sent recently. Please wait before requesting another.',
        Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
      );
    }
  }

  // Rolling request window.
  const windowStart = user.otpRequestWindowStart;
  const windowExpired =
    !windowStart || (now.getTime() - windowStart.getTime()) / 1000 >= OTP_REQUEST_WINDOW_SECONDS;

  if (windowExpired) {
    user.otpRequestWindowStart = now;
    user.otpRequestCount = 0;
  } else if (user.otpRequestCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil(
      OTP_REQUEST_WINDOW_SECONDS - (now.getTime() - windowStart.getTime()) / 1000,
    );
    throw new RateLimitError('Too many OTP requests. Please try again later.', retryAfter);
  }

  const otp = generateOtp();

  user.otpHash = await hashOtp(otp);
  user.otpExpiresAt = otpExpiryFrom(now);
  user.otpAttempts = 0;
  user.otpLastSentAt = now;
  user.otpRequestCount += 1;
  await user.save();

  await sendEmail(
    otpEmail({
      to: user.email,
      name: user.name,
      otp,
      expiresInMinutes: Math.round(OTP_TTL_SECONDS / 60),
    }),
  );

  logger.info('OTP issued', { userId: user._id.toString() });
  return generic;
}

export interface VerifyOtpResult {
  token: string;
  user: SessionUser;
}

let masterOtpAnnounced = false;

/**
 * The configured master code, announced once per process.
 *
 * `env()` snapshots the environment the first time it is read, so a
 * `MASTER_OTP` added to an already-running server is not picked up until that
 * server restarts — and the symptom is indistinguishable from typing the code
 * wrongly: an ordinary "Invalid or expired code". This line says which side of
 * that you are on, and says it without putting the code in the log.
 */
function masterOtp(): string | undefined {
  const configured = env().MASTER_OTP;

  if (!masterOtpAnnounced) {
    masterOtpAnnounced = true;
    logger.info('Master OTP status', { armed: Boolean(configured) });
  }

  return configured;
}

export async function verifyOtpAndCreateSession(
  rawEmail: string,
  otp: string,
): Promise<VerifyOtpResult> {
  await connectToDatabase();

  const email = rawEmail.trim().toLowerCase();
  const now = new Date();

  const user = await User.findOne({ email })
    .select('+otpHash +otpExpiresAt +otpAttempts +otpLastSentAt')
    .exec();

  // Deliberately identical message for every failure mode below.
  const invalid = new UnauthorizedError('Invalid or expired code');

  if (!user || user.status !== 'ACTIVE') throw invalid;

  const userId = user._id.toString();

  const sessionUser: SessionUser = {
    userId,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  // The attempt ceiling is checked before anything is compared, and it is
  // checked ahead of the emailed code because it now has to cover the master
  // code as well. The master path below accepts a login with no outstanding
  // OTP behind it, so this is the only thing standing between an attacker and
  // an unlimited walk through a six-digit space.
  if (user.otpAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    // The outstanding code is taken out of play, but the counter is
    // deliberately left standing. Only *requesting* a new OTP resets it, and
    // that is itself limited to five per hour — zeroing it here would hand a
    // guesser a fresh five tries on every single call.
    await burnOtp(userId);
    throw new RateLimitError('Too many incorrect attempts. Request a new code.');
  }

  // The master code: one fixed OTP that signs in as any active account,
  // whether or not a real code was ever requested — which is the entire point,
  // since it exists for accounts whose inbox the operator cannot read.
  if (isMasterOtp(otp, masterOtp())) {
    // Logged at warn with the account it opened. No email was sent and no OTP
    // row was consumed, so this line is the only record anywhere that the
    // login happened.
    logger.warn('Master OTP accepted', { userId, email: user.email, role: user.role });

    // Nothing on the account is written: not the outstanding code, not the
    // attempt count, and not `lastLoginAt` — that field reports the account
    // holder's own activity, and somebody else debugging as them is not that.
    return { token: await createSessionToken(sessionUser), user: sessionUser };
  }

  if (!user.otpHash || !user.otpExpiresAt) {
    // Counted, not waved through. Reaching here means a code was offered for
    // an account with none outstanding, which is exactly what guessing at the
    // master code looks like.
    await recordFailedAttempt(userId);
    throw invalid;
  }

  if (user.otpExpiresAt.getTime() <= now.getTime()) {
    await burnOtp(userId);
    await recordFailedAttempt(userId);
    throw invalid;
  }

  const matches = await verifyOtp(otp, user.otpHash);

  if (!matches) {
    const attempts = await recordFailedAttempt(userId);
    logger.warn('Failed OTP verification', { userId, attempts });
    throw invalid;
  }

  // Single-use: the OTP is burned the moment it succeeds.
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;
  user.lastLoginAt = now;
  await user.save();

  logger.info('Session created', { userId: sessionUser.userId, role: sessionUser.role });

  return { token: await createSessionToken(sessionUser), user: sessionUser };
}

/** Takes the outstanding code out of play, leaving the attempt count alone. */
async function burnOtp(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { otpHash: null, otpExpiresAt: null } }).exec();
}

/**
 * Counts one wrong code and returns the new total.
 *
 * `$inc` rather than read-modify-write: this is the counter that rate limits
 * guessing, and concurrent requests are precisely how someone would guess. A
 * read, an increment and a save would let parallel attempts overwrite each
 * other and settle on a total far below the number actually tried.
 */
async function recordFailedAttempt(userId: string): Promise<number> {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { otpAttempts: 1 } },
    { returnDocument: 'after', projection: '+otpAttempts' },
  ).exec();

  return updated?.otpAttempts ?? 0;
}
