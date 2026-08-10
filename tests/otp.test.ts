import { beforeAll, describe, expect, it } from 'vitest';
import {
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  generateOtp,
  hashOtp,
  otpExpiryFrom,
  safeEqual,
  verifyOtp,
} from '@/lib/auth/otp';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
});

describe('OTP generation', () => {
  it('produces a code of the configured length', () => {
    expect(generateOtp()).toHaveLength(OTP_LENGTH);
  });

  it('produces digits only', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOtp()).toMatch(/^\d+$/);
    }
  });

  it('covers all ten digits across many samples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      for (const digit of generateOtp()) seen.add(digit);
    }
    expect(seen.size).toBe(10);
  });

  it('does not repeat the same code every call', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe('OTP hashing', () => {
  it('never returns the plaintext', async () => {
    const hash = await hashOtp('123456');
    expect(hash).not.toContain('123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same secret', async () => {
    expect(await hashOtp('123456')).toBe(await hashOtp('123456'));
  });

  it('differs for different codes', async () => {
    expect(await hashOtp('123456')).not.toBe(await hashOtp('123457'));
  });

  it('is keyed by AUTH_SECRET, so a leaked hash is not brute-forceable alone', async () => {
    const withFirstSecret = await hashOtp('123456');
    process.env.AUTH_SECRET = 'a-completely-different-secret-value-32chars';
    const withSecondSecret = await hashOtp('123456');
    process.env.AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';

    expect(withFirstSecret).not.toBe(withSecondSecret);
  });
});

describe('OTP verification', () => {
  it('accepts the correct code', async () => {
    const hash = await hashOtp('420690');
    expect(await verifyOtp('420690', hash)).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const hash = await hashOtp('420690');
    expect(await verifyOtp('420691', hash)).toBe(false);
  });

  it('rejects a code of the wrong length', async () => {
    const hash = await hashOtp('420690');
    expect(await verifyOtp('42069', hash)).toBe(false);
  });
});

describe('constant-time compare', () => {
  it('matches identical strings', () => {
    expect(safeEqual('abcdef', 'abcdef')).toBe(true);
  });

  it('rejects differing strings of equal length', () => {
    expect(safeEqual('abcdef', 'abcdeg')).toBe(false);
  });

  it('rejects strings of different lengths', () => {
    expect(safeEqual('abc', 'abcdef')).toBe(false);
  });
});

describe('expiry', () => {
  it('expires the configured number of seconds after issue', () => {
    const now = new Date('2026-08-08T10:00:00.000Z');
    expect(otpExpiryFrom(now).getTime() - now.getTime()).toBe(OTP_TTL_SECONDS * 1000);
  });

  it('is in the future relative to issue time', () => {
    const now = new Date();
    expect(otpExpiryFrom(now).getTime()).toBeGreaterThan(now.getTime());
  });
});
