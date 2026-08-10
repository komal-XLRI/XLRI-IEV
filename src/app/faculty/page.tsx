import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { ReviewerDashboard } from '@/components/reviewer/ReviewerDashboard';

export const metadata: Metadata = { title: 'Faculty review desk' };
export const dynamic = 'force-dynamic';

export default async function FacultyDashboardPage() {
  const user = await requireRole('FACULTY');
  return (
    <ReviewerDashboard reviewer={{ userId: user.userId, role: 'FACULTY' }} basePath="/faculty" />
  );
}
