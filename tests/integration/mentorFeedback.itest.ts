/**
 * Presentation instances and mentor feedback — presentations, per-student
 * received marks, QR tokens, the redirect, and Google Form ingestion — against
 * a real MongoDB, through the service layer the routes and actions call.
 *
 * Covers the acceptance tests: pending → no QR/no feedback; received → QR and
 * redirect; per-stage forms; multiple mentors; duplicates; Received → Pending →
 * Received; no form configured; tampered tokens; completion unlocking the next
 * stage — and, per presentation instance: several presentations per stage, the
 * same student in more than one, feedback kept apart per presentation, the
 * feedback count over received students only, cancelling, and the guards that
 * keep feedback history from being deleted. Leaves the shared activities' form
 * configuration as it found it.
 *
 * Requires MONGODB_URI and seeded activities. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createStudentVenture, getVentureProgress } =
  await import('@/services/ventures/studentVentureService');
const presentations = await import('@/services/ventures/presentationService');
const svc = await import('@/services/ventures/mentorFeedbackService');
const { googleFormFeedbackPayloadSchema } = await import('@/validators/mentorFeedback');
const { feedbackTally } = await import('@/lib/rules/mentorFeedback');
const { formatDate } = await import('@/lib/utils/dates');

const SUFFIX = `mf-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;
const BASE = 'https://iev.example.test';

const FORM_A = '1FAIpQLSd_stage_one_form_aaaaaaaaaaaa';
const FORM_B = '1FAIpQLSd_stage_two_form_bbbbbbbbbbbb';
const template = (formId: string) =>
  `https://docs.google.com/forms/d/e/${formId}/viewform?usp=pp_url` +
  '&entry.1=%7B%7BIEV_TOKEN%7D%7D&entry.2=%7B%7BIEV_STUDENT%7D%7D&entry.3=%7B%7BIEV_STAGE%7D%7D' +
  '&entry.4=%7B%7BIEV_DATE%7D%7D';

let adminId: string;
const studentIds: string[] = [];
const ventureIds: string[] = [];
const createdPresentationIds: string[] = [];
let stage1Id: string;
let stage2Id: string;
let aStage1: string; // student A, stage 1 record
let aStage2: string;
let bStage1: string;
let cStage1: string;
let savedForms: Record<string, unknown> = {};

// Participants: one student in one presentation.
let pA1: string; // A in the 10 Sep presentation of stage 1
let pB1: string;
let pC1: string;
let pA2: string; // A in stage 2
let pA1Again: string; // A in a second, 17 Sep presentation of stage 1
let sitting1: string;
let sittingAgain: string;

function tokenFromUrl(url: string): string {
  return url.split('/feedback/')[1]!;
}

async function makeStudent(label: string, name: string) {
  const userId = (
    await createUser({
      role: 'STUDENT',
      name,
      email: email(label),
      status: 'ACTIVE',
      profile: { rollNumber: `${label}-${SUFFIX}`, batch: '2026' },
    })
  ).userId;
  const ventureId = (
    await createStudentVenture({
      studentId: userId,
      ventureName: `Venture ${label}`,
      status: 'ACTIVE',
    })
  ).studentVentureId;
  studentIds.push(userId);
  ventureIds.push(ventureId);
  const progress = await getVentureProgress(ventureId);
  const recordOn = (stageId: string) =>
    progress.find((p) => p.activity._id.toString() === stageId)!.recordId;
  return { userId, ventureId, recordOn };
}

/** Adds a presentation and returns its id and each record's participant id. */
async function addPresentation(
  stageId: string,
  recordIds: string[],
  presentedOn: string,
  driveUrl: string,
) {
  const { presentationId } = await presentations.createPresentation(
    {
      ventureActivityId: stageId,
      presentedOn: new Date(`${presentedOn}T00:00:00.000Z`),
      startTime: '10:00',
      driveUrl,
      status: 'HELD',
      studentRecordIds: recordIds,
    },
    adminId,
  );
  createdPresentationIds.push(presentationId);
  const rows = await models.PresentationParticipant.find({ presentationId }).lean().exec();
  const byRecord = new Map(
    rows.map((row) => [row.studentVentureActivityId.toString(), row._id.toString()]),
  );
  return { presentationId, participant: (recordId: string) => byRecord.get(recordId)! };
}

