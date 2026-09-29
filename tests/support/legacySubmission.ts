/**
 * Writes a submission the way the retired in-app submission flow did.
 *
 * Students no longer submit work through the application, but records written
 * by that flow still exist and can still be reviewed. The review rules are
 * tested against records in exactly that shape, so this reproduces the write
 * directly rather than keeping the student-facing service alive for tests.
 */
export async function writeLegacySubmission(
  studentVentureActivityId: string,
  submittedBy: string,
  content: string,
  title?: string,
): Promise<{ submissionId: string; attemptNumber: number }> {
  const { StudentVenture, StudentVentureActivity, VentureSubmission } = await import('@/models');

  const record = await StudentVentureActivity.findById(studentVentureActivityId).lean().exec();
  if (!record) throw new Error('Activity record not found');

  const venture = await StudentVenture.findById(record.studentVentureId).lean().exec();
  if (!venture) throw new Error('Venture not found');

  const attemptNumber = record.attemptNumber + 1;

  const submission = await VentureSubmission.create({
    studentVentureActivityId,
    submittedBy,
    attemptNumber,
    submissionType: attemptNumber === 1 ? 'INITIAL' : 'REVISION',
    title,
    content,
    submittedAt: new Date(),
  });

  await StudentVentureActivity.updateOne(
    { _id: studentVentureActivityId },
    {
      $set: {
        attemptNumber,
        status: 'UNDER_REVIEW',
        facultyReviewStatus: 'PENDING',
        mentorReviewStatus: 'PENDING',
        reviewFacultyId: venture.facultyId ?? null,
        reviewMentorId: venture.mentorId ?? null,
        facultyId: venture.facultyId ?? null,
        mentorId: venture.mentorId ?? null,
        currentSubmissionId: submission._id,
        startedAt: record.startedAt ?? new Date(),
        completedAt: null,
      },
    },
  ).exec();

  return { submissionId: submission._id.toString(), attemptNumber };
}
