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
 * Fills in a type for records written before the field existed.
 *
 * A schema default only applies when Mongoose hydrates a document — `.lean()`
 * returns the raw BSON, so a workshop stored before `workshopType` was added
 * comes back without it and would render as a blank cell. Normalising here
 * keeps that off every screen, and the next save writes the value for real.
 */
function withType<T extends { workshopType?: WorkshopType }>(
  workshop: T,
): T & { workshopType: WorkshopType } {
  return { ...workshop, workshopType: workshop.workshopType ?? 'OTHER' };
}

/** Newest first — the list is read far more often for "what is coming" than for history. */
export async function listWorkshops(filters: WorkshopFilters = {}) {
  await connectToDatabase();

  const rows = await Workshop.find(buildQuery(filters))
    .sort({ date: -1, startTime: -1 })
    .lean()
    .exec();

  return rows.map(withType);
}

export async function getWorkshop(workshopId: string) {
  await connectToDatabase();
  const workshop = await Workshop.findById(workshopId).lean().exec();
  if (!workshop) throw new NotFoundError('Workshop not found');
  return withType(workshop);
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
    registrationLink: existing.registrationLink,
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
