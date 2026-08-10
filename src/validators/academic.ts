import { z } from 'zod';
import {
  CONTENT_STATUSES,
  SESSION_TYPES,
  TERM_STATUSES,
  ATTENDANCE_STATUSES,
} from '@/lib/constants/status';
import { dateSchema, objectId } from './common';

// ---------------------------------------------------------------- Terms ----

export const upsertTermSchema = z
  .object({
    termNumber: z.coerce.number().int().min(1).max(3),
    name: z.string().trim().min(1).max(80),
    startDate: dateSchema,
    endDate: dateSchema,
    status: z.enum(TERM_STATUSES).default('UPCOMING'),
  })
  .refine((v) => v.endDate.getTime() >= v.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

// ------------------------------------------------------------- Subjects ----

export const createSubjectSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(1).max(160),
  credits: z.coerce.number().min(0).max(20).default(3),
  area: z.string().trim().max(80).optional().or(z.literal('')),
  termId: objectId,
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(CONTENT_STATUSES).default('ACTIVE'),
});

export const updateSubjectSchema = createSubjectSchema.partial();

// --------------------------------------------- Subject faculty mapping ----

export const assignSubjectFacultySchema = z.object({
  subjectId: objectId,
  facultyIds: z.array(objectId).max(20),
});

// ------------------------------------------------------------- Sessions ----

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm');

export const createSubjectSessionSchema = z
  .object({
    subjectId: objectId,
    facultyId: objectId,
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    sessionType: z.enum(SESSION_TYPES).default('LECTURE'),
    /** Links an Expert Workshop (A7) or other support activity to this class. */
    supportActivityId: objectId.nullish(),
    topic: z.string().trim().max(200).optional().or(z.literal('')),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const updateSubjectSessionSchema = z.object({
  facultyId: objectId.optional(),
  date: dateSchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  sessionType: z.enum(SESSION_TYPES).optional(),
  supportActivityId: objectId.nullish(),
  topic: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ----------------------------------------------------------- Attendance ----

export const markAttendanceSchema = z.object({
  sessionId: objectId,
  entries: z
    .array(
      z.object({
        studentId: objectId,
        status: z.enum(ATTENDANCE_STATUSES),
        remarks: z.string().trim().max(300).optional().or(z.literal('')),
      }),
    )
    .min(1)
    .max(500),
});

export type UpsertTermInput = z.infer<typeof upsertTermSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateSubjectSessionInput = z.infer<typeof createSubjectSessionSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
