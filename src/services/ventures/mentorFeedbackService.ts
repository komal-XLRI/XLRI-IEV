import 'server-only';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  FeedbackSyncLog,
  MentorFeedback,
  Presentation,
  PresentationParticipant,
  StudentVenture,
  StudentVentureActivity,
  VentureActivity,
  type FeedbackSyncOutcome,
  type IFeedbackFormConfig,
  type IMentorFeedbackAnswer,
} from '@/models';
import { NotFoundError, RuleViolationError } from '@/lib/errors';
import {
  feedbackTally,
  isFeedbackComplete,
  isParticipantReceived,
  isPresentationReceived,
  supersededResponseIds,
} from '@/lib/rules/mentorFeedback';
import {
  checkPrefillTemplate,
  fillPrefillTemplate,
  isTokenQuestion,
  publishedFormIdFromUrl,
} from '@/lib/feedback/googleForm';
import {
  FEEDBACK_TOKEN_PATTERN,
  type FeedbackFormConfigInput,
  type GoogleFormFeedbackPayload,
} from '@/validators/mentorFeedback';
import type { PresentationStatus } from '@/lib/constants/presentations';
import { formatDate } from '@/lib/utils/dates';
import { refreshCurrentActivity } from './studentVentureService';
import { logger } from '@/lib/logger';

/**
 * Mentor feedback on presentations, through QR codes and Google Forms.
 *
 * Everything is keyed on the participant — one student in one presentation.
 * Its token is what the QR carries, its received mark is what switches the
 * link on and off, and its responses are what complete the student's stage.
 */

// ------------------------------------------------------------ Helpers ----

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokenPrefix(token: string | null | undefined): string | null {
  return token ? token.slice(0, 6) : null;
}

/** A form is usable only when it is configured and switched on. */
function usableForm(form: IFeedbackFormConfig | null | undefined): IFeedbackFormConfig | null {
  return form && form.enabled && form.prefillUrlTemplate && form.publishedFormId ? form : null;
}

export function feedbackUrlFor(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/feedback/${token}`;
}

// ----------------------------------------- Presentation configuration ----

/**
 * Sets, changes or clears one presentation's Google Form. Lowering the
 * required count can complete students who already have enough feedback, so
 * the presentation is re-evaluated afterwards. Nothing is ever un-completed by
 * a config change, and no other presentation is touched.
 */
export async function saveFeedbackFormConfig(input: FeedbackFormConfigInput, adminUserId: string) {
  await connectToDatabase();

  const presentation = await Presentation.findById(input.presentationId).exec();
  if (!presentation) throw new NotFoundError('Presentation not found');

  if (input.prefillUrlTemplate === '') {
    presentation.feedbackForm = null;
  } else {
    const check = checkPrefillTemplate(input.prefillUrlTemplate);
    if (!check.ok) throw new RuleViolationError(check.message);

    presentation.feedbackForm = {
      title: input.title,
      prefillUrlTemplate: input.prefillUrlTemplate,
      publishedFormId: check.publishedFormId,
      enabled: input.enabled,
      requiredFeedbackCount: input.requiredFeedbackCount,
      updatedBy: new Types.ObjectId(adminUserId),
      updatedAt: new Date(),
    };
  }

  await presentation.save();
  logger.info('Feedback form configured', {
    presentationId: input.presentationId,
    cleared: input.prefillUrlTemplate === '',
    enabled: input.enabled,
    requiredFeedbackCount: input.requiredFeedbackCount,
  });

  const completed = await reevaluatePresentationCompletion(presentation._id);
  return { completed, ventureActivityId: presentation.ventureActivityId.toString() };
}

/** The public form a mentor would see, for the admin's "View form" link. */
export function publishedFormUrl(publishedFormId: string): string {
  return `https://docs.google.com/forms/d/e/${publishedFormId}/viewform`;
}

// ---------------------------------------------------------------- QR ----

export type FeedbackQrResult =
  | {
      available: true;
      url: string;
      svg: string;
      pngDataUrl: string;
      details: QrDetails;
    }
  | {
      available: false;
      reason: 'PRESENTATION_PENDING' | 'PRESENTATION_CANCELLED' | 'NO_FORM';
      message: string;
      details: QrDetails;
    };

export interface QrDetails {
  studentName: string;
  ventureName: string;
  stage: string;
  presentedOn: string;
  startTime: string | null;
  presentationStatus: PresentationStatus;
  presentationReceived: boolean;
  formConfigured: boolean;
}

