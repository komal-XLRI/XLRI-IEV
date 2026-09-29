/**
 * Retires the attempt limit from existing data.
 *
 * `MAX_ATTEMPTS_REACHED` is no longer a status — the limit it enforced has been
 * removed along with in-app submission. Records sitting at it are moved to
 * `REVISION_REQUIRED`, which is what the same sequence of verdicts now resolves
 * to, so they read correctly on every screen and can be saved again.
 *
 * The old `maxAttempts` and `evidenceRequired` fields are left on venture
 * activity documents. Nothing reads them any more and they do no harm, and
 * leaving them keeps the original configuration inspectable. Run with:
 *
 *   npm run migrate:attempts
 *
 * Pass `--dry` to report what it would change without writing anything.
 */
import mongoose from 'mongoose';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

async function main() {
  const dry = process.argv.includes('--dry');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  await mongoose.connect(uri);
  const models = await import('../src/models');

  // The raw collection: the status is no longer in the schema's enum, so a
  // typed Mongoose query would refuse to express the filter.
  const collection = models.StudentVentureActivity.collection;
  const filter = { status: 'MAX_ATTEMPTS_REACHED' };

  const count = await collection.countDocuments(filter);
  console.log(`Found ${count} record(s) at MAX_ATTEMPTS_REACHED.`);

  if (dry || count === 0) {
    if (dry && count > 0)
      console.log(`Dry run: would move ${count} record(s) to REVISION_REQUIRED.`);
    await mongoose.disconnect();
    return;
  }

  const result = await collection.updateMany(filter, { $set: { status: 'REVISION_REQUIRED' } });
  console.log(`Moved ${result.modifiedCount} record(s) to REVISION_REQUIRED.`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
