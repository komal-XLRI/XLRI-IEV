import 'server-only';
import { connectToDatabase } from '@/lib/db/mongoose';
import { Workshop } from '@/models';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { containsPattern } from '@/lib/utils/regex';
import {
  WORKSHOP_MODES,
  WORKSHOP_STATUSES,
  type WorkshopMode,
  type WorkshopStatus,
  type WorkshopType,
} from '@/lib/constants/workshops';
import { createWorkshopSchema, type CreateWorkshopInput } from '@/validators/workshops';
import { startOfTodayUtc } from '@/lib/utils/dates';

export interface WorkshopFilters {
  q?: string;
  status?: WorkshopStatus;
  mode?: WorkshopMode;
  workshopType?: WorkshopType;
  dateFrom?: Date;
  dateTo?: Date;
}

function buildQuery(filters: WorkshopFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filters.status) query.status = filters.status;
  if (filters.mode) query.mode = filters.mode;
  if (filters.workshopType) query.workshopType = filters.workshopType;

  if (filters.dateFrom || filters.dateTo) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (filters.dateFrom) range.$gte = filters.dateFrom;
    if (filters.dateTo) range.$lte = filters.dateTo;
    query.date = range;
  }

  if (filters.q) {
    const pattern = containsPattern(filters.q);
    query.$or = [
      { title: pattern },
      { hostName: pattern },
      { speakerName: pattern },
      { venue: pattern },
      { hostOrganisation: pattern },
      { speakerOrganisation: pattern },
    ];
  }

  return query;
}

/**
 * Fills in the fields that records written before them do not carry.
 *
 * A schema default only applies when Mongoose hydrates a document — `.lean()`
 * returns the raw BSON, so a workshop stored before `workshopType` or
 * `isEmailSent` was added comes back without it and would render as a blank
 * cell or an undefined flag. Normalising here keeps that off every screen, and
 * the next save writes the values for real.
 */
type WorkshopDefaults = {
  workshopType?: WorkshopType;
  isEmailSent?: boolean;
  emailRecipientCount?: number;
};

function withDefaults<T extends WorkshopDefaults>(workshop: T) {
  return {
    ...workshop,
    workshopType: workshop.workshopType ?? 'OTHER',
    isEmailSent: workshop.isEmailSent ?? false,
    emailRecipientCount: workshop.emailRecipientCount ?? 0,
  };
}

/** Newest first — the list is read far more often for "what is coming" than for history. */
export async function listWorkshops(filters: WorkshopFilters = {}) {
  await connectToDatabase();

  const rows = await Workshop.find(buildQuery(filters))
    .sort({ date: -1, startTime: -1 })
    .lean()
    .exec();

  return rows.map(withDefaults);
}

/**
 * What a student is allowed to see.
 *
 * A draft is unfinished writing, so it is invisible. A cancelled workshop is
 * normally invisible too — except once it has been announced by email, because
 * a student who was told to turn up must be able to find out that it is off.
 * Silently removing it from their list is the one outcome that strands
 * somebody outside a locked room.
 */
function studentVisibilityQuery(): Record<string, unknown> {
  return {
    $or: [
      { status: { $in: ['PUBLISHED', 'COMPLETED'] } },
      { status: 'CANCELLED', isEmailSent: true },
    ],
  };
}

/** One workshop as every read in this module returns it — defaults filled in. */
export type WorkshopRecord = Awaited<ReturnType<typeof getWorkshop>>;

export interface StudentWorkshopFeed {
  upcoming: WorkshopRecord[];
  past: WorkshopRecord[];
}

/**
 * The workshops on a student's own page, split at today.
 *
 * A workshop running today is still upcoming: it has not happened until its
 * end time, and moving it into "past" at midnight would hide it from the
 * person on their way to it.
 */
export async function listWorkshopsForStudent(
  now: Date = new Date(),
): Promise<StudentWorkshopFeed> {
  await connectToDatabase();

  const today = startOfTodayUtc(now);

  const rows = await Workshop.find(studentVisibilityQuery())
    .sort({ date: 1, startTime: 1 })
    .lean()
    .exec();

  const visible = rows.map(withDefaults);

  // Status wins over the calendar: a workshop the office has marked completed
  // is over, even if it was marked on the morning it ran. The date alone would
  // leave it advertised as "coming up" for the rest of the day.
  const isOver = (workshop: WorkshopRecord) =>
    workshop.status === 'COMPLETED' || workshop.date < today;

  return {
    upcoming: visible.filter((workshop) => !isOver(workshop)),
    // Most recent first — history is read backwards.
    past: visible.filter(isOver).reverse(),
  };
}