async function loadParticipantContext(participantId: string) {
  const participant = await PresentationParticipant.findById(participantId).lean().exec();
  if (!participant) throw new NotFoundError('That student is not on this presentation');

  const [presentation, activity, venture] = await Promise.all([
    Presentation.findById(participant.presentationId).lean().exec(),
    VentureActivity.findById(participant.ventureActivityId).lean().exec(),
    StudentVenture.findById(participant.studentVentureId)
      .select('ventureName studentId')
      .populate<{ studentId: { _id: Types.ObjectId; name: string } | null }>('studentId', 'name')
      .lean()
      .exec(),
  ]);
  if (!presentation) throw new NotFoundError('Presentation not found');
  if (!activity) throw new NotFoundError('Venture activity not found');
  if (!venture) throw new NotFoundError('Venture not found');

  return { participant, presentation, activity, venture };
}

/**
 * The QR for one student in one presentation — admin only, enforced by the
 * caller.
 *
 * Refuses (with a reason, not an error) unless that student's presentation is
 * received and the presentation has a usable form, so an unusable QR is never
 * produced. The token is issued here, lazily, the first time it is needed.
 */
export async function getFeedbackQr(
  participantId: string,
  baseUrl: string,
): Promise<FeedbackQrResult> {
  await connectToDatabase();

  const { participant, presentation, activity, venture } =
    await loadParticipantContext(participantId);
  const received = isParticipantReceived(participant, presentation);
  const form = usableForm(presentation.feedbackForm);

  const details: QrDetails = {
    studentName: venture.studentId?.name ?? 'Unknown student',
    ventureName: venture.ventureName,
    stage: `${activity.activityCode} · ${activity.name}`,
    presentedOn: presentation.presentedOn.toISOString(),
    startTime: presentation.startTime ?? null,
    presentationStatus: presentation.status,
    presentationReceived: received,
    formConfigured: form !== null,
  };

  if (presentation.status === 'CANCELLED') {
    return {
      available: false,
      reason: 'PRESENTATION_CANCELLED',
      message: 'This presentation is cancelled, so it has no feedback QR.',
      details,
    };
  }
  if (!received) {
    return {
      available: false,
      reason: 'PRESENTATION_PENDING',
      message: 'This student’s presentation has not been received yet, so it has no feedback QR.',
      details,
    };
  }
  if (!form) {
    return {
      available: false,
      reason: 'NO_FORM',
      message: 'Feedback form is not configured for this presentation.',
      details,
    };
  }

  let token = participant.feedbackToken ?? null;
  if (!token) {
    // Conditional on the field still being empty, so two admins opening the
    // same QR at once end up with one token rather than two.
    const claimed = await PresentationParticipant.findOneAndUpdate(
      { _id: participant._id, feedbackToken: null },
      { $set: { feedbackToken: newToken(), feedbackTokenCreatedAt: new Date() } },
      { returnDocument: 'after' },
    )
      .select('feedbackToken')
      .lean()
      .exec();
    token =
      claimed?.feedbackToken ??
      (
        await PresentationParticipant.findById(participant._id)
          .select('feedbackToken')
          .lean()
          .exec()
      )?.feedbackToken ??
      null;
    if (!token) throw new Error('Could not issue a feedback token');
    logger.info('Feedback token issued', { participantId, tokenPrefix: tokenPrefix(token) });
  }

  const url = feedbackUrlFor(baseUrl, token);
  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }),
  ]);

  return { available: true, url, svg, pngDataUrl, details };
}

/**
 * Replaces a participant's token, so a QR that has been shared too widely
 * stops working. Feedback already received stays attached to the participant.
 */
export async function regenerateFeedbackToken(participantId: string) {
  await connectToDatabase();

  const participant = await PresentationParticipant.findById(participantId)
    .select('presentationId receivedAt feedbackToken')
    .lean()
    .exec();
  if (!participant) throw new NotFoundError('That student is not on this presentation');
  const presentation = await Presentation.findById(participant.presentationId)
    .select('status')
    .lean()
    .exec();
  if (!presentation || !isParticipantReceived(participant, presentation)) {
    throw new RuleViolationError(
      'This student’s presentation has not been received, so it has no QR.',
    );
  }

  const token = newToken();
  await PresentationParticipant.updateOne(
    { _id: participant._id },
    { $set: { feedbackToken: token, feedbackTokenCreatedAt: new Date() } },
  ).exec();

  logger.info('Feedback token regenerated', {
    participantId,
    previous: tokenPrefix(participant.feedbackToken),
    tokenPrefix: tokenPrefix(token),
  });
}

