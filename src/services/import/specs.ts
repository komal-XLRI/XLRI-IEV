import 'server-only';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/db/mongoose';
import { SupportActivity, Term, VentureActivity } from '@/models';
import { createUser } from '@/services/users/userService';
import { createSubject } from '@/services/academic/academicService';
import { createVentureActivity } from '@/services/ventures/ventureActivityService';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ImportSpec } from '@/lib/import/types';

/**
 * Import definitions.
 *
 * Each one reuses the same service function the UI calls, so an imported record
 * goes through identical validation, uniqueness checks and side effects as one
 * typed in by hand — there is no second, weaker write path.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const emailField = z.string().trim().toLowerCase().email('Enter a valid email address');

/** Duplicate detection within a single uploaded file. */
function duplicateBy<T>(key: (row: T) => string, label: string) {
  return (rows: T[]) => {
    const seen = new Map<string, number>();
    const problems: Array<{ index: number; message: string }> = [];

    rows.forEach((row, index) => {
      const value = key(row).toLowerCase();
      if (!value) return;

      const first = seen.get(value);
      if (first !== undefined) {
        problems.push({
          index,
          message: `Duplicate ${label} "${key(row)}" — also on row ${first + 1} of this file.`,
        });
      } else {
        seen.set(value, index);
      }
    });

    return problems;
  };
}

// ---------------------------------------------------------- Students ----

const studentRow = z.object({
  name: trimmed(120).min(2, 'Name is too short'),
  email: emailField,
  rollNumber: trimmed(40).min(1, 'Roll number is required'),
  batch: trimmed(40).min(1, 'Batch is required'),
  cluster: optional(80),
  phone: optional(20),
});

export const studentImport: ImportSpec<z.infer<typeof studentRow>> = {
  key: 'students',
  title: 'Import students',
  description:
    'Creates student accounts and their profiles. Each student can then sign in with an emailed OTP.',
  roles: ['ADMIN'],
  columns: [
    { field: 'name', label: 'Name', required: true, example: 'Asha Ramanathan' },
    { field: 'email', label: 'Email', required: true, example: 'asha@programme.edu' },
    { field: 'rollNumber', label: 'Roll Number', required: true, example: 'IEV001' },
    { field: 'batch', label: 'Batch', required: true, example: '2026' },
    { field: 'cluster', label: 'Cluster', required: false, example: 'A' },
    { field: 'phone', label: 'Phone', required: false, example: '+91 98765 43210' },
  ],
  schema: studentRow,
  validateBatch: (rows) => [
    ...duplicateBy<z.infer<typeof studentRow>>((row) => row.email, 'email')(rows),
    ...duplicateBy<z.infer<typeof studentRow>>((row) => row.rollNumber, 'roll number')(rows),
  ],
  commit: async (row) => {
    await createUser({
      role: 'STUDENT',
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: 'ACTIVE',
      profile: {
        rollNumber: row.rollNumber,
        batch: row.batch,
        cluster: row.cluster,
      },
    });
  },
};

// ----------------------------------------------------------- Faculty ----

const facultyRow = z.object({
  name: trimmed(120).min(2, 'Name is too short'),
  email: emailField,
  designation: optional(120),
  department: optional(120),
  specialization: optional(200),
  phone: optional(20),
});

export const facultyImport: ImportSpec<z.infer<typeof facultyRow>> = {
  key: 'faculty',
  title: 'Import faculty',
  description:
    'Creates faculty accounts. Teaching a subject grants no venture-review rights — assign reviewers on each venture.',
  roles: ['ADMIN'],
  columns: [
    { field: 'name', label: 'Name', required: true, example: 'Dr Meera Iyer' },
    { field: 'email', label: 'Email', required: true, example: 'meera@programme.edu' },
    { field: 'designation', label: 'Designation', required: false, example: 'Associate Professor' },
    { field: 'department', label: 'Department', required: false, example: 'Entrepreneurship' },
    {
      field: 'specialization',
      label: 'Specialization',
      required: false,
      example: 'New venture creation',
    },
    { field: 'phone', label: 'Phone', required: false, example: '+91 98765 43210' },
  ],
  schema: facultyRow,
  validateBatch: duplicateBy<z.infer<typeof facultyRow>>((row) => row.email, 'email'),
  commit: async (row) => {
    await createUser({
      role: 'FACULTY',
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: 'ACTIVE',
      profile: {
        designation: row.designation,
        department: row.department,
        specialization: row.specialization,
      },
    });
  },
};

