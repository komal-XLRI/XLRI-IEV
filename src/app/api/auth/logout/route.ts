import { cookies } from 'next/headers';
import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });
  return jsonResponse({ ok: true });
});
