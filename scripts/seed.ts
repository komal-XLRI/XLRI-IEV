/**
 * Seeds the reference data the programme depends on:
 *   3 Terms · 12 Venture Activities · 8 Support Activities ·
 *   the default V→A mapping · the programme subject list · one admin account.
 *
 * Idempotent — every write is an upsert keyed on a natural identifier, so
 * re-running never duplicates and never clobbers edits made in Admin beyond
 * the seeded fields.
 *
 *   npm run seed
 */
import { config as loadEnv } from 'dotenv';
import mongoose from 'mongoose';

// Match Next.js precedence: .env.local wins, .env fills the gaps.
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

import {
  ActivitySupportMapping,
  StudentVenture,
  StudentVentureActivity,
  Subject,
  SupportActivity,
  Term,
  User,
  VentureActivity,
} from '../src/models';
import {
  ACTIVITY_SUPPORT_MAPPING_SEED,
  DEFAULT_MAX_ATTEMPTS,
  SUPPORT_ACTIVITY_SEED,
  VENTURE_ACTIVITY_SEED,
} from '../src/lib/constants/activities';
import { SUBJECT_SEED, TERM_SEED } from '../src/lib/constants/subjects';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Term windows default to four months each, starting from the next 1 July. */
function defaultTermWindow(termNumber: number): { startDate: Date; endDate: Date } {
  const year = new Date().getUTCFullYear();
  const programmeStart = Date.UTC(year, 6, 1); // 1 July
  const monthsIn = (termNumber - 1) * 4;

  const start = new Date(programmeStart);
  start.setUTCMonth(start.getUTCMonth() + monthsIn);

  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 4);
  end.setUTCDate(end.getUTCDate() - 1);

  return { startDate: start, endDate: end };
}

/**
 * Venture activity windows: 14 days each (mid-point of the 12–15 day
 * guideline) laid end to end inside the activity's term. These are starting
 * values — Admin is expected to set the real dates.
 */
function defaultActivityWindow(
  termStart: Date,
  indexWithinTerm: number,
): { startDate: Date; endDate: Date } {
  const lengthDays = 14;
  const gapDays = 2;

  const start = new Date(
    termStart.getTime() + indexWithinTerm * (lengthDays + gapDays) * MS_PER_DAY,
  );
  const end = new Date(start.getTime() + (lengthDays - 1) * MS_PER_DAY);

  return { startDate: start, endDate: end };
}

