/**
 * Announcing a workshop to the student body, against a real MongoDB.
 *
 * `tests/emailTemplate.test.ts` proves the message reads correctly; this proves
 * the right people get it and that the record of having sent it can be trusted.
 * That second half is the point of the whole feature: `isEmailSent` is only
 * worth having if it is never true for a send that did not happen.
 *
 * Delivery is always stubbed. The suite runs against `.env.local`, which in
 * this deployment points at a real relay — an unstubbed run would email the
 * entire cohort.
 *
 * Requires MONGODB_URI. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createWorkshop } = await import('@/services/workshops/workshopService');
const { countEmailRecipients, sendWorkshopAnnouncement } =
  await import('@/services/workshops/workshopEmailService');
type EmailMessage = import('@/lib/email/provider').EmailMessage;

const SUFFIX = `wsmail-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

const BASE = {
  date: new Date('2026-10-08T00:00:00.000Z'),
  startTime: '11:00',
  endTime: '13:00',
  workshopType: 'FOUNDER_TALK' as const,
  mode: 'OFFLINE' as const,
  venue: 'Auditorium 2',
  hostName: 'A. Host',
  speakerName: 'B. Speaker',
};

/** Collects what would have been sent, and optionally refuses one address. */
function collector(refuse?: (message: EmailMessage) => boolean) {
  const sent: EmailMessage[] = [];
  return {
    sent,
    recipients: () => sent.map((message) => message.to),
    deliver: async (message: EmailMessage) => {
      if (refuse?.(message)) throw new Error('relay refused the address');
      sent.push(message);
    },
  };
}

let publishedId: string;
let draftId: string;
let cancelledId: string;
let activeOne: string;
let activeTwo: string;
let inactive: string;

beforeAll(async () => {
  await connectToDatabase();

  activeOne = email('active-one');
  activeTwo = email('active-two');
  inactive = email('inactive');

  await createUser({
    role: 'STUDENT',
    name: 'Mail One',
    email: activeOne,
    status: 'ACTIVE',
    profile: { rollNumber: `WM1-${SUFFIX}`, batch: '2026' },
  });

  await createUser({
    role: 'STUDENT',
    name: 'Mail Two',
    email: activeTwo,
    status: 'ACTIVE',
    profile: { rollNumber: `WM2-${SUFFIX}`, batch: '2026' },
  });

  const left = await createUser({
    role: 'STUDENT',
    name: 'Mail Gone',
    email: inactive,
    status: 'ACTIVE',
    profile: { rollNumber: `WM3-${SUFFIX}`, batch: '2026' },
  });
  await models.User.updateOne({ _id: left.userId }, { $set: { status: 'INACTIVE' } }).exec();

  // A faculty member, to prove the audience is students and not "everyone".
  await createUser({
    role: 'FACULTY',
    name: 'Mail Faculty',
    email: email('faculty'),
    status: 'ACTIVE',
    profile: { designation: 'Professor', department: 'Strategy' },
  });

  publishedId = (
    await createWorkshop({ ...BASE, title: `Published ${SUFFIX}`, status: 'PUBLISHED' })
  )._id.toString();

  draftId = (
    await createWorkshop({ ...BASE, title: `Draft ${SUFFIX}`, status: 'DRAFT' })
  )._id.toString();

  cancelledId = (
    await createWorkshop({ ...BASE, title: `Cancelled ${SUFFIX}`, status: 'CANCELLED' })
  )._id.toString();
});

afterAll(async () => {
  await models.Workshop.deleteMany({ title: new RegExp(SUFFIX) }).exec();
  const users = await models.User.find({ email: new RegExp(SUFFIX) })
    .select('_id')
    .lean()
    .exec();
  const ids = users.map((user) => user._id);
  await models.StudentProfile.deleteMany({ userId: { $in: ids } }).exec();
  await models.FacultyProfile.deleteMany({ userId: { $in: ids } }).exec();
  await models.User.deleteMany({ _id: { $in: ids } }).exec();
  await disconnectFromDatabase();
});

