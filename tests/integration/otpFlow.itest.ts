/**
 * The OTP sign-in flow, end to end against a real MongoDB.
 *
 * The email transport is the one thing stubbed: the point here is the auth
 * rules, and a suite that sends mail on every run is a suite nobody runs.
 * ZeptoMail delivery itself is checked separately by `npm run check:smtp`,
 * which opens a real connection and can send a real message.
 *
 * The stub is also what makes these assertions possible at all — the plaintext
 * OTP exists only in memory on its way to the mailer, so capturing the outgoing
 * message is the only way to learn it. That is the design working: nothing
 * persisted or returned by the API ever contains the code.
 *
 * Requires MONGODB_URI. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

/** Every message the service tried to send, newest last. */
const sent: Array<{ to: string; subject: string; html: string; text: string }> = [];
let deliveryError: Error | null = null;

vi.mock('@/lib/email/provider', () => ({
  sendEmail: async (message: { to: string; subject: string; html: string; text: string }) => {
    if (deliveryError) throw deliveryError;
    sent.push(message);
  },
}));

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { requestOtp, verifyOtpAndCreateSession } = await import('@/services/auth/authService');
const { verifySessionToken } = await import('@/lib/auth/session');
const { OTP_MAX_VERIFY_ATTEMPTS, OTP_MAX_REQUESTS_PER_WINDOW } = await import('@/lib/auth/otp');

