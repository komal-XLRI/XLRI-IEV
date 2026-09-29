import 'server-only';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  FeedbackSyncLog,
  MentorFeedback,
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
import { refreshCurrentActivity } from './studentVentureService';
import { logger } from '@/lib/logger';

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

// ------------------------------------------------ Stage configuration ----

/**
 * Sets, changes or clears a stage's Google Form. Lowering the required count
 * can complete presentations that already have enough feedback, so the stage
 * is re-evaluated afterwards. Nothing is ever un-completed by a config change.
 */
export async function saveFeedbackFormConfig(input: FeedbackFormConfigInput, adminUserId: string) {
  await connectToDatabase();

  const activity = await VentureActivity.findById(input.ventureActivityId).exec();
  if (!activity) throw new NotFoundError('Venture activity not found');

  if (input.prefillUrlTemplate === '') {
    activity.feedbackForm = null;
  } else {
    const check = checkPrefillTemplate(input.prefillUrlTemplate);
    if (!check.ok) throw new RuleViolationError(check.message);

    activity.feedbackForm = {
      prefillUrlTemplate: input.prefillUrlTemplate,
      publishedFormId: check.publishedFormId,
      enabled: input.enabled,
      requiredFeedbackCount: input.requiredFeedbackCount,
      updatedBy: new Types.ObjectId(adminUserId),
      updatedAt: new Date(),
    };
  }

  await activity.save();
  logger.info('Feedback form configured', {
    ventureActivityId: input.ventureActivityId,
    cleared: input.prefillUrlTemplate === '',
    enabled: input.enabled,
    requiredFeedbackCount: input.requiredFeedbackCount,
  });

  const completed = await reevaluateStageCompletion(input.ventureActivityId);
  return { completed };
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
      reason: 'PRESENTATION_PENDING' | 'NO_FORM';
      message: string;
      details: QrDetails;
    };

export interface QrDetails {
  studentName: string;
  ventureName: string;
  stage: string;
  presentationReceived: boolean;
  formConfigured: boolean;
}

async function loadRecordContext(recordId: string) {
  const record = await StudentVentureActivity.findById(recordId).lean().exec();
  if (!record) throw new NotFoundError('Presentation not found');

  const [activity, venture] = await Promise.all([
    VentureActivity.findById(record.ventureActivityId).lean().exec(),
    StudentVenture.findById(record.studentVentureId)
      .select('ventureName studentId')
      .populate<{ studentId: { _id: Types.ObjectId; name: string } | null }>('studentId', 'name')
      .lean()
      .exec(),
  ]);
  if (!activity) throw new NotFoundError('Venture activity not found');
  if (!venture) throw new NotFoundError('Venture not found');

  return { record, activity, venture };
}

/**
 * The QR for one presentation — admin only, enforced by the caller.
 *
 * Refuses (with a reason, not an error) unless the presentation is received
 * and the stage has a usable form, so an unusable QR is never produced. The
 * token is issued here, lazily, the first time it is needed.
 */
export async function getFeedbackQr(recordId: string, baseUrl: string): Promise<FeedbackQrResult> {
  await connectToDatabase();

  const { record, activity, venture } = await loadRecordContext(recordId);
  const received = isPresentationReceived(record);
  const form = usableForm(activity.feedbackForm);

  const details: QrDetails = {
    studentName: venture.studentId?.name ?? 'Unknown student',
    ventureName: venture.ventureName,
    stage: `${activity.activityCode} · ${activity.name}`,
    presentationReceived: received,
    formConfigured: form !== null,
  };

  if (!received) {
    return {
      available: false,
      reason: 'PRESENTATION_PENDING',
      message: 'This presentation has not been received yet, so it has no feedback QR.',
      details,
    };
  }
  if (!form) {
    return {
      available: false,
      reason: 'NO_FORM',
      message: 'Feedback form is not configured for this stage.',
      details,
    };
  }

  let token = record.feedbackToken ?? null;
  if (!token) {
    // Conditional on the field still being empty, so two admins opening the
    // same QR at once end up with one token rather than two.
    const claimed = await StudentVentureActivity.findOneAndUpdate(
      { _id: record._id, feedbackToken: null },
      { $set: { feedbackToken: newToken(), feedbackTokenCreatedAt: new Date() } },
      { returnDocument: 'after' },
    )
      .select('feedbackToken')
      .lean()
      .exec();
    token =
      claimed?.feedbackToken ??
      (await StudentVentureActivity.findById(record._id).select('feedbackToken').lean().exec())
        ?.feedbackToken ??
      null;
    if (!token) throw new Error('Could not issue a feedback token');
    logger.info('Feedback token issued', { recordId, tokenPrefix: tokenPrefix(token) });
  }

  const url = feedbackUrlFor(baseUrl, token);
  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }),
  ]);

  return { available: true, url, svg, pngDataUrl, details };
}

