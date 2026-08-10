import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Role } from '@/lib/constants/roles';

/**
 * Stateless signed session. Kept free of `server-only` and of the Zod env
 * loader so that the Edge middleware can verify a session too.
 */

export const SESSION_COOKIE = 'iev_session';
const ISSUER = 'iev-tracker';
const AUDIENCE = 'iev-tracker-app';

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

interface SessionClaims extends JWTPayload {
  email: string;
  name: string;
  role: Role;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET is missing or shorter than 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export function sessionMaxAgeSeconds(): number {
  const raw = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 43_200);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 43_200;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const maxAge = sessionMaxAgeSeconds();
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey());
}

/** Returns null for any token that is absent, malformed, expired or unsigned. */
export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<SessionClaims>(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (!payload.sub || !payload.role) return null;

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge: number = sessionMaxAgeSeconds()) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
