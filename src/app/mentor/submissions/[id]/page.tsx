import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { SubmissionReviewScreen } from '@/components/reviewer/SubmissionReviewScreen';

export const metadata: Metadata = { title: 'Mentor review' };
export const dynamic = 'force-dynamic';

export default async function MentorReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('MENTOR');

  return (
    <SubmissionReviewScreen
      submissionId={id}
      reviewer={{ userId: user.userId, role: 'MENTOR' }}
      basePath="/mentor"
    />
  );
}
