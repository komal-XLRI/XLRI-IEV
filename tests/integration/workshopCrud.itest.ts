/**
 * Workshop CRUD against a real MongoDB, through the service layer.
 *
 * The unit specs cover the schema; this covers what only the database can
 * answer — that a partial edit is validated against the stored record, that
 * clearing an optional field actually clears it, and that the model's own mode
 * rules hold for a write that never went through the form.
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
const {
  createWorkshop,
  deleteWorkshop,
  getWorkshop,
  listWorkshops,
  setWorkshopStatus,
  updateWorkshop,
} = await import('@/services/workshops/workshopService');

const SUFFIX = `itest-${Date.now()}`;
const title = (label: string) => `${label} ${SUFFIX}`;

const BASE = {
  date: new Date('2026-09-14T00:00:00.000Z'),
  startTime: '10:00',
  endTime: '12:30',
  workshopType: 'FOUNDER_TALK' as const,
  hostName: 'A. Host',
  speakerName: 'B. Speaker',
  status: 'DRAFT' as const,
};

let offlineId: string;

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await models.Workshop.deleteMany({ title: new RegExp(SUFFIX) }).exec();
  await disconnectFromDatabase();
});

describe('create and read', () => {
  it('creates an offline workshop and reads it back', async () => {
    const created = await createWorkshop({
      ...BASE,
      title: title('Offline workshop'),
      mode: 'OFFLINE',
      venue: 'Auditorium 2',
      hostLinkedIn: 'https://www.linkedin.com/in/a-host',
    });

    offlineId = created._id.toString();

    const stored = await getWorkshop(offlineId);
    expect(stored.title).toBe(title('Offline workshop'));
    expect(stored.mode).toBe('OFFLINE');
    expect(stored.venue).toBe('Auditorium 2');
    expect(stored.status).toBe('DRAFT');
    expect(stored.meetingLink).toBeUndefined();
  });

  it('refuses an online workshop with no meeting link, at the model layer', async () => {
    // Never touches the Zod schema — this is the collection defending itself.
    await expect(
      models.Workshop.create({ ...BASE, title: title('Bad online'), mode: 'ONLINE' }),
    ).rejects.toThrow(/meetingLink is required/i);
  });

  it('refuses an end time at or before the start, at the model layer', async () => {
    await expect(
      models.Workshop.create({
        ...BASE,
        title: title('Bad times'),
        mode: 'OFFLINE',
        venue: 'Somewhere',
        endTime: '09:00',
      }),
    ).rejects.toThrow(/endTime must be after startTime/i);
  });

  it('filters by workshop type', async () => {
    const matching = await listWorkshops({ workshopType: 'FOUNDER_TALK' });
    expect(matching.some((row) => row._id.toString() === offlineId)).toBe(true);

    const other = await listWorkshops({ workshopType: 'INDUSTRIAL_VISIT' });
    expect(other.some((row) => row._id.toString() === offlineId)).toBe(false);
  });

  it('combines type with status and mode', async () => {
    const narrow = await listWorkshops({
      workshopType: 'FOUNDER_TALK',
      status: 'DRAFT',
      mode: 'OFFLINE',
    });
    expect(narrow.some((row) => row._id.toString() === offlineId)).toBe(true);
  });

  it('defaults an existing record with no type to OTHER', async () => {
    // Written straight to the collection with the field absent, the way a
    // workshop created before this field existed is stored.
    const legacy = await models.Workshop.collection.insertOne({
      title: `Legacy workshop ${SUFFIX}`,
      date: new Date('2026-09-14T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
      mode: 'OFFLINE',
      venue: 'Somewhere',
      hostName: 'A. Host',
      speakerName: 'B. Speaker',
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const read = await getWorkshop(legacy.insertedId.toString());
    expect(read.workshopType).toBe('OTHER');
  });

  it('finds the workshop through the filters the list page uses', async () => {
    const byStatus = await listWorkshops({ status: 'DRAFT', mode: 'OFFLINE' });
    expect(byStatus.some((row) => row._id.toString() === offlineId)).toBe(true);

    const bySearch = await listWorkshops({ q: SUFFIX });
    expect(bySearch.some((row) => row._id.toString() === offlineId)).toBe(true);

    const outsideRange = await listWorkshops({ dateTo: new Date('2026-01-01T00:00:00.000Z') });
    expect(outsideRange.some((row) => row._id.toString() === offlineId)).toBe(false);
  });
});

describe('update is validated against the stored record', () => {
  it('rejects a patch that switches to ONLINE without supplying a link', async () => {
    // The patch alone looks harmless; only the merged record shows the problem.
    await expect(updateWorkshop(offlineId, { mode: 'ONLINE' })).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ path: ['meetingLink'] })]),
    });

    const unchanged = await getWorkshop(offlineId);
    expect(unchanged.mode).toBe('OFFLINE');
  });

  it('accepts the same switch when the link comes with it, and clears the venue', async () => {
    await updateWorkshop(offlineId, {
      mode: 'ONLINE',
      meetingLink: 'https://meet.example.com/abc',
      venue: '',
    });

    const stored = await getWorkshop(offlineId);
    expect(stored.mode).toBe('ONLINE');
    expect(stored.meetingLink).toBe('https://meet.example.com/abc');
    expect(stored.venue).toBeUndefined();
  });

  it('leaves untouched fields alone', async () => {
    await updateWorkshop(offlineId, { title: title('Renamed workshop') });

    const stored = await getWorkshop(offlineId);
    expect(stored.title).toBe(title('Renamed workshop'));
    expect(stored.hostName).toBe('A. Host');
    expect(stored.hostLinkedIn).toBe('https://www.linkedin.com/in/a-host');
    expect(stored.meetingLink).toBe('https://meet.example.com/abc');
  });

  it('rejects a LinkedIn URL on another host', async () => {
    await expect(
      updateWorkshop(offlineId, { speakerLinkedIn: 'https://example.com/in/someone' }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ path: ['speakerLinkedIn'] })]),
    });
  });
});

describe('status transitions', () => {
  it('publishes, unpublishes and completes', async () => {
    expect((await setWorkshopStatus(offlineId, 'PUBLISHED')).status).toBe('PUBLISHED');
    expect((await setWorkshopStatus(offlineId, 'DRAFT')).status).toBe('DRAFT');
    expect((await setWorkshopStatus(offlineId, 'COMPLETED')).status).toBe('COMPLETED');
    expect((await getWorkshop(offlineId)).status).toBe('COMPLETED');
  });

  it('refuses a status outside the enum', async () => {
    await expect(
      setWorkshopStatus(offlineId, 'ARCHIVED' as unknown as 'DRAFT'),
    ).rejects.toThrow();
  });
});

describe('delete', () => {
  it('removes the workshop and then reports it missing', async () => {
    expect(await deleteWorkshop(offlineId)).toEqual({ deleted: true });
    await expect(getWorkshop(offlineId)).rejects.toThrow(/not found/i);
    await expect(deleteWorkshop(offlineId)).rejects.toThrow(/not found/i);
  });
});
