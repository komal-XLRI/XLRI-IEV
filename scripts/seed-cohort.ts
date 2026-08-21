/**
 * A demo cohort large and varied enough to actually exercise the screens.
 *
 *   npm run seed:cohort
 *
 * `seed:demo` creates one student so every dashboard has something on it. This
 * creates a cohort with the variation the *controls* need: two batches and a
 * deactivated account for the directory filters, ventures with and without
 * reviewers for the ventures screen, activities in every review state for the
 * reviews queue and the admin dashboard, attendance in all three states for the
 * roster, and workshops across every mode and status.
 *
 * Everything is written through the same services the UI calls, so a seeded
 * record is indistinguishable from one typed in by hand — no second, weaker
 * write path that can drift from the rules.
 *
 * Idempotent: re-running reuses accounts, ventures and workshops it already
 * created. Every account it makes is on @demo.iev.test, so the whole cohort can
 * be removed in one query:
 *
 *   db.users.find({ email: /@demo\.iev\.test$/ })
 */
import { config as loadEnv } from 'dotenv';
import mongoose from 'mongoose';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const DOMAIN = 'demo.iev.test';
const email = (handle: string) => `${handle}@${DOMAIN}`;

/**
 * The cohort.
 *
 * `state` drives how far each venture is taken, so the fixture reads as a list
 * of situations to test rather than as a pile of records.
 */
const STUDENTS = [
  { handle: 'asha', name: 'Asha Ramanathan', roll: 'IEV101', batch: '2026', cluster: 'A' },
  { handle: 'bhavin', name: 'Bhavin Shah', roll: 'IEV102', batch: '2026', cluster: 'A' },
  { handle: 'chitra', name: 'Chitra Nair', roll: 'IEV103', batch: '2026', cluster: 'B' },
  { handle: 'devan', name: 'Devan Kulkarni', roll: 'IEV104', batch: '2026', cluster: 'B' },
  { handle: 'esha', name: 'Esha Bhatt', roll: 'IEV105', batch: '2026', cluster: 'C' },
  { handle: 'farhan', name: 'Farhan Qureshi', roll: 'IEV106', batch: '2027', cluster: 'A' },
  { handle: 'gita', name: 'Gita Menon', roll: 'IEV107', batch: '2027', cluster: 'B' },
  { handle: 'harsh', name: 'Harsh Vardhan', roll: 'IEV108', batch: '2027', cluster: 'B' },
  { handle: 'ira', name: 'Ira Sengupta', roll: 'IEV109', batch: '2027', cluster: 'C' },
  // Deactivated, so the Status filter has something to find.
  {
    handle: 'jatin',
    name: 'Jatin Rao',
    roll: 'IEV110',
    batch: '2026',
    cluster: 'A',
    inactive: true,
  },
  // No venture, so "students without a venture" is not an empty list.
  { handle: 'kavya', name: 'Kavya Iyer', roll: 'IEV111', batch: '2027', cluster: 'C' },
  { handle: 'lakshmi', name: 'Lakshmi Pillai', roll: 'IEV112', batch: '2026', cluster: 'B' },
] as const;

const FACULTY = [
  {
    handle: 'meera',
    name: 'Dr Meera Iyer',
    designation: 'Associate Professor',
    department: 'Entrepreneurship',
    specialization: 'New venture creation',
  },
  {
    handle: 'sanjay',
    name: 'Dr Sanjay Bose',
    designation: 'Professor',
    department: 'Strategy',
    specialization: 'Business models',
  },
  {
    handle: 'nandini',
    name: 'Dr Nandini Rao',
    designation: 'Assistant Professor',
    department: 'Finance',
    specialization: 'Venture finance',
  },
] as const;

