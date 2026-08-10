/**
 * SMTP preflight.
 *
 *   npm run check:smtp                 verify the connection and credential
 *   npm run check:smtp -- you@x.com    ...and send one real test email
 *
 * A wrong credential otherwise shows up as a user who never receives their
 * code, which looks like an application bug and is diagnosed as one. This makes
 * it an operator-facing error instead.
 *
 * Prints the host, port and username. Never prints the password.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

import { env } from '@/config/env';
import { verifySmtpConnection } from '@/lib/email/smtp';
import { sendEmail } from '@/lib/email/provider';
import { otpEmail } from '@/lib/email/templates';

async function main() {
  const config = env();

  if (config.EMAIL_PROVIDER !== 'smtp') {
    console.error(`EMAIL_PROVIDER is "${config.EMAIL_PROVIDER}", not "smtp" — nothing to check.`);
    process.exit(1);
  }

  console.log('Relay      ', `${config.SMTP_HOST}:${config.SMTP_PORT}`);
  console.log('Username   ', config.SMTP_USER);
  console.log('Password   ', `set, ${config.SMTP_PASSWORD?.length ?? 0} characters (not shown)`);
  console.log('From       ', config.EMAIL_FROM);
  console.log('');

  process.stdout.write('Connecting and authenticating… ');
  await verifySmtpConnection();
  console.log('ok');

  const recipient = process.argv[2];
  if (!recipient) {
    console.log('\nPass an address to also send a test email:');
    console.log('  npm run check:smtp -- you@example.com');
    process.exit(0);
  }

  process.stdout.write(`Sending a test message to ${recipient}… `);
  await sendEmail(
    otpEmail({
      to: recipient,
      name: 'Test Recipient',
      // Fixed, obviously-fake digits: this is a delivery check, and a real
      // random code in a test mail is a code somebody might try to use.
      otp: '000000',
      expiresInMinutes: 10,
    }),
  );
  console.log('ok');
  console.log('\nCheck the inbox. The code in it is a placeholder, not a working one.');
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('\nFAILED:', error instanceof Error ? error.message : error);
  console.error(
    '\nCommon causes:\n' +
      '  - SMTP_PASSWORD wrong or expired (ZeptoMail shows 535 authentication failed)\n' +
      '  - the From address is not a verified sender/domain on the relay\n' +
      '  - outbound port 587 blocked by the network',
  );
  process.exit(1);
});
