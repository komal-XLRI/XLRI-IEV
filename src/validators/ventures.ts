import { z } from 'zod';
import {
  CONTENT_STATUSES,
  SUPPORT_ACTIVITY_STATUSES,
  SUPPORT_SCHEDULE_TYPES,
  VENTURE_STATUSES,
} from '@/lib/constants/status';
import { dateSchema, objectId } from './common';

// ------------------------------------------------- Venture activities ----

/**
 * Note what is deliberately absent: no 12–15 day duration check. That range is
 * a planning guideline, and `durationDays` is derived from the dates rather
 * than supplied by the client.
 */
export const createVentureActivitySchema = z
  .object({
    activityCode: z.string().trim().min(1).max(10).toUpperCase(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).optional().or(z.literal('')),
    termId: objectId,
    order: z.coerce.number().int().min(1).max(99),
    startDate: dateSchema,
    endDate: dateSchema,
    maxAttempts: z.coerce.number().int().min(1).max(10),
    evidenceRequired: z.coerce.boolean().default(true),
    status: z.enum(CONTENT_STATUSES).default('ACTIVE'),
  })
  .refine((v) => v.endDate.getTime() >= v.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export const updateVentureActivitySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).optional().or(z.literal('')),
    termId: objectId.optional(),
    order: z.coerce.number().int().min(1).max(99).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
    evidenceRequired: z.coerce.boolean().optional(),
    status: z.enum(CONTENT_STATUSES).optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate.getTime() >= v.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

// ------------------------------------------------- Support activities ----

/** Blank clears the field rather than arriving as an empty string. */
const optionalTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const upsertSupportActivitySchema = z
  .object({
    activityCode: z.string().trim().min(1).max(10).toUpperCase(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).optional().or(z.literal('')),
    order: z.coerce.number().int().min(1).max(99),
    scheduleType: z.enum(SUPPORT_SCHEDULE_TYPES),

    // Optional throughout: the eight seeded activities have no schedule, and
    // requiring one would make every existing record unsavable.
    scheduledDate: dateSchema.optional().or(z.literal('').transform(() => undefined)),
    startTime: optionalTime,
    endTime: optionalTime,
  })
  .superRefine((value, ctx) => {
    if ((value.startTime || value.endTime) && !value.scheduledDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduledDate'],
        message: 'Add a date for these times',
      });
    }

    if (value.startTime && value.endTime && value.endTime <= value.startTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after the start time',
      });
    }
  });

/** Replaces the full support-activity set for one venture activity. */
export const setSupportMappingsSchema = z.object({
  ventureActivityId: objectId,
  supportActivityIds: z.array(objectId).max(20),
});

// -------------------------------------------------- Student ventures ----

export const createStudentVentureSchema = z.object({
  studentId: objectId,
  ventureName: z.string().trim().min(1).max(160),
  ventureTitle: z.string().trim().max(200).optional().or(z.literal('')),
  industry: z.string().trim().max(120).optional().or(z.literal('')),
  targetMarket: z.string().trim().max(200).optional().or(z.literal('')),
  problemStatement: z.string().trim().max(4000).optional().or(z.literal('')),
  solution: z.string().trim().max(4000).optional().or(z.literal('')),
  fundingStatus: z.string().trim().max(120).optional().or(z.literal('')),
  facultyId: objectId.nullish(),
  mentorId: objectId.nullish(),
  status: z.enum(VENTURE_STATUSES).default('ACTIVE'),
});

export const updateStudentVentureSchema = createStudentVentureSchema.partial().omit({
  studentId: true,
});

/** Admin-only reviewer assignment. Students can never reach this. */
export const assignReviewersSchema = z.object({
  facultyId: objectId.nullish(),
  mentorId: objectId.nullish(),
});

/** Fields a student may edit on their own venture. */
export const studentVentureDetailsSchema = z.object({
  ventureName: z.string().trim().min(1).max(160),
  ventureTitle: z.string().trim().max(200).optional().or(z.literal('')),
  industry: z.string().trim().max(120).optional().or(z.literal('')),
  targetMarket: z.string().trim().max(200).optional().or(z.literal('')),
  problemStatement: z.string().trim().max(4000).optional().or(z.literal('')),
  solution: z.string().trim().max(4000).optional().or(z.literal('')),
  fundingStatus: z.string().trim().max(120).optional().or(z.literal('')),
});

// ------------------------------------ Student support activity records ----

export const updateStudentSupportActivitySchema = z.object({
  status: z.enum(SUPPORT_ACTIVITY_STATUSES),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type CreateVentureActivityInput = z.infer<typeof createVentureActivitySchema>;
export type UpdateVentureActivityInput = z.infer<typeof updateVentureActivitySchema>;
export type CreateStudentVentureInput = z.infer<typeof createStudentVentureSchema>;
export type AssignReviewersInput = z.infer<typeof assignReviewersSchema>;
