/**
 * Removes a venture whose student account no longer exists — the kind that
 * shows as "Unknown" on the ventures list and cannot be removed from the admin
 * UI, because the Delete button lives on the student.
 *
 * Deletes the venture and everything that exists only because of it: its
 * activity and support records, submissions, reviews, evidence records,
 * attendance, presentation seats, mentor and HR feedback — plus any profile,
 * class and workshop rows left behind under the missing student's id.
 * Presentations themselves stay, as history.
 *
 * Refuses a venture whose student still exists: use Admin → Students →
 * Delete for that, which removes the account too. Run with:
 *
 *   npm run remove:orphan-venture -- --name "Kirana Connect"            (preview)
 *   npm run remove:orphan-venture -- --name "Kirana Connect" --confirm  (delete)
 *
 * Uploaded evidence files in Cloudinary are not touched; their count is shown.
 */
import mongoose, { type ClientSession } from 'mongoose';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const name = arg('--name')?.trim();
  const confirm = process.argv.includes('--confirm');
  if (!name) throw new Error('Pass the venture name: --name "Kirana Connect"');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(uri);
  const models = await import('../src/models');

  const ventures = await models.StudentVenture.find({
    ventureName: new RegExp(`^${escapeRegex(name)}$`, 'i'),
  })
    .lean()
    .exec();
  if (ventures.length === 0) {
    console.log(`No venture named "${name}".`);
    return;
  }
  if (ventures.length > 1) {
    console.log(`${ventures.length} ventures are named "${name}" — not removing any:`);
    for (const v of ventures) console.log(`  ${v._id}  student ${v.studentId ?? '—'}`);
    return;
  }

  const venture = ventures[0]!;
  const student = venture.studentId
    ? await models.User.findById(venture.studentId).select('name email role').lean().exec()
    : null;
  console.log(`Venture: ${venture.ventureName} (${venture._id})`);
  if (student) {
    console.log(
      `Its student still exists: ${student.name} <${student.email}> (${student.role}). ` +
        'Use Admin → Students → Delete instead. Nothing removed.',
    );
    return;
  }
  console.log(`Student: missing (id ${venture.studentId ?? '—'})`);

  const ventureId = venture._id;
  const studentId = venture.studentId ?? null;
  const records = await models.StudentVentureActivity.find({ studentVentureId: ventureId })
    .select('_id')
    .lean()
    .exec();
  const recordIds = records.map((r) => r._id);
  const submissions = await models.VentureSubmission.find({
    studentVentureActivityId: { $in: recordIds },
  })
    .select('_id')
    .lean()
    .exec();
  const submissionIds = submissions.map((s) => s._id);

  const byVenture = { studentVentureId: ventureId };
  const byStudent = studentId ? { studentId } : null;
  const counts = {
    activityRecords: recordIds.length,
    supportRecords: await models.StudentSupportActivity.countDocuments(byVenture).exec(),
    submissions: submissionIds.length,
    reviews: await models.Review.countDocuments({ submissionId: { $in: submissionIds } }).exec(),
    evidence: await models.Evidence.countDocuments({
      $or: [
        { studentVentureActivityId: { $in: recordIds } },
        { submissionId: { $in: submissionIds } },
      ],
    }).exec(),
    ventureAttendance: await models.VentureActivityAttendance.countDocuments(byVenture).exec(),
    presentationSeats: await models.PresentationParticipant.countDocuments(byVenture).exec(),
    mentorFeedback: await models.MentorFeedback.countDocuments(byVenture).exec(),
    behaviourFeedback: await models.BehaviourFeedback.countDocuments(byVenture).exec(),
    leftoverProfile: byStudent
      ? await models.StudentProfile.countDocuments({ userId: studentId }).exec()
      : 0,
    leftoverClassAttendance: byStudent
      ? await models.SubjectAttendance.countDocuments(byStudent).exec()
      : 0,
    leftoverWorkshopRows: byStudent
      ? (await models.WorkshopAttendance.countDocuments(byStudent).exec()) +
        (await models.WorkshopFeedback.countDocuments(byStudent).exec())
      : 0,
  };
  console.log('Would remove:', counts);

  if (!confirm) {
    console.log('Preview only. Add --confirm to delete.');
    return;
  }

  const run = async (session: ClientSession | null) => {
    const o = session ? { session } : {};
    await models.Review.deleteMany({ submissionId: { $in: submissionIds } }, o).exec();
    await models.Evidence.deleteMany(
      {
        $or: [
          { studentVentureActivityId: { $in: recordIds } },
          { submissionId: { $in: submissionIds } },
        ],
      },
      o,
    ).exec();
    await models.VentureSubmission.deleteMany({ _id: { $in: submissionIds } }, o).exec();
    await models.StudentVentureActivity.deleteMany(byVenture, o).exec();
    await models.StudentSupportActivity.deleteMany(byVenture, o).exec();
    await models.VentureActivityAttendance.deleteMany(byVenture, o).exec();
    await models.PresentationParticipant.deleteMany(byVenture, o).exec();
    await models.MentorFeedback.deleteMany(byVenture, o).exec();
    await models.BehaviourFeedback.deleteMany(byVenture, o).exec();
    if (byStudent) {
      await models.StudentProfile.deleteMany({ userId: studentId }, o).exec();
      await models.SubjectAttendance.deleteMany(byStudent, o).exec();
      await models.WorkshopAttendance.deleteMany(byStudent, o).exec();
      await models.WorkshopFeedback.deleteMany(byStudent, o).exec();
    }
    await models.StudentVenture.deleteOne({ _id: ventureId }, o).exec();
  };

  // All or nothing where the cluster supports transactions (Atlas does).
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => run(session));
  } catch (error) {
    if (!String(error).includes('Transaction numbers are only allowed')) throw error;
    await run(null);
  } finally {
    await session.endSession();
  }
  console.log(`Removed "${venture.ventureName}" and its records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
