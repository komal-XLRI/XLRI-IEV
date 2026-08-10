/**
 * Evidence staging and the "evidence required" rule, against a real MongoDB.
 *
 * Cloudinary is not involved: these tests write the Evidence rows the upload
 * path would have written, and exercise everything that happens on either side
 * of the transfer — the requirement check, the adoption of drafts by the
 * attempt that is created, and the isolation between attempts.
 *
 * That split is deliberate. Whether a file reached Cloudinary is a question
 * about a third party; whether a submission can exist without its evidence is a
 * question about this system, and it is the one that was previously unenforced.
 *
 * Requires MONGODB_URI and a seeded database. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createStudentVenture, getVentureProgress } =
  await import('@/services/ventures/studentVentureService');
const { createSubmission } = await import('@/services/submissions/submissionService');
const { countDraftEvidence, deleteEvidence, listDraftEvidence } =
  await import('@/services/evidence/evidenceService');

const SUFFIX = `evidence-itest-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

let studentId: string;
let otherStudentId: string;
let ventureId: string;
let recordId: string;
let ventureActivityId: string;

/**
 * The row the upload path writes once Cloudinary has accepted a file and the
 * server has re-verified its signature.
 */
async function stageDraft(fileName: string, studentVentureActivityId = recordId) {
  const created = await models.Evidence.create({
    submissionId: null,
    studentVentureActivityId,
    fileName,
    fileUrl: `https://res.cloudinary.com/demo/raw/upload/${SUFFIX}/${fileName}`,
    publicId: `iev-tracker/evidence/${studentVentureActivityId}/${SUFFIX}-${fileName}`,
    fileType: 'application/pdf',
    resourceType: 'raw',
    fileSize: 2048,
    uploadedBy: studentId,
    uploadedAt: new Date(),
  });

  return created._id.toString();
}

/**
 * Safe because the activity is this file's own, created in `beforeAll` and
 * deleted in `afterAll`. Flipping the flag on a seeded activity would leave
 * the programme's reference data altered for every other suite — and for the
 * running application — if this file ever failed part-way through.
 */
async function setEvidenceRequired(required: boolean) {
  await models.VentureActivity.updateOne(
    { _id: ventureActivityId },
    { $set: { evidenceRequired: required } },
  ).exec();
}

beforeAll(async () => {
  await connectToDatabase();

  const seeded = await models.VentureActivity.findOne({ status: 'ACTIVE' })
    .sort({ order: 1 })
    .lean()
    .exec();
  if (!seeded) throw new Error('Run `npm run seed` before the integration tests.');

  studentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Evidence Student',
      email: email('student'),
      status: 'ACTIVE',
      profile: { rollNumber: `ROLL-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  otherStudentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Other Student',
      email: email('other'),
      status: 'ACTIVE',
      profile: { rollNumber: `ROLL-OTHER-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  // This file's own activity, so the evidence flag can be flipped per test
  // without touching the twelve real ones. It sits last in the order and
  // borrows the seeded term, which is the only shared thing it reads.
  ventureActivityId = (
    await models.VentureActivity.create({
      activityCode: `EVI${Date.now().toString().slice(-6)}`,
      name: 'Evidence Fixture Activity',
      termId: seeded.termId,
      order: 9000,
      startDate: seeded.startDate,
      endDate: seeded.endDate,
      maxAttempts: 3,
      evidenceRequired: false,
      status: 'ACTIVE',
    })
  )._id.toString();

  ventureId = (
    await createStudentVenture({
      studentId,
      ventureName: 'Evidence Venture',
      status: 'ACTIVE',
    })
  ).studentVentureId;

  const progress = await getVentureProgress(ventureId);
  recordId = progress.find((p) => p.activity._id.toString() === ventureActivityId)!.recordId;

  // Progression unlocks an activity only once everything before it is done.
  // The fixture sits at the end of the order, so the rest of this venture is
  // marked complete — the subject here is the evidence rule, not the ladder.
  await models.StudentVentureActivity.updateMany(
    { studentVentureId: ventureId, _id: { $ne: recordId } },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  ).exec();
});

afterAll(async () => {
  const records = await models.StudentVentureActivity.find({ studentVentureId: ventureId })
    .select('_id')
    .lean()
    .exec();
  const recordIds = records.map((r) => r._id);

  await models.Evidence.deleteMany({ studentVentureActivityId: { $in: recordIds } }).exec();
  await models.VentureSubmission.deleteMany({
    studentVentureActivityId: { $in: recordIds },
  }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: ventureId }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: ventureId }).exec();
  await models.StudentVenture.deleteOne({ _id: ventureId }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: [studentId, otherStudentId] } }).exec();
  await models.User.deleteMany({ _id: { $in: [studentId, otherStudentId] } }).exec();

  // The fixture activity leaves with the fixtures. Left behind it would be a
  // thirteenth activity on every venture in the database.
  await models.VentureActivity.deleteOne({ _id: ventureActivityId }).exec();

  await disconnectFromDatabase();
});

