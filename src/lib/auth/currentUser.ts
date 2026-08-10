import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { connectToDatabase } from '@/lib/db/mongoose';
import { User } from '@/models';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import type { Role } from '@/lib/constants/roles';
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from './session';

/**
 * Resolves the caller from the session cookie AND re-reads the user from the
 * database on every request.
 *
 * The role in the JWT is only a hint — an account deactivated or re-roled
 * after the token was minted must not keep its old privileges, so the database
 * value always wins. `cache()` dedupes the lookup within one request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const claims = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  await connectToDatabase();
  const user = await User.findById(claims.userId).select('name email role status').lean().exec();

  if (!user || user.status !== 'ACTIVE') return null;

  return {
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  };
});

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(`This action requires one of: ${allowed.join(', ')}`);
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole('ADMIN');
}

/** Faculty and Mentor share most review screens but never each other's verdicts. */
export async function requireReviewer(): Promise<SessionUser & { role: 'FACULTY' | 'MENTOR' }> {
  const user = await requireRole('FACULTY', 'MENTOR');
  return user as SessionUser & { role: 'FACULTY' | 'MENTOR' };
}
