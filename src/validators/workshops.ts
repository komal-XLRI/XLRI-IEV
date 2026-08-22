import { z } from 'zod';
import {
  WORKSHOP_MODES,
  WORKSHOP_STATUSES,
  WORKSHOP_TYPES,
  requiresMeetingLink,
  requiresVenue,
} from '@/lib/constants/workshops';
import { dateSchema } from './common';

/**
 * A blank optional field arrives from a form as `''`, not as `undefined`.
 * Normalising here means the service and the model only ever see a real value
 * or nothing at all, so clearing a field actually clears it.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm');

/**
 * A URL, not merely a string containing a dot.
 *
 * `new URL()` accepts `mailto:` and `javascript:` too, so the protocol is
 * checked explicitly — a stored `javascript:` URL would become a live XSS
 * vector the moment it is rendered as a link.
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const optionalHttpUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .refine((value) => value === undefined || isHttpUrl(value), { message });

/**
 * LinkedIn profiles are checked for host as well as shape.
 *
 * The field is labelled "LinkedIn profile" and is rendered as one; accepting
 * any URL at all would quietly let an arbitrary link through under that label.
 */
const linkedInUrl = optionalHttpUrl('Enter a valid LinkedIn profile URL').refine(
  (value) => {
    if (value === undefined) return true;
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      return host === 'linkedin.com' || host.endsWith('.linkedin.com');
    } catch {
      return false;
    }
  },
  { message: 'Enter a LinkedIn URL (linkedin.com/in/…)' },
);

const workshopFields = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText(4000),

  workshopType: z.enum(WORKSHOP_TYPES, { message: 'Choose a type' }).default('OTHER'),

  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,

  mode: z.enum(WORKSHOP_MODES, { message: 'Choose a mode' }),
  venue: optionalText(300),
  meetingLink: optionalHttpUrl('Enter a valid meeting link (https://…)'),

  hostName: z.string().trim().min(1, 'Host name is required').max(160),
  hostDesignation: optionalText(160),
  hostOrganisation: optionalText(160),
  hostLinkedIn: linkedInUrl,

  speakerName: z.string().trim().min(1, 'Speaker name is required').max(160),
  speakerDesignation: optionalText(160),
  speakerOrganisation: optionalText(160),
  speakerLinkedIn: linkedInUrl,

  maxParticipants: z.coerce.number().int().min(1).max(100_000).nullish(),

  status: z.enum(WORKSHOP_STATUSES).default('DRAFT'),
});

/**
 * The conditional rules, applied to whatever subset of fields is present.
 *
 * Shared by create and update so a partial edit cannot sidestep them: changing
 * only `mode` on an existing record still has to satisfy them, which is why the
 * update path merges the stored record before validating rather than checking
 * the patch alone.
 */
function applyModeRules<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx: z.RefinementCtx) => {
    const { mode, venue, meetingLink, startTime, endTime } = value as {
      mode?: string;
      venue?: string;
      meetingLink?: string;
      startTime?: string;
      endTime?: string;
    };

    if (startTime && endTime && endTime <= startTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after the start time',
      });
    }

    if (!mode) return;
    const workshopMode = mode as (typeof WORKSHOP_MODES)[number];

    if (requiresVenue(workshopMode) && !venue) {
      ctx.addIssue({
        code: 'custom',
        path: ['venue'],
        message:
          workshopMode === 'HYBRID'
            ? 'A hybrid workshop needs a venue as well as a link'
            : 'A venue is required for an offline workshop',
      });
    }

    if (requiresMeetingLink(workshopMode) && !meetingLink) {
      ctx.addIssue({
        code: 'custom',
        path: ['meetingLink'],
        message:
          workshopMode === 'HYBRID'
            ? 'A hybrid workshop needs a meeting link as well as a venue'
            : 'A meeting link is required for an online workshop',
      });
    }
  });
}

export const createWorkshopSchema = applyModeRules(workshopFields);

/**
 * An edit is validated with the *same* schema, against the patch merged onto
 * the stored record (see `updateWorkshop`). There is deliberately no partial
 * variant: a partial schema would accept a patch switching a workshop to
 * ONLINE, because the patch itself carries no meeting link to object to.
 */
export const workshopPatchSchema = workshopFields.partial();

export const workshopStatusSchema = z.object({
  status: z.enum(WORKSHOP_STATUSES),
});

export type CreateWorkshopInput = z.infer<typeof createWorkshopSchema>;
export type WorkshopPatch = z.infer<typeof workshopPatchSchema>;
