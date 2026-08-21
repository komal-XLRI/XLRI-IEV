import { z } from 'zod';
import { ATTENDANCE_MARKS } from '@/lib/constants/status';
import { dateSchema, objectId } from './common';

/**
 * Venture Activity attendance.
 *
 * Its own module rather than a section of `ventures.ts`, matching the way the
 * feature itself is separated: attendance is a register the programme office
 * keeps, and it takes no part in the rules that decide what a student may do
 * next. Nothing that gates progression should have to be read past this.
 */

/**
 * A whole register, submitted in one request.
 *
 * Scoped to one activity and one date, because that is what a register *is* —
 * the pair is what the unique index keys on, so a save without both could not
 * be an idempotent correction of an earlier one.
 *
 * `max` bounds a runaway form rather than trusting the page to send a sensible
 * number.
 */
export const saveAttendanceSchema = z
  .object({
    ventureActivityId: objectId,
    date: dateSchema,
    entries: z
      .array(
        z.object({
          studentVentureId: objectId,
          status: z.enum(ATTENDANCE_MARKS),
          remarks: z.string().trim().max(300).optional().or(z.literal('')),
        }),
      )
      .max(500)
      .default([]),
    /**
     * Students whose existing mark is being taken back off the register.
     *
     * Clearing travels with the save rather than being a separate request:
     * unmarked is the absence of a row, not a third status, so taking a mark
     * back is a delete — and one submit that both marks and unmarks is the only
     * way "everyone present, except remove the two I mis-clicked" is one edit.
     */
    cleared: z.array(objectId).max(500).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.entries.length === 0 && value.cleared.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to save', path: ['entries'] });
    }
  });

/** Returning one student to "not marked", which is not a status but an absence. */
export const clearAttendanceSchema = z.object({
  ventureActivityId: objectId,
  studentVentureId: objectId,
  date: dateSchema,
});

export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type ClearAttendanceInput = z.infer<typeof clearAttendanceSchema>;