// ---------------------------------------------------- Mentor redirect ----

export type FeedbackLinkResolution =
  | { ok: true; formUrl: string }
  | { ok: false; reason: 'INVALID' | 'PENDING' | 'NO_FORM' | 'UNAVAILABLE' };

/**
 * What a scanned QR leads to. Every rule is checked against the database as
 * it is now — the token is only a pointer, never a permission.
 */
export async function resolveFeedbackLink(token: string): Promise<FeedbackLinkResolution> {
  if (!FEEDBACK_TOKEN_PATTERN.test(token)) return { ok: false, reason: 'INVALID' };

  await connectToDatabase();

  const participant = await PresentationParticipant.findOne({ feedbackToken: token })
    .select('_id')
    .lean()
    .exec();
  if (!participant) return { ok: false, reason: 'INVALID' };

  const {
    participant: current,
    presentation,
    activity,
    venture,
  } = await loadParticipantContext(participant._id.toString());

  if (!isParticipantReceived(current, presentation)) {
    logger.info('Feedback link used while presentation pending', {
      tokenPrefix: tokenPrefix(token),
    });
    return { ok: false, reason: 'PENDING' };
  }

  // The form is this presentation's own — never another presentation's.
  const form = presentation.feedbackForm;
  if (!form) return { ok: false, reason: 'NO_FORM' };
  if (!usableForm(form) || activity.status !== 'ACTIVE') {
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  const formUrl = fillPrefillTemplate(form.prefillUrlTemplate, {
    token,
    student: venture.studentId?.name ?? '',
    venture: venture.ventureName,
    stage: activity.name,
    date: formatDate(presentation.presentedOn),
  });

  logger.info('Feedback link opened', {
    tokenPrefix: tokenPrefix(token),
    ventureActivityId: activity._id.toString(),
    presentationId: presentation._id.toString(),
  });
  return { ok: true, formUrl };
}

// ------------------------------------------------- Response ingestion ----

export interface IngestResult {
  outcome: FeedbackSyncOutcome;
  /** HTTP status the webhook should answer with. */
  status: number;
  reason?: string;
  message: string;
  mentorFeedbackId?: string;
  stageCompleted?: boolean;
}

async function logSync(entry: {
  outcome: FeedbackSyncOutcome;
  reason?: string;
  payload: GoogleFormFeedbackPayload;
  publishedFormId?: string | null;
  recordId?: Types.ObjectId | null;
  participantId?: Types.ObjectId | null;
  mentorFeedbackId?: Types.ObjectId | null;
}) {
  try {
    await FeedbackSyncLog.create({
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      googleResponseId: entry.payload.responseId,
      publishedFormId: entry.publishedFormId ?? null,
      tokenPrefix: tokenPrefix(entry.payload.token),
      studentVentureActivityId: entry.recordId ?? null,
      participantId: entry.participantId ?? null,
      mentorFeedbackId: entry.mentorFeedbackId ?? null,
    });
  } catch (error) {
    // The log is diagnostic; losing a row must never lose the feedback.
    logger.warn('Feedback sync log write failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function reject(
  payload: GoogleFormFeedbackPayload,
  status: number,
  reason: string,
  message: string,
  extra: {
    publishedFormId?: string | null;
    recordId?: Types.ObjectId | null;
    participantId?: Types.ObjectId | null;
  } = {},
): Promise<IngestResult> {
  logger.warn('Mentor feedback rejected', {
    reason,
    googleResponseId: payload.responseId,
    tokenPrefix: tokenPrefix(payload.token),
  });
  await logSync({ outcome: 'REJECTED', reason, payload, ...extra });
  return { outcome: 'REJECTED', status, reason, message };
}

/**
 * Stores one Google Form response forwarded by the Apps Script.
 *
 * The token must belong to a participant who is received right now, and the
 * response must come from the form configured for that presentation.
 * Duplicates: the same Google response id updates in place; a new response
 * from the same mentor on the same participant supersedes their earlier one.
 */
export async function ingestGoogleFormFeedback(
  payload: GoogleFormFeedbackPayload,
): Promise<IngestResult> {
  await connectToDatabase();

  const publishedFormId = publishedFormIdFromUrl(payload.publishedUrl);

  if (!FEEDBACK_TOKEN_PATTERN.test(payload.token)) {
    return reject(
      payload,
      422,
      'INVALID_TOKEN',
      'The presentation ID on the response is not valid.',
      {
        publishedFormId,
      },
    );
  }

  const participant = await PresentationParticipant.findOne({ feedbackToken: payload.token })
    .lean()
    .exec();
  if (!participant) {
    return reject(payload, 404, 'UNKNOWN_TOKEN', 'No presentation matches this presentation ID.', {
      publishedFormId,
    });
  }
  const ids = {
    publishedFormId,
    recordId: participant.studentVentureActivityId,
    participantId: participant._id,
  };

  const presentation = await Presentation.findById(participant.presentationId)
    .select('status feedbackForm')
    .lean()
    .exec();
  if (!presentation || !isParticipantReceived(participant, presentation)) {
    return reject(
      payload,
      409,
      'PRESENTATION_NOT_RECEIVED',
      'This presentation has not been received. Feedback is currently unavailable.',
      ids,
    );
  }

  const form = presentation.feedbackForm;
  if (!form) {
    return reject(
      payload,
      409,
      'NO_FORM_CONFIGURED',
      'Feedback form is not configured for this presentation.',
      ids,
    );
  }
  if (!usableForm(form)) {
    return reject(
      payload,
      409,
      'FORM_DISABLED',
      'Feedback is currently unavailable for this presentation.',
      ids,
    );
  }
  if (!publishedFormId || publishedFormId !== form.publishedFormId) {
    return reject(
      payload,
      409,
      'FORM_MISMATCH',
      'This response came from a form that is not the one configured for this presentation.',
      ids,
    );
  }

  const responses: IMentorFeedbackAnswer[] = payload.answers
    .filter((item) => !isTokenQuestion(item.question))
    .map((item) => ({ question: item.question, type: item.type, answer: item.answer }));

  const previous = await MentorFeedback.findOne({ googleResponseId: payload.responseId })
    .select('_id participantId studentVentureActivityId')
    .lean()
    .exec();

  const saved = await MentorFeedback.findOneAndUpdate(
    { googleResponseId: payload.responseId },
    {
      $set: {
        presentationId: participant.presentationId,
        participantId: participant._id,
        studentVentureActivityId: participant.studentVentureActivityId,
        studentVentureId: participant.studentVentureId,
        studentId: participant.studentId,
        ventureActivityId: participant.ventureActivityId,
        googleFormId: payload.formId,
        publishedFormId,
        mentorName: payload.mentorName ?? fallbackMentorName(payload.respondentEmail),
        mentorEmail: payload.respondentEmail ?? null,
        submittedAt: payload.submittedAt,
        receivedAt: new Date(),
        responses,
      },
      $setOnInsert: { superseded: false },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  )
    .lean()
    .exec();

  await recomputeSuperseded({ participantId: participant._id });
  if (previous && !previous.participantId?.equals(participant._id)) {
    // An edited response now names a different participant; the old one's
    // counts change too.
    await recomputeSuperseded(
      previous.participantId
        ? { participantId: previous.participantId }
        : { recordId: previous.studentVentureActivityId },
    );
  }

  const stageCompleted = await evaluateParticipantCompletion(participant._id.toString());

  const outcome: FeedbackSyncOutcome = previous ? 'UPDATED' : 'ACCEPTED';
  await logSync({ outcome, payload, ...ids, mentorFeedbackId: saved!._id });
  logger.info(previous ? 'Mentor feedback updated' : 'Mentor feedback received', {
    googleResponseId: payload.responseId,
    participantId: participant._id.toString(),
    presentationId: participant.presentationId.toString(),
    ventureActivityId: participant.ventureActivityId.toString(),
    stageCompleted,
  });

  return {
    outcome,
    status: 200,
    message: previous ? 'Feedback updated.' : 'Feedback stored.',
    mentorFeedbackId: saved!._id.toString(),
    stageCompleted,
  };
}

function fallbackMentorName(email: string | null | undefined): string | null {
  return email ? email.split('@')[0]! : null;
}

/**
 * Marks every response but the latest per mentor as superseded, for one
 * participant — or, for feedback stored before participants existed, for one
 * stage record's unassigned responses.
 */
async function recomputeSuperseded(
  group: { participantId: Types.ObjectId } | { recordId: Types.ObjectId },
) {
  const filter =
    'participantId' in group
      ? { participantId: group.participantId }
      : { studentVentureActivityId: group.recordId, participantId: null };
  const docs = await MentorFeedback.find(filter)
    .select('_id submittedAt mentorEmail googleResponseId superseded')
    .lean()
    .exec();

  const superseded = supersededResponseIds(
    docs.map((doc) => ({
      id: doc._id.toString(),
      submittedAt: doc.submittedAt,
      mentorEmail: doc.mentorEmail,
      googleResponseId: doc.googleResponseId,
    })),
  );

  const changes = docs.filter((doc) => doc.superseded !== superseded.has(doc._id.toString()));
  if (changes.length === 0) return;

  await MentorFeedback.bulkWrite(
    changes.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { superseded: superseded.has(doc._id.toString()) } },
      },
    })),
  );
}

