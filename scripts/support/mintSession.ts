/**
 * Prints a session cookie for an existing user, for local verification only.
 *
 * It signs with the same AUTH_SECRET the app uses, so it proves nothing about
 * authentication itself — it just saves going through the OTP flow by hand when
 * checking that pages render.
 *
 * Usage: npx tsx --tsconfig tsconfig.scripts.json scripts/support/mintSession.ts <email> <outFile>
 *
 * The cookie is written to a file rather than stdout because dotenv and the
 * app logger both print to stdout, and their output would end up inside the
 * cookie value.
 */
import { writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import { connectToDatabase } from '../../src/lib/db/mongoose';
import { User } from '../../src/models';
import { SESSION_COOKIE, createSessionToken } from '../../src/lib/auth/session';

config({ path: '.env.local' });

async function main() {
  const email = process.argv[2];
  const outFile = process.argv[3];
  if (!email || !outFile) throw new Error('Usage: mintSession.ts <email> <outFile>');

  await connectToDatabase();

  const user = await User.findOne({ email: email.toLowerCase() }).lean().exec();
  if (!user) throw new Error(`No user with email ${email}`);

  const token = await createSessionToken({
    userId: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
  });

  writeFileSync(outFile, `${SESSION_COOKIE}=${token}`, 'utf8');
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
