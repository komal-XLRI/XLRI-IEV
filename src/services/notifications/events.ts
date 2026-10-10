import 'server-only';
import { formatDate } from '@/lib/utils/dates';
import {
  notifyAdmins,
  notifyStudents,
  notifyUser,
  stageRecordContext,
} from './notificationService';

/**
 * Every notification the app sends, worded in one place. Each function is
 * called after the change it reports has been saved, and none of them throws.
 */

const studentStageHref = (recordId: string) => `/student/activities/${recordId}`;
const adminStageHref = (activityId: string) => `/admin/venture-activities/${activityId}`;

function when(presentedOn: Date, startTime: string | null) {
  return `${formatDate(presentedOn)}${startTime ? ` at ${startTime}` : ''}`;
}

// ------------------------------------------------------- Presentations ----

export async function presentationScheduled(
  recordIds: string[],
  sitting: { presentedOn: Date; startTime: string | null },
  rescheduled = false,
) {
  for (const ctx of await stageRecordContext(recordIds)) {
    await notifyUser(ctx.studentId, {
      kind: rescheduled ? 'presentation.rescheduled' : 'presentation.scheduled',
      title: rescheduled
        ? `${ctx.stageLabel}: presentation moved`
        : `${ctx.stageLabel}: presentation scheduled`,
      body: `You present on ${when(sitting.presentedOn, sitting.startTime)}.`,
      href: studentStageHref(ctx.recordId),
      tone: rescheduled ? 'warning' : 'info',
    });
  }
}

export async function presentationCancelled(recordIds: string[], presentedOn: Date) {
  for (const ctx of await stageRecordContext(recordIds)) {
    await notifyUser(ctx.studentId, {
      kind: 'presentation.cancelled',
      title: `${ctx.stageLabel}: presentation cancelled`,
      body: `Your presentation on ${formatDate(presentedOn)} is cancelled. A new date will appear on your timeline.`,
      href: studentStageHref(ctx.recordId),
      tone: 'warning',
    });
  }
}

export async function presentationReceived(recordId: string) {
  const [ctx] = await stageRecordContext([recordId]);
  if (!ctx) return;
  await notifyUser(ctx.studentId, {
    kind: 'presentation.received',
    title: `${ctx.stageLabel}: presentation received`,
    body: 'Mentors can now give you feedback by scanning your QR code.',
    href: studentStageHref(ctx.recordId),
    tone: 'success',
  });
}

// ------------------------------------------------------ Mentor feedback ----

export async function mentorFeedbackReceived(recordId: string, mentorName: string | null) {
  const [ctx] = await stageRecordContext([recordId]);
  if (!ctx) return;
  const mentor = mentorName?.trim() || 'A mentor';
  await notifyUser(ctx.studentId, {
    kind: 'feedback.received',
    title: `${ctx.stageLabel}: new mentor feedback`,
    body: `${mentor} gave feedback on your presentation.`,
    href: studentStageHref(ctx.recordId),
    tone: 'info',
  });
  await notifyAdmins({
    kind: 'feedback.received',
    title: `Mentor feedback for ${ctx.studentName}`,
    body: `${mentor} · ${ctx.stageLabel} · ${ctx.ventureName}`,
    href: adminStageHref(ctx.activityId),
    tone: 'info',
  });
}

/** A response from Google that could not be stored against any student. */
export async function mentorFeedbackRejected(reason: string) {
  await notifyAdmins({
    kind: 'feedback.rejected',
    title: 'A mentor feedback response was not saved',
    body: reason,
    href: '/admin/venture-activities',
    tone: 'warning',
  });
}

export async function stageCompleted(recordId: string) {
  const [ctx] = await stageRecordContext([recordId]);
  if (!ctx) return;
  await notifyUser(ctx.studentId, {
    kind: 'stage.completed',
    title: `${ctx.stageLabel} complete`,
    body: 'Your mentor feedback is in. Your next stage is now open on your timeline.',
    href: '/student/timeline',
    tone: 'success',
  });
  await notifyAdmins({
    kind: 'stage.completed',
    title: `${ctx.studentName} completed ${ctx.stageLabel}`,
    body: ctx.ventureName,
    href: adminStageHref(ctx.activityId),
    tone: 'success',
  });
}

// ------------------------------------------------------ HR & behaviour ----

export async function behaviourFeedbackGiven(recordId: string, updated: boolean) {
  const [ctx] = await stageRecordContext([recordId]);
  if (!ctx) return;
  await notifyUser(ctx.studentId, {
    kind: 'behaviour.given',
    title: `${ctx.stageLabel}: HR & behaviour feedback ${updated ? 'updated' : 'given'}`,
    body: 'See your ratings and comments on the stage page.',
    href: studentStageHref(ctx.recordId),
    tone: 'info',
  });
}

// ------------------------------------------------------------ Workshops ----

export async function workshopPublished(workshop: {
  title: string;
  date: Date;
  startTime: string;
}) {
  await notifyStudents({
    kind: 'workshop.published',
    title: `New workshop: ${workshop.title}`,
    body: `${formatDate(workshop.date)} at ${workshop.startTime}.`,
    href: '/student/workshops',
    tone: 'info',
  });
}

export async function workshopCancelled(workshop: { title: string; date: Date }) {
  await notifyStudents({
    kind: 'workshop.cancelled',
    title: `Workshop cancelled: ${workshop.title}`,
    body: `The session on ${formatDate(workshop.date)} will not take place.`,
    href: '/student/workshops',
    tone: 'warning',
  });
}

// -------------------------------------------------- Support activities ----

export async function supportActivityLogged(input: {
  studentId: string;
  studentName: string;
  activityCode: string;
  activityName: string;
  status: string;
}) {
  await notifyAdmins({
    kind: 'support.logged',
    title: `${input.studentName} updated ${input.activityCode} · ${input.activityName}`,
    body: `Set to ${input.status.toLowerCase().replace(/_/g, ' ')}. Confirm completion when it is done.`,
    href: `/admin/students/${input.studentId}`,
    tone: 'info',
  });
}