// ----------------------------------------------------------- Mentors ----

const mentorRow = z.object({
  name: trimmed(120).min(2, 'Name is too short'),
  email: emailField,
  company: optional(160),
  designation: optional(120),
  industry: optional(120),
  expertise: optional(200),
  phone: optional(20),
});

export const mentorImport: ImportSpec<z.infer<typeof mentorRow>> = {
  key: 'mentors',
  title: 'Import mentors',
  description: 'Creates industry mentor accounts. Mentor approval is mandatory on every activity.',
  roles: ['ADMIN'],
  columns: [
    { field: 'name', label: 'Name', required: true, example: 'Ravi Deshpande' },
    { field: 'email', label: 'Email', required: true, example: 'ravi@northbridge.com' },
    { field: 'company', label: 'Company', required: false, example: 'Northbridge Ventures' },
    { field: 'designation', label: 'Designation', required: false, example: 'Operating Partner' },
    { field: 'industry', label: 'Industry', required: false, example: 'Retail & supply chain' },
    { field: 'expertise', label: 'Expertise', required: false, example: 'Go-to-market' },
    { field: 'phone', label: 'Phone', required: false, example: '+91 98765 43210' },
  ],
  schema: mentorRow,
  validateBatch: duplicateBy<z.infer<typeof mentorRow>>((row) => row.email, 'email'),
  commit: async (row) => {
    await createUser({
      role: 'MENTOR',
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: 'ACTIVE',
      profile: {
        company: row.company,
        designation: row.designation,
        industry: row.industry,
        expertise: row.expertise,
      },
    });
  },
};

// ---------------------------------------------------------- Subjects ----

const subjectRow = z.object({
  code: trimmed(20).min(1, 'Code is required').toUpperCase(),
  name: trimmed(160).min(1, 'Name is required'),
  termNumber: z.coerce.number().int().min(1).max(3),
  credits: z.coerce.number().min(0).max(20).default(3),
  area: optional(80),
  description: optional(2000),
});

export const subjectImport: ImportSpec<z.infer<typeof subjectRow>> = {
  key: 'subjects',
  title: 'Import subjects',
  description: 'Adds subjects to a term. Term Number must be 1, 2 or 3.',
  roles: ['ADMIN'],
  columns: [
    { field: 'code', label: 'Code', required: true, example: 'DT' },
    { field: 'name', label: 'Name', required: true, example: 'Design Thinking' },
    { field: 'termNumber', label: 'Term Number', required: true, example: '1' },
    { field: 'credits', label: 'Credits', required: false, example: '3' },
    { field: 'area', label: 'Area', required: false, example: 'Innovation' },
    { field: 'description', label: 'Description', required: false, example: '' },
  ],
  schema: subjectRow,
  validateBatch: duplicateBy<z.infer<typeof subjectRow>>((row) => row.code, 'subject code'),
  commit: async (row) => {
    await connectToDatabase();

    const term = await Term.findOne({ termNumber: row.termNumber }).select('_id').lean().exec();
    if (!term) throw new NotFoundError(`Term ${row.termNumber} does not exist. Seed terms first.`);

    await createSubject({
      code: row.code,
      name: row.name,
      credits: row.credits,
      area: row.area,
      termId: term._id.toString(),
      description: row.description,
      status: 'ACTIVE',
    });
  },
};

// ------------------------------------------------- Venture activities ----

