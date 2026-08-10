import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppShell, type NavItem } from '@/components/layout/AppShell';
import { getHeaderAlerts } from '@/services/dashboard/dashboardService';
import { ROLE_HOME } from '@/lib/constants/roles';

export const dynamic = 'force-dynamic';

const NAV: NavItem[] = [
  { href: '/mentor', label: 'Review desk', icon: 'reviews', exact: true },
  {
    href: '/mentor/ventures',
    label: 'My ventures',
    icon: 'ventures',
    group: 'Venture supervision',
  },
];

export default async function MentorLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/mentor');
  if (user.role !== 'MENTOR') redirect(ROLE_HOME[user.role]);

  const alerts = await getHeaderAlerts({ userId: user.userId, role: user.role });

  return (
    <AppShell role="MENTOR" userName={user.name} nav={NAV} alerts={alerts}>
      {children}
    </AppShell>
  );
}
