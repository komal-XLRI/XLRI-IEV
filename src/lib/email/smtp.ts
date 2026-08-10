import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import type { EmailMessage, EmailProvider } from './provider';

/**
 * SMTP delivery, configured entirely from the environment.
 *
 * Written against plain SMTP rather than a ZeptoMail SDK: the whole
 * configuration is four environment variables, so moving to a different relay
 * is an `.env.local` change and nothing else. Nothing in the authentication
 * path knows which service is behind this.
 *
 * `import 'server-only'` is the guard that matters. This module reads the SMTP
 * credential, and that import makes it a *build error* for any client component
 * to pull it in, rather than something to remember in review.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const config = env();

  // The env schema already refuses to boot with these missing when
  // EMAIL_PROVIDER=smtp. Narrowing here turns that guarantee into a type the
  // compiler can see, rather than a non-null assertion nobody can verify.
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass } = config;
  if (!host || !user || !pass) {
    throw new Error('SMTP is selected but SMTP_HOST, SMTP_USER or SMTP_PASSWORD is missing');
  }

  transporter = nodemailer.createTransport({
    host,
    port: config.SMTP_PORT,
    // Port 587 is STARTTLS: the connection opens in the clear and is upgraded.
    // `secure: true` would attempt implicit TLS and hang. `requireTLS` turns
    // the upgrade from optional into mandatory, so a relay that fails to offer
    // STARTTLS gets an error rather than a plaintext send of the credential.
    secure: config.SMTP_PORT === 465,
    requireTLS: config.SMTP_PORT !== 465,
    auth: { user, pass },
    // A hung relay must not hold an OTP request open indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // One connection reused across sends, rather than a fresh TLS handshake per
    // OTP. Idle connections are dropped rather than held open forever.
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
  });

  // Host and port only. The user and password never reach the log.
  logger.info('SMTP transport created', { host, port: config.SMTP_PORT });

  return transporter;
}

export const smtpProvider: EmailProvider = {
  async send(message: EmailMessage) {
    const config = env();

    try {
      const result = await getTransporter().sendMail({
        from: config.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments?.map((file) => ({
          filename: file.filename,
          content: file.content,
          encoding: 'base64',
          contentType: file.contentType,
          cid: file.cid,
          // Without this an embedded image is also listed as a downloadable
          // attachment, and a sign-in email appears to carry a payload.
          contentDisposition: file.cid ? 'inline' : 'attachment',
        })),
      });

      logger.info('Email delivered via SMTP', {
        to: message.to,
        messageId: result.messageId,
        accepted: result.accepted?.length ?? 0,
      });
    } catch (error) {
      // The relay's own message can echo the credential back in an auth
      // failure, so only the code and a fixed summary are logged, and the
      // caller gets a message safe to show a user.
      const code = (error as { code?: string; responseCode?: number } | null)?.code;
      const responseCode = (error as { responseCode?: number } | null)?.responseCode;

      logger.error('SMTP delivery failed', {
        to: message.to,
        host: config.SMTP_HOST,
        code: code ?? 'unknown',
        responseCode: responseCode ?? null,
      });

      throw new Error('Email delivery failed');
    }
  },
};

/**
 * Opens a connection and authenticates without sending anything.
 *
 * Used by `npm run check:smtp` so a misconfigured credential is found by an
 * operator running a command, not by a user who never receives their code.
 */
export async function verifySmtpConnection(): Promise<void> {
  await getTransporter().verify();
}
