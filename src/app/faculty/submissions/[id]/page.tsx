import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { SubmissionReviewScreen } from '@/components/reviewer/SubmissionReviewScreen';

export const metadata: Metadata = { title: 'Faculty review' };
export const dynamic = 'force-dynamic';

export default async function FacultyReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('FACULTY');

  return (
    <SubmissionReviewScreen
      submissionId={id}
      reviewer={{ userId: user.userId, role: 'FACULTY' }}
      basePath="/faculty"
    />
  );
}