const MENTORS = [
  {
    handle: 'ravi',
    name: 'Ravi Deshpande',
    company: 'Northbridge Ventures',
    designation: 'Operating Partner',
    industry: 'Retail & supply chain',
    expertise: 'Go-to-market, distribution',
  },
  {
    handle: 'priya',
    name: 'Priya Venkatesh',
    company: 'Kettle & Co',
    designation: 'Founder',
    industry: 'Consumer goods',
    expertise: 'Brand, early revenue',
  },
  {
    handle: 'imran',
    name: 'Imran Sheikh',
    company: 'Gridline Logistics',
    designation: 'VP Operations',
    industry: 'Logistics',
    expertise: 'Operations, unit economics',
  },
] as const;

type VentureState = 'FRESH' | 'SUBMITTED' | 'HALF_REVIEWED' | 'COMPLETED' | 'REVISION' | 'NO_PAIR';

const VENTURES: Array<{
  student: (typeof STUDENTS)[number]['handle'];
  name: string;
  title: string;
  industry: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
  faculty?: (typeof FACULTY)[number]['handle'];
  mentor?: (typeof MENTORS)[number]['handle'];
  state: VentureState;
}> = [
  {
    student: 'asha',
    name: 'Kirana Connect',
    title: 'Wholesale ordering for neighbourhood grocers',
    industry: 'Retail technology',
    status: 'ACTIVE',
    faculty: 'meera',
    mentor: 'ravi',
    state: 'COMPLETED',
  },
  {
    student: 'bhavin',
    name: 'RouteWise',
    title: 'Last-mile routing for small fleets',
    industry: 'Logistics',
    status: 'ACTIVE',
    faculty: 'meera',
    mentor: 'imran',
    state: 'HALF_REVIEWED',
  },
  {
    student: 'chitra',
    name: 'Sootra Textiles',
    title: 'Handloom co-operative marketplace',
    industry: 'Textiles',
    status: 'ACTIVE',
    faculty: 'sanjay',
    mentor: 'priya',
    state: 'SUBMITTED',
  },
  {
    student: 'devan',
    name: 'FarmLedger',
    title: 'Crop input credit tracking',
    industry: 'Agritech',
    status: 'ACTIVE',
    faculty: 'sanjay',
    mentor: 'ravi',
    state: 'REVISION',
  },
  {
    student: 'esha',
    name: 'CareCircle',
    title: 'Home care staffing for elders',
    industry: 'Healthcare',
    status: 'ON_HOLD',
    faculty: 'nandini',
    mentor: 'priya',
    state: 'FRESH',
  },
  {
    student: 'farhan',
    name: 'StudySprint',
    title: 'Exam prep for vernacular learners',
    industry: 'Education',
    status: 'ACTIVE',
    faculty: 'nandini',
    mentor: 'imran',
    state: 'SUBMITTED',
  },
  {
    student: 'gita',
    name: 'ReSpin',
    title: 'Textile waste recycling',
    industry: 'Sustainability',
    status: 'ACTIVE',
    faculty: 'meera',
    mentor: 'priya',
    state: 'FRESH',
  },
  {
    student: 'harsh',
    name: 'MetroMeals',
    title: 'Subscription tiffin for commuters',
    industry: 'Food & beverage',
    status: 'COMPLETED',
    faculty: 'sanjay',
    mentor: 'ravi',
    state: 'COMPLETED',
  },
  // Deliberately unpaired, so the "awaiting a reviewer" warning is non-zero.
  {
    student: 'ira',
    name: 'Tinker Labs',
    title: 'After-school robotics kits',
    industry: 'Education',
    status: 'ACTIVE',
    faculty: 'nandini',
    state: 'NO_PAIR',
  },
  {
    student: 'lakshmi',
    name: 'Bluewater',
    title: 'Rainwater harvesting retrofits',
    industry: 'Cleantech',
    status: 'ACTIVE',
    state: 'NO_PAIR',
  },
];

