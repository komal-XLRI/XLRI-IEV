import 'server-only';
import { Resend } from 'resend';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { smtpProvider } from './smtp';

export interface EmailAttachment {
  filename: string;
  /** The file's bytes, base64-encoded. */
  content: string;
  contentType: string;
  /**
   * Set to embed the file in the message body, referenced from the HTML as
   * `cid:<this value>`. Without it the file is a normal attachment.
   */
  cid?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Development provider — writes the message to the server log instead of sending. */
const consoleProvider: EmailProvider = {
  async send(message) {
    logger.info('[email:console] outbound email', {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  },
};

let resendClient: Resend | null = null;

const resendProvider: EmailProvider = {
  async send(message) {
    resendClient ??= new Resend(env().RESEND_API_KEY);

    const { error } = await resendClient.emails.send({
      from: env().EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
        contentId: file.cid,
      })),
    });

    if (error) {
      logger.error('Resend failed to deliver email', { to: message.to, error: error.message });
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  },
};

/**
 * Chosen by `EMAIL_PROVIDER`, so the authentication path never names a service.
 * Switching relay is an environment change, not a code change.
 *
 * `smtp.ts` imports this module for its types only, and a type-only import is
 * erased at compile time — so importing it back here is not a runtime cycle.
 * The SMTP connection pool is built on first send, not on import, so a
 * deployment using a different provider never opens one.
 */
export function getEmailProvider(): EmailProvider {
  switch (env().EMAIL_PROVIDER) {
    case 'smtp':
      return smtpProvider;
    case 'resend':
      return resendProvider;
    default:
      return consoleProvider;
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getEmailProvider().send(message);
}