// ------------------------------------------------------ Completion ----

/**
 * Completes the student's stage once one of their presentations on it is
 * received and has the required number of counted responses. Moves forward
 * only: nothing here ever takes a COMPLETED record back.
 */
export async function evaluateParticipantCompletion(participantId: string): Promise<boolean> {
  const participant = await PresentationParticipant.findById(participantId)
    .select(
      '_id presentationId studentVentureActivityId studentVentureId ventureActivityId receivedAt',
    )
    .lean()
    .exec();
  if (!participant) return false;

  const [record, presentation] = await Promise.all([
    StudentVentureActivity.findById(participant.studentVentureActivityId)
      .select('status')
      .lean()
      .exec(),
    Presentation.findById(participant.presentationId).select('status feedbackForm').lean().exec(),
  ]);
  if (!record || record.status === 'COMPLETED' || !presentation) return false;

  const form = usableForm(presentation.feedbackForm);
  if (!form) return false;

  const counted = await MentorFeedback.countDocuments({
    participantId: participant._id,
    superseded: false,
  }).exec();

  if (
    !isFeedbackComplete({
      received: isParticipantReceived(participant, presentation),
      countedResponses: counted,
      requiredFeedbackCount: form.requiredFeedbackCount,
    })
  ) {
    return false;
  }

  // Re-checked at the last moment, so a student unticked a moment ago is not
  // completed by a late response.
  if (
    !(await PresentationParticipant.exists({ _id: participant._id, receivedAt: { $ne: null } }))
  ) {
    return false;
  }

  const result = await StudentVentureActivity.updateOne(
    {
      _id: participant.studentVentureActivityId,
      status: { $ne: 'COMPLETED' },
      presentationReceivedAt: { $ne: null },
    },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  ).exec();
  if (result.modifiedCount === 0) return false;

  await refreshCurrentActivity(participant.studentVentureId.toString());
  logger.info('Stage completed on mentor feedback', { participantId, counted });
  return true;
}