const SUFFIX = `otp-itest-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

const ACTIVE = email('active');
const INACTIVE = email('inactive');
const UNKNOWN = email('nobody');

/** The digits in the most recent email. */
function lastOtp(): string {
  const message = sent.at(-1);
  if (!message) throw new Error('no email was sent');
  const match = /\b(\d{6})\b/.exec(message.text);
  if (!match) throw new Error(`no 6-digit code in the email text: ${message.text.slice(0, 200)}`);
  return match[1]!;
}

/**
 * The service enforces a resend cooldown and a rolling request cap. Tests that
 * need a fresh code wind those counters back rather than sleeping through them.
 */
async function clearRateLimits(address: string): Promise<void> {
  await models.User.updateOne(
    { email: address },
    { $set: { otpLastSentAt: null, otpRequestCount: 0, otpRequestWindowStart: null } },
  ).exec();
}

beforeAll(async () => {
  await connectToDatabase();

  await createUser({
    role: 'FACULTY',
    name: 'OTP Active User',
    email: ACTIVE,
    status: 'ACTIVE',
    profile: {},
  });

  await createUser({
    role: 'FACULTY',
    name: 'OTP Inactive User',
    email: INACTIVE,
    status: 'INACTIVE',
    profile: {},
  });
});

afterAll(async () => {
  await models.User.deleteMany({ email: { $in: [ACTIVE, INACTIVE] } }).exec();
  await disconnectFromDatabase();
});

beforeEach(async () => {
  sent.length = 0;
  deliveryError = null;
  await clearRateLimits(ACTIVE);
  await clearRateLimits(INACTIVE);
});

describe('requesting a code', () => {
  it('emails a six-digit code to an active user', async () => {
    const result = await requestOtp(ACTIVE);

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(ACTIVE);
    expect(sent[0]!.subject).toBe('Your IEV Login OTP');
    expect(lastOtp()).toMatch(/^\d{6}$/);
  });

  it('never returns the code to the caller', async () => {
    const result = await requestOtp(ACTIVE);
    // Whatever the response shape becomes, the code must not be in it.
    expect(JSON.stringify(result)).not.toContain(lastOtp());
  });

  it('stores a hash, never the code itself', async () => {
    await requestOtp(ACTIVE);
    const code = lastOtp();

    const user = await models.User.findOne({ email: ACTIVE })
      .select('+otpHash +otpExpiresAt')
      .lean()
      .exec();

    expect(user!.otpHash).toBeTruthy();
    expect(user!.otpHash).not.toBe(code);
    expect(JSON.stringify(user)).not.toContain(code);
    expect(user!.otpExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('answers identically for an unknown address, and sends nothing', async () => {
    const known = await requestOtp(ACTIVE);
    sent.length = 0;

    const unknown = await requestOtp(UNKNOWN);

    // Same shape and same values: the response cannot be used to enumerate
    // who is on the programme.
    expect(unknown).toEqual(known);
    expect(sent).toHaveLength(0);
  });

  it('answers identically for a deactivated account, and sends nothing', async () => {
    const known = await requestOtp(ACTIVE);
    sent.length = 0;

    const inactive = await requestOtp(INACTIVE);

    expect(inactive).toEqual(known);
    expect(sent).toHaveLength(0);
  });

  it('surfaces a delivery failure rather than pretending it worked', async () => {
    deliveryError = new Error('Email delivery failed');
    await expect(requestOtp(ACTIVE)).rejects.toThrow('Email delivery failed');
  });

  it('does not leak the relay credential into the error', async () => {
    deliveryError = new Error('Email delivery failed');
    const failure = await requestOtp(ACTIVE).catch((error: Error) => error);

    const password = process.env.SMTP_PASSWORD;
    if (password) expect((failure as Error).message).not.toContain(password);
    expect((failure as Error).message).not.toMatch(/emailapikey/i);
  });
});

describe('resending', () => {
  it('is refused inside the cooldown', async () => {
    await requestOtp(ACTIVE);
    await expect(requestOtp(ACTIVE)).rejects.toThrow(/wait before requesting another/i);
  });

  it('invalidates the previous code when a new one is issued', async () => {
    await requestOtp(ACTIVE);
    const first = lastOtp();

    await clearRateLimits(ACTIVE);
    await requestOtp(ACTIVE);
    const second = lastOtp();

    expect(second).not.toBe(first);
    await expect(verifyOtpAndCreateSession(ACTIVE, first)).rejects.toThrow(/invalid or expired/i);

    // ...and the replacement still works.
    const session = await verifyOtpAndCreateSession(ACTIVE, second);
    expect(session.token).toBeTruthy();
  });

  it('caps the number of codes issued in one window', async () => {
    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i += 1) {
      await models.User.updateOne({ email: ACTIVE }, { $set: { otpLastSentAt: null } }).exec();
      await requestOtp(ACTIVE);
    }

    await models.User.updateOne({ email: ACTIVE }, { $set: { otpLastSentAt: null } }).exec();
    await expect(requestOtp(ACTIVE)).rejects.toThrow(/too many otp requests/i);
  });
});

describe('verifying a code', () => {
  it('signs the user in and issues a usable session', async () => {
    await requestOtp(ACTIVE);
    const { token, user } = await verifyOtpAndCreateSession(ACTIVE, lastOtp());

    expect(user.email).toBe(ACTIVE);
    expect(user.role).toBe('FACULTY');

    const session = await verifySessionToken(token);
    expect(session!.userId).toBe(user.userId);
  });

  it('rejects the wrong code', async () => {
    await requestOtp(ACTIVE);
    const wrong = lastOtp() === '000000' ? '111111' : '000000';

    await expect(verifyOtpAndCreateSession(ACTIVE, wrong)).rejects.toThrow(/invalid or expired/i);
  });

  it('burns the code, so it cannot be replayed', async () => {
    await requestOtp(ACTIVE);
    const code = lastOtp();

    await verifyOtpAndCreateSession(ACTIVE, code);
    await expect(verifyOtpAndCreateSession(ACTIVE, code)).rejects.toThrow(/invalid or expired/i);

    const user = await models.User.findOne({ email: ACTIVE }).select('+otpHash').lean().exec();
    expect(user!.otpHash).toBeNull();
  });

  it('rejects an expired code', async () => {
    await requestOtp(ACTIVE);
    const code = lastOtp();

    // Wind the clock forward by moving the expiry, rather than waiting ten
    // minutes for it.
    await models.User.updateOne(
      { email: ACTIVE },
      { $set: { otpExpiresAt: new Date(Date.now() - 1000) } },
    ).exec();

    await expect(verifyOtpAndCreateSession(ACTIVE, code)).rejects.toThrow(/invalid or expired/i);
  });

  it('stops accepting guesses after the attempt limit', async () => {
    await requestOtp(ACTIVE);
    const code = lastOtp();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i += 1) {
      await expect(verifyOtpAndCreateSession(ACTIVE, wrong)).rejects.toThrow(/invalid or expired/i);
    }

    // The next attempt is refused outright — and the correct code no longer
    // works either, so a burst of guesses cannot be followed by the real one.
    await expect(verifyOtpAndCreateSession(ACTIVE, code)).rejects.toThrow(/too many incorrect/i);
  });

  it('refuses a deactivated account even with a valid code', async () => {
    await requestOtp(ACTIVE);
    const code = lastOtp();

    await models.User.updateOne({ email: ACTIVE }, { $set: { status: 'INACTIVE' } }).exec();
    await expect(verifyOtpAndCreateSession(ACTIVE, code)).rejects.toThrow(/invalid or expired/i);
    await models.User.updateOne({ email: ACTIVE }, { $set: { status: 'ACTIVE' } }).exec();
  });

  it('gives the same message for unknown, wrong and expired', async () => {
    await requestOtp(ACTIVE);
    const code = lastOtp();
    const wrong = code === '000000' ? '111111' : '000000';

    const messages = await Promise.all(
      [
        verifyOtpAndCreateSession(UNKNOWN, code),
        verifyOtpAndCreateSession(ACTIVE, wrong),
        verifyOtpAndCreateSession(INACTIVE, code),
      ].map((promise) => promise.catch((error: Error) => error.message)),
    );

    expect(new Set(messages).size).toBe(1);
  });
});

describe('the email itself', () => {
  it('is XLRI-branded and says what the code is for', async () => {
    await requestOtp(ACTIVE);
    const message = sent.at(-1)!;

    expect(message.subject).toBe('Your IEV Login OTP');
    expect(message.html).toContain('XLRI');
    expect(message.html).toContain('IEV Login OTP');
    expect(message.html).toContain(lastOtp());
    // Both parts, so a plaintext client is not left with an empty message.
    expect(message.text).toContain(lastOtp());
  });

  it('warns against sharing the code and does not put it in the subject', async () => {
    await requestOtp(ACTIVE);
    const message = sent.at(-1)!;

    expect(message.html).toMatch(/never ask you for/i);
    expect(message.text).toMatch(/do not share/i);
    // Subjects are visible on a lock screen; the code should not be.
    expect(message.subject).not.toContain(lastOtp());
  });

  it('states the expiry and that the code is single-use', async () => {
    await requestOtp(ACTIVE);
    expect(sent.at(-1)!.html).toMatch(/expire in \d+ minutes and can be used only once/i);
  });
});
