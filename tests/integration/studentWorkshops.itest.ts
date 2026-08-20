/**
 * What a student sees on their workshops page, against a real MongoDB.
 *
 * This is a visibility boundary, so it is tested as one. The failure that
 * matters is not a missing card — it is a draft that an administrator is still
 * writing appearing in front of the cohort, or a cancelled session staying
 * silently visible so somebody travels to it.
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
const { createWorkshop, listWorkshopsForStudent } =
  await import('@/services/workshops/workshopService');

const SUFFIX = `stuws-${Date.now()}`;
const NOW = new Date('2026-07-15T09:00:00.000Z');

/** A date offset from the fixed "now" these tests reason about. */
const day = (offset: number) => new Date(Date.UTC(2026, 6, 15 + offset, 0, 0, 0, 0));

const BASE = {
  startTime: '10:00',
  endTime: '12:00',
  workshopType: 'MASTERCLASS' as const,
  mode: 'OFFLINE' as const,
  venue: 'Auditorium 2',
  hostName: 'A. Host',
  speakerName: 'B. Speaker',
};

const ids: Record<string, string> = {};

async function fixture(label: string, overrides: Record<string, unknown>) {
  const workshop = await createWorkshop({
    ...BASE,
    ...overrides,
    title: `${label} ${SUFFIX}`,
  } as Parameters<typeof createWorkshop>[0]);

  ids[label] = workshop._id.toString();
  return workshop._id.toString();
}

/** Only this spec's own fixtures — the database also holds seeded workshops. */
function mine(rows: Array<{ _id: { toString(): string } }>): string[] {
  const owned = new Set(Object.values(ids));
  return rows.map((row) => row._id.toString()).filter((id) => owned.has(id));
}

function labelOf(id: string): string {
  return Object.entries(ids).find(([, value]) => value === id)?.[0] ?? id;
}

beforeAll(async () => {
  await connectToDatabase();

  await fixture('published-future', { date: day(10), status: 'PUBLISHED' });
  await fixture('published-today', { date: day(0), status: 'PUBLISHED' });
  await fixture('published-past', { date: day(-10), status: 'PUBLISHED' });
  await fixture('completed-past', { date: day(-20), status: 'COMPLETED' });
  await fixture('draft-future', { date: day(5), status: 'DRAFT' });
  await fixture('cancelled-quiet', { date: day(7), status: 'CANCELLED' });
  await fixture('completed-today', { date: day(0), status: 'COMPLETED' });

  const announced = await fixture('cancelled-announced', { date: day(8), status: 'CANCELLED' });
  await models.Workshop.updateOne(
    { _id: announced },
    { $set: { isEmailSent: true, emailSentAt: new Date(), emailRecipientCount: 12 } },
  ).exec();
});

afterAll(async () => {
  await models.Workshop.deleteMany({ title: new RegExp(SUFFIX) }).exec();
  await disconnectFromDatabase();
});

describe('what a student may see', () => {
  it('shows published and completed workshops', async () => {
    const feed = await listWorkshopsForStudent(NOW);
    const visible = [...mine(feed.upcoming), ...mine(feed.past)].map(labelOf);

    expect(visible).toContain('published-future');
    expect(visible).toContain('published-today');
    expect(visible).toContain('published-past');
    expect(visible).toContain('completed-past');
  });

  it('never shows a draft', async () => {
    // A draft is an administrator still writing. It has no business in front
    // of the cohort, whatever its date says.
    const feed = await listWorkshopsForStudent(NOW);
    const visible = [...mine(feed.upcoming), ...mine(feed.past)].map(labelOf);

    expect(visible).not.toContain('draft-future');
  });

  it('hides a workshop cancelled before anyone was told', async () => {
    const feed = await listWorkshopsForStudent(NOW);
    expect(mine(feed.upcoming).map(labelOf)).not.toContain('cancelled-quiet');
  });

  it('keeps showing a workshop cancelled after the email went out', async () => {
    // The one case where a cancelled record must stay visible: these students
    // were told to turn up, and removing the card silently strands them.
    const feed = await listWorkshopsForStudent(NOW);
    expect(mine(feed.upcoming).map(labelOf)).toContain('cancelled-announced');
  });
});

describe('upcoming and past', () => {
  it("treats today's workshop as still to come", async () => {
    // It has not happened until its end time; moving it to "past" at midnight
    // hides it from the student on their way to it.
    const feed = await listWorkshopsForStudent(NOW);

    expect(mine(feed.upcoming).map(labelOf)).toContain('published-today');
    expect(mine(feed.past).map(labelOf)).not.toContain('published-today');
  });

  it('puts a completed workshop in the past whatever its date says', async () => {
    // The office marks a session completed on the morning it ran. Trusting the
    // date alone would keep advertising it as "coming up" until midnight.
    const feed = await listWorkshopsForStudent(NOW);

    expect(mine(feed.past).map(labelOf)).toContain('completed-today');
    expect(mine(feed.upcoming).map(labelOf)).not.toContain('completed-today');
  });

  it('holds the split at the start of today, not at the current hour', async () => {
    const lateEvening = new Date('2026-07-15T23:30:00.000Z');
    const feed = await listWorkshopsForStudent(lateEvening);

    expect(mine(feed.upcoming).map(labelOf)).toContain('published-today');
  });

  it('orders what is coming soonest first, and history most recent first', async () => {
    const feed = await listWorkshopsForStudent(NOW);

    const upcoming = mine(feed.upcoming).map(labelOf);
    expect(upcoming.indexOf('published-today')).toBeLessThan(
      upcoming.indexOf('cancelled-announced'),
    );
    expect(upcoming.indexOf('cancelled-announced')).toBeLessThan(
      upcoming.indexOf('published-future'),
    );

    const past = mine(feed.past).map(labelOf);
    expect(past.indexOf('published-past')).toBeLessThan(past.indexOf('completed-past'));
  });

  it('carries the full record, not a summary', async () => {
    // The page renders everything inline instead of linking to a detail view,
    // so a field trimmed from this query is a field a student cannot reach.
    const feed = await listWorkshopsForStudent(NOW);
    const workshop = feed.upcoming.find((row) => row._id.toString() === ids['published-future']);

    expect(workshop).toMatchObject({
      venue: 'Auditorium 2',
      hostName: 'A. Host',
      speakerName: 'B. Speaker',
      startTime: '10:00',
      endTime: '12:00',
      workshopType: 'MASTERCLASS',
      mode: 'OFFLINE',
    });
  });
});