async function reevaluatePresentationCompletion(presentationId: Types.ObjectId): Promise<number> {
  const participants = await PresentationParticipant.find({
    presentationId,
    receivedAt: { $ne: null },
  })
    .select('_id')
    .lean()
    .exec();

  let completed = 0;
  for (const participant of participants) {
    if (await evaluateParticipantCompletion(participant._id.toString())) completed += 1;
  }
  return completed;
}

// ------------------------------------------------------------ Reading ----

export interface MentorFeedbackEntry {
  id: string;
  mentorName: string | null;
  /** Only ever filled in for administrators. */
  mentorEmail: string | null;
  submittedAt: string;
  superseded: boolean;
  responses: IMentorFeedbackAnswer[];
}

function toEntry(
  doc: {
    _id: Types.ObjectId;
    mentorName?: string | null;
    mentorEmail?: string | null;
    submittedAt: Date;
    superseded: boolean;
    responses: IMentorFeedbackAnswer[];
  },
  includeEmail: boolean,
): MentorFeedbackEntry {
  return {
    id: doc._id.toString(),
    mentorName: doc.mentorName ?? null,
    mentorEmail: includeEmail ? (doc.mentorEmail ?? null) : null,
    submittedAt: doc.submittedAt.toISOString(),
    superseded: doc.superseded,
    responses: doc.responses,
  };
}

export interface ParticipantFeedbackSummary {
  counted: number;
  required: number;
  complete: boolean;
}

/** One presentation's feedback form, as the admin sees it. */
export interface PresentationFormView {
  title: string | null;
  prefillUrlTemplate: string;
  /** The plain form, without anything prefilled — for "View form". */
  viewUrl: string;
  enabled: boolean;
  requiredFeedbackCount: number;
}

