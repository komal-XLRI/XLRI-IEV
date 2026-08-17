/**
 * Filter behaviour, against a real MongoDB.
 *
 * These are integration specs rather than unit specs on purpose: every bug they
 * cover was a query that looked right in isolation and returned the wrong rows
 * against real data — a filter applied to an already-fetched page, a reviewer
 * matched by display name, a batch compared with `===` to a value a CSV had
 * padded. None of that reproduces against a stub.
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
const { createUser, listUsers, DIRECTORY_LIMIT } = await import('@/services/users/userService');
const { createStudentVenture, listVentures } = await import(
  '@/services/ventures/studentVentureService'
);
const { getStudentProgressReport, getActivityCompletionReport } = await import(
  '@/services/reports/reportService'
);
const { getFilterOptions } = await import('@/services/export/filterOptions');

const SUFFIX = `filt-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

/**
 * Two batches, and a name that only differs in the profile, so a search that
 * only looks at User cannot pass by accident.
 */
const COHORT = [
  { label: 'alpha', name: 'Zenobia Alpha', batch: '2026', roll: `RA-${SUFFIX}` },
  { label: 'beta', name: 'Yusuf Beta', batch: '2027', roll: `RB-${SUFFIX}` },
  // Batch written the way a spreadsheet writes it: padded and differently cased.
  { label: 'gamma', name: 'Xavier Gamma', batch: ' 2026 ', roll: `RC-${SUFFIX}` },
];

const created: Record<string, string> = {};
let facultyOneId: string;
let facultyTwoId: string;
let mentorId: string;
let ventureAlphaId: string;
let ventureBetaId: string;

