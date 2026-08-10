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
  otpExpiryFrom,
  verifyOtp,
} from '@/lib/auth/otp';
import { createSessionToken, type SessionUser } from '@/lib/auth/session';

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
  if (!user.otpHash || !user.otpExpiresAt) throw invalid;

  if (user.otpExpiresAt.getTime() <= now.getTime()) {
    await clearOtp(user._id.toString());
    throw invalid;
  }

  if (user.otpAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    await clearOtp(user._id.toString());
    throw new RateLimitError('Too many incorrect attempts. Request a new code.');
  }

  const matches = await verifyOtp(otp, user.otpHash);

  if (!matches) {
    user.otpAttempts += 1;
    await user.save();
    logger.warn('Failed OTP verification', {
      userId: user._id.toString(),
      attempts: user.otpAttempts,
    });
    throw invalid;
  }

  // Single-use: the OTP is burned the moment it succeeds.
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;
  user.lastLoginAt = now;
  await user.save();

  const sessionUser: SessionUser = {
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  };

  logger.info('Session created', { userId: sessionUser.userId, role: sessionUser.role });

  return { token: await createSessionToken(sessionUser), user: sessionUser };
}

async function clearOtp(userId: string): Promise<void> {
  await User.updateOne(
    { _id: userId },
    { $set: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } },
  ).exec();
}
