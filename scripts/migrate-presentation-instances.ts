/**
 * Moves the old one-checklist-per-stage presentations into presentation
 * instances.
 *
 * Before, each stage had one Drive folder and one tick per student, kept on
 * the student's stage record, and — on the mentor-feedback branch — the QR
 * token and the feedback hung off that record too. Now a stage has any number
 * of presentations, each with its own students, and the token and feedback
 * belong to one student in one presentation.
 *
 * For every stage with anything to carry over, this creates one presentation
 * marked "from the earlier checklist" (dated from the first received mark, or
 * the stage's start date; its Drive link is the stage's folder link) and puts
 * every student who was ticked, had a QR token or has feedback into it:
 *
 *   - their received mark and who made it are kept as they were;
 *   - an existing QR token moves to their participant row, so a QR already
 *     printed keeps working;
 *   - their mentor feedback is attached to that presentation.
 *
 * Stages still showing a status from the retired submit-and-review flow
 * ("Under review", "Revision required") are moved to "Presentation received"
 * if their presentation is in, or back to "Not started" if not.
 *
 * The mentor feedback form now belongs to each presentation, not the stage. A
 * stage that still has a stage-level form has it copied onto each of its
 * existing presentations that has none — so QR codes already in use keep
 * leading to the same form — and then removed from the stage, so presentations
 * created afterwards start without a form.
 *
 * Nothing else is deleted: stage records keep their received date (it is
 * still the summary the timeline reads), and the stage's folder link is left
 * in place. The old unique index on stage-record tokens is dropped once it is
 * empty. Safe to run more than once. Run with:
 *
 *   npm run migrate:presentations
 *
 * Pass `--dry` to report what it would change without writing anything.
 */
import mongoose, { Types } from 'mongoose';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

interface LegacyRecord {
  _id: Types.ObjectId;
  studentVentureId: Types.ObjectId;
  ventureActivityId: Types.ObjectId;
  presentationReceivedAt?: Date | null;
  presentationMarkedBy?: Types.ObjectId | null;
  feedbackToken?: string | null;
  feedbackTokenCreatedAt?: Date | null;
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function main() {
  const dry = process.argv.includes('--dry');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  await mongoose.connect(uri);
  const models = await import('../src/models');

  // The raw collection: the token fields are no longer in the schema.
  const records = models.StudentVentureActivity.collection;

  const unassigned = await models.MentorFeedback.distinct('studentVentureActivityId', {
    participantId: null,
  }).exec();

  const legacy = (await records
    .find({
      $or: [
        { presentationReceivedAt: { $ne: null } },
        { feedbackToken: { $type: 'string' } },
        { _id: { $in: unassigned } },
      ],
    })
    .project({
      studentVentureId: 1,
      ventureActivityId: 1,
      presentationReceivedAt: 1,
      presentationMarkedBy: 1,
      feedbackToken: 1,
      feedbackTokenCreatedAt: 1,
    })
    .toArray()) as unknown as LegacyRecord[];

  const byStage = new Map<string, LegacyRecord[]>();
  for (const record of legacy) {
    const key = record.ventureActivityId.toString();
    byStage.set(key, [...(byStage.get(key) ?? []), record]);
  }

  console.log(
    `Found ${legacy.length} student record(s) to carry over, across ${byStage.size} stage(s).`,
  );

  let presentationsCreated = 0;
  let participantsCreated = 0;
  let tokensMoved = 0;
  let feedbackAttached = 0;

  for (const [stageId, stageRecords] of byStage) {
    const activity = await models.VentureActivity.findById(stageId)
      .select('activityCode startDate presentationFolderUrl')
      .lean()
      .exec();
    if (!activity) {
      console.warn(`  Skipping ${stageRecords.length} record(s) on missing stage ${stageId}.`);
      continue;
    }

    const ventures = await models.StudentVenture.find({
      _id: { $in: stageRecords.map((r) => r.studentVentureId) },
    })
      .select('_id studentId')
      .lean()
      .exec();
    const studentByVenture = new Map(ventures.map((v) => [v._id.toString(), v.studentId]));

    const receivedDates = stageRecords
      .map((r) => r.presentationReceivedAt)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());
    const presentedOn = utcMidnight(receivedDates[0] ?? activity.startDate);

    const presentation = await models.Presentation.findOne({
      ventureActivityId: activity._id,
      migratedFromChecklist: true,
    })
      .select('_id')
      .lean()
      .exec();
    const existing = presentation
      ? new Set(
          (
            await models.PresentationParticipant.find({ presentationId: presentation._id })
              .select('studentVentureActivityId')
              .lean()
              .exec()
          ).map((p) => p.studentVentureActivityId.toString()),
        )
      : new Set<string>();
    const toAdd = stageRecords.filter(
      (r) => !existing.has(r._id.toString()) && studentByVenture.has(r.studentVentureId.toString()),
    );

    console.log(
      `  ${activity.activityCode}: ${presentation ? 'existing' : 'new'} presentation on ${presentedOn
        .toISOString()
        .slice(0, 10)}, ${toAdd.length} student(s) to add.`,
    );
    if (dry) {
      if (!presentation) presentationsCreated += 1;
      participantsCreated += toAdd.length;
      tokensMoved += toAdd.filter((r) => typeof r.feedbackToken === 'string').length;
      continue;
    }

    let presentationId: Types.ObjectId;
    if (presentation) {
      presentationId = presentation._id;
    } else {
      const created = await models.Presentation.create({
        ventureActivityId: activity._id,
        presentedOn,
        startTime: null,
        driveUrl: activity.presentationFolderUrl ?? null,
        status: 'HELD',
        migratedFromChecklist: true,
      });
      presentationId = created._id;
      presentationsCreated += 1;
    }

    for (const record of toAdd) {
      const token = typeof record.feedbackToken === 'string' ? record.feedbackToken : null;
      const participant = await models.PresentationParticipant.create({
        presentationId,
        ventureActivityId: activity._id,
        studentVentureActivityId: record._id,
        studentVentureId: record.studentVentureId,
        studentId: studentByVenture.get(record.studentVentureId.toString()),
        receivedAt: record.presentationReceivedAt ?? null,
        markedBy: record.presentationMarkedBy ?? null,
        feedbackToken: token,
        feedbackTokenCreatedAt: token ? (record.feedbackTokenCreatedAt ?? new Date()) : null,
      });
      participantsCreated += 1;

      if (token) {
        await records.updateOne(
          { _id: record._id },
          { $unset: { feedbackToken: '', feedbackTokenCreatedAt: '' } },
        );
        tokensMoved += 1;
      }

      const attached = await models.MentorFeedback.updateMany(
        { studentVentureActivityId: record._id, participantId: null },
        { $set: { participantId: participant._id, presentationId } },
      ).exec();
      feedbackAttached += attached.modifiedCount;
    }
  }