describe('who receives it', () => {
  it('emails every active student and nobody else', async () => {
    const mail = collector();
    const result = await sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver });

    const recipients = mail.recipients();
    expect(recipients).toContain(activeOne);
    expect(recipients).toContain(activeTwo);

    // A deactivated student has left the programme, and faculty are not the
    // audience for a "you are invited" notice.
    expect(recipients).not.toContain(inactive);
    expect(recipients).not.toContain(email('faculty'));

    expect(result.sent).toBe(recipients.length);
    expect(result.failed).toBe(0);
    expect(result.resent).toBe(false);
  });

  it('agrees with the count the confirmation dialog shows', async () => {
    // The dialog promises "N active students"; a different N reaching the
    // relay would make that promise a lie.
    const mail = collector();
    const promised = await countEmailRecipients();
    const result = await sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver });

    expect(result.total).toBe(promised);
  });

  it('addresses each student by their own name', async () => {
    const mail = collector();
    await sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver });

    const message = mail.sent.find((entry) => entry.to === activeOne);
    expect(message?.text).toContain('Hello Mail One,');
    expect(message?.subject).toContain(`Published ${SUFFIX}`);
    expect(message?.html).toContain('Auditorium 2');
  });
});

describe('what gets recorded', () => {
  it('marks the workshop as emailed, with when and how many', async () => {
    const before = new Date();
    const mail = collector();
    const result = await sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver });

    const stored = await models.Workshop.findById(publishedId).lean().exec();
    expect(stored?.isEmailSent).toBe(true);
    expect(stored?.emailRecipientCount).toBe(result.sent);
    expect(stored?.emailSentAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('reports a second send as a resend', async () => {
    const mail = collector();
    const result = await sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver });

    // The flag is already true, so the dialog can warn before sending twice.
    expect(result.resent).toBe(true);
  });

  it('counts only what was delivered when some addresses fail', async () => {
    const mail = collector((message) => message.to === activeTwo);
    const result = await sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver });

    expect(result.failed).toBe(1);
    expect(result.failedRecipients).toContain(activeTwo);
    expect(result.sent).toBe(result.total - 1);

    // One bad address among many is still an announcement that went out.
    const stored = await models.Workshop.findById(publishedId).lean().exec();
    expect(stored?.isEmailSent).toBe(true);
    expect(stored?.emailRecipientCount).toBe(result.sent);
  });

  it('leaves the record untouched when nothing is delivered at all', async () => {
    const before = await models.Workshop.findById(publishedId).lean().exec();
    const mail = collector(() => true);

    await expect(sendWorkshopAnnouncement(publishedId, { deliver: mail.deliver })).rejects.toThrow(
      /could not be delivered/i,
    );

    // The stamp must keep describing the last send that actually happened,
    // not the one that just failed.
    const after = await models.Workshop.findById(publishedId).lean().exec();
    expect(after?.emailSentAt?.getTime()).toBe(before?.emailSentAt?.getTime());
    expect(after?.emailRecipientCount).toBe(before?.emailRecipientCount);
  });
});

describe('what cannot be emailed', () => {
  it('refuses a draft, and does not mark it', async () => {
    const mail = collector();

    await expect(sendWorkshopAnnouncement(draftId, { deliver: mail.deliver })).rejects.toThrow(
      /publish the workshop/i,
    );

    expect(mail.sent).toHaveLength(0);
    expect((await models.Workshop.findById(draftId).lean().exec())?.isEmailSent).toBe(false);
  });

  it('refuses a cancelled workshop', async () => {
    const mail = collector();

    await expect(sendWorkshopAnnouncement(cancelledId, { deliver: mail.deliver })).rejects.toThrow(
      /cannot be emailed/i,
    );
    expect(mail.sent).toHaveLength(0);
  });

  it('refuses a workshop that is not there', async () => {
    await expect(
      sendWorkshopAnnouncement('000000000000000000000000', { deliver: async () => {} }),
    ).rejects.toThrow(/not found/i);
  });
});
