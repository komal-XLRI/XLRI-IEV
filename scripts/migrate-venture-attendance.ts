/**
 * Moves Venture Activity attendance out of `StudentVentureActivity.attendanceStatus`
 * and into the `VentureActivityAttendance` collection.
 *
 * The old field could hold one mark per student per activity and carried no
 * date, no author and no timestamp. Nothing here can invent the missing facts,
 * so it is explicit about the ones it has to supply:
 *
 *   - `date` becomes the activity's own `startDate`, the only date the old
 *     record was ever associated with.
 *   - `markedBy` becomes an administrator account, because the column recorded
 *     nobody and the new model requires somebody.
 *   - `remarks` says so on every migrated row, so a reader can always tell a
 *     migrated mark from one somebody actually took.
 *
 * PENDING is dropped rather than migrated: it meant "nobody has marked this",
 * which in the new model is the absence of a row.
 *
 * The old field is left on the documents in the database. Nothing reads it any
 * more, and leaving it means this script can be re-run and the original data
 * can still be inspected. Run with:
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/migrate-venture-attendance.ts
 *
 * Pass `--dry` to report what it would write without writing anything.
 */
import mongoose from 'mongoose';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const MIGRATION_REMARK = 'Migrated from the previous per-activity attendance field.';

async function main() {
  const dry = process.argv.includes('--dry');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  await mongoose.connect(uri);
  const models = await import('../src/models');

  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id name').lean().exec();
  if (!admin) throw new Error('No admin account found — nobody to attribute migrated marks to.');

  // Read the raw collection: the field is no longer in the schema, so a normal
  // Mongoose query would not return it.
  const legacy = await models.StudentVentureActivity.collection
    .find<{
      _id: mongoose.Types.ObjectId;
      studentVentureId: mongoose.Types.ObjectId;
      ventureActivityId: mongoose.Types.ObjectId;
      attendanceStatus: 'PRESENT' | 'ABSENT';
    }>({ attendanceStatus: { $in: ['PRESENT', 'ABSENT'] } })
    .toArray();

  console.log(`Found ${legacy.length} legacy mark(s) worth migrating.`);

  if (legacy.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const activities = await models.VentureActivity.find()
    .select('_id activityCode startDate')
    .lean()
    .exec();
  const activityById = new Map(activities.map((activity) => [activity._id.toString(), activity]));

  const operations = [];
  let skipped = 0;

  for (const record of legacy) {
    const activity = activityById.get(String(record.ventureActivityId));

    if (!activity?.startDate) {
      skipped += 1;
      continue;
    }

    operations.push({
      updateOne: {
        filter: {
          ventureActivityId: record.ventureActivityId,
          studentVentureId: record.studentVentureId,
          date: models.attendanceDay(activity.startDate),
        },
        update: {
          // `$setOnInsert`, not `$set`: re-running must never overwrite a mark
          // an administrator has since corrected in the new register.
          $setOnInsert: {
            ventureActivityId: record.ventureActivityId,
            studentVentureId: record.studentVentureId,
            date: models.attendanceDay(activity.startDate),
            status: record.attendanceStatus,
            markedAt: new Date(),
            markedBy: admin._id,
            remarks: MIGRATION_REMARK,
          },
        },
        upsert: true,
      },
    });
  }

  if (skipped > 0) {
    console.log(`  ${skipped} skipped — their activity has no start date to file them under.`);
  }

  if (dry) {
    console.log(`Dry run: would write ${operations.length} attendance row(s).`);
    console.log(`  Attributed to ${admin.name}, dated at each activity's start date.`);
    await mongoose.disconnect();
    return;
  }

  const result = await models.VentureActivityAttendance.bulkWrite(operations);

  console.log(`Inserted ${result.upsertedCount} row(s).`);
  console.log(`  ${operations.length - result.upsertedCount} already existed and were left alone.`);
  console.log(`  Attributed to ${admin.name}; each row carries a migration remark.`);
  console.log('The old attendanceStatus field is untouched and is no longer read by anything.');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