  // Leftover statuses of the retired submit-and-review flow. A record whose
  // presentation is in becomes PRESENTATION_RECEIVED; one without goes back to
  // NOT_STARTED. COMPLETED is never touched, and the old reviews stay stored.
  const retired = ['UNDER_REVIEW', 'REVISION_REQUIRED', 'IN_PROGRESS'];
  const toReceived = {
    status: { $in: retired },
    presentationReceivedAt: { $ne: null },
  };
  const toNotStarted = {
    status: { $in: ['UNDER_REVIEW', 'REVISION_REQUIRED'] },
    presentationReceivedAt: null,
  };
  const staleReceived = await records.countDocuments(toReceived);
  const staleOther = await records.countDocuments(toNotStarted);
  console.log(
    `  Old review statuses: ${staleReceived} → Presentation received, ${staleOther} → Not started.`,
  );
  if (!dry) {
    await records.updateMany(toReceived, { $set: { status: 'PRESENTATION_RECEIVED' } });
    await records.updateMany(toNotStarted, { $set: { status: 'NOT_STARTED' } });
  }

  // Stage-level feedback forms → each existing presentation of that stage.
  // Raw collections: the stage field is no longer in the schema.
  const stages = models.VentureActivity.collection;
  const withStageForm = await stages
    .find({ feedbackForm: { $type: 'object' } })
    .project({ activityCode: 1, feedbackForm: 1 })
    .toArray();
  let formsCopied = 0;
  for (const stage of withStageForm) {
    const filter = { ventureActivityId: stage._id, feedbackForm: null };
    const count = await models.Presentation.countDocuments(filter).exec();
    console.log(
      `  ${stage.activityCode}: stage feedback form → ${count} presentation(s) without one.`,
    );
    if (dry) {
      formsCopied += count;
      continue;
    }
    const copied = await models.Presentation.collection.updateMany(filter, {
      $set: { feedbackForm: { title: null, ...stage.feedbackForm } },
    });
    formsCopied += copied.modifiedCount;
    await stages.updateOne({ _id: stage._id }, { $unset: { feedbackForm: '' } });
  }

  if (!dry) {
    const stageIndexes = await stages.indexes();
    if (stageIndexes.some((index) => index.name === 'feedbackForm.publishedFormId_1')) {
      await stages.dropIndex('feedbackForm.publishedFormId_1');
    }

    const indexes = await records.indexes();
    if (indexes.some((index) => index.name === 'feedbackToken_1')) {
      const left = await records.countDocuments({ feedbackToken: { $type: 'string' } });
      if (left === 0) {
        await records.dropIndex('feedbackToken_1');
        console.log('Dropped the old feedbackToken index on student activity records.');
      }
    }
  }

  console.log(
    `${dry ? 'Dry run: would create' : 'Created'} ${presentationsCreated} presentation(s) and ` +
      `${participantsCreated} participant(s); ${dry ? 'would move' : 'moved'} ${tokensMoved} QR token(s)` +
      (dry ? '' : `; attached ${feedbackAttached} feedback response(s)`) +
      `; ${dry ? 'would copy' : 'copied'} the stage feedback form onto ${formsCopied} presentation(s).`,
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