const tick = (participantId: string, on = true) =>
  presentations.setParticipantReceived(participantId, on, adminId);

function payload(over: Partial<Record<string, unknown>> & { token: string; responseId: string }) {
  return googleFormFeedbackPayloadSchema.parse({
    version: 1,
    formId: 'edit-id',
    publishedUrl: `https://docs.google.com/forms/d/e/${FORM_A}/viewform`,
    submittedAt: new Date().toISOString(),
    respondentEmail: 'mentor1@example.test',
    mentorName: 'Mentor One',
    answers: [
      { question: 'IEV Presentation ID (do not edit)', type: 'TEXT', answer: over.token },
      { question: 'Persona creation', type: 'SCALE', answer: '4' },
      { question: 'Key strengths', type: 'PARAGRAPH_TEXT', answer: 'Clear customer insight.' },
    ],
    ...over,
  });
}

async function qrToken(participantId: string): Promise<string> {
  const qr = await svc.getFeedbackQr(participantId, BASE);
  if (!qr.available) throw new Error(`expected a QR, got ${qr.reason}`);
  return tokenFromUrl(qr.url);
}

beforeAll(async () => {
  await connectToDatabase();

  const activities = await models.VentureActivity.find({ status: 'ACTIVE' })
    .sort({ order: 1 })
    .limit(2)
    .lean()
    .exec();
  if (activities.length < 2) throw new Error('Run `npm run seed` before the integration tests.');
  stage1Id = activities[0]!._id.toString();
  stage2Id = activities[1]!._id.toString();
  savedForms = Object.fromEntries(
    activities.map((a) => [a._id.toString(), a.feedbackForm ?? null]),
  );

  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!admin) throw new Error('Run `npm run seed` before the integration tests.');
  adminId = admin._id.toString();

  const a = await makeStudent('a', 'Feedback Student A');
  const b = await makeStudent('b', 'Feedback Student B');
  const c = await makeStudent('c', 'Feedback Student C');
  aStage1 = a.recordOn(stage1Id);
  aStage2 = a.recordOn(stage2Id);
  bStage1 = b.recordOn(stage1Id);
  cStage1 = c.recordOn(stage1Id);

  // Stage 1 starts without a form; stage 2 gets form B.
  await models.VentureActivity.updateOne(
    { _id: stage1Id },
    { $set: { feedbackForm: null } },
  ).exec();
  await svc.saveFeedbackFormConfig(
    {
      ventureActivityId: stage2Id,
      prefillUrlTemplate: template(FORM_B),
      enabled: true,
      requiredFeedbackCount: 1,
    },
    adminId,
  );

  // 10 Sep: three students scheduled on stage 1.
  const first = await addPresentation(
    stage1Id,
    [aStage1, bStage1, cStage1],
    '2026-09-10',
    'https://drive.google.com/drive/folders/drive-a',
  );
  sitting1 = first.presentationId;
  pA1 = first.participant(aStage1);
  pB1 = first.participant(bStage1);
  pC1 = first.participant(cStage1);

  pA2 = (
    await addPresentation(
      stage2Id,
      [aStage2],
      '2026-09-24',
      'https://drive.google.com/drive/folders/drive-s2',
    )
  ).participant(aStage2);
});

afterAll(async () => {
  for (const [id, form] of Object.entries(savedForms)) {
    await models.VentureActivity.updateOne({ _id: id }, { $set: { feedbackForm: form } }).exec();
  }
  await models.MentorFeedback.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.FeedbackSyncLog.deleteMany({
    studentVentureActivityId: { $in: [aStage1, aStage2, bStage1, cStage1] },
  }).exec();
  await models.PresentationParticipant.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.Presentation.deleteMany({ _id: { $in: createdPresentationIds } }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: studentIds } }).exec();
  await models.User.deleteMany({ _id: { $in: studentIds } }).exec();
  await disconnectFromDatabase();
});

describe('a presentation instance', () => {
  it('keeps its own date, Drive link and students, and starts with nobody received', async () => {
    const list = await presentations.listStagePresentations(stage1Id);
    const mine = list.find((p) => p.id === sitting1)!;
    expect(mine.presentedOn).toBe('2026-09-10T00:00:00.000Z');
    expect(mine.driveUrl).toBe('https://drive.google.com/drive/folders/drive-a');
    expect(mine.participants.map((p) => p.recordId).sort()).toEqual(
      [aStage1, bStage1, cStage1].sort(),
    );
    expect(mine.participants.every((p) => !p.marked)).toBe(true);
  });
});

