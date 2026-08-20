import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { User, Workshop } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendEmail, type EmailMessage } from '@/lib/email/provider';
import { workshopAnnouncementEmail } from '@/lib/email/templates';
import { WORKSHOP_MODE_LABELS, WORKSHOP_TYPE_LABELS } from '@/lib/constants/workshops';
import { formatDate } from '@/lib/utils/dates';

/**
 * Announcing a workshop to the student body.
 *
 * No queue and no background worker: the cohort is a few dozen students, so
 * the whole send finishes inside the request that started it and the
 * administrator sees a real result rather than "queued". That choice is what
 * `CONCURRENCY` is protecting — a hundred simultaneous connections would be
 * refused by the relay, and the SMTP transport pools three anyway.
 *
 * A partial failure is reported, not hidden. One bad address among forty must
 * not read as a failed send, and forty bad addresses must not read as a
 * successful one.
 */

const CONCURRENCY = 8;

export interface WorkshopEmailResult {
  /** Active students the announcement was addressed to. */
  total: number;
  sent: number;
  failed: number;
  /** Addresses that were not delivered to, so the failure is actionable. */
  failedRecipients: string[];
  /** True when this workshop had already been emailed before this send. */
  resent: boolean;
}

/** Runs `task` over `items` a few at a time, and never rejects. */
async function inBatches<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = [];

  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    results.push(...(await Promise.allSettled(batch.map(task))));
  }

  return results;
}

/**
 * Who receives the announcement.
 *
 * Active students only. A deactivated account is someone who has left the
 * programme, and faculty and mentors are not the audience for a "you are
 * invited" notice.
 */
export async function countEmailRecipients(): Promise<number> {
  await connectToDatabase();
  return User.countDocuments({ role: 'STUDENT', status: 'ACTIVE' }).exec();
}

/**
 * Sends the workshop details to every active student and records that it went.
 *
 * `deliver` exists so a test can observe and fail individual sends without a
 * relay; production callers pass nothing and get the configured provider.
 */
export async function sendWorkshopAnnouncement(
  workshopId: string,
  options: { deliver?: (message: EmailMessage) => Promise<void> } = {},
): Promise<WorkshopEmailResult> {
  await connectToDatabase();

  const workshop = await Workshop.findById(workshopId).lean().exec();
  if (!workshop) throw new NotFoundError('Workshop not found');

  // Publishing is the decision to make a workshop real; emailing the cohort
  // about a draft would announce something still being written, and about a
  // cancelled one would invite people to something that is not happening.
  if (workshop.status !== 'PUBLISHED') {
    throw new ValidationError(
      workshop.status === 'DRAFT'
        ? 'Publish the workshop before emailing students'
        : `A ${workshop.status.toLowerCase()} workshop cannot be emailed to students`,
    );
  }

  const students = await User.find({ role: 'STUDENT', status: 'ACTIVE' })
    .select('name email')
    .lean()
    .exec();

  if (students.length === 0) {
    throw new ValidationError('There are no active students to email');
  }

  const details = {
    title: workshop.title,
    description: workshop.description,
    typeLabel: WORKSHOP_TYPE_LABELS[workshop.workshopType ?? 'OTHER'],
    dateLabel: formatDate(workshop.date),
    startTime: workshop.startTime,
    endTime: workshop.endTime,
    modeLabel: WORKSHOP_MODE_LABELS[workshop.mode],
    venue: workshop.venue,
    meetingLink: workshop.meetingLink,
    hostName: workshop.hostName,
    hostDesignation: workshop.hostDesignation,
    hostOrganisation: workshop.hostOrganisation,
    speakerName: workshop.speakerName,
    speakerDesignation: workshop.speakerDesignation,
    speakerOrganisation: workshop.speakerOrganisation,
    registrationLink: workshop.registrationLink,
  };

  const deliver = options.deliver ?? sendEmail;

  const outcomes = await inBatches(students, CONCURRENCY, (student) =>
    deliver(
      workshopAnnouncementEmail({ to: student.email, name: student.name, workshop: details }),
    ),
  );

  const failedRecipients = students
    .filter((_, index) => outcomes[index]?.status === 'rejected')
    .map((student) => student.email);

  const sent = students.length - failedRecipients.length;

  logger.info('Workshop announcement sent', {
    workshopId,
    total: students.length,
    sent,
    failed: failedRecipients.length,
  });

  // Nothing got through, so nothing is recorded — the flag has to mean the
  // students were actually told, or it is worse than not having it.
  if (sent === 0) {
    throw new ValidationError(
      'The workshop email could not be delivered to anyone. Check the email settings and try again.',
    );
  }

  const resent = workshop.isEmailSent === true;

  await Workshop.updateOne(
    { _id: workshop._id },
    { $set: { isEmailSent: true, emailSentAt: new Date(), emailRecipientCount: sent } },
  ).exec();

  return {
    total: students.length,
    sent,
    failed: failedRecipients.length,
    failedRecipients,
    resent,
  };
}
