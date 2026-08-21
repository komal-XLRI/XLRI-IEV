import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppShell, type NavItem } from '@/components/layout/AppShell';
import { getHeaderAlerts } from '@/services/dashboard/dashboardService';
import { ROLE_HOME } from '@/lib/constants/roles';

export const dynamic = 'force-dynamic';

const NAV: NavItem[] = [
  { href: '/student', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/student/venture', label: 'My venture', icon: 'ventures', group: 'My programme' },
  {
    href: '/student/support',
    label: 'Support activities',
    icon: 'supportActivities',
    group: 'My programme',
  },
  { href: '/student/workshops', label: 'Workshops', icon: 'workshops', group: 'My programme' },
  {
    href: '/student/attendance',
    label: 'My attendance',
    icon: 'attendance',
    group: 'My programme',
  },
];

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/student');
  if (user.role !== 'STUDENT') redirect(ROLE_HOME[user.role]);

  const alerts = await getHeaderAlerts({ userId: user.userId, role: user.role });

  return (
    <AppShell
      role="STUDENT"
      userName={user.name}
      nav={NAV}
      alerts={alerts}
      profileHref="/student/profile"
    >
      {children}
    </AppShell>
  );
}
