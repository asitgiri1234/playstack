/**
 * Refresh-token transport.
 *
 * The split matters, so it is written down once here:
 *
 *   ACCESS token  → response body. The frontend holds it in a JS variable, in
 *                   memory only. It is short-lived (15m) and dies with the tab.
 *   REFRESH token → httpOnly cookie. Long-lived (7d) and therefore the more
 *                   valuable of the two.
 *
 * Why not localStorage for either: localStorage is readable by ANY JavaScript
 * on the origin. One XSS — a compromised npm dependency, a reflected script —
 * and `localStorage.getItem('token')` exfiltrates a working session. An
 * httpOnly cookie is not exposed to `document.cookie` at all, so the same XSS
 * cannot read the refresh token; it can only ride along on requests to this
 * origin while the page is open. That is a strictly smaller blast radius.
 *
 * The access token in memory is the accepted trade: an XSS can still use it,
 * but only for minutes, and only while the page lives.
 *
 * NOTHING in this project puts a token in localStorage.
 */

import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'playstack_refresh';

/**
 * Scoped to /api/auth: the refresh token is only ever presented to refresh and
 * logout, so no other endpoint should receive it. A cookie scoped to '/' would
 * be attached to every request, widening exposure for nothing.
 */
const COOKIE_PATH = '/api/auth';

function baseCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    // Unreadable from document.cookie — the entire point. See above.
    httpOnly: true,
    // Strict: the cookie is not sent on ANY cross-site navigation, which is
    // what makes CSRF against /api/auth/refresh a non-issue. 'Lax' would still
    // ride top-level GET navigations.
    sameSite: 'strict',
    // HTTPS-only in prod. Not in dev, or localhost over http never sees it.
    secure: isProduction,
    path: COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseCookieOptions(), expires: expiresAt });
}

/**
 * Clearing must use the SAME attributes it was set with — browsers match
 * cookies on name+domain+path, so a mismatched path silently leaves the cookie
 * in place and "logout" only appears to work in the UI.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
}
