import 'server-only';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import { sessionOption, withTransaction } from '@/lib/db/transaction';
import {
  MentorFeedback,
  Presentation,
  PresentationParticipant,
  StudentVenture,
  StudentVentureActivity,
  VentureActivity,
} from '@/models';
import { NotFoundError, RuleViolationError, ValidationError } from '@/lib/errors';
import {
  statusOnPresentationCleared,
  statusOnPresentationReceived,
  type PresentationTally,
} from '@/lib/rules/presentations';
import { isParticipantReceived } from '@/lib/rules/mentorFeedback';
import type { PresentationStatus } from '@/lib/constants/presentations';
import type { StudentActivityStatus } from '@/lib/constants/status';
import type { CreatePresentationInput, UpdatePresentationInput } from '@/validators/presentations';
import { evaluateParticipantCompletion } from './mentorFeedbackService';
import { logger } from '@/lib/logger';
import * as notify from '@/services/notifications/events';

/**
 * Presentation instances within a stage.
 *
 * A stage is presented in as many sittings as the administrator creates. Each
 * sitting (`Presentation`) has a date, a Drive link and a set of students; each
 * student in it (`PresentationParticipant`) is individually marked received or
 * not, and only a received participant has a feedback QR.
 *
 * The student's stage record (`StudentVentureActivity`) keeps a summary —
 * `presentationReceivedAt` is their earliest received participation on the
 * stage — so the timeline, progress and reports read exactly as before.
 */

// ------------------------------------------------------------ Students ----

/** A student who can be put on a presentation for this stage. */
export interface StageStudent {
  recordId: string;
  studentVentureId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  status: StudentActivityStatus;
  /** Has presented on this stage — a received presentation, or a completed stage. */
  presented: boolean;
}

