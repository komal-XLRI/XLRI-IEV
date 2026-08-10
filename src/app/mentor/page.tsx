import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { ReviewerDashboard } from '@/components/reviewer/ReviewerDashboard';

export const metadata: Metadata = { title: 'Mentor review desk' };
export const dynamic = 'force-dynamic';

export default async function MentorDashboardPage() {
  const user = await requireRole('MENTOR');
  return (
    <ReviewerDashboard reviewer={{ userId: user.userId, role: 'MENTOR' }} basePath="/mentor" />
  );
}