/**
 * Replaces a presentation's token, so a QR that has been shared too widely
 * stops working. Feedback already received stays attached to the presentation.
 */
export async function regenerateFeedbackToken(recordId: string) {
  await connectToDatabase();

  const record = await StudentVentureActivity.findById(recordId)
    .select('status presentationReceivedAt feedbackToken')
    .lean()
    .exec();
  if (!record) throw new NotFoundError('Presentation not found');
  if (!isPresentationReceived(record)) {
    throw new RuleViolationError('This presentation has not been received, so it has no QR.');
  }

  const token = newToken();
  await StudentVentureActivity.updateOne(
    { _id: record._id },
    { $set: { feedbackToken: token, feedbackTokenCreatedAt: new Date() } },
  ).exec();

  logger.info('Feedback token regenerated', {
    recordId,
    previous: tokenPrefix(record.feedbackToken),
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

  const record = await StudentVentureActivity.findOne({ feedbackToken: token }).lean().exec();
  if (!record) return { ok: false, reason: 'INVALID' };

  if (!isPresentationReceived(record)) {
    logger.info('Feedback link used while presentation pending', {
      tokenPrefix: tokenPrefix(token),
    });
    return { ok: false, reason: 'PENDING' };
  }

  const { activity, venture } = await loadRecordContext(record._id.toString());
  if (!activity.feedbackForm) return { ok: false, reason: 'NO_FORM' };
  if (!usableForm(activity.feedbackForm) || activity.status !== 'ACTIVE') {
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  const formUrl = fillPrefillTemplate(activity.feedbackForm.prefillUrlTemplate, {
    token,
    student: venture.studentId?.name ?? '',
    venture: venture.ventureName,
    stage: activity.name,
  });

  logger.info('Feedback link opened', {
    tokenPrefix: tokenPrefix(token),
    ventureActivityId: activity._id.toString(),
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
  extra: { publishedFormId?: string | null; recordId?: Types.ObjectId | null } = {},
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
 * The token must belong to a presentation that is received right now, and the
 * response must come from the form configured for that presentation's stage.
 * Duplicates: the same Google response id updates in place; a new response
 * from the same mentor on the same presentation supersedes their earlier one.
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

  const record = await StudentVentureActivity.findOne({ feedbackToken: payload.token })
    .lean()
    .exec();
  if (!record) {
    return reject(payload, 404, 'UNKNOWN_TOKEN', 'No presentation matches this presentation ID.', {
      publishedFormId,
    });
  }

  if (!isPresentationReceived(record)) {
    return reject(
      payload,
      409,
      'PRESENTATION_NOT_RECEIVED',
      'This presentation has not been received. Feedback is currently unavailable.',
      { publishedFormId, recordId: record._id },
    );
  }

  const activity = await VentureActivity.findById(record.ventureActivityId).lean().exec();
  if (!activity?.feedbackForm) {
    return reject(
      payload,
      409,
      'NO_FORM_CONFIGURED',
      'Feedback form is not configured for this stage.',
      {
        publishedFormId,
        recordId: record._id,
      },
    );
  }
  if (!usableForm(activity.feedbackForm)) {
    return reject(
      payload,
      409,
      'FORM_DISABLED',
      'Feedback is currently unavailable for this stage.',
      {
        publishedFormId,
        recordId: record._id,
      },
    );
  }
  if (!publishedFormId || publishedFormId !== activity.feedbackForm.publishedFormId) {
    return reject(
      payload,
      409,
      'FORM_MISMATCH',
      'This response came from a form that is not the one configured for the presentation’s stage.',
      { publishedFormId, recordId: record._id },
    );
  }

  const venture = await StudentVenture.findById(record.studentVentureId)
    .select('studentId')
    .lean()
    .exec();
  if (!venture) {
    return reject(payload, 409, 'VENTURE_MISSING', 'The presentation’s venture no longer exists.', {
      publishedFormId,
      recordId: record._id,
    });
  }

  const responses: IMentorFeedbackAnswer[] = payload.answers
    .filter((item) => !isTokenQuestion(item.question))
    .map((item) => ({ question: item.question, type: item.type, answer: item.answer }));

  const previous = await MentorFeedback.findOne({ googleResponseId: payload.responseId })
    .select('_id studentVentureActivityId')
    .lean()
    .exec();

  const saved = await MentorFeedback.findOneAndUpdate(
    { googleResponseId: payload.responseId },
    {
      $set: {
        studentVentureActivityId: record._id,
        studentVentureId: record.studentVentureId,
        studentId: venture.studentId,
        ventureActivityId: record.ventureActivityId,
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

  await recomputeSuperseded(record._id);
  if (previous && !previous.studentVentureActivityId.equals(record._id)) {
    // An edited response now names a different presentation; the old one's
    // counts change too.
    await recomputeSuperseded(previous.studentVentureActivityId);
  }

  const stageCompleted = await evaluateCompletion(record._id.toString());

  const outcome: FeedbackSyncOutcome = previous ? 'UPDATED' : 'ACCEPTED';
  await logSync({
    outcome,
    payload,
    publishedFormId,
    recordId: record._id,
    mentorFeedbackId: saved!._id,
  });
  logger.info(previous ? 'Mentor feedback updated' : 'Mentor feedback received', {
    googleResponseId: payload.responseId,
    recordId: record._id.toString(),
    ventureActivityId: record.ventureActivityId.toString(),
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

/** Marks every response but the latest per mentor as superseded, for one presentation. */
async function recomputeSuperseded(recordId: Types.ObjectId) {
  const docs = await MentorFeedback.find({ studentVentureActivityId: recordId })
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
 * Completes the stage for one presentation once it is received and has the
 * required number of counted responses. Moves forward only: nothing here ever
 * takes a COMPLETED record back.
 */
async function evaluateCompletion(recordId: string): Promise<boolean> {
  const record = await StudentVentureActivity.findById(recordId).lean().exec();
  if (!record || record.status === 'COMPLETED') return false;

  const activity = await VentureActivity.findById(record.ventureActivityId)
    .select('feedbackForm')
    .lean()
    .exec();
  const form = usableForm(activity?.feedbackForm);
  if (!form) return false;

  const counted = await MentorFeedback.countDocuments({
    studentVentureActivityId: record._id,
    superseded: false,
  }).exec();

  if (
    !isFeedbackComplete({
      received: isPresentationReceived(record),
      countedResponses: counted,
      requiredFeedbackCount: form.requiredFeedbackCount,
    })
  ) {
    return false;
  }

  // Conditional on the record still being uncompleted and still received, so a
  // presentation unticked a moment ago is not completed by a late response.
  const result = await StudentVentureActivity.updateOne(
    { _id: record._id, status: { $ne: 'COMPLETED' }, presentationReceivedAt: { $ne: null } },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
  ).exec();
  if (result.modifiedCount === 0) return false;

  await refreshCurrentActivity(record.studentVentureId.toString());
  logger.info('Stage completed on mentor feedback', { recordId, counted });
  return true;
}

async function reevaluateStageCompletion(ventureActivityId: string): Promise<number> {
  const records = await StudentVentureActivity.find({
    ventureActivityId,
    status: { $ne: 'COMPLETED' },
    presentationReceivedAt: { $ne: null },
  })
    .select('_id')
    .lean()
    .exec();

  let completed = 0;
  for (const record of records) {
    if (await evaluateCompletion(record._id.toString())) completed += 1;
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

export interface RecordFeedbackSummary {
  counted: number;
  required: number;
  complete: boolean;
}

export interface StageFeedback {
  formConfigured: boolean;
  formEnabled: boolean;
  requiredFeedbackCount: number;
  prefillUrlTemplate: string | null;
  byRecord: Record<string, RecordFeedbackSummary & { entries: MentorFeedbackEntry[] }>;
  tally: ReturnType<typeof feedbackTally>;
}

/** Everything the admin stage page needs about mentor feedback. */
export async function getStageFeedback(ventureActivityId: string): Promise<StageFeedback> {
  await connectToDatabase();

  const [activity, records, docs] = await Promise.all([
    VentureActivity.findById(ventureActivityId).select('feedbackForm').lean().exec(),
    StudentVentureActivity.find({ ventureActivityId })
      .select('_id status presentationReceivedAt')
      .lean()
      .exec(),
    MentorFeedback.find({ ventureActivityId }).sort({ submittedAt: -1 }).lean().exec(),
  ]);
  if (!activity) throw new NotFoundError('Venture activity not found');

  const form = activity.feedbackForm ?? null;
  const required = form?.requiredFeedbackCount ?? 1;

  const entriesByRecord = new Map<string, MentorFeedbackEntry[]>();
  for (const doc of docs) {
    const key = doc.studentVentureActivityId.toString();
    const list = entriesByRecord.get(key) ?? [];
    list.push(toEntry(doc, true));
    entriesByRecord.set(key, list);
  }

  const byRecord: StageFeedback['byRecord'] = {};
  const tallyInput: Array<{ received: boolean; countedResponses: number }> = [];
  for (const record of records) {
    const key = record._id.toString();
    const entries = entriesByRecord.get(key) ?? [];
    const counted = entries.filter((e) => !e.superseded).length;
    const received = isPresentationReceived(record);
    byRecord[key] = {
      counted,
      required,
      complete: isFeedbackComplete({
        received,
        countedResponses: counted,
        requiredFeedbackCount: required,
      }),
      entries,
    };
    tallyInput.push({ received, countedResponses: counted });
  }

  return {
    formConfigured: Boolean(form),
    formEnabled: Boolean(form?.enabled),
    requiredFeedbackCount: required,
    prefillUrlTemplate: form?.prefillUrlTemplate ?? null,
    byRecord,
    tally: feedbackTally(tallyInput, required),
  };
}

/**
 * A student's own feedback on one presentation. The caller has already
 * checked that the record is theirs; mentor emails are never included.
 * Only the counted (latest per mentor) responses are shown.
 */
export async function getStudentMentorFeedback(recordId: string) {
  await connectToDatabase();

  const record = await StudentVentureActivity.findById(recordId)
    .select('ventureActivityId status presentationReceivedAt')
    .lean()
    .exec();
  if (!record) throw new NotFoundError('Presentation not found');

  const [activity, docs] = await Promise.all([
    VentureActivity.findById(record.ventureActivityId).select('feedbackForm').lean().exec(),
    MentorFeedback.find({ studentVentureActivityId: record._id, superseded: false })
      .sort({ submittedAt: 1 })
      .lean()
      .exec(),
  ]);

  const required = activity?.feedbackForm?.requiredFeedbackCount ?? 1;
  const received = isPresentationReceived(record);

  return {
    formConfigured: Boolean(activity?.feedbackForm),
    received,
    required,
    counted: docs.length,
    complete: isFeedbackComplete({
      received,
      countedResponses: docs.length,
      requiredFeedbackCount: required,
    }),
    entries: docs.map((doc) => toEntry(doc, false)),
  };
}

/** Per-stage feedback figures for the activity list, keyed by activity id. */
export async function getFeedbackTallies(): Promise<
  Record<string, { received: number; complete: number; configured: boolean }>
> {
  await connectToDatabase();

  const [activities, records, counts] = await Promise.all([
    VentureActivity.find().select('_id feedbackForm').lean().exec(),
    StudentVentureActivity.find()
      .select('_id ventureActivityId status presentationReceivedAt')
      .lean()
      .exec(),
    MentorFeedback.aggregate<{ _id: Types.ObjectId; counted: number }>([
      { $match: { superseded: false } },
      { $group: { _id: '$studentVentureActivityId', counted: { $sum: 1 } } },
    ]).exec(),
  ]);

  const countedByRecord = new Map(counts.map((row) => [row._id.toString(), row.counted]));
  const recordsByActivity = new Map<
    string,
    Array<{ received: boolean; countedResponses: number }>
  >();
  for (const record of records) {
    const key = record.ventureActivityId.toString();
    const list = recordsByActivity.get(key) ?? [];
    list.push({
      received: isPresentationReceived(record),
      countedResponses: countedByRecord.get(record._id.toString()) ?? 0,
    });
    recordsByActivity.set(key, list);
  }

  return Object.fromEntries(
    activities.map((activity) => {
      const tally = feedbackTally(
        recordsByActivity.get(activity._id.toString()) ?? [],
        activity.feedbackForm?.requiredFeedbackCount ?? 1,
      );
      return [
        activity._id.toString(),
        {
          received: tally.received,
          complete: tally.complete,
          configured: Boolean(activity.feedbackForm),
        },
      ];
    }),
  );
}
