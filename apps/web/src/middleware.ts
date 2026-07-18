import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_HINT_COOKIE } from './lib/session-hint';

/**
 * Route-level redirects. THIS IS UX ONLY — IT IS NOT SECURITY.
 *
 * It reads a forgeable hint cookie (see session-hint.ts), not a token: the real
 * httpOnly refresh cookie is scoped to the API's /api/auth path and is never
 * sent on a page navigation, so middleware structurally cannot verify a
 * session. Anyone can set the hint in a console and reach the dashboard shell —
 * and get nothing, because every byte of data on it comes from the API, which
 * authenticates each request and re-reads the role from the database.
 *
 * The job here is only to avoid rendering a dashboard skeleton to someone who
 * is plainly logged out, and to keep a logged-in user off /login.
 */

const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasHint = request.cookies.get(SESSION_HINT_COOKIE) !== undefined;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasHint && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the destination so login can send them back where they meant to
    // go, rather than dumping everyone on the index.
    if (pathname !== '/') url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  if (hasHint && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/employees';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the favicon and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'],
};
