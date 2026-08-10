import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/auth/currentUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (!user) return jsonResponse({ user: null }, { status: 200 });

  return jsonResponse({
    user: { name: user.name, email: user.email, role: user.role },
  });
});