const ventureActivityRow = z
  .object({
    activityCode: trimmed(10).min(1, 'Code is required').toUpperCase(),
    name: trimmed(160).min(1, 'Name is required'),
    termNumber: z.coerce.number().int().min(1).max(3),
    order: z.coerce.number().int().min(1).max(99),
    startDate: z.coerce.date({ message: 'Use YYYY-MM-DD' }),
    endDate: z.coerce.date({ message: 'Use YYYY-MM-DD' }),
    maxAttempts: z.coerce.number().int().min(1).max(10).default(3),
    evidenceRequired: z
      .string()
      .trim()
      .optional()
      .transform((value) => {
        if (value === undefined || value === '') return true;
        return !/^(no|false|0|n)$/i.test(value);
      }),
    description: optional(4000),
    supportActivityCodes: optional(200),
  })
  .refine((row) => row.endDate.getTime() >= row.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export const ventureActivityImport: ImportSpec<z.infer<typeof ventureActivityRow>> = {
  key: 'venture-activities',
  title: 'Import venture activities',
  description:
    'Bulk-configures the activity schedule. Duration is derived from the dates; the 12–15 day guideline is not enforced.',
  roles: ['ADMIN'],
  columns: [
    { field: 'activityCode', label: 'Code', required: true, example: 'V01' },
    { field: 'name', label: 'Name', required: true, example: 'Idea Generation' },
    { field: 'termNumber', label: 'Term Number', required: true, example: '1' },
    { field: 'order', label: 'Order', required: true, example: '1' },
    { field: 'startDate', label: 'Start Date', required: true, example: '2026-07-01' },
    { field: 'endDate', label: 'End Date', required: true, example: '2026-07-14' },
    { field: 'maxAttempts', label: 'Max Attempts', required: false, example: '3' },
    {
      field: 'evidenceRequired',
      label: 'Evidence Required',
      required: false,
      example: 'Yes',
      hint: 'Yes/No — defaults to Yes',
    },
    {
      field: 'supportActivityCodes',
      label: 'Support Activity Codes',
      required: false,
      example: 'A1;A2;A8',
      hint: 'Semicolon-separated support activity codes',
    },
    { field: 'description', label: 'Description', required: false, example: '' },
  ],
  schema: ventureActivityRow,
  validateBatch: (rows) => [
    ...duplicateBy<z.infer<typeof ventureActivityRow>>(
      (row) => row.activityCode,
      'activity code',
    )(rows),
    ...duplicateBy<z.infer<typeof ventureActivityRow>>((row) => String(row.order), 'order')(rows),
  ],
  commit: async (row) => {
    await connectToDatabase();

    const term = await Term.findOne({ termNumber: row.termNumber }).select('_id').lean().exec();
    if (!term) throw new NotFoundError(`Term ${row.termNumber} does not exist. Seed terms first.`);

    const existing = await VentureActivity.findOne({ activityCode: row.activityCode })
      .select('_id')
      .lean()
      .exec();
    if (existing) {
      throw new ConflictError(
        `Activity ${row.activityCode} already exists. Edit it from the Venture Activities screen instead.`,
      );
    }

    const created = await createVentureActivity({
      activityCode: row.activityCode,
      name: row.name,
      description: row.description,
      termId: term._id.toString(),
      order: row.order,
      startDate: row.startDate,
      endDate: row.endDate,
      maxAttempts: row.maxAttempts,
      evidenceRequired: row.evidenceRequired,
      status: 'ACTIVE',
    });

    // Support mappings are optional; an unknown code is a row-level failure so
    // the administrator finds out rather than silently losing the mapping.
    if (row.supportActivityCodes) {
      const codes = row.supportActivityCodes
        .split(/[;|]/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);

      if (codes.length > 0) {
        const supports = await SupportActivity.find({ activityCode: { $in: codes } })
          .select('_id activityCode')
          .lean()
          .exec();

        const found = new Set(supports.map((support) => support.activityCode));
        const missing = codes.filter((code) => !found.has(code));
        if (missing.length > 0) {
          throw new ValidationError(
            `Activity created, but these support activity codes were not found: ${missing.join(', ')}`,
          );
        }

        const { setSupportMappings } = await import('@/services/ventures/ventureActivityService');
        await setSupportMappings(
          created._id.toString(),
          supports.map((support) => support._id.toString()),
        );
      }
    }
  },
};

// ------------------------------------------------------------ Registry ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by design; each spec is internally typed.
const SPECS: Record<string, ImportSpec<any>> = {
  [studentImport.key]: studentImport,
  [facultyImport.key]: facultyImport,
  [mentorImport.key]: mentorImport,
  [subjectImport.key]: subjectImport,
  [ventureActivityImport.key]: ventureActivityImport,
};

export const IMPORT_KEYS = Object.keys(SPECS);

export function getImportSpec(key: string) {
  return SPECS[key] ?? null;
}
