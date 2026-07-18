/**
 * A non-sensitive "there is probably a session" marker for Next middleware.
 *
 * Why this exists at all: the real refresh token is an httpOnly cookie set by
 * the API on path=/api/auth. Middleware runs on page navigations to
 * /employees, /login … which do not match that path, so the browser never
 * sends it and middleware CANNOT see it. Without a marker, middleware would
 * either redirect everyone to /login or nobody.
 *
 * So this cookie carries no token, no id, no claim — just "1". It is readable
 * and forgeable by any script, and that is fine, because it is used only to
 * decide which page to render first. Forging it gets you a dashboard shell that
 * immediately fails its /me call and bounces you to /login. The API is the gate.
 */

const HINT_COOKIE = 'playstack_session_hint';

export function setSessionHint(): void {
  if (typeof document === 'undefined') return;
  // Session cookie (no Expires): it should not outlive the browser session,
  // and the refresh cookie's own 7-day expiry is the real authority.
  document.cookie = `${HINT_COOKIE}=1; path=/; SameSite=Strict`;
}

export function clearSessionHint(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${HINT_COOKIE}=; path=/; Max-Age=0; SameSite=Strict`;
}

export const SESSION_HINT_COOKIE = HINT_COOKIE;