/** Each test starts from a clean, unsubmitted activity record. */
beforeEach(async () => {
  const records = await models.StudentVentureActivity.find({ studentVentureId: ventureId })
    .select('_id')
    .lean()
    .exec();
  const recordIds = records.map((r) => r._id);

  await models.Evidence.deleteMany({ studentVentureActivityId: { $in: recordIds } }).exec();
  await models.VentureSubmission.deleteMany({
    studentVentureActivityId: { $in: recordIds },
  }).exec();
  await models.StudentVentureActivity.updateOne(
    { _id: recordId },
    {
      $set: {
        attemptNumber: 0,
        status: 'NOT_STARTED',
        facultyReviewStatus: 'PENDING',
        mentorReviewStatus: 'PENDING',
        currentSubmissionId: null,
        completedAt: null,
      },
    },
  ).exec();

  await setEvidenceRequired(false);
});

describe('staging evidence before an attempt exists', () => {
  it('keeps a draft invisible to the submission history', async () => {
    await stageDraft('draft.pdf');

    const drafts = await listDraftEvidence(recordId);
    expect(drafts).toHaveLength(1);

    // Nothing that reads evidence for review or export looks up a null
    // submission, so a staged file cannot leak into either.
    const attached = await models.Evidence.find({ submissionId: { $ne: null } })
      .lean()
      .exec();
    expect(attached.map((file) => file.fileName)).not.toContain('draft.pdf');
  });

  it('counts only unadopted files', async () => {
    await stageDraft('one.pdf');
    await stageDraft('two.pdf');
    expect(await countDraftEvidence(recordId)).toBe(2);
  });
});

describe('the evidence requirement', () => {
  it('refuses a submission when the activity requires evidence and none is staged', async () => {
    await setEvidenceRequired(true);

    await expect(
      createSubmission({ studentVentureActivityId: recordId, content: 'Work done' }, studentId),
    ).rejects.toThrow(/requires evidence/i);

    // The attempt must not have been consumed by the refusal.
    const record = await models.StudentVentureActivity.findById(recordId).lean().exec();
    expect(record!.attemptNumber).toBe(0);
    expect(record!.status).toBe('NOT_STARTED');
  });

  it('allows the submission once a file is staged', async () => {
    await setEvidenceRequired(true);
    await stageDraft('evidence.pdf');

    const result = await createSubmission(
      { studentVentureActivityId: recordId, content: 'Work done' },
      studentId,
    );

    expect(result.attemptNumber).toBe(1);
    expect(result.evidenceAttached).toBe(1);
  });

  it('still allows a submission with no evidence when it is optional', async () => {
    const result = await createSubmission(
      { studentVentureActivityId: recordId, content: 'Work done' },
      studentId,
    );

    expect(result.attemptNumber).toBe(1);
    expect(result.evidenceAttached).toBe(0);
  });
});

describe('adoption by the attempt', () => {
  it('binds every staged file to the submission that was created', async () => {
    await stageDraft('a.pdf');
    await stageDraft('b.pdf');

    const { submissionId } = await createSubmission(
      { studentVentureActivityId: recordId, content: 'Work done' },
      studentId,
    );

    const attached = await models.Evidence.find({ submissionId }).lean().exec();
    expect(attached.map((file) => file.fileName).sort()).toEqual(['a.pdf', 'b.pdf']);
    expect(await countDraftEvidence(recordId)).toBe(0);
  });

  it('does not hand a later attempt the earlier attempt files', async () => {
    await stageDraft('first-attempt.pdf');
    const first = await createSubmission(
      { studentVentureActivityId: recordId, content: 'Attempt one' },
      studentId,
    );

    // A revision request reopens the activity for another attempt.
    await models.StudentVentureActivity.updateOne(
      { _id: recordId },
      { $set: { status: 'REVISION_REQUIRED' } },
    ).exec();

    await stageDraft('second-attempt.pdf');
    const second = await createSubmission(
      { studentVentureActivityId: recordId, content: 'Attempt two' },
      studentId,
    );

    const firstFiles = await models.Evidence.find({ submissionId: first.submissionId })
      .lean()
      .exec();
    const secondFiles = await models.Evidence.find({ submissionId: second.submissionId })
      .lean()
      .exec();

    expect(firstFiles.map((f) => f.fileName)).toEqual(['first-attempt.pdf']);
    expect(secondFiles.map((f) => f.fileName)).toEqual(['second-attempt.pdf']);
  });

  it('shows the evidence in the submission history once attached', async () => {
    await stageDraft('shown-to-reviewers.pdf');
    await createSubmission({ studentVentureActivityId: recordId, content: 'Work done' }, studentId);

    const { getSubmissionHistory } = await import('@/services/submissions/submissionService');
    const history = await getSubmissionHistory(recordId);

    expect(history[0]!.evidence.map((file) => file.fileName)).toEqual(['shown-to-reviewers.pdf']);
  });
});

describe('removing evidence', () => {
  it('refuses to delete a file another student staged', async () => {
    const id = await stageDraft('mine.pdf');
    await expect(deleteEvidence(id, otherStudentId)).rejects.toThrow(/does not belong to you/i);
  });

  it('refuses to delete a file an attempt has already adopted', async () => {
    const id = await stageDraft('submitted.pdf');
    await createSubmission({ studentVentureActivityId: recordId, content: 'Work done' }, studentId);

    // Reviewers may already have read it; a submitted record is not editable.
    await expect(deleteEvidence(id, studentId)).rejects.toThrow(/no longer be removed/i);
  });
});