const WORKSHOPS = [
  {
    title: 'Telling your venture story',
    description: 'Structuring a pitch that survives the first ninety seconds.',
    workshopType: 'MASTERCLASS' as const,
    daysFromNow: 7,
    startTime: '10:00',
    endTime: '12:30',
    mode: 'OFFLINE' as const,
    venue: 'XLRI Jamshedpur, Auditorium 2',
    hostName: 'Dr Meera Iyer',
    hostDesignation: 'Associate Professor',
    hostOrganisation: 'XLRI Jamshedpur',
    hostLinkedIn: 'https://www.linkedin.com/in/meera-iyer-demo',
    speakerName: 'Ravi Deshpande',
    speakerDesignation: 'Operating Partner',
    speakerOrganisation: 'Northbridge Ventures',
    speakerLinkedIn: 'https://www.linkedin.com/in/ravi-deshpande-demo',
    maxParticipants: 60,
    status: 'PUBLISHED' as const,
  },
  {
    title: 'Unit economics clinic',
    description: 'Bring your numbers. We rebuild them line by line.',
    workshopType: 'PARTNER_SESSION' as const,
    daysFromNow: 14,
    startTime: '15:00',
    endTime: '17:00',
    mode: 'ONLINE' as const,
    meetingLink: 'https://teams.microsoft.com/l/meetup-join/demo-unit-economics',
    hostName: 'Dr Nandini Rao',
    hostDesignation: 'Assistant Professor',
    hostOrganisation: 'XLRI Jamshedpur',
    speakerName: 'Imran Sheikh',
    speakerDesignation: 'VP Operations',
    speakerOrganisation: 'Gridline Logistics',
    speakerLinkedIn: 'https://www.linkedin.com/in/imran-sheikh-demo',
    registrationLink: 'https://forms.office.com/r/demo-unit-economics',
    maxParticipants: 100,
    status: 'PUBLISHED' as const,
  },
  {
    title: 'Fundraising without a deck',
    description: 'What early investors actually ask, and how to answer it.',
    workshopType: 'FOUNDER_TALK' as const,
    daysFromNow: 21,
    startTime: '11:00',
    endTime: '13:00',
    mode: 'HYBRID' as const,
    venue: 'XLRI Jamshedpur, Seminar Hall 1',
    meetingLink: 'https://meet.google.com/demo-fundraising',
    hostName: 'Dr Sanjay Bose',
    hostDesignation: 'Professor',
    hostOrganisation: 'XLRI Jamshedpur',
    speakerName: 'Priya Venkatesh',
    speakerDesignation: 'Founder',
    speakerOrganisation: 'Kettle & Co',
    speakerLinkedIn: 'https://www.linkedin.com/in/priya-venkatesh-demo',
    maxParticipants: 45,
    status: 'DRAFT' as const,
  },
  {
    title: 'Customer discovery in the field',
    description: 'Running twenty interviews in a week without leading the witness.',
    workshopType: 'INDUSTRIAL_VISIT' as const,
    daysFromNow: -21,
    startTime: '09:30',
    endTime: '16:30',
    mode: 'OFFLINE' as const,
    venue: 'Sakchi Market, Jamshedpur',
    hostName: 'Dr Meera Iyer',
    hostOrganisation: 'XLRI Jamshedpur',
    speakerName: 'Priya Venkatesh',
    speakerOrganisation: 'Kettle & Co',
    status: 'COMPLETED' as const,
  },
  {
    title: 'Intellectual property basics',
    workshopType: 'ENTREPRENEUR_SESSION' as const,
    daysFromNow: -7,
    startTime: '14:00',
    endTime: '15:30',
    mode: 'ONLINE' as const,
    meetingLink: 'https://teams.microsoft.com/l/meetup-join/demo-ip',
    hostName: 'Dr Nandini Rao',
    hostOrganisation: 'XLRI Jamshedpur',
    speakerName: 'Anita Krishnan',
    speakerDesignation: 'Partner',
    speakerOrganisation: 'Krishnan & Co',
    status: 'CANCELLED' as const,
  },
];