/** Everyone enrolled on one stage — the pool a presentation's students come from. */
export async function listStageStudents(ventureActivityId: string): Promise<StageStudent[]> {
  await connectToDatabase();

  const records = await StudentVentureActivity.find({ ventureActivityId })
    .select('studentVentureId status presentationReceivedAt')
    .lean()
    .exec();
  if (records.length === 0) return [];

  const ventures = await StudentVenture.find({
    _id: { $in: records.map((r) => r.studentVentureId) },
  })
    .select('ventureName studentId')
    .populate<{ studentId: { _id: unknown; name: string; email: string } | null }>(
      'studentId',
      'name email',
    )
    .lean()
    .exec();
  const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));

  return records
    .map((record) => {
      const venture = ventureById.get(record.studentVentureId.toString());
      return {
        recordId: record._id.toString(),
        studentVentureId: record.studentVentureId.toString(),
        studentName: venture?.studentId?.name ?? 'Unknown student',
        studentEmail: venture?.studentId?.email ?? '',
        ventureName: venture?.ventureName ?? '—',
        status: record.status,
        presented: record.presentationReceivedAt != null || record.status === 'COMPLETED',
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/**
 * The chosen students' stage records, checked to all be on this stage, with
 * the ids a participant row denormalises.
 */
async function loadStageRecords(ventureActivityId: Types.ObjectId | string, recordIds: string[]) {
  const records = await StudentVentureActivity.find({
    _id: { $in: recordIds },
    ventureActivityId,
  })
    .select('_id studentVentureId')
    .lean()
    .exec();
  if (records.length !== recordIds.length) {
    throw new ValidationError('One of the students is not on this venture activity');
  }

  const ventures = await StudentVenture.find({
    _id: { $in: records.map((r) => r.studentVentureId) },
  })
    .select('_id studentId')
    .lean()
    .exec();
  const studentByVenture = new Map(ventures.map((v) => [v._id.toString(), v.studentId]));

  return records.map((record) => {
    const studentId = studentByVenture.get(record.studentVentureId.toString());
    if (!studentId) throw new ValidationError('One of the students no longer has a venture');
    return { recordId: record._id, studentVentureId: record.studentVentureId, studentId };
  });
}

// ------------------------------------------------ Create / edit / delete ----

/** Creates one presentation and its students. Every student starts not received. */
export async function createPresentation(input: CreatePresentationInput, actorUserId: string) {
  await connectToDatabase();

  const activity = await VentureActivity.findById(input.ventureActivityId)
    .select('_id')
    .lean()
    .exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  const students = await loadStageRecords(activity._id, input.studentRecordIds);
  const actor = new Types.ObjectId(actorUserId);

  const presentationId = await withTransaction(async (session) => {
    const [presentation] = await Presentation.create(
      [
        {
          ventureActivityId: activity._id,
          presentedOn: input.presentedOn,
          startTime: input.startTime,
          driveUrl: input.driveUrl,
          status: input.status,
          createdBy: actor,
          updatedBy: actor,
        },
      ],
      sessionOption(session),
    );
    await PresentationParticipant.insertMany(
      students.map((s) => ({
        presentationId: presentation!._id,
        ventureActivityId: activity._id,
        studentVentureActivityId: s.recordId,
        studentVentureId: s.studentVentureId,
        studentId: s.studentId,
      })),
      sessionOption(session),
    );
    return presentation!._id;
  });

  logger.info('Presentation created', {
    presentationId: presentationId.toString(),
    ventureActivityId: input.ventureActivityId,
    students: students.length,
  });
  // Only a sitting still to come is news to the student; one recorded after
  // the fact (Held) or already cancelled is not.
  if (input.status === 'SCHEDULED') {
    await notify.presentationScheduled(
      students.map((s) => s.recordId.toString()),
      { presentedOn: input.presentedOn, startTime: input.startTime },
    );
  }
  return { presentationId: presentationId.toString() };
}

/**
 * Edits one presentation: its date, time, link, status and students. Students
 * can be added freely; one who already has mentor feedback on this
 * presentation cannot be taken off it — that would orphan the feedback — so
 * the administrator unticks their Received mark instead.
 */
export async function updatePresentation(input: UpdatePresentationInput, actorUserId: string) {
  await connectToDatabase();

  const presentation = await Presentation.findById(input.presentationId).lean().exec();
  if (!presentation) throw new NotFoundError('Presentation not found');

  const students = await loadStageRecords(presentation.ventureActivityId, input.studentRecordIds);
  const existing = await PresentationParticipant.find({ presentationId: presentation._id })
    .select('_id studentVentureActivityId')
    .lean()
    .exec();

  const wanted = new Set(students.map((s) => s.recordId.toString()));
  const have = new Set(existing.map((p) => p.studentVentureActivityId.toString()));
  const toRemove = existing.filter((p) => !wanted.has(p.studentVentureActivityId.toString()));
  const toAdd = students.filter((s) => !have.has(s.recordId.toString()));

  if (toRemove.length > 0) {
    const withFeedback = await MentorFeedback.countDocuments({
      participantId: { $in: toRemove.map((p) => p._id) },
    }).exec();
    if (withFeedback > 0) {
      throw new RuleViolationError(
        'A student with mentor feedback on this presentation cannot be removed from it. Untick their Received mark instead.',
      );
    }
  }

  const actor = new Types.ObjectId(actorUserId);
  await withTransaction(async (session) => {
    await Presentation.updateOne(
      { _id: presentation._id },
      {
        $set: {
          presentedOn: input.presentedOn,
          startTime: input.startTime,
          driveUrl: input.driveUrl,
          status: input.status,
          updatedBy: actor,
        },
      },
      sessionOption(session),
    ).exec();
    if (toRemove.length > 0) {
      await PresentationParticipant.deleteMany(
        { _id: { $in: toRemove.map((p) => p._id) } },
        sessionOption(session),
      ).exec();
    }
    if (toAdd.length > 0) {
      await PresentationParticipant.insertMany(
        toAdd.map((s) => ({
          presentationId: presentation._id,
          ventureActivityId: presentation.ventureActivityId,
          studentVentureActivityId: s.recordId,
          studentVentureId: s.studentVentureId,
          studentId: s.studentId,
        })),
        sessionOption(session),
      );
    }
  });

  // Removing a student, or cancelling / restoring the sitting, can change who
  // has presented on the stage; and restoring it can make feedback that is
  // already in count again.
  const touched = new Set([
    ...existing.map((p) => p.studentVentureActivityId.toString()),
    ...toAdd.map((s) => s.recordId.toString()),
  ]);
  for (const recordId of touched) await syncStageRecordReceipt(recordId, actorUserId);
  if (presentation.status !== input.status) {
    await evaluatePresentationCompletion(presentation._id);
  }

  logger.info('Presentation updated', {
    presentationId: input.presentationId,
    added: toAdd.length,
    removed: toRemove.length,
    status: input.status,
  });

  // Tell the students what changed for them: newly added ones that they are
  // scheduled; those already on it that it moved or was cancelled.
  const kept = existing
    .filter((p) => wanted.has(p.studentVentureActivityId.toString()))
    .map((p) => p.studentVentureActivityId.toString());
  const sitting = { presentedOn: input.presentedOn, startTime: input.startTime };
  if (input.status === 'SCHEDULED') {
    await notify.presentationScheduled(
      toAdd.map((s) => s.recordId.toString()),
      sitting,
    );
    const moved =
      presentation.presentedOn.getTime() !== input.presentedOn.getTime() ||
      (presentation.startTime ?? null) !== input.startTime;
    if (moved || presentation.status === 'CANCELLED') {
      await notify.presentationScheduled(kept, sitting, presentation.status !== 'CANCELLED');
    }
  } else if (input.status === 'CANCELLED' && presentation.status !== 'CANCELLED') {
    await notify.presentationCancelled(kept, input.presentedOn);
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/**
 * Deletes a presentation created by mistake. One that has mentor feedback is
 * history and cannot be deleted — it can be cancelled instead.
 */
export async function deletePresentation(presentationId: string, actorUserId: string) {
  await connectToDatabase();

  const presentation = await Presentation.findById(presentationId).select('_id').lean().exec();
  if (!presentation) throw new NotFoundError('Presentation not found');

  if (await MentorFeedback.exists({ presentationId: presentation._id }).exec()) {
    throw new RuleViolationError(
      'This presentation has mentor feedback, so it cannot be deleted. Set its status to Cancelled instead.',
    );
  }

  const participants = await PresentationParticipant.find({ presentationId: presentation._id })
    .select('studentVentureActivityId')
    .lean()
    .exec();

  await withTransaction(async (session) => {
    await PresentationParticipant.deleteMany(
      { presentationId: presentation._id },
      sessionOption(session),
    ).exec();
    await Presentation.deleteOne({ _id: presentation._id }, sessionOption(session)).exec();
  });

  for (const p of participants) {
    await syncStageRecordReceipt(p.studentVentureActivityId.toString(), actorUserId);
  }

  logger.info('Presentation deleted', { presentationId, students: participants.length });
}

// -------------------------------------------------- Received per student ----

/**
 * Marks one student in one presentation received, or not. Unticking switches
 * their QR and feedback link off at once but keeps every response already
 * given; ticking again switches the same link back on.
 */
export async function setParticipantReceived(
  participantId: string,
  received: boolean,
  actorUserId: string,
) {
  await connectToDatabase();

  const participant = await PresentationParticipant.findById(participantId)
    .select('_id presentationId studentVentureActivityId receivedAt')
    .lean()
    .exec();
  if (!participant) throw new NotFoundError('That student is not on this presentation');

  const presentation = await Presentation.findById(participant.presentationId)
    .select('status')
    .lean()
    .exec();
  if (!presentation) throw new NotFoundError('Presentation not found');
  if (received && presentation.status === 'CANCELLED') {
    throw new RuleViolationError(
      'This presentation is cancelled. Change its status before marking students received.',
    );
  }

  const already = participant.receivedAt != null;
  if (already !== received) {
    await PresentationParticipant.updateOne(
      { _id: participant._id },
      {
        $set: received
          ? { receivedAt: new Date(), markedBy: new Types.ObjectId(actorUserId) }
          : { receivedAt: null, markedBy: null },
      },
    ).exec();
  }

  await syncStageRecordReceipt(participant.studentVentureActivityId.toString(), actorUserId);
  // Before completion is evaluated, so "received" comes ahead of "complete".
  if (received && !already) {
    await notify.presentationReceived(participant.studentVentureActivityId.toString());
  }

  // Feedback given before an untick still counts once the tick is back.
  const stageCompleted = received ? await evaluateParticipantCompletion(participantId) : false;

  logger.info('Participant presentation marked', { participantId, received, stageCompleted });
  return { received, stageCompleted };
}

/**
 * Brings a student's stage record in line with their participations: received
 * from their earliest received presentation on the stage, and back to not
 * received when none remains — except a COMPLETED record, which has had its
 * feedback and is never taken back.
 */
export async function syncStageRecordReceipt(recordId: string, actorUserId?: string) {
  const record = await StudentVentureActivity.findById(recordId)
    .select('status presentationReceivedAt')
    .lean()
    .exec();
  if (!record) return;

  const marked = await PresentationParticipant.find({
    studentVentureActivityId: record._id,
    receivedAt: { $ne: null },
  })
    .select('presentationId receivedAt markedBy')
    .lean()
    .exec();
  const statuses = await presentationStatuses(marked.map((p) => p.presentationId));
  const received = marked
    .filter((p) => {
      const status = statuses.get(p.presentationId.toString());
      return status !== undefined && isParticipantReceived(p, { status });
    })
    .sort((a, b) => a.receivedAt!.getTime() - b.receivedAt!.getTime());

  const first = received[0];
  if (first) {
    const status = statusOnPresentationReceived(record.status);
    if (
      status === record.status &&
      record.presentationReceivedAt?.getTime() === first.receivedAt!.getTime()
    ) {
      return;
    }
    await StudentVentureActivity.updateOne(
      { _id: record._id },
      {
        $set: {
          status,
          presentationReceivedAt: first.receivedAt,
          presentationMarkedBy:
            first.markedBy ?? (actorUserId ? new Types.ObjectId(actorUserId) : null),
        },
      },
    ).exec();
    return;
  }

  if (record.status === 'COMPLETED') return;
  if (!record.presentationReceivedAt && record.status !== 'PRESENTATION_RECEIVED') return;
  await StudentVentureActivity.updateOne(
    { _id: record._id },
    {
      $set: {
        status: statusOnPresentationCleared(record.status),
        presentationReceivedAt: null,
        presentationMarkedBy: null,
      },
    },
  ).exec();
}

async function presentationStatuses(ids: Types.ObjectId[]) {
  if (ids.length === 0) return new Map<string, PresentationStatus>();
  const rows = await Presentation.find({ _id: { $in: ids } })
    .select('_id status')
    .lean()
    .exec();
  return new Map(rows.map((row) => [row._id.toString(), row.status]));
}

async function evaluatePresentationCompletion(presentationId: Types.ObjectId) {
  const received = await PresentationParticipant.find({
    presentationId,
    receivedAt: { $ne: null },
  })
    .select('_id')
    .lean()
    .exec();
  for (const p of received) await evaluateParticipantCompletion(p._id.toString());
}

// ------------------------------------------------------------- Reading ----

export interface ParticipantView {
  participantId: string;
  recordId: string;
  studentName: string;
  studentEmail: string;
  ventureName: string;
  /** The student's own mark on this presentation, whatever the sitting's status. */
  marked: boolean;
  receivedAt: string | null;
  recordStatus: StudentActivityStatus;
}

export interface PresentationView {
  id: string;
  presentedOn: string;
  startTime: string | null;
  driveUrl: string | null;
  status: PresentationStatus;
  migratedFromChecklist: boolean;
  participants: ParticipantView[];
}

/** Every presentation on one stage with its students, in date order. */
export async function listStagePresentations(
  ventureActivityId: string,
): Promise<PresentationView[]> {
  await connectToDatabase();

  const [presentations, participants, students] = await Promise.all([
    Presentation.find({ ventureActivityId })
      .sort({ presentedOn: 1, startTime: 1, createdAt: 1 })
      .lean()
      .exec(),
    PresentationParticipant.find({ ventureActivityId })
      .select('_id presentationId studentVentureActivityId receivedAt')
      .lean()
      .exec(),
    listStageStudents(ventureActivityId),
  ]);

  const studentByRecord = new Map(students.map((s) => [s.recordId, s]));
  const byPresentation = new Map<string, ParticipantView[]>();
  for (const p of participants) {
    const student = studentByRecord.get(p.studentVentureActivityId.toString());
    const list = byPresentation.get(p.presentationId.toString()) ?? [];
    list.push({
      participantId: p._id.toString(),
      recordId: p.studentVentureActivityId.toString(),
      studentName: student?.studentName ?? 'Unknown student',
      studentEmail: student?.studentEmail ?? '',
      ventureName: student?.ventureName ?? '—',
      marked: p.receivedAt != null,
      receivedAt: p.receivedAt ? p.receivedAt.toISOString() : null,
      recordStatus: student?.status ?? 'NOT_STARTED',
    });
    byPresentation.set(p.presentationId.toString(), list);
  }

  return presentations.map((presentation) => ({
    id: presentation._id.toString(),
    presentedOn: presentation.presentedOn.toISOString(),
    startTime: presentation.startTime ?? null,
    driveUrl: presentation.driveUrl ?? null,
    status: presentation.status,
    migratedFromChecklist: presentation.migratedFromChecklist,
    participants: (byPresentation.get(presentation._id.toString()) ?? []).sort((a, b) =>
      a.studentName.localeCompare(b.studentName),
    ),
  }));
}

/** Received / completed counts for every venture activity, keyed by activity id. */
export async function getPresentationTallies(): Promise<Record<string, PresentationTally>> {
  await connectToDatabase();

  const rows = await StudentVentureActivity.aggregate<{
    _id: Types.ObjectId;
    total: number;
    received: number;
    completed: number;
  }>([
    {
      $group: {
        _id: '$ventureActivityId',
        total: { $sum: 1 },
        // A completed record counts as presented even without a received date
        // — stages completed under the old review flow never had one.
        received: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $ne: [{ $ifNull: ['$presentationReceivedAt', null] }, null] },
                  { $eq: ['$status', 'COMPLETED'] },
                ],
              },
              1,
              0,
            ],
          },
        },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      },
    },
  ]).exec();

  return Object.fromEntries(
    rows.map((row) => [
      row._id.toString(),
      { total: row.total, received: row.received, completed: row.completed },
    ]),
  );
}

/** How many presentations each stage has, keyed by activity id. */
export async function getPresentationCounts(): Promise<Record<string, number>> {
  await connectToDatabase();
  const rows = await Presentation.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $group: { _id: '$ventureActivityId', count: { $sum: 1 } } },
  ]).exec();
  return Object.fromEntries(rows.map((row) => [row._id.toString(), row.count]));
}
