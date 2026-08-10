/**
 * Optional demo data on top of `npm run seed`: one student with a venture,
 * one faculty reviewer and one mentor, so all four dashboards have something
 * to show.
 *
 *   npm run seed:demo
 *
 * Idempotent — re-running reuses the existing accounts. Safe to skip entirely
 * in a real deployment.
 */
import { config as loadEnv } from 'dotenv';
import mongoose from 'mongoose';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const DEMO = {
  student: { name: 'Asha Ramanathan', email: 'student@example.com', rollNumber: 'IEV001' },
  faculty: { name: 'Dr Meera Iyer', email: 'faculty@example.com' },
  mentor: { name: 'Ravi Deshpande', email: 'mentor@example.com' },
  venture: {
    ventureName: 'Kirana Connect',
    ventureTitle: 'Wholesale ordering for neighbourhood grocers',
    industry: 'Retail technology',
    targetMarket: 'Independent kirana stores in tier-2 cities',
    problemStatement:
      'Small grocers spend half a day each week travelling to wholesale markets and still miss stock.',
    solution:
      'A WhatsApp-first ordering service that aggregates demand across nearby stores and delivers next morning.',
  },
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  await mongoose.connect(uri);

  const { User, StudentProfile, FacultyProfile, MentorProfile, StudentVenture, VentureActivity } =
    await import('../src/models');
  const { createUser } = await import('../src/services/users/userService');
  const { createStudentVenture, bootstrapActivityRecords } =
    await import('../src/services/ventures/studentVentureService');

  const activityCount = await VentureActivity.countDocuments({ status: 'ACTIVE' }).exec();
  if (activityCount === 0) {
    throw new Error('No venture activities found. Run `npm run seed` first.');
  }

  async function ensureUser(
    role: 'STUDENT' | 'FACULTY' | 'MENTOR',
    person: { name: string; email: string; rollNumber?: string },
  ): Promise<string> {
    const existing = await User.findOne({ email: person.email }).select('_id').lean().exec();
    if (existing) {
      console.log(`  = ${role.toLowerCase()} exists: ${person.email}`);
      return existing._id.toString();
    }

    const result =
      role === 'STUDENT'
        ? await createUser({
            role: 'STUDENT',
            name: person.name,
            email: person.email,
            status: 'ACTIVE',
            profile: {
              rollNumber: person.rollNumber!,
              batch: '2026',
              cluster: 'A',
              background: 'Family runs a wholesale grocery business.',
              strengths: 'Customer conversations, negotiation.',
              weakness: 'Financial modelling.',
            },
          })
        : role === 'FACULTY'
          ? await createUser({
              role: 'FACULTY',
              name: person.name,
              email: person.email,
              status: 'ACTIVE',
              profile: {
                designation: 'Associate Professor',
                department: 'Entrepreneurship',
                specialization: 'New venture creation',
              },
            })
          : await createUser({
              role: 'MENTOR',
              name: person.name,
              email: person.email,
              status: 'ACTIVE',
              profile: {
                company: 'Northbridge Ventures',
                designation: 'Operating Partner',
                industry: 'Retail & supply chain',
                expertise: 'Go-to-market, distribution',
              },
            });

    console.log(`  + ${role.toLowerCase()} created: ${person.email}`);
    return result.userId;
  }

  console.log('Demo accounts:');
  const studentId = await ensureUser('STUDENT', DEMO.student);
  const facultyId = await ensureUser('FACULTY', DEMO.faculty);
  const mentorId = await ensureUser('MENTOR', DEMO.mentor);

  const existingVenture = await StudentVenture.findOne({ studentId }).select('_id').lean().exec();

  if (existingVenture) {
    // Backfill in case activities were added since the venture was created.
    const result = await bootstrapActivityRecords(existingVenture._id.toString());
    console.log(
      `  = venture exists (${result.activitiesCreated} activity / ${result.supportsCreated} support records backfilled)`,
    );
  } else {
    const { studentVentureId } = await createStudentVenture({
      studentId,
      facultyId,
      mentorId,
      status: 'ACTIVE',
      ...DEMO.venture,
    });
    console.log(`  + venture created: ${DEMO.venture.ventureName} (${studentVentureId})`);
  }

  // Touch the profile models so the import is not tree-shaken before populate.
  void StudentProfile;
  void FacultyProfile;
  void MentorProfile;

  console.log('\nSign in with any of these (the OTP is printed to the dev server console):');
  console.log(`  admin    ${process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'}`);
  console.log(`  student  ${DEMO.student.email}`);
  console.log(`  faculty  ${DEMO.faculty.email}`);
  console.log(`  mentor   ${DEMO.mentor.email}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('\nDemo seed failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
