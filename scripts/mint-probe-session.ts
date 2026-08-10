/**
 * Mints a signed session cookie per role, for driving the app in a browser.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/mint-probe-session.ts <out-dir>
 *
 * Writes one file per role rather than printing to stdout: dotenv's banner and
 * the application logger also write to stdout, and a cookie with a log line
 * glued onto it fails to authenticate — which then looks like a bug in whatever
 * is being tested rather than in the harness.
 *
 * Development only. It signs with the same secret the app uses, so it can only
 * mint sessions for a database you already have credentials for.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongoose';
import { User } from '@/models/User';
import { ROLES } from '@/lib/constants/roles';

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('usage: mint-probe-session.ts <out-dir>');

  await connectToDatabase();

  for (const role of ROLES) {
    const user = await User.findOne({ role, status: 'ACTIVE' }).lean();
    const file = join(outDir, `cookie-${role.toLowerCase()}.txt`);

    if (!user) {
      writeFileSync(file, '');
      continue;
    }

    const token = await createSessionToken({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    writeFileSync(file, `${SESSION_COOKIE}=${token}`);
  }

  process.exit(0);
}

void main();
