import { z } from 'zod';

/**
 * Server-only environment validation.
 *
 * Importing this module from a client component is a build error by design —
 * these values (Cloudinary secrets, AUTH_SECRET) must never reach the browser.
 */
import 'server-only';
import { OTP_LENGTH } from '@/lib/auth/otp';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(43_200),

    // A fixed code that verifies as *any* active account's OTP, so a developer
    // can sign in as a user whose inbox they do not have. Set deliberately and
    // active in every environment including production — unsetting it is the
    // only thing that turns it off.
    //
    // It must be exactly OTP_LENGTH digits or it could never be typed into the
    // login form, which accepts nothing else.
    MASTER_OTP: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          new RegExp(`^\\d{${OTP_LENGTH}}$`),
          `MASTER_OTP must be exactly ${OTP_LENGTH} digits`,
        )
        .optional(),
    ),

    EMAIL_PROVIDER: z.enum(['console', 'resend', 'smtp']).default('console'),
    RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    EMAIL_FROM: z.string().default('IEV Tracker <onboarding@resend.dev>'),

    // SMTP relay (ZeptoMail in this deployment). The password is a credential
    // and is read from the environment only — it appears in no source file, no
    // API response and no log line.
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PORT: z.coerce.number().int().positive().max(65_535).default(587),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),

    CLOUDINARY_CLOUD_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
    CLOUDINARY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    CLOUDINARY_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    CLOUDINARY_UPLOAD_FOLDER: z.string().default('iev-tracker/evidence'),

    SEED_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
    SEED_ADMIN_NAME: z.string().default('IEV Administrator'),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_PROVIDER === 'resend' && !value.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
    if (value.EMAIL_PROVIDER === 'smtp') {
      // Named individually rather than as one lumped message, so a half-filled
      // block says exactly which line is missing.
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when EMAIL_PROVIDER=smtp`,
          });
        }
      }
    }
    if (value.NODE_ENV === 'production' && value.EMAIL_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=console is not allowed in production — OTPs would not be sent',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}

let cached: Env | null = null;

/**
 * Lazily validated environment. Kept lazy so that `next build` can statically
 * analyse modules that merely import (but never call) this at module scope.
 */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

export function isCloudinaryConfigured(): boolean {
  const e = env();
  return Boolean(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET);
}
