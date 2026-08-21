import { z } from 'zod';
import { ATTENDANCE_MARKS } from '@/lib/constants/status';
import { objectId } from './common';

/**
 * Workshop attendance.
 *
 * Its own module, matching the service. There is no date here and there is not
 * meant to be one: a workshop happens on its own date, so the workshop
 * identifies the occasion by itself.
 */

export const saveWorkshopAttendanceSchema = z
  .object({
    workshopId: objectId,
    entries: z
      .array(
        z.object({
          studentId: objectId,
          status: z.enum(ATTENDANCE_MARKS),
          remarks: z.string().trim().max(300).optional().or(z.literal('')),
        }),
      )
      .max(2000)
      .default([]),
    /** Students whose existing mark is being taken back off the register. */
    cleared: z.array(objectId).max(2000).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.entries.length === 0 && value.cleared.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to save', path: ['entries'] });
    }
  });

/** A pasted attendee list, before anybody has been matched to it. */
export const matchAttendeesSchema = z.object({
  text: z.string().trim().min(1, 'Paste the attendee list first').max(100_000),
});

export type SaveWorkshopAttendanceInput = z.infer<typeof saveWorkshopAttendanceSchema>;
