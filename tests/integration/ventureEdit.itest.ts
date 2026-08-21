/**
 * Editing a venture's details, against a real MongoDB.
 *
 * The interesting case is not "does a change save" but "does erasing one".
 * On an edit form an empty field and an absent field mean opposite things —
 * "clear this" and "this was not on the form" — and folding them together is
 * how a tagline you deleted quietly comes back.
 *
 * Fixtures are created here and removed in `afterAll`. No seeded venture is
 * touched.
 *
 * Requires MONGODB_URI. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createStudentVenture, updateStudentVenture } =
  await import('@/services/ventures/studentVentureService');
const { updateStudentVentureSchema } = await import('@/validators/ventures');

const SUFFIX = `edit-${Date.now()}`;

let studentId: string;
let facultyId: string;
let ventureId: string;

beforeAll(async () => {
  await connectToDatabase();

  studentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Edit Student',
      email: `student.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: { rollNumber: `EDT-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  facultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Edit Faculty',
      email: `faculty.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  ventureId = (
    await createStudentVenture({
      studentId,
      ventureName: `Before ${SUFFIX}`,
      ventureTitle: 'A tagline that will be deleted',
      industry: 'Retail technology',
      facultyId,
      status: 'ACTIVE',
    })
  ).studentVentureId;
});

afterAll(async () => {
  const userIds = [studentId, facultyId].filter(Boolean);

  await models.StudentVentureActivity.deleteMany({ studentVentureId: ventureId }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: ventureId }).exec();
  await models.StudentVenture.deleteMany({ _id: ventureId }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('editing a venture', () => {
  it('renames it', async () => {
    await updateStudentVenture(ventureId, { ventureName: `After ${SUFFIX}` });

    const venture = await models.StudentVenture.findById(ventureId).lean().exec();
    expect(venture!.ventureName).toBe(`After ${SUFFIX}`);
  });

  it('leaves fields it was not given alone', async () => {
    await updateStudentVenture(ventureId, { industry: 'Logistics' });

    const venture = await models.StudentVenture.findById(ventureId).lean().exec();
    expect(venture!.industry).toBe('Logistics');
    expect(venture!.ventureName).toBe(`After ${SUFFIX}`);
    expect(venture!.ventureTitle).toBe('A tagline that will be deleted');
  });

  it('removes a field submitted empty rather than storing a blank', async () => {
    // The bug this guards: a blank string is not a missing value, and every
    // screen that prints a dash for "not set" would show an empty box instead.
    await updateStudentVenture(ventureId, { ventureTitle: '' });

    const venture = await models.StudentVenture.findById(ventureId).lean().exec();
    expect(venture!.ventureTitle).toBeUndefined();
  });

  it('changes the status', async () => {
    await updateStudentVenture(ventureId, { status: 'ON_HOLD' });

    const venture = await models.StudentVenture.findById(ventureId).lean().exec();
    expect(venture!.status).toBe('ON_HOLD');
  });

  it('never touches the reviewers', async () => {
    // Assignment is what grants review rights, so it keeps its own form. An
    // edit that quietly dropped a reviewer would silently stop a venture being
    // reviewable at all.
    await updateStudentVenture(ventureId, { ventureName: `Renamed again ${SUFFIX}` });

    const venture = await models.StudentVenture.findById(ventureId).lean().exec();
    expect(venture!.facultyId?.toString()).toBe(facultyId);
  });

  it('refuses an empty name through the schema', async () => {
    const parsed = updateStudentVentureSchema.safeParse({ ventureName: '' });

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/venture name is required/i);
  });

  it('refuses a venture that is not there', async () => {
    await expect(
      updateStudentVenture('000000000000000000000000', { ventureName: 'Ghost' }),
    ).rejects.toThrow(/not found/i);
  });
});
