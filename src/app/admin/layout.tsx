import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppShell, type NavItem } from '@/components/layout/AppShell';
import { getHeaderAlerts } from '@/services/dashboard/dashboardService';
import { ROLE_HOME } from '@/lib/constants/roles';

export const dynamic = 'force-dynamic';

/**
 * Grouped so the rail reads as the shape of the programme rather than as a flat
 * list of thirteen links: who is in it, what they build, what they study, and
 * how it is assessed.
 */
const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard', exact: true },

  { href: '/admin/students', label: 'Students', icon: 'students', group: 'People' },
  { href: '/admin/faculty', label: 'Faculty', icon: 'faculty', group: 'People' },
  { href: '/admin/mentors', label: 'Mentors', icon: 'mentors', group: 'People' },

  { href: '/admin/ventures', label: 'Ventures', icon: 'ventures', group: 'Venture management' },
  {
    href: '/admin/venture-activities',
    label: 'Venture Activities',
    icon: 'ventureActivities',
    group: 'Venture management',
  },
  {
    href: '/admin/support-activities',
    label: 'Support Activities',
    icon: 'supportActivities',
    group: 'Venture management',
  },
  {
    href: '/admin/attendance',
    label: 'Attendance',
    icon: 'attendance',
    group: 'Venture management',
  },

  { href: '/admin/academic', label: 'Terms', icon: 'academic', exact: true, group: 'Academic' },
  { href: '/admin/academic/subjects', label: 'Subjects', icon: 'subjects', group: 'Academic' },
  { href: '/admin/academic/sessions', label: 'Classes', icon: 'sessions', group: 'Academic' },
  { href: '/admin/academic/workshops', label: 'Workshops', icon: 'workshops', group: 'Academic' },
  {
    href: '/admin/academic/recordings',
    label: 'Recordings',
    icon: 'recordings',
    group: 'Academic',
  },

  { href: '/admin/reviews', label: 'Reviews', icon: 'reviews', group: 'Reviews & reporting' },
  { href: '/admin/reports', label: 'Reports', icon: 'reports', group: 'Reviews & reporting' },
];

/**
 * Server-side role gate. The middleware redirect is a convenience; this is the
 * boundary that actually keeps non-admins out, because it re-reads the role
 * from the database on every request.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'ADMIN') redirect(ROLE_HOME[user.role]);

  const alerts = await getHeaderAlerts({ userId: user.userId, role: user.role });

  return (
    <AppShell role="ADMIN" userName={user.name} nav={NAV} alerts={alerts}>
      {children}
    </AppShell>
  );
}