export interface StageFeedback {
  /** Keyed by presentation id; null where that presentation has no form. */
  forms: Record<string, PresentationFormView | null>;
  /** Keyed by participant id — one student in one presentation. */
  byParticipant: Record<string, ParticipantFeedbackSummary & { entries: MentorFeedbackEntry[] }>;
  /** Out of received participants only, across the stage's presentations. */
  tally: ReturnType<typeof feedbackTally>;
}

/** Everything the admin stage page needs about mentor feedback. */
export async function getStageFeedback(ventureActivityId: string): Promise<StageFeedback> {
  await connectToDatabase();

  const [participants, presentations, docs] = await Promise.all([
    PresentationParticipant.find({ ventureActivityId })
      .select('_id presentationId receivedAt')
      .lean()
      .exec(),
    Presentation.find({ ventureActivityId }).select('_id status feedbackForm').lean().exec(),
    MentorFeedback.find({ ventureActivityId, participantId: { $ne: null } })
      .sort({ submittedAt: -1 })
      .lean()
      .exec(),
  ]);

  const presentationById = new Map(presentations.map((p) => [p._id.toString(), p]));
  const forms: StageFeedback['forms'] = Object.fromEntries(
    presentations.map((p) => [
      p._id.toString(),
      p.feedbackForm
        ? {
            title: p.feedbackForm.title ?? null,
            prefillUrlTemplate: p.feedbackForm.prefillUrlTemplate,
            viewUrl: publishedFormUrl(p.feedbackForm.publishedFormId),
            enabled: p.feedbackForm.enabled,
            requiredFeedbackCount: p.feedbackForm.requiredFeedbackCount,
          }
        : null,
    ]),
  );

  const entriesByParticipant = new Map<string, MentorFeedbackEntry[]>();
  for (const doc of docs) {
    const key = doc.participantId!.toString();
    const list = entriesByParticipant.get(key) ?? [];
    list.push(toEntry(doc, true));
    entriesByParticipant.set(key, list);
  }

  const byParticipant: StageFeedback['byParticipant'] = {};
  const tallyInput: Parameters<typeof feedbackTally>[0][number][] = [];
  for (const participant of participants) {
    const key = participant._id.toString();
    const presentation = presentationById.get(participant.presentationId.toString());
    const entries = entriesByParticipant.get(key) ?? [];
    const counted = entries.filter((e) => !e.superseded).length;
    const required = presentation?.feedbackForm?.requiredFeedbackCount ?? 1;
    // Only a student whose presentation has a form can be owed feedback.
    const received =
      Boolean(presentation?.feedbackForm) &&
      isParticipantReceived(participant, { status: presentation?.status ?? 'CANCELLED' });
    byParticipant[key] = {
      counted,
      required,
      complete: isFeedbackComplete({
        received,
        countedResponses: counted,
        requiredFeedbackCount: required,
      }),
      entries,
    };
    tallyInput.push({ received, countedResponses: counted, requiredFeedbackCount: required });
  }

  return { forms, byParticipant, tally: feedbackTally(tallyInput, 1) };
}

export interface StudentPresentationFeedback {
  participantId: string;
  presentedOn: string;
  startTime: string | null;
  driveUrl: string | null;
  status: PresentationStatus;
  received: boolean;
  formConfigured: boolean;
  required: number;
  counted: number;
  complete: boolean;
  entries: MentorFeedbackEntry[];
}

/**
 * A student's own presentations on one stage and the feedback on each. The
 * caller has already checked that the record is theirs; mentor emails are
 * never included, and only counted (latest per mentor) responses are shown.
 */
