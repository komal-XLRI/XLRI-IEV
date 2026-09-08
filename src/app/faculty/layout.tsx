import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppShell, type NavItem } from '@/components/layout/AppShell';
import { getHeaderAlerts } from '@/services/dashboard/dashboardService';
import { ROLE_HOME } from '@/lib/constants/roles';

export const dynamic = 'force-dynamic';

const NAV: NavItem[] = [
  { href: '/faculty', label: 'Review desk', icon: 'reviews', exact: true },
  {
    href: '/faculty/ventures',
    label: 'My ventures',
    icon: 'ventures',
    group: 'Venture supervision',
  },
  { href: '/faculty/subjects', label: 'My subjects', icon: 'subjects', group: 'Academic' },
  { href: '/faculty/recordings', label: 'Recordings', icon: 'recordings', group: 'Academic' },
];

export default async function FacultyLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/faculty');
  if (user.role !== 'FACULTY') redirect(ROLE_HOME[user.role]);

  const alerts = await getHeaderAlerts({ userId: user.userId, role: user.role });

  return (
    <AppShell role="FACULTY" userName={user.name} nav={NAV} alerts={alerts}>
      {children}
    </AppShell>
  );
}
