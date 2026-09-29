/**
 * Mentor feedback — QR tokens, the redirect, and Google Form ingestion —
 * against a real MongoDB, through the service layer the routes call.
 *
 * Covers the acceptance tests: pending → no QR/no feedback; received → QR and
 * redirect; per-stage forms; multiple mentors; duplicates; Received → Pending →
 * Received; no form configured; tampered tokens; completion unlocking the next
 * stage. Leaves the shared activities' form configuration as it found it.
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
const { setPresentationsReceived } = await import('@/services/ventures/presentationService');
const svc = await import('@/services/ventures/mentorFeedbackService');
const { googleFormFeedbackPayloadSchema } = await import('@/validators/mentorFeedback');

const SUFFIX = `mf-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;
const BASE = 'https://iev.example.test';

const FORM_A = '1FAIpQLSd_stage_one_form_aaaaaaaaaaaa';
const FORM_B = '1FAIpQLSd_stage_two_form_bbbbbbbbbbbb';
const template = (formId: string) =>
  `https://docs.google.com/forms/d/e/${formId}/viewform?usp=pp_url` +
  '&entry.1=%7B%7BIEV_TOKEN%7D%7D&entry.2=%7B%7BIEV_STUDENT%7D%7D&entry.3=%7B%7BIEV_STAGE%7D%7D';

let adminId: string;
let studentAId: string;
let studentBId: string;
let ventureAId: string;
let ventureBId: string;
let stage1Id: string;
let stage2Id: string;
let aStage1: string; // student A, stage 1 record
let aStage2: string;
let bStage1: string;
let savedForms: Record<string, unknown> = {};

async function othersReceived(activityId: string, mine: string[]): Promise<string[]> {
  const rows = await models.StudentVentureActivity.find({
    ventureActivityId: activityId,
    _id: { $nin: mine },
    presentationReceivedAt: { $ne: null },
  })
    .select('_id')
    .lean()
    .exec();
  return rows.map((r) => r._id.toString());
}

/** Ticks/unticks only this suite's records, carrying everyone else's marks over. */
async function setReceived(activityId: string, mineReceived: string[], mineAll: string[]) {
  const others = await othersReceived(activityId, mineAll);
  await setPresentationsReceived(activityId, [...others, ...mineReceived], adminId);
}

