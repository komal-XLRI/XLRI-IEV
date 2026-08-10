import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { AssignedVentures } from '@/components/reviewer/AssignedVentures';

export const metadata: Metadata = { title: 'My ventures' };
export const dynamic = 'force-dynamic';

export default async function MentorVenturesPage() {
  const user = await requireRole('MENTOR');
  return <AssignedVentures reviewer={{ userId: user.userId, role: 'MENTOR' }} basePath="/mentor" />;
}