export async function getStudentMentorFeedback(recordId: string) {
  await connectToDatabase();

  const record = await StudentVentureActivity.findById(recordId)
    .select('ventureActivityId status presentationReceivedAt')
    .lean()
    .exec();
  if (!record) throw new NotFoundError('Activity record not found');

  const [participants, docs] = await Promise.all([
    PresentationParticipant.find({ studentVentureActivityId: record._id })
      .select('_id presentationId receivedAt')
      .lean()
      .exec(),
    MentorFeedback.find({ studentVentureActivityId: record._id, superseded: false })
      .sort({ submittedAt: 1 })
      .lean()
      .exec(),
  ]);
  const presentations = await Presentation.find({
    _id: { $in: participants.map((p) => p.presentationId) },
  })
    .lean()
    .exec();
  const presentationById = new Map(presentations.map((p) => [p._id.toString(), p]));

  const entriesByParticipant = new Map<string, MentorFeedbackEntry[]>();
  const earlier: MentorFeedbackEntry[] = [];
  for (const doc of docs) {
    if (!doc.participantId) {
      earlier.push(toEntry(doc, false));
      continue;
    }
    const key = doc.participantId.toString();
    const list = entriesByParticipant.get(key) ?? [];
    list.push(toEntry(doc, false));
    entriesByParticipant.set(key, list);
  }

  const mine: StudentPresentationFeedback[] = participants
    .flatMap((participant) => {
      const presentation = presentationById.get(participant.presentationId.toString());
      if (!presentation) return [];
      const entries = entriesByParticipant.get(participant._id.toString()) ?? [];
      const received = isParticipantReceived(participant, presentation);
      const required = presentation.feedbackForm?.requiredFeedbackCount ?? 1;
      return [
        {
          participantId: participant._id.toString(),
          presentedOn: presentation.presentedOn.toISOString(),
          startTime: presentation.startTime ?? null,
          driveUrl: presentation.driveUrl ?? null,
          status: presentation.status,
          received,
          formConfigured: Boolean(presentation.feedbackForm),
          required,
          counted: entries.length,
          complete:
            Boolean(presentation.feedbackForm) &&
            isFeedbackComplete({
              received,
              countedResponses: entries.length,
              requiredFeedbackCount: required,
            }),
          entries,
        },
      ];
    })
    .sort((a, b) => a.presentedOn.localeCompare(b.presentedOn));

  // The headline figures follow the latest presentation that has a form —
  // each presentation sets its own required count.
  const latestWithForm = [...mine].reverse().find((p) => p.formConfigured);
  const counted = docs.length;
  return {
    formConfigured: mine.some((p) => p.formConfigured),
    received: isPresentationReceived(record),
    required: latestWithForm?.required ?? 1,
    counted,
    complete: mine.some((p) => p.complete),
    presentations: mine,
    /** Feedback given before presentations were recorded one by one. */
    earlierEntries: earlier,
  };
}

/** Per-stage feedback figures for the activity list, keyed by activity id. */
export async function getFeedbackTallies(): Promise<
  Record<string, { received: number; complete: number; configured: boolean }>
> {
  await connectToDatabase();

  const [activities, participants, presentations, counts] = await Promise.all([
    VentureActivity.find().select('_id').lean().exec(),
    PresentationParticipant.find()
      .select('_id ventureActivityId presentationId receivedAt')
      .lean()
      .exec(),
    Presentation.find().select('_id ventureActivityId status feedbackForm').lean().exec(),
    MentorFeedback.aggregate<{ _id: Types.ObjectId; counted: number }>([
      { $match: { superseded: false, participantId: { $ne: null } } },
      { $group: { _id: '$participantId', counted: { $sum: 1 } } },
    ]).exec(),
  ]);

  const countedByParticipant = new Map(counts.map((row) => [row._id.toString(), row.counted]));
  const presentationById = new Map(presentations.map((p) => [p._id.toString(), p]));
  const configuredStages = new Set(
    presentations.filter((p) => p.feedbackForm).map((p) => p.ventureActivityId.toString()),
  );
  const byActivity = new Map<string, Parameters<typeof feedbackTally>[0][number][]>();
  for (const participant of participants) {
    const presentation = presentationById.get(participant.presentationId.toString());
    const key = participant.ventureActivityId.toString();
    const list = byActivity.get(key) ?? [];
    list.push({
      received:
        Boolean(presentation?.feedbackForm) &&
        isParticipantReceived(participant, { status: presentation?.status ?? 'CANCELLED' }),
      countedResponses: countedByParticipant.get(participant._id.toString()) ?? 0,
      requiredFeedbackCount: presentation?.feedbackForm?.requiredFeedbackCount ?? 1,
    });
    byActivity.set(key, list);
  }

  return Object.fromEntries(
    activities.map((activity) => {
      const tally = feedbackTally(byActivity.get(activity._id.toString()) ?? [], 1);
      return [
        activity._id.toString(),
        {
          received: tally.received,
          complete: tally.complete,
          // Configured when at least one of the stage's presentations has a form.
          configured: configuredStages.has(activity._id.toString()),
        },
      ];
    }),
  );
}
