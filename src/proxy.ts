import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { ROLE_HOME, ROLE_ROUTE_PREFIX, ROLES } from '@/lib/constants/roles';

/**
 * Coarse-grained edge gate: is there a valid signed session, and does its role
 * own this route prefix?
 *
 * This is a redirect convenience, not the security boundary. Every server
 * component and route handler independently re-authorises against the
 * database via `requireRole()`, because the JWT role can be stale.
 */
const PUBLIC_PATHS = ['/', '/login'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

function roleOwning(pathname: string) {
  return ROLES.find((role) => pathname.startsWith(ROLE_ROUTE_PREFIX[role]));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  // Signed-in users have no business on the login screens.
  if (session && isPublic(pathname)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }

  const owner = roleOwning(pathname);
  if (!owner) return NextResponse.next();

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session.role !== owner) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/admin/:path*', '/student/:path*', '/faculty/:path*', '/mentor/:path*'],
};
