import { z } from 'zod';
import { ROLES, USER_STATUSES } from '@/lib/constants/roles';
import { emailSchema, objectId, phoneSchema } from './common';

const nameSchema = z.string().trim().min(2, 'Name is too short').max(120);

const studentProfileFields = z.object({
  rollNumber: z.string().trim().min(1, 'Roll number is required').max(40),
  batch: z.string().trim().min(1, 'Batch is required').max(40),
  cluster: z.string().trim().max(80).optional().or(z.literal('')),
  background: z.string().trim().max(2000).optional().or(z.literal('')),
  strengths: z.string().trim().max(2000).optional().or(z.literal('')),
  weakness: z.string().trim().max(2000).optional().or(z.literal('')),
  personalContext: z.string().trim().max(2000).optional().or(z.literal('')),
});

const facultyProfileFields = z.object({
  designation: z.string().trim().max(120).optional().or(z.literal('')),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  specialization: z.string().trim().max(200).optional().or(z.literal('')),
  bio: z.string().trim().max(2000).optional().or(z.literal('')),
});

const mentorProfileFields = z.object({
  company: z.string().trim().max(160).optional().or(z.literal('')),
  designation: z.string().trim().max(120).optional().or(z.literal('')),
  industry: z.string().trim().max(120).optional().or(z.literal('')),
  expertise: z.string().trim().max(200).optional().or(z.literal('')),
  bio: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * Creating a user always creates the matching role profile in the same
 * operation, so the discriminated union keeps the two in step.
 */
export const createUserSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('STUDENT'),
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal('')),
    status: z.enum(USER_STATUSES).default('ACTIVE'),
    profile: studentProfileFields,
  }),
  z.object({
    role: z.literal('FACULTY'),
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal('')),
    status: z.enum(USER_STATUSES).default('ACTIVE'),
    profile: facultyProfileFields.default({}),
  }),
  z.object({
    role: z.literal('MENTOR'),
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal('')),
    status: z.enum(USER_STATUSES).default('ACTIVE'),
    profile: mentorProfileFields.default({}),
  }),
  z.object({
    role: z.literal('ADMIN'),
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal('')),
    status: z.enum(USER_STATUSES).default('ACTIVE'),
  }),
]);

export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  status: z.enum(USER_STATUSES).optional(),
  profile: z
    .object({
      ...studentProfileFields.partial().shape,
      ...facultyProfileFields.shape,
      ...mentorProfileFields.shape,
    })
    .partial()
    .optional(),
});

export const listUsersSchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Bulk student import — one row per student. */
export const importStudentsSchema = z.object({
  students: z
    .array(
      z.object({
        name: nameSchema,
        email: emailSchema,
        phone: phoneSchema.optional().or(z.literal('')),
        rollNumber: z.string().trim().min(1).max(40),
        batch: z.string().trim().min(1).max(40),
        cluster: z.string().trim().max(80).optional().or(z.literal('')),
      }),
    )
    .min(1, 'Provide at least one student')
    .max(500, 'Import at most 500 students at a time'),
});

export const userIdParamSchema = z.object({ id: objectId });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
