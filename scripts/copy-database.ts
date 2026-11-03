/**
 * Copies one database into another — production into the test database — so
 * the preview deployment can be tried against real data.
 *
 * The two connection strings are read from `.env.copy` (git-ignored, never
 * committed) or from the environment, and are never printed:
 *
 *   SOURCE_MONGODB_URI=mongodb+srv://…/production-db   (read only)
 *   TARGET_MONGODB_URI=mongodb+srv://…/test-db         (wiped and replaced)
 *
 *   npm run copy:database                        (preview: what would be copied)
 *   npm run copy:database -- --confirm           (copy)
 *   npm run copy:database -- --confirm --mask-student-emails
 *
 * The target ends up as an exact copy: every collection in it is dropped and
 * rebuilt from the source, indexes included, and collections that exist only
 * in the target are dropped too. The source is only ever read.
 *
 * `--mask-student-emails` rewrites every student's email to an address that
 * cannot receive mail, so nothing done on the test site (a workshop email, a
 * notification email) reaches a real student. Students are then signed in as
 * with the master OTP, using the masked address shown on their admin page.
 */
import mongoose from 'mongoose';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.copy', quiet: true });

const BATCH = 1000;
const args = new Set(process.argv.slice(2));
const confirm = args.has('--confirm');
const maskEmails = args.has('--mask-student-emails');

/** Where a connection string points, without its credentials. */
function describe(uri: string): { key: string; label: string } {
  try {
    const url = new URL(uri);
    const db = url.pathname.replace(/^\//, '') || '(default)';
    return { key: `${url.hostname}/${db}`, label: `database "${db}" on ${url.hostname}` };
  } catch {
    throw new Error('A connection string in .env.copy is not a valid MongoDB URI.');
  }
}

async function main() {
  const sourceUri = process.env.SOURCE_MONGODB_URI;
  const targetUri = process.env.TARGET_MONGODB_URI;

  if (!sourceUri || !targetUri) {
    throw new Error(
      'Set SOURCE_MONGODB_URI (production) and TARGET_MONGODB_URI (test) in .env.copy.',
    );
  }

  const source = describe(sourceUri);
  const target = describe(targetUri);

  if (source.key === target.key) {
    throw new Error('Source and target are the same database. Nothing was done.');
  }
  if (target.label.includes('"(default)"')) {
    throw new Error('Name the test database in TARGET_MONGODB_URI (…mongodb.net/<name>?…).');
  }

  console.log(`From: ${source.label}  (read only)`);
  console.log(`To:   ${target.label}  (will be replaced)`);
  console.log('');

  const from = await mongoose.createConnection(sourceUri).asPromise();
  const to = await mongoose.createConnection(targetUri).asPromise();

  try {
    const sourceDb = from.db!;
    const targetDb = to.db!;

    const sourceNames = (await sourceDb.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith('system.'))
      .sort();
    const targetNames = (await targetDb.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith('system.'));
    const extra = targetNames.filter((name) => !sourceNames.includes(name)).sort();

    for (const name of sourceNames) {
      const count = await sourceDb.collection(name).countDocuments();
      console.log(`  ${name.padEnd(32)} ${String(count).padStart(7)} documents`);
    }
    if (extra.length > 0) {
      console.log(`\n  Only in the test database, will be dropped: ${extra.join(', ')}`);
    }

    if (!confirm) {
      console.log('\nPreview only. Run again with --confirm to replace the test database.');
      return;
    }

    console.log('');
    for (const name of extra) await targetDb.collection(name).drop();

    for (const name of sourceNames) {
      const from = sourceDb.collection(name);
      if (targetNames.includes(name)) await targetDb.collection(name).drop();
      const into = targetDb.collection(name);

      let copied = 0;
      let batch: Record<string, unknown>[] = [];
      for await (const doc of from.find()) {
        batch.push(doc);
        if (batch.length === BATCH) {
          await into.insertMany(batch, { ordered: false });
          copied += batch.length;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await into.insertMany(batch, { ordered: false });
        copied += batch.length;
      }
      if (copied === 0) await targetDb.createCollection(name);

      // Indexes after the data: faster, and the copy carries unique and TTL
      // indexes exactly as production has them.
      for (const index of await from.indexes()) {
        if (index.name === '_id_') continue;
        const { key, v: _v, ns: _ns, ...options } = index as typeof index & { ns?: string };
        await into.createIndex(key, options);
      }

      console.log(`  copied ${name.padEnd(32)} ${copied}`);
    }

    if (maskEmails) {
      const users = targetDb.collection('users');
      let masked = 0;
      for await (const user of users.find({ role: 'STUDENT' }, { projection: { _id: 1 } })) {
        await users.updateOne(
          { _id: user._id },
          { $set: { email: `student.${user._id.toString()}@example.invalid` } },
        );
        masked += 1;
      }
      console.log(`\nMasked the email address of ${masked} student(s).`);
    }

    console.log('\nDone. The test database is now a copy of production.');
  } finally {
    await from.close();
    await to.close();
  }
}

main().catch((error: unknown) => {
  // The message only — a driver error can echo the connection string.
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `\nFailed: ${message.replace(/mongodb(\+srv)?:\/\/[^\s]+/g, '<connection string>')}`,
  );
  process.exitCode = 1;
});