export async function getWorkshop(workshopId: string) {
  await connectToDatabase();
  const workshop = await Workshop.findById(workshopId).lean().exec();
  if (!workshop) throw new NotFoundError('Workshop not found');
  return withDefaults(workshop);
}

export async function createWorkshop(input: CreateWorkshopInput) {
  await connectToDatabase();
  const workshop = await Workshop.create(input);
  return workshop.toObject();
}

/**
 * Partial update, validated against the *merged* record.
 *
 * Validating the patch alone would let a workshop be switched to ONLINE
 * without a meeting link, because the patch itself contains no link to object
 * to. Merging first is what makes the conditional rules hold across an edit
 * that touches only one field.
 */
export async function updateWorkshop(workshopId: string, patch: Record<string, unknown>) {
  await connectToDatabase();

  const existing = await Workshop.findById(workshopId).lean().exec();
  if (!existing) throw new NotFoundError('Workshop not found');

  const merged = createWorkshopSchema.safeParse({
    title: existing.title,
    description: existing.description,
    date: existing.date,
    startTime: existing.startTime,
    endTime: existing.endTime,
    mode: existing.mode,
    venue: existing.venue,
    meetingLink: existing.meetingLink,
    hostName: existing.hostName,
    hostDesignation: existing.hostDesignation,
    hostOrganisation: existing.hostOrganisation,
    hostLinkedIn: existing.hostLinkedIn,
    speakerName: existing.speakerName,
    speakerDesignation: existing.speakerDesignation,
    speakerOrganisation: existing.speakerOrganisation,
    speakerLinkedIn: existing.speakerLinkedIn,
    maxParticipants: existing.maxParticipants,
    status: existing.status,
    ...patch,
  });

  if (!merged.success) throw merged.error;

  // `$unset` rather than `$set: undefined` — Mongo ignores an undefined value,
  // so clearing an optional field needs to be said explicitly.
  const next = merged.data as Record<string, unknown>;
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null) unset[key] = '';
    else set[key] = value;
  }

  const updated = await Workshop.findByIdAndUpdate(
    workshopId,
    { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
    { returnDocument: 'after', runValidators: true },
  ).exec();

  if (!updated) throw new NotFoundError('Workshop not found');
  return updated.toObject();
}

export async function deleteWorkshop(workshopId: string) {
  await connectToDatabase();
  const result = await Workshop.findByIdAndDelete(workshopId).exec();
  if (!result) throw new NotFoundError('Workshop not found');
  return { deleted: true as const };
}

/**
 * Status transitions.
 *
 * Publishing is a visibility decision, so a draft has to be complete enough to
 * be worth showing: the model's own mode rules already guarantee a venue or a
 * link, and `runValidators` re-applies them here rather than trusting that the
 * record was created through the form.
 */
export async function setWorkshopStatus(workshopId: string, status: WorkshopStatus) {
  await connectToDatabase();

  if (!WORKSHOP_STATUSES.includes(status)) {
    throw new ValidationError('Unknown workshop status');
  }

  const workshop = await Workshop.findById(workshopId).exec();
  if (!workshop) throw new NotFoundError('Workshop not found');

  workshop.status = status;
  await workshop.save();

  return workshop.toObject();
}

export interface WorkshopSummary {
  total: number;
  published: number;
  upcoming: number;
  draft: number;
}

/** Counts for the page header, from one pass rather than four queries. */
export async function getWorkshopSummary(): Promise<WorkshopSummary> {
  await connectToDatabase();

  const [byStatus, upcoming] = await Promise.all([
    Workshop.aggregate<{ _id: WorkshopStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec(),
    Workshop.countDocuments({
      status: 'PUBLISHED',
      date: { $gte: new Date(new Date().toDateString()) },
    }).exec(),
  ]);

  const counts = new Map(byStatus.map((row) => [row._id, row.count]));

  return {
    total: [...counts.values()].reduce((sum, value) => sum + value, 0),
    published: counts.get('PUBLISHED') ?? 0,
    upcoming,
    draft: counts.get('DRAFT') ?? 0,
  };
}

export { WORKSHOP_MODES, WORKSHOP_STATUSES };