describe('TEST 1 — pending presentation', () => {
  it('has no QR and issues no token', async () => {
    const result = await svc.getFeedbackQr(pA1, BASE);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe('PRESENTATION_PENDING');

    const participant = await models.PresentationParticipant.findById(pA1).lean().exec();
    expect(participant!.feedbackToken ?? null).toBeNull();
  });

  it('cannot have its token regenerated either', async () => {
    await expect(svc.regenerateFeedbackToken(pA1)).rejects.toThrow(/not been received/i);
  });
});

describe('TEST 10 — received, but no form configured for the stage', () => {
  it('refuses a QR with a clear message and issues no token', async () => {
    await tick(pA1);
    await tick(pB1);

    const result = await svc.getFeedbackQr(pA1, BASE);
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe('NO_FORM');
      expect(result.message).toBe('Feedback form is not configured for this stage.');
    }
    const participant = await models.PresentationParticipant.findById(pA1).lean().exec();
    expect(participant!.feedbackToken ?? null).toBeNull();
  });
});

let tokenA1: string;
let tokenB1: string;

describe('TEST 2 / 3 — received student with a configured form', () => {
  it('issues a QR pointing at the portal, never at Google', async () => {
    await svc.saveFeedbackFormConfig(
      {
        ventureActivityId: stage1Id,
        prefillUrlTemplate: template(FORM_A),
        enabled: true,
        requiredFeedbackCount: 2,
      },
      adminId,
    );

    const result = await svc.getFeedbackQr(pA1, BASE);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.url.startsWith(`${BASE}/feedback/`)).toBe(true);
    expect(result.url).not.toContain('docs.google.com');
    expect(result.svg).toContain('<svg');
    expect(result.details.presentedOn).toBe('2026-09-10T00:00:00.000Z');
    tokenA1 = tokenFromUrl(result.url);
    expect(tokenA1).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns the same token on the next request (lazy, issued once)', async () => {
    expect(await qrToken(pA1)).toBe(tokenA1);
  });

  it('redirects to the stage’s own form, prefilled with the token, name and date', async () => {
    const resolved = await svc.resolveFeedbackLink(tokenA1);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const url = new URL(resolved.formUrl);
    expect(url.pathname).toContain(FORM_A);
    expect(url.searchParams.get('entry.1')).toBe(tokenA1);
    expect(url.searchParams.get('entry.2')).toBe('Feedback Student A');
    expect(url.searchParams.get('entry.4')).toBe(formatDate('2026-09-10T00:00:00.000Z'));
  });

  it('gives each student a different token', async () => {
    tokenB1 = await qrToken(pB1);
    expect(tokenB1).not.toBe(tokenA1);
  });

  it('gives no QR to a student in the same presentation who is not received', async () => {
    const c = await svc.getFeedbackQr(pC1, BASE);
    expect(c.available).toBe(false);
    if (!c.available) expect(c.reason).toBe('PRESENTATION_PENDING');
  });
});

describe('TEST 4 — different stages use different forms', () => {
  it('routes stage 2 to form B', async () => {
    await tick(pA2);
    const resolved = await svc.resolveFeedbackLink(await qrToken(pA2));
    expect(resolved.ok && new URL(resolved.formUrl).pathname).toContain(FORM_B);
  });

  it('refuses a stage-2 presentation ID submitted on stage 1’s form', async () => {
    const result = await svc.ingestGoogleFormFeedback(
      payload({ token: await qrToken(pA2), responseId: `${SUFFIX}-cross` }),
    );
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'FORM_MISMATCH', status: 409 });
  });
});

