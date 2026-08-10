import { z } from 'zod';
import { Types } from 'mongoose';

export const objectId = z
  .string()
  .trim()
  .refine((value) => Types.ObjectId.isValid(value) && String(new Types.ObjectId(value)) === value, {
    message: 'Invalid id',
  });

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number');

/** Accepts "2026-11-09" and full ISO strings; normalises to a Date. */
export const dateSchema = z.coerce.date({ message: 'Enter a valid date' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

/** Rejects a range where the end precedes the start. */
export function withDateOrder<T extends { startDate: Date; endDate: Date }>(schema: z.ZodType<T>) {
  return schema.refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });
}
