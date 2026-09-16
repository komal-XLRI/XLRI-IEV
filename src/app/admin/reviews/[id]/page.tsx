import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { SubmissionReviewScreen } from '@/components/reviewer/SubmissionReviewScreen';

export const metadata: Metadata = { title: 'Review' };
export const dynamic = 'force-dynamic';

/**
 * The same review screen faculty and mentors work from.
 *
 * An administrator gets the whole submission — the work, the evidence, every
 * earlier verdict — rather than a decision box in a dialog, because a verdict
 * filed without reading the attempt is the one nobody can defend later.
 */
export default async function AdminReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole('ADMIN');

  return (
    <SubmissionReviewScreen
      submissionId={id}
      reviewer={{ userId: user.userId, role: 'ADMIN' }}
      basePath="/admin/reviews"
    />
  );
}