async function seedTerms() {
  const terms = new Map<number, mongoose.Types.ObjectId>();

  for (const seed of TERM_SEED) {
    const window = defaultTermWindow(seed.termNumber);

    const term = await Term.findOneAndUpdate(
      { termNumber: seed.termNumber },
      {
        $setOnInsert: {
          termNumber: seed.termNumber,
          name: seed.name,
          startDate: window.startDate,
          endDate: window.endDate,
          status: seed.termNumber === 1 ? 'ACTIVE' : 'UPCOMING',
        },
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).exec();

    terms.set(seed.termNumber, term!._id);
  }

  console.log(`✓ Terms: ${terms.size}`);
  return terms;
}

async function seedSupportActivities() {
  const codes = new Map<string, mongoose.Types.ObjectId>();

  for (const seed of SUPPORT_ACTIVITY_SEED) {
    const activity = await SupportActivity.findOneAndUpdate(
      { activityCode: seed.activityCode },
      {
        $set: { name: seed.name, order: seed.order, scheduleType: seed.scheduleType },
        $setOnInsert: { description: seed.description },
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).exec();

    codes.set(seed.activityCode, activity!._id);
  }

  console.log(`✓ Support activities: ${codes.size}`);
  return codes;
}

async function seedVentureActivities(terms: Map<number, mongoose.Types.ObjectId>) {
  const codes = new Map<string, mongoose.Types.ObjectId>();
  const perTermIndex = new Map<number, number>();

  for (const seed of VENTURE_ACTIVITY_SEED) {
    const termId = terms.get(seed.termNumber);
    if (!termId) throw new Error(`Term ${seed.termNumber} was not seeded`);

    const term = await Term.findById(termId).lean().exec();
    const indexWithinTerm = perTermIndex.get(seed.termNumber) ?? 0;
    perTermIndex.set(seed.termNumber, indexWithinTerm + 1);

    const window = defaultActivityWindow(term!.startDate, indexWithinTerm);

    // Only insert defaults — never overwrite dates or attempt limits an
    // administrator has already tuned.
    const existing = await VentureActivity.findOne({ activityCode: seed.activityCode }).exec();

    if (existing) {
      existing.name = seed.name;
      existing.order = seed.order;
      existing.termId = termId;
      if (!existing.description) existing.description = seed.description;
      await existing.save();
      codes.set(seed.activityCode, existing._id);
      continue;
    }

    const created = await VentureActivity.create({
      activityCode: seed.activityCode,
      name: seed.name,
      description: seed.description,
      termId,
      order: seed.order,
      startDate: window.startDate,
      endDate: window.endDate,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      evidenceRequired: true,
      status: 'ACTIVE',
    });

    codes.set(seed.activityCode, created._id);
  }

  console.log(`✓ Venture activities: ${codes.size}`);
  return codes;
}

async function seedSupportMappings(
  ventureCodes: Map<string, mongoose.Types.ObjectId>,
  supportCodes: Map<string, mongoose.Types.ObjectId>,
) {
  let created = 0;

  for (const [ventureCode, supportList] of Object.entries(ACTIVITY_SUPPORT_MAPPING_SEED)) {
    const ventureActivityId = ventureCodes.get(ventureCode);
    if (!ventureActivityId) continue;

    for (const supportCode of supportList) {
      const supportActivityId = supportCodes.get(supportCode);
      if (!supportActivityId) continue;

      const result = await ActivitySupportMapping.updateOne(
        { ventureActivityId, supportActivityId },
        { $setOnInsert: { ventureActivityId, supportActivityId } },
        { upsert: true },
      ).exec();

      if (result.upsertedCount > 0) created += 1;
    }
  }

  const total = await ActivitySupportMapping.countDocuments().exec();
  console.log(`✓ Support mappings: ${total} total (${created} new)`);
}

async function seedSubjects(terms: Map<number, mongoose.Types.ObjectId>) {
  let count = 0;

  for (const seed of SUBJECT_SEED) {
    const termId = terms.get(seed.termNumber);
    if (!termId) continue;

    await Subject.findOneAndUpdate(
      { code: seed.code },
      {
        $set: { termId },
        $setOnInsert: {
          code: seed.code,
          name: seed.name,
          credits: seed.credits,
          area: seed.area,
          status: 'ACTIVE',
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).exec();

    count += 1;
  }

  console.log(`✓ Subjects: ${count}`);
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? 'IEV Administrator';

  const existing = await User.findOne({ email }).select('_id role').lean().exec();

  if (existing) {
    console.log(`✓ Admin already exists: ${email}`);
    return;
  }

  await User.create({ name, email, role: 'ADMIN', status: 'ACTIVE' });
  console.log(`✓ Admin created: ${email} (sign in with an emailed OTP)`);
}

/**
 * Backfills progress rows for ventures created before a new Venture or
 * Support Activity was added.
 */
async function backfillActivityRecords() {
  const ventures = await StudentVenture.find().select('_id facultyId mentorId').lean().exec();
  if (ventures.length === 0) return;

  const activities = await VentureActivity.find({ status: 'ACTIVE' }).select('_id').lean().exec();
  let created = 0;

  for (const venture of ventures) {
    const existing = await StudentVentureActivity.find({ studentVentureId: venture._id })
      .select('ventureActivityId')
      .lean()
      .exec();
    const have = new Set(existing.map((r) => r.ventureActivityId.toString()));

    const missing = activities
      .filter((a) => !have.has(a._id.toString()))
      .map((a) => ({
        studentVentureId: venture._id,
        ventureActivityId: a._id,
        facultyId: venture.facultyId ?? null,
        mentorId: venture.mentorId ?? null,
        attemptNumber: 0,
        status: 'NOT_STARTED' as const,
        facultyReviewStatus: 'PENDING' as const,
        mentorReviewStatus: 'PENDING' as const,
      }));

    if (missing.length > 0) {
      await StudentVentureActivity.insertMany(missing);
      created += missing.length;
    }
  }

  if (created > 0) console.log(`✓ Backfilled ${created} student activity record(s)`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.');
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri);

  const terms = await seedTerms();
  const supportCodes = await seedSupportActivities();
  const ventureCodes = await seedVentureActivities(terms);
  await seedSupportMappings(ventureCodes, supportCodes);
  await seedSubjects(terms);
  await seedAdmin();
  await backfillActivityRecords();

  await mongoose.disconnect();
  console.log('\nSeed complete.');
}

main().catch(async (error) => {
  console.error('\nSeed failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