describe('TEST 5 / 6 / 11 — ingestion, multiple mentors, duplicates, completion', () => {
  it('stores a response against the exact presentation and student, without the ID question', async () => {
    const result = await svc.ingestGoogleFormFeedback(
      payload({ token: tokenA1, responseId: `${SUFFIX}-m1` }),
    );
    expect(result).toMatchObject({ outcome: 'ACCEPTED', status: 200, stageCompleted: false });

    const doc = await models.MentorFeedback.findOne({ googleResponseId: `${SUFFIX}-m1` })
      .lean()
      .exec();
    expect(doc!.participantId!.toString()).toBe(pA1);
    expect(doc!.presentationId!.toString()).toBe(sitting1);
    expect(doc!.studentVentureActivityId.toString()).toBe(aStage1);
    expect(doc!.studentId.toString()).toBe(studentIds[0]);
    expect(doc!.responses.map((r) => r.question)).toEqual(['Persona creation', 'Key strengths']);
  });

  it('updates in place when Google resends the same response id', async () => {
    const result = await svc.ingestGoogleFormFeedback(
      payload({
        token: tokenA1,
        responseId: `${SUFFIX}-m1`,
        answers: [{ question: 'Persona creation', type: 'SCALE', answer: '5' }],
      }),
    );
    expect(result.outcome).toBe('UPDATED');
    expect(
      await models.MentorFeedback.countDocuments({ googleResponseId: `${SUFFIX}-m1` }).exec(),
    ).toBe(1);
  });

  it('supersedes the same mentor’s earlier response instead of counting it twice', async () => {
    await svc.ingestGoogleFormFeedback(
      payload({
        token: tokenA1,
        responseId: `${SUFFIX}-m1b`,
        submittedAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const stage = await svc.getStageFeedback(stage1Id);
    expect(stage.byParticipant[pA1]!.counted).toBe(1);
    const first = await models.MentorFeedback.findOne({ googleResponseId: `${SUFFIX}-m1` })
      .lean()
      .exec();
    expect(first!.superseded).toBe(true);
  });

  it('keeps a second mentor separate, and completes the stage at the required count (2)', async () => {
    const result = await svc.ingestGoogleFormFeedback(
      payload({
        token: tokenA1,
        responseId: `${SUFFIX}-m2`,
        respondentEmail: 'mentor2@example.test',
        mentorName: 'Mentor Two',
      }),
    );
    expect(result).toMatchObject({ outcome: 'ACCEPTED', stageCompleted: true });

    const record = await models.StudentVentureActivity.findById(aStage1).lean().exec();
    expect(record!.status).toBe('COMPLETED');

    const stage = await svc.getStageFeedback(stage1Id);
    expect(stage.byParticipant[pA1]).toMatchObject({ counted: 2, complete: true });
  });

  it('unlocks the next stage once the stage completes', async () => {
    const progress = await getVentureProgress(ventureIds[0]!);
    const next = progress.find((p) => p.recordId === aStage2)!;
    expect(next.unlocked).toBe(true);
  });
});

let tokenA1Again: string;

describe('several presentations on one stage', () => {
  it('adds a later presentation without touching the earlier one', async () => {
    const again = await addPresentation(
      stage1Id,
      [aStage1],
      '2026-09-17',
      'https://drive.google.com/drive/folders/drive-b',
    );
    sittingAgain = again.presentationId;
    pA1Again = again.participant(aStage1);

    const list = await presentations.listStagePresentations(stage1Id);
    const earlier = list.find((p) => p.id === sitting1)!;
    const later = list.find((p) => p.id === sittingAgain)!;
    expect(earlier.driveUrl).toBe('https://drive.google.com/drive/folders/drive-a');
    expect(earlier.participants).toHaveLength(3);
    expect(later.driveUrl).toBe('https://drive.google.com/drive/folders/drive-b');
    expect(later.participants).toHaveLength(1);
    // Date order: 10 Sep before 17 Sep.
    expect(list.findIndex((p) => p.id === sitting1)).toBeLessThan(
      list.findIndex((p) => p.id === sittingAgain),
    );
  });

  it('gives the same student a separate QR for the later presentation', async () => {
    await tick(pA1Again);
    tokenA1Again = await qrToken(pA1Again);
    expect(tokenA1Again).not.toBe(tokenA1);
    const resolved = await svc.resolveFeedbackLink(tokenA1Again);
    expect(resolved.ok && new URL(resolved.formUrl).searchParams.get('entry.4')).toBe(
      formatDate('2026-09-17T00:00:00.000Z'),
    );
  });

  it('keeps each presentation’s feedback apart', async () => {
    await svc.ingestGoogleFormFeedback(
      payload({
        token: tokenA1Again,
        responseId: `${SUFFIX}-again-1`,
        respondentEmail: 'mentor3@example.test',
      }),
    );
    const doc = await models.MentorFeedback.findOne({ googleResponseId: `${SUFFIX}-again-1` })
      .lean()
      .exec();
    expect(doc!.participantId!.toString()).toBe(pA1Again);
    expect(doc!.presentationId!.toString()).toBe(sittingAgain);

    const stage = await svc.getStageFeedback(stage1Id);
    expect(stage.byParticipant[pA1]!.counted).toBe(2);
    expect(stage.byParticipant[pA1Again]!.counted).toBe(1);
  });

  it('owes feedback only to received students', async () => {
    // 10 Sep: A and B presented, C was scheduled but did not.
    const stage = await svc.getStageFeedback(stage1Id);
    const list = await presentations.listStagePresentations(stage1Id);
    const first = list.find((p) => p.id === sitting1)!;
    const received = first.participants.filter((p) => p.marked);
    expect(received.map((p) => p.recordId).sort()).toEqual([aStage1, bStage1].sort());

    const tally = feedbackTally(
      first.participants.map((p) => ({
        received: p.marked,
        countedResponses: stage.byParticipant[p.participantId]!.counted,
      })),
      2,
    );
    // Feedback 1 of 2 — not 1 of 3: C is not owed any.
    expect(tally).toMatchObject({ total: 3, received: 2, complete: 1 });
    expect(stage.byParticipant[pC1]).toMatchObject({ counted: 0, complete: false });
  });
});

describe('TEST 7 — a student sees only their own feedback', () => {
  it('student B’s view of their record contains none of A’s feedback', async () => {
    const b = await svc.getStudentMentorFeedback(bStage1);
    expect(b.counted).toBe(0);
    expect(b.presentations.flatMap((p) => p.entries)).toHaveLength(0);
  });

  it('student A sees each presentation’s feedback separately, without emails or superseded responses', async () => {
    const a = await svc.getStudentMentorFeedback(aStage1);
    expect(a.presentations.map((p) => p.presentedOn)).toEqual([
      '2026-09-10T00:00:00.000Z',
      '2026-09-17T00:00:00.000Z',
    ]);
    const [first, later] = a.presentations;
    expect(first!.entries).toHaveLength(2);
    expect(later!.entries).toHaveLength(1);
    const all = a.presentations.flatMap((p) => p.entries);
    expect(all.every((e) => e.mentorEmail === null && !e.superseded)).toBe(true);
    expect(first!.driveUrl).toBe('https://drive.google.com/drive/folders/drive-a');
    expect(a.complete).toBe(true);
  });
});

describe('TEST 8 / 9 — Received → Pending → Received', () => {
  it('pending deactivates the QR, the redirect and ingestion, but keeps feedback', async () => {
    await svc.ingestGoogleFormFeedback(payload({ token: tokenB1, responseId: `${SUFFIX}-b1` }));
    await tick(pB1, false);

    const qr = await svc.getFeedbackQr(pB1, BASE);
    expect(qr.available).toBe(false);
    expect(await svc.resolveFeedbackLink(tokenB1)).toEqual({ ok: false, reason: 'PENDING' });

    const refused = await svc.ingestGoogleFormFeedback(
      payload({ token: tokenB1, responseId: `${SUFFIX}-b2` }),
    );
    expect(refused).toMatchObject({
      outcome: 'REJECTED',
      reason: 'PRESENTATION_NOT_RECEIVED',
      status: 409,
    });

    expect(
      await models.MentorFeedback.countDocuments({ googleResponseId: `${SUFFIX}-b1` }).exec(),
    ).toBe(1);
  });

  it('received again reactivates the same token', async () => {
    await tick(pB1);
    expect(await qrToken(pB1)).toBe(tokenB1);
    expect((await svc.resolveFeedbackLink(tokenB1)).ok).toBe(true);
  });

  it('regenerating revokes the old token', async () => {
    await svc.regenerateFeedbackToken(pB1);
    expect(await svc.resolveFeedbackLink(tokenB1)).toEqual({ ok: false, reason: 'INVALID' });
  });
});

describe('cancelling, editing and deleting a presentation', () => {
  const edit = (presentationId: string, over: Record<string, unknown>) =>
    presentations.updatePresentation(
      {
        presentationId,
        presentedOn: new Date('2026-09-17T00:00:00.000Z'),
        startTime: '10:00',
        driveUrl: 'https://drive.google.com/drive/folders/drive-b',
        status: 'HELD',
        studentRecordIds: [aStage1],
        ...over,
      },
      adminId,
    );

  it('cancelling switches its feedback links off, and restoring switches them back on', async () => {
    await edit(sittingAgain, { status: 'CANCELLED' });
    expect(await svc.resolveFeedbackLink(tokenA1Again)).toEqual({ ok: false, reason: 'PENDING' });
    const qr = await svc.getFeedbackQr(pA1Again, BASE);
    expect(!qr.available && qr.reason).toBe('PRESENTATION_CANCELLED');
    await expect(tick(pA1Again)).rejects.toThrow(/cancelled/i);

    await edit(sittingAgain, { status: 'HELD' });
    expect((await svc.resolveFeedbackLink(tokenA1Again)).ok).toBe(true);
  });

  it('will not remove a student who has feedback on it, nor delete it', async () => {
    await expect(edit(sittingAgain, { studentRecordIds: [bStage1] })).rejects.toThrow(
      /cannot be removed/i,
    );
    await expect(presentations.deletePresentation(sittingAgain, adminId)).rejects.toThrow(
      /cannot be deleted/i,
    );
  });

  it('removes a student without feedback, and adds another, keeping the rest', async () => {
    const result = await presentations.updatePresentation(
      {
        presentationId: sitting1,
        presentedOn: new Date('2026-09-10T00:00:00.000Z'),
        startTime: '10:00',
        driveUrl: 'https://drive.google.com/drive/folders/drive-a',
        status: 'HELD',
        studentRecordIds: [aStage1, bStage1],
      },
      adminId,
    );
    expect(result).toEqual({ added: 0, removed: 1 });
    expect(await models.PresentationParticipant.exists({ _id: pC1 }).exec()).toBeNull();
    expect(await models.PresentationParticipant.exists({ _id: pA1 }).exec()).not.toBeNull();
  });

  it('deletes a presentation that has no feedback', async () => {
    const extra = await addPresentation(
      stage1Id,
      [cStage1],
      '2026-09-30',
      'https://drive.google.com/drive/folders/drive-c',
    );
    await presentations.deletePresentation(extra.presentationId, adminId);
    expect(await models.Presentation.exists({ _id: extra.presentationId }).exec()).toBeNull();
    expect(
      await models.PresentationParticipant.countDocuments({
        presentationId: extra.presentationId,
      }).exec(),
    ).toBe(0);
  });
});

describe('TEST 12 — invalid and tampered tokens', () => {
  it('rejects malformed and unknown tokens at the redirect', async () => {
    expect(await svc.resolveFeedbackLink('not-a-token')).toEqual({ ok: false, reason: 'INVALID' });
    expect(await svc.resolveFeedbackLink('A'.repeat(43))).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('rejects them at ingestion, and stores nothing', async () => {
    const malformed = await svc.ingestGoogleFormFeedback(
      payload({ token: 'tampered', responseId: `${SUFFIX}-t1` }),
    );
    expect(malformed).toMatchObject({ outcome: 'REJECTED', reason: 'INVALID_TOKEN' });
    const unknown = await svc.ingestGoogleFormFeedback(
      payload({ token: 'B'.repeat(43), responseId: `${SUFFIX}-t2` }),
    );
    expect(unknown).toMatchObject({ outcome: 'REJECTED', reason: 'UNKNOWN_TOKEN', status: 404 });
    expect(
      await models.MentorFeedback.countDocuments({
        googleResponseId: { $in: [`${SUFFIX}-t1`, `${SUFFIX}-t2`] },
      }).exec(),
    ).toBe(0);
  });

  it('pausing a stage’s form makes the link unavailable', async () => {
    await svc.saveFeedbackFormConfig(
      {
        ventureActivityId: stage1Id,
        prefillUrlTemplate: template(FORM_A),
        enabled: false,
        requiredFeedbackCount: 2,
      },
      adminId,
    );
    const qr = await svc.getFeedbackQr(pA1, BASE);
    expect(qr.available).toBe(false);
  });
});
