import { z } from 'zod';
import { objectId } from './common';
import { MAX_PRESENTATION_STUDENTS, PRESENTATION_STATUSES } from '@/lib/constants/presentations';

/**
 * A presentation's Drive link. Optional — decks often arrive after the
 * sitting — but when given it must be https: it is rendered as a link for
 * students, so a javascript: or data: URL must never get this far.
 */
const driveUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), {
    message: 'Paste the full https:// link to the Drive folder or file',
  })
  .transform((v) => (v === '' ? null : v));

/** "YYYY-MM-DD" from a date input; stored as that day's UTC midnight. */
const presentedOn = z
  .string({ message: 'Choose the presentation date' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the presentation date')
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Choose a valid date');

const startTime = z
  .string()
  .trim()
  .refine((v) => v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Enter a time as HH:MM')
  .transform((v) => (v === '' ? null : v));

/**
 * The students on a presentation are their progress records for the stage.
 * Any number may be chosen — the only bounds are "at least one" and a sanity
 * cap — and duplicates collapse.
 */
const studentRecordIds = z
  .array(objectId)
  .min(1, 'Select at least one student')
  .max(MAX_PRESENTATION_STUDENTS)
  .transform((ids) => [...new Set(ids)]);

const presentationFields = {
  presentedOn,
  startTime: startTime.optional().transform((v) => v ?? null),
  driveUrl: driveUrl.optional().transform((v) => v ?? null),
  status: z.enum(PRESENTATION_STATUSES).default('SCHEDULED'),
  studentRecordIds,
};

export const createPresentationSchema = z.object({
  ventureActivityId: objectId,
  ...presentationFields,
});
export type CreatePresentationInput = z.infer<typeof createPresentationSchema>;

export const updatePresentationSchema = z.object({
  presentationId: objectId,
  ...presentationFields,
});
export type UpdatePresentationInput = z.infer<typeof updatePresentationSchema>;

export const participantReceivedSchema = z.object({
  participantId: objectId,
  received: z.boolean(),
});
