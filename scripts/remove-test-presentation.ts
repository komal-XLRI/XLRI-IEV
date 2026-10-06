/**
 * Removes one presentation together with its mentor feedback — for clearing
 * test data so the flow can be run again end to end.
 *
 * The admin UI refuses to delete a presentation that has feedback (it offers
 * Cancelled instead), because in real use that feedback is the record of the
 * stage. This script is the deliberate way past that rule.
 *
 * It deletes the presentation, its student rows (and so their QR codes) and
 * every mentor feedback response given on it. Then, for each of its students:
 *
 *   - a stage that was completed only by feedback now gone (no feedback left
 *     on that stage) goes back to not completed;
 *   - the stage's "presentation received" is recomputed from any other
 *     presentation the student is on;
 *   - the venture's current stage is recomputed, so a stage unlocked by that
 *     completion locks again.
 *
 * Identify it the way the admin page shows it — the stage code and the
 * presentation's number on that stage:
 *
 *   npm run remove:presentation -- --stage V01                         (list)
 *   npm run remove:presentation -- --stage V01 --number 1              (preview)
 *   npm run remove:presentation -- --stage V01 --number 1 --confirm    (delete)
 *
 * The Google Form's own responses are not touched; delete them in Google
 * Forms if you want those gone too.
 */
import mongoose from 'mongoose';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const stageCode = arg('--stage')?.trim().toUpperCase();
  const number = arg('--number') ? Number(arg('--number')) : null;
  const confirm = process.argv.includes('--confirm');
  if (!stageCode) throw new Error('Pass the stage code: --stage V01');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  await mongoose.connect(uri);
  const models = await import('../src/models');

  const stage = await models.VentureActivity.findOne({ activityCode: stageCode })
    .select('_id activityCode name')
    .lean()
    .exec();
  if (!stage) {
    console.log(`No stage with code ${stageCode}.`);
    return;
  }

  // Same order as the admin page, so "Presentation 01" here is the one there.
  const presentations = await models.Presentation.find({ ventureActivityId: stage._id })
    .sort({ presentedOn: 1, startTime: 1, createdAt: 1 })
    .lean()
    .exec();
  console.log(`${stage.activityCode} · ${stage.name}: ${presentations.length} presentation(s)`);
  for (const [index, p] of presentations.entries()) {
    const [students, feedback] = await Promise.all([
      models.PresentationParticipant.countDocuments({ presentationId: p._id }).exec(),
      models.MentorFeedback.countDocuments({ presentationId: p._id }).exec(),
    ]);
    console.log(
      `  ${index + 1}. ${day(p.presentedOn)}${p.startTime ? ` ${p.startTime}` : ''} · ${p.status}` +
        ` · ${students} student(s) · ${feedback} feedback response(s)` +
        (p.feedbackForm?.title ? ` · form "${p.feedbackForm.title}"` : ''),
    );
  }
  if (number === null) {
    console.log('\nPass --number N to choose one.');
    return;
  }

  const presentation = presentations[number - 1];
  if (!presentation || !Number.isInteger(number)) {
    console.log(`\nThere is no presentation ${number} on ${stage.activityCode}.`);
    return;
  }

  const participants = await models.PresentationParticipant.find({
    presentationId: presentation._id,
  })
    .select('_id studentVentureActivityId studentVentureId studentId')
    .lean()
    .exec();
  const recordIds = participants.map((p) => p.studentVentureActivityId);
  const [records, users] = await Promise.all([
    models.StudentVentureActivity.find({ _id: { $in: recordIds } })
      .select('_id status')
      .lean()
      .exec(),
    models.User.find({ _id: { $in: participants.map((p) => p.studentId) } })
      .select('_id name')
      .lean()
      .exec(),
  ]);
  const statusByRecord = new Map(records.map((r) => [r._id.toString(), r.status]));
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  // A completed stage goes back only if no feedback would be left on it once
  // this presentation's feedback is gone.
  const toReopen: string[] = [];
  console.log(`\nPresentation ${number} on ${day(presentation.presentedOn)}:`);
  for (const p of participants) {
    const recordId = p.studentVentureActivityId.toString();
    const status = statusByRecord.get(recordId) ?? '—';
    const otherFeedback = await models.MentorFeedback.exists({
      studentVentureActivityId: p.studentVentureActivityId,
      presentationId: { $ne: presentation._id },
    }).exec();
    const reopen = status === 'COMPLETED' && !otherFeedback;
    if (reopen) toReopen.push(recordId);
    console.log(
      `  ${nameById.get(p.studentId.toString()) ?? 'Unknown student'} · stage ${status}` +
        (reopen ? ' → will no longer be completed' : ''),
    );
  }
  const feedback = await models.MentorFeedback.countDocuments({
    presentationId: presentation._id,
  }).exec();
  console.log(`  ${feedback} mentor feedback response(s) will be deleted.`);

  if (!confirm) {
    console.log('\nPreview only. Add --confirm to delete.');
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await models.MentorFeedback.deleteMany({ presentationId: presentation._id }, { session });
      await models.PresentationParticipant.deleteMany(
        { presentationId: presentation._id },
        { session },
      );
      await models.Presentation.deleteOne({ _id: presentation._id }, { session });
      if (toReopen.length > 0) {
        await models.StudentVentureActivity.updateMany(
          { _id: { $in: toReopen }, status: 'COMPLETED' },
          {
            $set: {
              status: 'NOT_STARTED',
              completedAt: null,
              presentationReceivedAt: null,
              presentationMarkedBy: null,
            },
          },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }

  // Received dates and the current stage are derived; recompute them the way
  // the app does, now that the presentation is gone.
  const { syncStageRecordReceipt } = await import('../src/services/ventures/presentationService');
  const { refreshCurrentActivity } = await import('../src/services/ventures/studentVentureService');
  for (const recordId of recordIds) await syncStageRecordReceipt(recordId.toString());
  for (const ventureId of new Set(participants.map((p) => p.studentVentureId.toString()))) {
    await refreshCurrentActivity(ventureId);
  }

  console.log(
    `\nDeleted presentation ${number} on ${stage.activityCode}, ${participants.length} student row(s) ` +
      `and ${feedback} feedback response(s); ${toReopen.length} stage(s) no longer completed.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    process.exit();
  });
