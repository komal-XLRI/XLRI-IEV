/**
 * The schedule fields on a Support Activity, against a real MongoDB.
 *
 * The upsert is keyed on `activityCode`, so the interesting cases are not
 * "does it save" but what happens on the *second* save: an omitted key in a
 * `$set` leaves the stored value alone, which is how a cleared date quietly
 * comes back. That, and the fact that the eight seeded activities carry no
 * schedule at all and must stay editable.
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
const { upsertSupportActivity } = await import('@/services/ventures/ventureActivityService');
const { upsertSupportActivitySchema } = await import('@/validators/ventures');

const SUFFIX = Date.now().toString().slice(-6);
const CODE = `SCH${SUFFIX}`;
const ORDER = 90;

const BASE = {
  activityCode: CODE,
  name: `Schedule fixture ${SUFFIX}`,
  order: ORDER,
  scheduleType: 'WEEKEND',
};

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await models.SupportActivity.deleteMany({ activityCode: CODE }).exec();
  await disconnectFromDatabase();
});

describe('saving a schedule', () => {
  it('stores a date with a start and end time', async () => {
    const saved = await upsertSupportActivity({
      ...BASE,
      scheduledDate: new Date('2026-10-03T00:00:00.000Z'),
      startTime: '09:30',
      endTime: '16:00',
    });

    expect(saved.scheduledDate?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(saved.startTime).toBe('09:30');
    expect(saved.endTime).toBe('16:00');
  });

  it('allows a date with no times', async () => {
    const saved = await upsertSupportActivity({
      ...BASE,
      scheduledDate: new Date('2026-10-04T00:00:00.000Z'),
    });

    expect(saved.scheduledDate).not.toBeNull();
    expect(saved.startTime).toBeNull();
    expect(saved.endTime).toBeNull();
  });

  it('clears the schedule when the fields are left blank', async () => {
    // The regression this guards: `$set` without these keys leaves the stored
    // date in place, so clearing the form would appear to do nothing.
    await upsertSupportActivity({
      ...BASE,
      scheduledDate: new Date('2026-10-05T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
    });

    const cleared = await upsertSupportActivity(BASE);

    expect(cleared.scheduledDate).toBeNull();
    expect(cleared.startTime).toBeNull();
    expect(cleared.endTime).toBeNull();
  });

  it('leaves the eight seeded activities editable with no schedule', async () => {
    const seeded = await models.SupportActivity.findOne({ activityCode: { $ne: CODE } })
      .sort({ order: 1 })
      .lean()
      .exec();
    if (!seeded) throw new Error('Run `npm run seed` before the integration tests.');

    const saved = await upsertSupportActivity({
      activityCode: seeded.activityCode,
      name: seeded.name,
      description: seeded.description,
      order: seeded.order,
      scheduleType: seeded.scheduleType,
    });

    expect(saved.name).toBe(seeded.name);
    expect(saved.scheduledDate).toBeNull();
  });
});

describe('the model refuses an incoherent schedule', () => {
  it('rejects a time with no date', async () => {
    await expect(
      models.SupportActivity.create({
        activityCode: `BAD1${SUFFIX}`,
        name: 'No date',
        order: 91,
        scheduleType: 'WEEKEND',
        startTime: '09:00',
      }),
    ).rejects.toThrow(/need a scheduledDate/i);
  });

  it('rejects an end time at or before the start', async () => {
    await expect(
      models.SupportActivity.create({
        activityCode: `BAD2${SUFFIX}`,
        name: 'Backwards',
        order: 92,
        scheduleType: 'WEEKEND',
        scheduledDate: new Date('2026-10-03T00:00:00.000Z'),
        startTime: '16:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow(/endTime must be after startTime/i);
  });

  it('rejects a malformed time', async () => {
    await expect(
      models.SupportActivity.create({
        activityCode: `BAD3${SUFFIX}`,
        name: 'Bad clock',
        order: 93,
        scheduleType: 'WEEKEND',
        scheduledDate: new Date('2026-10-03T00:00:00.000Z'),
        startTime: '25:00',
      }),
    ).rejects.toThrow();
  });
});

describe('the form schema applies the same rules', () => {
  const form = (extra: Record<string, unknown>) =>
    upsertSupportActivitySchema.safeParse({ ...BASE, ...extra });

  const paths = (result: ReturnType<typeof form>) =>
    result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));

  it('accepts a whole schedule', () => {
    expect(form({ scheduledDate: '2026-10-03', startTime: '09:30', endTime: '16:00' }).success).toBe(
      true,
    );
  });

  it('accepts no schedule at all', () => {
    expect(form({}).success).toBe(true);
  });

  it('treats blank strings as "no schedule" rather than as errors', () => {
    const result = form({ scheduledDate: '', startTime: '', endTime: '' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.startTime).toBeUndefined();
  });

  it('asks for a date when a time is given', () => {
    expect(paths(form({ startTime: '09:00' }))).toContain('scheduledDate');
  });

  it('rejects an end at or before the start', () => {
    expect(
      paths(form({ scheduledDate: '2026-10-03', startTime: '16:00', endTime: '09:00' })),
    ).toContain('endTime');
    expect(
      paths(form({ scheduledDate: '2026-10-03', startTime: '09:00', endTime: '09:00' })),
    ).toContain('endTime');
  });

  it('rejects a malformed time', () => {
    expect(paths(form({ scheduledDate: '2026-10-03', startTime: '9am' }))).toContain('startTime');
  });
});