beforeAll(async () => {
  await connectToDatabase();

  for (const person of COHORT) {
    created[person.label] = (
      await createUser({
        role: 'STUDENT',
        name: person.name,
        email: email(person.label),
        status: 'ACTIVE',
        profile: { rollNumber: person.roll, batch: person.batch, cluster: 'Cluster Q' },
      })
    ).userId;
  }

  // Two faculty with the SAME display name — the case the old name-matching
  // filter got wrong, and the reason this fixture exists.
  facultyOneId = (
    await createUser({
      role: 'FACULTY',
      name: 'Same Name',
      email: email('faculty-one'),
      status: 'ACTIVE',
      profile: { designation: 'Professor', department: 'Strategy' },
    })
  ).userId;

  facultyTwoId = (
    await createUser({
      role: 'FACULTY',
      name: 'Same Name',
      email: email('faculty-two'),
      status: 'ACTIVE',
      profile: { designation: 'Reader', department: 'Finance' },
    })
  ).userId;

  mentorId = (
    await createUser({
      role: 'MENTOR',
      name: 'Filter Mentor',
      email: email('mentor'),
      status: 'ACTIVE',
      profile: { company: 'Northwind Trading', industry: 'Logistics' },
    })
  ).userId;

  ventureAlphaId = (
    await createStudentVenture({
      studentId: created.alpha,
      ventureName: `Alpha Venture ${SUFFIX}`,
      industry: 'Agritech',
      facultyId: facultyOneId,
      mentorId,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  ventureBetaId = (
    await createStudentVenture({
      studentId: created.beta,
      ventureName: `Beta Venture ${SUFFIX}`,
      industry: 'Fintech',
      facultyId: facultyTwoId,
      mentorId,
      status: 'ON_HOLD',
    })
  ).studentVentureId;

  // Deactivated last: a venture can only be created for an active student, and
  // this fixture needs both a venture and an inactive account to prove that
  // status and search compose rather than override each other.
  await models.User.updateOne({ _id: created.beta }, { $set: { status: 'INACTIVE' } }).exec();
});

afterAll(async () => {
  const userIds = [...Object.values(created), facultyOneId, facultyTwoId, mentorId].filter(Boolean);
  const ventureIds = [ventureAlphaId, ventureBetaId].filter(Boolean);

  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.FacultyProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.MentorProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

const listStudents = (extra: Record<string, unknown> = {}) =>
  listUsers({ role: 'STUDENT', page: 1, pageSize: DIRECTORY_LIMIT, ...extra });

const ids = (result: { items: Array<{ _id: unknown }> }) =>
  result.items.map((item) => String(item._id));

describe('student directory search', () => {
  it('matches on name', async () => {
    expect(ids(await listStudents({ q: 'Zenobia' }))).toContain(created.alpha);
  });

  it('matches on email', async () => {
    expect(ids(await listStudents({ q: email('alpha') }))).toEqual([created.alpha]);
  });

  it('matches on roll number, which lives on the profile', async () => {
    // The regression: roll number is shown in the directory but was not
    // searchable, because the query only ever looked at name and email.
    expect(ids(await listStudents({ q: `RA-${SUFFIX}` }))).toEqual([created.alpha]);
  });

  it('matches on cluster', async () => {
    const found = ids(await listStudents({ q: 'Cluster Q' }));
    expect(found).toEqual(expect.arrayContaining(Object.values(created)));
  });

  it('is case-insensitive and tolerates padding', async () => {
    expect(ids(await listStudents({ q: 'zenobia' }))).toContain(created.alpha);
    expect(ids(await listStudents({ q: '  ZENOBIA  ' }))).toContain(created.alpha);
  });

  it('matches partially', async () => {
    expect(ids(await listStudents({ q: 'Zeno' }))).toContain(created.alpha);
  });

  it('treats regex metacharacters as literal text', async () => {
    // A search for ".*" must not behave as "match everything".
    expect(ids(await listStudents({ q: '.*' }))).toEqual([]);
  });

  it('returns an empty list rather than throwing when nothing matches', async () => {
    const result = await listStudents({ q: 'no-such-student-anywhere' });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('batch filter', () => {
  it('filters by batch in the query', async () => {
    const found = ids(await listStudents({ batch: '2026' }));
    expect(found).toContain(created.alpha);
    expect(found).not.toContain(created.beta);
  });

  it('matches a batch a CSV padded or recased', async () => {
    // "gamma" was imported as " 2026 ". An exact `===` misses it entirely.
    expect(ids(await listStudents({ batch: '2026' }))).toContain(created.gamma);
  });

  it('does not treat one batch as a prefix of another', async () => {
    expect(ids(await listStudents({ batch: '202' }))).toEqual([]);
  });

  it('offers batches from the database, not a hardcoded list', async () => {
    const { batches } = await getFilterOptions();
    const values = batches.map((option) => option.value);
    expect(values).toContain('2027');
    expect(batches.every((option) => option.value && option.label)).toBe(true);
  });
});

describe('filters compose', () => {
  it('search + status', async () => {
    expect(ids(await listStudents({ q: SUFFIX, status: 'INACTIVE' }))).toEqual([created.beta]);
  });

  it('batch + status', async () => {
    const active2026 = ids(await listStudents({ batch: '2026', status: 'ACTIVE' }));
    expect(active2026).toEqual(expect.arrayContaining([created.alpha, created.gamma]));
    expect(active2026).not.toContain(created.beta);

    // Asserted against this file's own fixtures rather than the whole table:
    // the database also holds seeded demo students, and a test that only
    // passes on an empty database is a test that fails the moment anyone
    // seeds one.
    const active2027 = ids(await listStudents({ batch: '2027', status: 'ACTIVE' }));
    expect(active2027).not.toContain(created.alpha);
    expect(active2027).not.toContain(created.beta);
    expect(active2027).not.toContain(created.gamma);
  });

  it('search + batch', async () => {
    expect(ids(await listStudents({ q: 'Zenobia', batch: '2026' }))).toEqual([created.alpha]);
    expect(ids(await listStudents({ q: 'Zenobia', batch: '2027' }))).not.toContain(created.alpha);
  });

  it('search + batch + status together', async () => {
    expect(ids(await listStudents({ q: SUFFIX, batch: '2026', status: 'ACTIVE' }))).toEqual(
      expect.arrayContaining([created.alpha, created.gamma]),
    );
  });

  it('clearing every filter restores the full list', async () => {
    const all = ids(await listStudents());
    expect(all).toEqual(expect.arrayContaining(Object.values(created)));
  });
});

describe('imported students, and the page-vs-query regression', () => {
  const IMPORTED = 'imported-2028';
  const importedIds: string[] = [];

  beforeAll(async () => {
    // Through the real import path, so these students are written exactly the
    // way a CSV upload writes them — same schema, same service, same trimming.
    const { studentImport } = await import('@/services/import/specs');

    // Names chosen to sort AFTER the rest of the fixture: the directory sorts
    // by name, so under the old code these fell outside the fetched page.
    for (const index of [1, 2, 3]) {
      await studentImport.commit({
        name: `Zzz Imported ${index}`,
        email: `imported${index}.${SUFFIX}@example.test`,
        rollNumber: `IMP${index}-${SUFFIX}`,
        batch: IMPORTED,
        cluster: undefined,
        phone: undefined,
      });
    }

    const users = await models.User.find({ email: new RegExp(`imported\\d\\.${SUFFIX}`) })
      .select('_id')
      .lean()
      .exec();
    importedIds.push(...users.map((user) => String(user._id)));
    Object.assign(created, Object.fromEntries(importedIds.map((id, i) => [`imported${i}`, id])));
  });

  it('created the imported students', () => {
    expect(importedIds).toHaveLength(3);
  });

  it('finds an imported student by roll number', async () => {
    expect(ids(await listStudents({ q: `IMP2-${SUFFIX}` }))).toHaveLength(1);
  });

  it('finds imported students by their batch', async () => {
    expect(ids(await listStudents({ batch: IMPORTED }))).toEqual(
      expect.arrayContaining(importedIds),
    );
  });

  it('applies the batch filter in the query, not to an already-fetched page', async () => {
    // The regression, reduced: a page size smaller than the cohort. Filtering
    // after the fetch searches only what the page happened to contain — and
    // these students sort last, so the old code returned nothing here.
    const narrow = await listUsers({
      role: 'STUDENT',
      batch: IMPORTED,
      page: 1,
      pageSize: 2,
    });

    expect(narrow.items.length).toBe(2);
    expect(narrow.total).toBe(3);
    expect(ids(narrow).every((id) => importedIds.includes(id))).toBe(true);
  });

  it('reports a total that counts every match, not just the page', async () => {
    const page = await listUsers({ role: 'STUDENT', batch: IMPORTED, page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
    expect(page.pageCount).toBe(3);
  });

  it('keeps the filter applied on later pages', async () => {
    const second = await listUsers({ role: 'STUDENT', batch: IMPORTED, page: 2, pageSize: 1 });
    expect(second.items).toHaveLength(1);
    expect(ids(second).every((id) => importedIds.includes(id))).toBe(true);
  });

  it('surfaces an imported batch in the filter options', async () => {
    const { batches } = await getFilterOptions();
    expect(batches.map((option) => option.value)).toContain(IMPORTED);
  });
});

describe('faculty and mentor directories search their own profiles', () => {
  it('finds faculty by department', async () => {
    const found = await listUsers({
      role: 'FACULTY',
      q: 'Finance',
      page: 1,
      pageSize: DIRECTORY_LIMIT,
    });
    expect(ids(found)).toContain(facultyTwoId);
    expect(ids(found)).not.toContain(facultyOneId);
  });

  it('finds mentors by company', async () => {
    const found = await listUsers({
      role: 'MENTOR',
      q: 'Northwind',
      page: 1,
      pageSize: DIRECTORY_LIMIT,
    });
    expect(ids(found)).toEqual([mentorId]);
  });

  it('does not leak a student profile match into the faculty directory', async () => {
    const found = await listUsers({
      role: 'FACULTY',
      q: `RA-${SUFFIX}`,
      page: 1,
      pageSize: DIRECTORY_LIMIT,
    });
    expect(found.items).toEqual([]);
  });
});

describe('venture filters run in the query', () => {
  const ventureIds = (rows: Array<{ _id: unknown }>) => rows.map((row) => String(row._id));

  it('filters by venture status', async () => {
    const onHold = ventureIds(await listVentures({ status: 'ON_HOLD' }));
    expect(onHold).toContain(ventureBetaId);
    expect(onHold).not.toContain(ventureAlphaId);
  });

  it('tells apart two faculty who share a display name', async () => {
    // The old filter compared the row's faculty *name*, so picking either of
    // these returned both ventures.
    expect(ventureIds(await listVentures({ facultyId: facultyOneId }))).toContain(ventureAlphaId);
    expect(ventureIds(await listVentures({ facultyId: facultyOneId }))).not.toContain(
      ventureBetaId,
    );
    expect(ventureIds(await listVentures({ facultyId: facultyTwoId }))).toContain(ventureBetaId);
  });

  it('searches the student behind the venture, not just its name', async () => {
    expect(ventureIds(await listVentures({ q: 'Zenobia' }))).toEqual([ventureAlphaId]);
  });

  it('searches venture name and industry', async () => {
    expect(ventureIds(await listVentures({ q: `Alpha Venture ${SUFFIX}` }))).toEqual([
      ventureAlphaId,
    ]);
    const agritech = ventureIds(await listVentures({ q: 'Agritech' }));
    expect(agritech).toContain(ventureAlphaId);
    expect(agritech).not.toContain(ventureBetaId);
  });

  it('combines status with a reviewer', async () => {
    expect(
      ventureIds(await listVentures({ status: 'ACTIVE', facultyId: facultyOneId })),
    ).toEqual([ventureAlphaId]);
    expect(await listVentures({ status: 'ON_HOLD', facultyId: facultyOneId })).toEqual([]);
  });

  it('filters by term through the venture’s current activity', async () => {
    const term = await models.Term.findOne({ termNumber: 1 }).select('_id').lean().exec();
    const otherTerm = await models.Term.findOne({ termNumber: 3 }).select('_id').lean().exec();
    if (!term || !otherTerm) throw new Error('Seed terms before running the filter specs.');

    // Bootstrapping points each venture at the first activity, which is term 1.
    const inTerm1 = ventureIds(await listVentures({ termId: term._id.toString() }));
    expect(inTerm1).toEqual(expect.arrayContaining([ventureAlphaId, ventureBetaId]));

    const inTerm3 = ventureIds(await listVentures({ termId: otherTerm._id.toString() }));
    expect(inTerm3).not.toContain(ventureAlphaId);
  });
});

describe('report filters share one scope', () => {
  it('applies batch to the student progress report', async () => {
    const rows = await getStudentProgressReport({ batch: '2026' });
    const names = rows.map((row) => row.studentName);
    expect(names).toContain('Zenobia Alpha');
    expect(names).not.toContain('Yusuf Beta');
  });

  it('applies the same batch to the activity completion report', async () => {
    // This report never joined the profile, so the batch chip used to be inert
    // here while changing the numbers on the card beside it.
    const scoped = await getActivityCompletionReport({ batch: '2026' });
    const everything = await getActivityCompletionReport();

    const scopedTotal = scoped.reduce((sum, row) => sum + row.total, 0);
    const fullTotal = everything.reduce((sum, row) => sum + row.total, 0);

    expect(scopedTotal).toBeGreaterThan(0);
    expect(scopedTotal).toBeLessThan(fullTotal);
  });

  it('intersects a student with a batch rather than overriding it', async () => {
    expect(await getStudentProgressReport({ studentId: created.alpha, batch: '2027' })).toEqual([]);
    expect(
      (await getStudentProgressReport({ studentId: created.alpha, batch: '2026' })).length,
    ).toBe(1);
  });

  it('reports zero rather than throwing for a batch nobody is in', async () => {
    expect(await getStudentProgressReport({ batch: 'no-such-batch' })).toEqual([]);

    // The activity report still lists the programme's activities — they exist
    // whether or not this batch has records against them — but every count
    // must be zero. Dropping the rows would misread "no records" as "no
    // activities configured", which is the empty state for a different problem.
    const rows = await getActivityCompletionReport({ batch: 'no-such-batch' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.total === 0 && row.completed === 0)).toBe(true);
  });
});
