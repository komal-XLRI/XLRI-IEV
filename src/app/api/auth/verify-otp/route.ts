import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { verifyOtpSchema } from '@/validators/auth';
import { verifyOtpAndCreateSession } from '@/services/auth/authService';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { ROLE_HOME } from '@/lib/constants/roles';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const input = verifyOtpSchema.parse(body);

  const { token, user } = await verifyOtpAndCreateSession(input.email, input.otp);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());

  return jsonResponse({
    user: { name: user.name, email: user.email, role: user.role },
    redirectTo: ROLE_HOME[user.role],
  });
});
