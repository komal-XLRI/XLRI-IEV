/**
 * Notifications — what students and administrators are told as a stage moves
 * on, who can see what, and read / unread per person — against a real
 * MongoDB, through the same services the actions call.
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
const { saveBehaviourFeedback } = await import('@/services/ventures/behaviourService');
const notifications = await import('@/services/notifications/notificationService');
const { googleFormFeedbackPayloadSchema } = await import('@/validators/mentorFeedback');

const SUFFIX = `nt-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;
const FORM = '1FAIpQLSd_notification_form_aaaaaaaaaa';

let stageId: string;
let adminId: string;
let otherAdminId: string;
const userIds: string[] = [];
const ventureIds: string[] = [];
let presentationId: string;
let student: { userId: string; recordId: string; name: string };
let bystander: { userId: string; recordId: string; name: string };

async function makeStudent(label: string, name: string) {
  const { userId } = await createUser({
    role: 'STUDENT',
    name,
    email: email(label),
    status: 'ACTIVE',
    profile: { rollNumber: `${label}-${SUFFIX}`, batch: '2026' },
  });
  const { studentVentureId } = await createStudentVenture({
    studentId: userId,
    ventureName: `Venture ${label} ${SUFFIX}`,
    status: 'ACTIVE',
  });
  userIds.push(userId);
  ventureIds.push(studentVentureId);
  const progress = await getVentureProgress(studentVentureId);
  const recordId = progress.find((p) => p.activity._id.toString() === stageId)!.recordId;
  return { userId, recordId, name };
}

const asStudent = (userId: string) => ({ userId, role: 'STUDENT' as const });
const asAdmin = (userId: string) => ({ userId, role: 'ADMIN' as const });

async function mine(userId: string, role: 'STUDENT' | 'ADMIN') {
  return notifications.listNotifications({ userId, role }, 200);
}

beforeAll(async () => {
  await connectToDatabase();
  const stage = await models.VentureActivity.findOne({ status: 'ACTIVE' })
    .sort({ order: 1 })
    .lean()
    .exec();
  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!stage || !admin) throw new Error('Run `npm run seed` before the integration tests.');
  stageId = stage._id.toString();
  adminId = admin._id.toString();
  otherAdminId = (
    await createUser({
      role: 'ADMIN',
      name: 'Second Admin',
      email: email('admin2'),
      status: 'ACTIVE',
    })
  ).userId;
  userIds.push(otherAdminId);

  student = await makeStudent('s', `Notified Student ${SUFFIX}`);
  bystander = await makeStudent('b', `Bystander ${SUFFIX}`);
});

afterAll(async () => {
  await models.Notification.deleteMany({
    $or: [{ recipientId: { $in: userIds } }, { title: { $regex: SUFFIX } }],
  }).exec();
  await models.MentorFeedback.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.FeedbackSyncLog.deleteMany({ googleResponseId: { $regex: SUFFIX } }).exec();
  await models.PresentationParticipant.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  if (presentationId) await models.Presentation.deleteOne({ _id: presentationId }).exec();
  await models.BehaviourFeedback.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();
  await disconnectFromDatabase();
});

describe('a student through one stage', () => {
  it('is told when a presentation is scheduled for them, and only them', async () => {
    ({ presentationId } = await presentations.createPresentation(
      {
        ventureActivityId: stageId,
        presentedOn: new Date('2026-11-20T00:00:00.000Z'),
        startTime: '14:00',
        driveUrl: null,
        status: 'SCHEDULED',
        studentRecordIds: [student.recordId],
      },
      adminId,
    ));

    const { items, unread } = await mine(student.userId, 'STUDENT');
    const scheduled = items.find((i) => i.kind === 'presentation.scheduled')!;
    expect(scheduled.title).toContain('presentation scheduled');
    expect(scheduled.body).toContain('at 14:00');
    expect(scheduled.href).toBe(`/student/activities/${student.recordId}`);
    expect(scheduled.read).toBe(false);
    expect(unread).toBeGreaterThanOrEqual(1);

    const other = await mine(bystander.userId, 'STUDENT');
    expect(other.items.some((i) => i.kind === 'presentation.scheduled')).toBe(false);
  });

  it('is told when it moves', async () => {
    const participantIds = [student.recordId];
    await presentations.updatePresentation(
      {
        presentationId,
        presentedOn: new Date('2026-11-21T00:00:00.000Z'),
        startTime: '15:30',
        driveUrl: null,
        status: 'SCHEDULED',
        studentRecordIds: participantIds,
      },
      adminId,
    );
    const { items } = await mine(student.userId, 'STUDENT');
    const moved = items.find((i) => i.kind === 'presentation.rescheduled')!;
    expect(moved.body).toContain('at 15:30');
  });

  it('is told it was received, then about feedback and completion — admins too', async () => {
    await svc.saveFeedbackFormConfig(
      {
        presentationId,
        title: `Form ${SUFFIX}`,
        prefillUrlTemplate: `https://docs.google.com/forms/d/e/${FORM}/viewform?usp=pp_url&entry.1=%7B%7BIEV_TOKEN%7D%7D`,
        enabled: true,
        requiredFeedbackCount: 1,
      },
      adminId,
    );
    const participant = (await models.PresentationParticipant.findOne({ presentationId })
      .lean()
      .exec())!;
    await presentations.setParticipantReceived(participant._id.toString(), true, adminId);

    const qr = await svc.getFeedbackQr(participant._id.toString(), 'https://iev.example.test');
    if (!qr.available) throw new Error('expected a QR');
    const result = await svc.ingestGoogleFormFeedback(
      googleFormFeedbackPayloadSchema.parse({
        version: 1,
        token: qr.url.split('/feedback/')[1],
        formId: 'edit',
        publishedUrl: `https://docs.google.com/forms/d/e/${FORM}/viewform`,
        responseId: `r1-${SUFFIX}`,
        submittedAt: new Date().toISOString(),
        respondentEmail: 'mentor@example.test',
        mentorName: 'Dr Notify',
        answers: [{ question: 'Strengths', type: 'PARAGRAPH_TEXT', answer: 'Good.' }],
      }),
    );
    expect(result.stageCompleted).toBe(true);

    const { items } = await mine(student.userId, 'STUDENT');
    const kinds = items.map((i) => i.kind);
    // Newest first: completion, then the feedback, then the received mark.
    expect(kinds.indexOf('stage.completed')).toBeLessThan(kinds.indexOf('feedback.received'));
    expect(kinds.indexOf('feedback.received')).toBeLessThan(kinds.indexOf('presentation.received'));
    expect(items.find((i) => i.kind === 'feedback.received')!.body).toContain('Dr Notify');

    const admin = await mine(adminId, 'ADMIN');
    const adminTitles = admin.items.map((i) => i.title);
    expect(adminTitles).toContain(`Mentor feedback for ${student.name}`);
    expect(adminTitles.some((t) => t.startsWith(`${student.name} completed`))).toBe(true);

    // A student never sees what is meant for administrators.
    expect(items.some((i) => i.title === `Mentor feedback for ${student.name}`)).toBe(false);
  });

  it('is told about HR & behaviour feedback', async () => {
    await saveBehaviourFeedback(
      {
        studentVentureActivityId: student.recordId,
        ratings: { teamwork: 4, communication: 4, discipline: 4, ownership: 4, conduct: 4 },
        comments: '',
      },
      adminId,
    );
    const { items } = await mine(student.userId, 'STUDENT');
    expect(items.find((i) => i.kind === 'behaviour.given')!.title).toContain('given');
  });

  it('is told a scheduled presentation was cancelled', async () => {
    const extra = await presentations.createPresentation(
      {
        ventureActivityId: stageId,
        presentedOn: new Date('2026-12-01T00:00:00.000Z'),
        startTime: null,
        driveUrl: null,
        status: 'SCHEDULED',
        studentRecordIds: [bystander.recordId],
      },
      adminId,
    );
    await presentations.updatePresentation(
      {
        presentationId: extra.presentationId,
        presentedOn: new Date('2026-12-01T00:00:00.000Z'),
        startTime: null,
        driveUrl: null,
        status: 'CANCELLED',
        studentRecordIds: [bystander.recordId],
      },
      adminId,
    );
    const { items } = await mine(bystander.userId, 'STUDENT');
    expect(items.some((i) => i.kind === 'presentation.cancelled')).toBe(true);
    await presentations.deletePresentation(extra.presentationId, adminId);
  });
});

describe('read and unread', () => {
  it('marks one read, then all, for that student only', async () => {
    const before = await mine(student.userId, 'STUDENT');
    const first = before.items.find((i) => !i.read)!;
    await notifications.markNotificationRead(asStudent(student.userId), first.id);
    const after = await mine(student.userId, 'STUDENT');
    expect(after.unread).toBe(before.unread - 1);
    expect(after.items.find((i) => i.id === first.id)!.read).toBe(true);

    await notifications.markAllNotificationsRead(asStudent(student.userId));
    expect((await mine(student.userId, 'STUDENT')).unread).toBe(0);
    expect((await mine(bystander.userId, 'STUDENT')).unread).toBeGreaterThan(0);
  });

  it('keeps an admin notification unread for the other administrators', async () => {
    await notifications.markAllNotificationsRead(asAdmin(adminId));
    expect((await mine(adminId, 'ADMIN')).unread).toBe(0);
    const other = await mine(otherAdminId, 'ADMIN');
    expect(other.unread).toBeGreaterThan(0);
  });

  it('will not let a student mark someone else’s notification read', async () => {
    const theirs = (await mine(bystander.userId, 'STUDENT')).items.find((i) => !i.read)!;
    await notifications.markNotificationRead(asStudent(student.userId), theirs.id);
    const still = (await mine(bystander.userId, 'STUDENT')).items.find((i) => i.id === theirs.id)!;
    expect(still.read).toBe(false);
  });
});

describe('group notifications', () => {
  it('reach students who already exist, not ones added afterwards', async () => {
    await notifications.notifyStudents({ kind: 'test.old', title: `Old news ${SUFFIX}` });
    // Account timestamps are to the millisecond; make sure "after" is after.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const late = await makeStudent('late', `Late Student ${SUFFIX}`);
    await notifications.notifyStudents({ kind: 'test.new', title: `New news ${SUFFIX}` });

    const lateTitles = (await mine(late.userId, 'STUDENT')).items.map((i) => i.title);
    expect(lateTitles).toContain(`New news ${SUFFIX}`);
    expect(lateTitles).not.toContain(`Old news ${SUFFIX}`);

    const earlyTitles = (await mine(bystander.userId, 'STUDENT')).items.map((i) => i.title);
    expect(earlyTitles).toContain(`Old news ${SUFFIX}`);
  });
});