/**
 * Attendance to record on the first two activities, by student handle.
 *
 * `SKIP` means no row at all — "not marked" is the absence of a record, so a
 * seeded student can be left genuinely unmarked rather than given a status
 * that means nobody has decided yet.
 */
const ATTENDANCE: Record<string, 'PRESENT' | 'ABSENT' | 'SKIP'> = {
  asha: 'PRESENT',
  bhavin: 'PRESENT',
  chitra: 'PRESENT',
  devan: 'ABSENT',
  esha: 'PRESENT',
  farhan: 'ABSENT',
  gita: 'PRESENT',
  harsh: 'PRESENT',
  ira: 'SKIP',
  lakshmi: 'SKIP',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  await mongoose.connect(uri);

  const models = await import('../src/models');
  const { createUser } = await import('../src/services/users/userService');
  const { createStudentVenture, bootstrapActivityRecords, getVentureProgress, assignReviewers } =
    await import('../src/services/ventures/studentVentureService');
  const { createSubmission } = await import('../src/services/submissions/submissionService');
  const { createReview } = await import('../src/services/reviews/reviewService');
  const { saveAttendance } = await import('../src/services/ventures/attendanceService');
  const { createWorkshop } = await import('../src/services/workshops/workshopService');

  if ((await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec()) < 2) {
    throw new Error('No venture activities found. Run `npm run seed` first.');
  }

  const idByHandle = new Map<string, string>();

  // ---------------------------------------------------------- accounts ----

  console.log('Accounts');

  for (const person of STUDENTS) {
    const address = email(person.handle);
    const existing = await models.User.findOne({ email: address }).select('_id').lean().exec();

    if (existing) {
      idByHandle.set(person.handle, existing._id.toString());
      continue;
    }

    const { userId } = await createUser({
      role: 'STUDENT',
      name: person.name,
      email: address,
      status: 'ACTIVE',
      profile: { rollNumber: person.roll, batch: person.batch, cluster: person.cluster },
    });

    // Deactivated after creation: a student cannot be given a venture while
    // inactive, and this one is here to give the Status filter a target.
    if ('inactive' in person && person.inactive) {
      await models.User.updateOne({ _id: userId }, { $set: { status: 'INACTIVE' } }).exec();
    }

    idByHandle.set(person.handle, userId);
  }

  for (const person of FACULTY) {
    const address = email(person.handle);
    const existing = await models.User.findOne({ email: address }).select('_id').lean().exec();

    if (existing) {
      idByHandle.set(person.handle, existing._id.toString());
      continue;
    }

    const { userId } = await createUser({
      role: 'FACULTY',
      name: person.name,
      email: address,
      status: 'ACTIVE',
      profile: {
        designation: person.designation,
        department: person.department,
        specialization: person.specialization,
      },
    });
    idByHandle.set(person.handle, userId);
  }

  for (const person of MENTORS) {
    const address = email(person.handle);
    const existing = await models.User.findOne({ email: address }).select('_id').lean().exec();

    if (existing) {
      idByHandle.set(person.handle, existing._id.toString());
      continue;
    }

    const { userId } = await createUser({
      role: 'MENTOR',
      name: person.name,
      email: address,
      status: 'ACTIVE',
      profile: {
        company: person.company,
        designation: person.designation,
        industry: person.industry,
        expertise: person.expertise,
      },
    });
    idByHandle.set(person.handle, userId);
  }

  console.log(
    `  ${STUDENTS.length} students · ${FACULTY.length} faculty · ${MENTORS.length} mentors`,
  );

  // ---------------------------------------------------------- ventures ----

  console.log('Ventures');

  const ventureIdByStudent = new Map<string, string>();

  for (const spec of VENTURES) {
    const studentId = idByHandle.get(spec.student)!;
    const facultyId = spec.faculty ? idByHandle.get(spec.faculty) : undefined;
    const mentorId = spec.mentor ? idByHandle.get(spec.mentor) : undefined;

    const existing = await models.StudentVenture.findOne({ studentId }).select('_id').lean().exec();

    if (existing) {
      ventureIdByStudent.set(spec.student, existing._id.toString());
      // Backfill in case activities were added since the venture was created.
      await bootstrapActivityRecords(existing._id.toString());
      continue;
    }

    const { studentVentureId } = await createStudentVenture({
      studentId,
      ventureName: spec.name,
      ventureTitle: spec.title,
      industry: spec.industry,
      status: spec.status,
      ...(facultyId ? { facultyId } : {}),
      ...(mentorId ? { mentorId } : {}),
    });

    // `createStudentVenture` does not take a status of ON_HOLD/COMPLETED at
    // creation in every path, so it is set explicitly afterwards.
    if (spec.status !== 'ACTIVE') {
      await models.StudentVenture.updateOne(
        { _id: studentVentureId },
        { $set: { status: spec.status } },
      ).exec();
    }

    if (facultyId || mentorId) {
      await assignReviewers(studentVentureId, {
        facultyId: facultyId ?? null,
        mentorId: mentorId ?? null,
      });
    }

    ventureIdByStudent.set(spec.student, studentVentureId);
  }

  console.log(`  ${ventureIdByStudent.size} ventures`);

  // ------------------------------------------------ submissions & reviews ----

  console.log('Activity progress');

  /** Evidence has to exist before an attempt: the server refuses one without. */
  async function stageEvidence(recordId: string, uploaderId: string) {
    const already = await models.Evidence.countDocuments({
      studentVentureActivityId: recordId,
    }).exec();
    if (already > 0) return;

    await models.Evidence.create({
      submissionId: null,
      studentVentureActivityId: recordId,
      fileName: 'market-research.pdf',
      fileUrl: 'https://res.cloudinary.com/demo/raw/upload/iev-demo/market-research.pdf',
      publicId: `iev-tracker/evidence/${recordId}/demo`,
      fileType: 'application/pdf',
      resourceType: 'raw',
      fileSize: 248_000,
      uploadedBy: uploaderId,
      uploadedAt: new Date(),
    });
  }

  let submitted = 0;
  let reviewed = 0;

  for (const spec of VENTURES) {
    if (spec.state === 'FRESH' || spec.state === 'NO_PAIR') continue;

    const ventureId = ventureIdByStudent.get(spec.student);
    if (!ventureId) continue;

    const studentId = idByHandle.get(spec.student)!;
    const progress = await getVentureProgress(ventureId);
    const first = progress[0];
    if (!first || first.record.attemptNumber > 0) continue;

    await stageEvidence(first.recordId, studentId);

    const submission = await createSubmission(
      {
        studentVentureActivityId: first.recordId,
        title: `${spec.name} — problem validation`,
        content:
          'Interviewed 22 prospective customers across three neighbourhoods. Notes and the ' +
          'interview guide are attached as evidence.',
      },
      studentId,
    );
    submitted += 1;

    const submissionId = submission.submissionId;
    const facultyId = spec.faculty ? idByHandle.get(spec.faculty)! : null;
    const mentorId = spec.mentor ? idByHandle.get(spec.mentor)! : null;

    // SUBMITTED stops here — those are the rows sitting in the review queue
    // with both verdicts outstanding.
    if (spec.state === 'SUBMITTED') continue;

    if (spec.state === 'REVISION' && facultyId) {
      await createReview(
        {
          submissionId,
          status: 'REVISION_REQUIRED',
          comments: 'Good interview coverage. Separate the problem from the proposed solution.',
        },
        { userId: facultyId, role: 'FACULTY' },
      );
      reviewed += 1;
      continue;
    }

    if (facultyId) {
      await createReview(
        { submissionId, status: 'APPROVED', comments: 'Clear evidence of a real problem.' },
        { userId: facultyId, role: 'FACULTY' },
      );
      reviewed += 1;
    }

    // HALF_REVIEWED leaves the mentor verdict outstanding, which is the state
    // the dual-review rule exists for.
    if (spec.state === 'COMPLETED' && mentorId) {
      await createReview(
        { submissionId, status: 'APPROVED', comments: 'Agreed — the demand signal is credible.' },
        { userId: mentorId, role: 'MENTOR' },
      );
      reviewed += 1;
    }
  }

  console.log(`  ${submitted} submissions · ${reviewed} reviews`);

  // -------------------------------------------------------- attendance ----

  console.log('Attendance');

  const activities = await models.VentureActivity.find({ status: 'ACTIVE' })
    .select('_id startDate')
    .sort({ order: 1 })
    .limit(2)
    .lean()
    .exec();

  let marked = 0;

  // Registers need somebody accountable for them, so the seed marks as the
  // administrator rather than inventing an anonymous author.
  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!admin) throw new Error('No admin account found. Run `npm run seed` first.');

  for (const activity of activities) {
    const entries: Array<{
      studentVentureId: string;
      status: 'PRESENT' | 'ABSENT';
      remarks?: string;
    }> = [];

    for (const [handle, status] of Object.entries(ATTENDANCE)) {
      if (status === 'SKIP') continue;

      const ventureId = ventureIdByStudent.get(handle);
      if (ventureId) {
        entries.push({
          studentVentureId: ventureId,
          status,
          remarks: status === 'ABSENT' ? 'Informed the programme office in advance' : undefined,
        });
      }
    }

    if (entries.length > 0) {
      // Two dates per activity, so the register exercises the thing the old
      // single-field design could not represent at all.
      for (const offset of [0, 3]) {
        const date = new Date(activity.startDate);
        date.setUTCDate(date.getUTCDate() + offset);

        const result = await saveAttendance({
          ventureActivityId: activity._id.toString(),
          date,
          entries,
          markedBy: admin._id.toString(),
        });
        marked += result.marked;
      }
    }
  }

  console.log(`  ${marked} attendance record(s) across ${activities.length} activities`);

  // --------------------------------------------------------- workshops ----

  console.log('Workshops');

  const today = new Date();
  let workshopsCreated = 0;

  for (const spec of WORKSHOPS) {
    const existing = await models.Workshop.findOne({ title: spec.title })
      .select('_id workshopType')
      .lean()
      .exec();

    if (existing) {
      // Backfill only — a record seeded before `workshopType` existed gets its
      // type, but one an administrator has since retyped is left alone.
      if (!existing.workshopType) {
        await models.Workshop.updateOne(
          { _id: existing._id },
          { $set: { workshopType: spec.workshopType } },
        ).exec();
      }
      continue;
    }

    const date = new Date(today);
    date.setDate(date.getDate() + spec.daysFromNow);

    const { daysFromNow: _daysFromNow, ...rest } = spec;
    await createWorkshop({ ...rest, date });
    workshopsCreated += 1;
  }

  console.log(`  ${workshopsCreated} created (${WORKSHOPS.length} defined)`);

  // ------------------------------------------------------------ sign in ----

  console.log('\nSign in with any of these — the OTP is printed to the dev server console');
  console.log('when EMAIL_PROVIDER=console, otherwise it is emailed:\n');
  console.log(`  admin    ${process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'}`);
  console.log(`  student  ${email('asha')}      (venture complete on activity 1)`);
  console.log(`  student  ${email('devan')}     (revision requested)`);
  console.log(`  faculty  ${email('meera')}     (two ventures, one verdict outstanding)`);
  console.log(`  mentor   ${email('ravi')}      (three ventures)`);
  console.log(`\nEvery demo account is on @${DOMAIN}.`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('\nCohort seed failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