function tokenFromUrl(url: string): string {
  return url.split('/feedback/')[1]!;
}

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

  studentAId = (
    await createUser({
      role: 'STUDENT',
      name: 'Feedback Student A',
      email: email('a'),
      status: 'ACTIVE',
      profile: { rollNumber: `A-${SUFFIX}`, batch: '2026' },
    })
  ).userId;
  studentBId = (
    await createUser({
      role: 'STUDENT',
      name: 'Feedback Student B',
      email: email('b'),
      status: 'ACTIVE',
      profile: { rollNumber: `B-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  ventureAId = (
    await createStudentVenture({
      studentId: studentAId,
      ventureName: 'Venture A',
      status: 'ACTIVE',
    })
  ).studentVentureId;
  ventureBId = (
    await createStudentVenture({
      studentId: studentBId,
      ventureName: 'Venture B',
      status: 'ACTIVE',
    })
  ).studentVentureId;

  const progressA = await getVentureProgress(ventureAId);
  const progressB = await getVentureProgress(ventureBId);
  aStage1 = progressA.find((p) => p.activity._id.toString() === stage1Id)!.recordId;
  aStage2 = progressA.find((p) => p.activity._id.toString() === stage2Id)!.recordId;
  bStage1 = progressB.find((p) => p.activity._id.toString() === stage1Id)!.recordId;

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
});

afterAll(async () => {
  for (const [id, form] of Object.entries(savedForms)) {
    await models.VentureActivity.updateOne({ _id: id }, { $set: { feedbackForm: form } }).exec();
  }
  const ventureIds = [ventureAId, ventureBId].filter(Boolean);
  const userIds = [studentAId, studentBId].filter(Boolean);
  await models.MentorFeedback.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.FeedbackSyncLog.deleteMany({
    studentVentureActivityId: { $in: [aStage1, aStage2, bStage1] },
  }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();
  await disconnectFromDatabase();
});

describe('TEST 1 — pending presentation', () => {
  it('has no QR and issues no token', async () => {
    const result = await svc.getFeedbackQr(aStage1, BASE);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe('PRESENTATION_PENDING');

    const record = await models.StudentVentureActivity.findById(aStage1).lean().exec();
    expect(record!.feedbackToken ?? null).toBeNull();
  });

  it('cannot have its token regenerated either', async () => {
    await expect(svc.regenerateFeedbackToken(aStage1)).rejects.toThrow(/not been received/i);
  });
});

describe('TEST 10 — received, but no form configured for the stage', () => {
  it('refuses a QR with a clear message and issues no token', async () => {
    await setReceived(stage1Id, [aStage1, bStage1], [aStage1, bStage1]);

    const result = await svc.getFeedbackQr(aStage1, BASE);
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe('NO_FORM');
      expect(result.message).toBe('Feedback form is not configured for this stage.');
    }
    const record = await models.StudentVentureActivity.findById(aStage1).lean().exec();
    expect(record!.feedbackToken ?? null).toBeNull();
  });
});

let tokenA1: string;
let tokenB1: string;

describe('TEST 2 / 3 — received presentation with a configured form', () => {
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

    const result = await svc.getFeedbackQr(aStage1, BASE);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.url.startsWith(`${BASE}/feedback/`)).toBe(true);
    expect(result.url).not.toContain('docs.google.com');
    expect(result.svg).toContain('<svg');
    tokenA1 = tokenFromUrl(result.url);
    expect(tokenA1).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns the same token on the next request (lazy, issued once)', async () => {
    const again = await svc.getFeedbackQr(aStage1, BASE);
    expect(again.available && tokenFromUrl(again.url)).toBe(tokenA1);
  });

  it('redirects to the stage’s own form, prefilled with the token and names', async () => {
    const resolved = await svc.resolveFeedbackLink(tokenA1);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const url = new URL(resolved.formUrl);
    expect(url.pathname).toContain(FORM_A);
    expect(url.searchParams.get('entry.1')).toBe(tokenA1);
    expect(url.searchParams.get('entry.2')).toBe('Feedback Student A');
  });

  it('gives each student a different token', async () => {
    const b = await svc.getFeedbackQr(bStage1, BASE);
    expect(b.available).toBe(true);
    if (b.available) tokenB1 = tokenFromUrl(b.url);
    expect(tokenB1).not.toBe(tokenA1);
  });
});

describe('TEST 4 — different stages use different forms', () => {
  it('routes stage 2 to form B', async () => {
    await setReceived(stage2Id, [aStage2], [aStage2]);
    const qr = await svc.getFeedbackQr(aStage2, BASE);
    expect(qr.available).toBe(true);
    if (!qr.available) return;
    const resolved = await svc.resolveFeedbackLink(tokenFromUrl(qr.url));
    expect(resolved.ok && new URL(resolved.formUrl).pathname).toContain(FORM_B);
  });

  it('refuses a stage-2 presentation ID submitted on stage 1’s form', async () => {
    const qr = await svc.getFeedbackQr(aStage2, BASE);
    if (!qr.available) throw new Error('expected QR');
    const result = await svc.ingestGoogleFormFeedback(
      payload({ token: tokenFromUrl(qr.url), responseId: `${SUFFIX}-cross` }),
    );
    expect(result).toMatchObject({ outcome: 'REJECTED', reason: 'FORM_MISMATCH', status: 409 });
  });
});

describe('TEST 5 / 6 / 11 — ingestion, multiple mentors, duplicates, completion', () => {
  it('stores a response against the exact presentation, without the ID question', async () => {
    const result = await svc.ingestGoogleFormFeedback(
      payload({ token: tokenA1, responseId: `${SUFFIX}-m1` }),
    );
    expect(result).toMatchObject({ outcome: 'ACCEPTED', status: 200, stageCompleted: false });

    const doc = await models.MentorFeedback.findOne({ googleResponseId: `${SUFFIX}-m1` })
      .lean()
      .exec();
    expect(doc!.studentVentureActivityId.toString()).toBe(aStage1);
    expect(doc!.studentId.toString()).toBe(studentAId);
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
    expect(stage.byRecord[aStage1]!.counted).toBe(1);
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
    expect(stage.byRecord[aStage1]).toMatchObject({ counted: 2, complete: true });
    expect(stage.tally.complete).toBeGreaterThanOrEqual(1);
  });

  it('unlocks the next stage once the stage completes', async () => {
    const progress = await getVentureProgress(ventureAId);
    const next = progress.find((p) => p.recordId === aStage2)!;
    expect(next.unlocked).toBe(true);
  });
});

describe('TEST 7 — a student sees only their own feedback', () => {
  it('student B’s view of their record contains none of A’s feedback', async () => {
    const b = await svc.getStudentMentorFeedback(bStage1);
    expect(b.entries).toHaveLength(0);
  });

  it('student A’s view hides mentor emails and superseded responses', async () => {
    const a = await svc.getStudentMentorFeedback(aStage1);
    expect(a.entries).toHaveLength(2);
    expect(a.entries.every((e) => e.mentorEmail === null && !e.superseded)).toBe(true);
    expect(a.complete).toBe(true);
  });
});

describe('TEST 8 / 9 — Received → Pending → Received', () => {
  it('pending deactivates the QR, the redirect and ingestion, but keeps feedback', async () => {
    await svc.ingestGoogleFormFeedback(payload({ token: tokenB1, responseId: `${SUFFIX}-b1` }));
    await setReceived(stage1Id, [aStage1], [aStage1, bStage1]); // untick B

    const qr = await svc.getFeedbackQr(bStage1, BASE);
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
    await setReceived(stage1Id, [aStage1, bStage1], [aStage1, bStage1]);
    const qr = await svc.getFeedbackQr(bStage1, BASE);
    expect(qr.available && tokenFromUrl(qr.url)).toBe(tokenB1);
    expect((await svc.resolveFeedbackLink(tokenB1)).ok).toBe(true);
  });

  it('regenerating revokes the old token', async () => {
    await svc.regenerateFeedbackToken(bStage1);
    expect(await svc.resolveFeedbackLink(tokenB1)).toEqual({ ok: false, reason: 'INVALID' });
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
    const qr = await svc.getFeedbackQr(aStage1, BASE);
    expect(qr.available).toBe(false);
  });
});
