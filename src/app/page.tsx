import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { ROLE_HOME } from '@/lib/constants/roles';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? ROLE_HOME[user.role] : '/login');
}
