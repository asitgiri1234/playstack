/**
 * Integration tests for /api/auth/* against the real test database.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/harness.js';
import { disconnect, makeEmployee, resetDb, TEST_PASSWORD } from './helpers/db.js';
import { prisma } from '../lib/prisma.js';
import { __internal } from '../services/auth.service.js';

const app = createTestApp();

/** Pulls the refresh cookie out of a Set-Cookie header. */
function refreshCookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const found = cookies.find((c) => typeof c === 'string' && c.startsWith('playstack_refresh='));
  if (found === undefined) throw new Error('No refresh cookie on response');
  return found.split(';')[0] ?? '';
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnect();
});

describe('POST /api/auth/login', () => {
  it('logs in an active employee and returns an access token', async () => {
    const employee = await makeEmployee({ role: 'EMPLOYEE' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.id).toBe(employee.id);
  });

  it('rejects login for soft-deleted employee', async () => {
    const employee = await makeEmployee({ deletedAt: new Date('2024-01-01') });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('rejects login for INACTIVE employee', async () => {
    const employee = await makeEmployee({ status: 'INACTIVE' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('returns identical error for wrong password and unknown email', async () => {
    const employee = await makeEmployee();

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: 'DefinitelyWrong@123' });

    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@playstack.test', password: 'DefinitelyWrong@123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Byte-identical: any difference is an account-enumeration oracle.
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password.');
  });

  it('returns the same generic error for a soft-deleted account as for a bad password', async () => {
    const deleted = await makeEmployee({ deletedAt: new Date('2024-01-01') });
    const active = await makeEmployee();

    const deletedRes = await request(app)
      .post('/api/auth/login')
      .send({ email: deleted.email, password: TEST_PASSWORD });
    const wrongRes = await request(app)
      .post('/api/auth/login')
      .send({ email: active.email, password: 'Wrong@12345' });

    // "This account is disabled" would confirm the address is a real employee.
    expect(deletedRes.body).toEqual(wrongRes.body);
  });

  it('never returns the refresh token in the response body', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    expect(JSON.stringify(res.body)).not.toMatch(/refreshToken/i);
  });

  it('sets the refresh token as an httpOnly, SameSite=Strict cookie', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    const raw = res.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw]).find((c) =>
      String(c).startsWith('playstack_refresh='),
    );
    expect(cookie).toBeDefined();
    expect(String(cookie)).toMatch(/HttpOnly/i);
    expect(String(cookie)).toMatch(/SameSite=Strict/i);
  });

  it('stores only the SHA-256 hash of the refresh token, never the raw value', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    const rawToken = refreshCookieFrom(res).split('=')[1] ?? '';
    const stored = await prisma.refreshToken.findMany({ select: { tokenHash: true } });

    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(rawToken);
    expect(stored[0]?.tokenHash).toBe(__internal.hashToken(decodeURIComponent(rawToken)));
  });

  it('access token payload contains only sub and role — it is not a cache', async () => {
    const employee = await makeEmployee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    const payloadPart = String(res.body.accessToken).split('.')[1] ?? '';
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8')) as Record<
      string,
      unknown
    >;

    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'iss', 'role', 'sub']);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('salary');
  });

  it('rejects a malformed email before touching the database', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });
    const cookie = refreshCookieFrom(loginRes);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    // Old token revoked, new token issued: two rows, one still live.
    expect(await prisma.refreshToken.count()).toBe(2);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('revoked refresh token cannot be reused', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });
    const cookie = refreshCookieFrom(loginRes);

    await request(app).post('/api/auth/logout').set('Cookie', cookie);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('reusing a rotated refresh token revokes the family', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });
    const stolenCookie = refreshCookieFrom(loginRes);

    // The legitimate client rotates once. `stolenCookie` is now spent.
    const firstRefresh = await request(app).post('/api/auth/refresh').set('Cookie', stolenCookie);
    expect(firstRefresh.status).toBe(200);
    const liveCookie = refreshCookieFrom(firstRefresh);

    // The thief replays the old token: two parties hold it, so assume breach.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', stolenCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // The victim's still-valid token must also die — we cannot tell which party
    // is which, so both are forced back to a password login.
    const victim = await request(app).post('/api/auth/refresh').set('Cookie', liveCookie);
    expect(victim.status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('rejects an expired refresh token', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });
    const cookie = refreshCookieFrom(loginRes);

    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date('2020-01-01') } });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'playstack_refresh=totally-made-up-token');
    expect(res.status).toBe(401);
  });

  it('rejects refresh for an employee soft-deleted after login', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });
    const cookie = refreshCookieFrom(loginRes);

    // Offboarding must cut the session short — a 7-day token cannot outlive it.
    await prisma.employee.update({ where: { id: employee.id }, data: { deletedAt: new Date() } });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token server-side', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });
    const cookie = refreshCookieFrom(loginRes);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    expect(res.status).toBe(204);
    // The whole point of the table: the token is dead in the database, not just
    // forgotten by the client.
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('clears the refresh cookie', async () => {
    const employee = await makeEmployee();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', refreshCookieFrom(loginRes));

    const raw = res.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw]).find((c) =>
      String(c).startsWith('playstack_refresh='),
    );
    expect(String(cookie)).toMatch(/playstack_refresh=;/);
  });

  it('succeeds idempotently for a bogus token', async () => {
    // A 404 here would confirm which tokens are real.
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'playstack_refresh=nonsense');
    expect(res.status).toBe(204);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const employee = await makeEmployee({ role: 'HR_MANAGER' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: TEST_PASSWORD });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${String(loginRes.body.accessToken)}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(employee.id);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.not-a-signature');
    expect(res.status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('blocks a 6th failed login attempt for the same IP+email', async () => {
    const employee = await makeEmployee();

    const attempts = [];
    for (let i = 0; i < 5; i += 1) {
      attempts.push(
        await request(app)
          .post('/api/auth/login')
          .send({ email: employee.email, password: 'Wrong@12345' }),
      );
    }
    expect(attempts.every((r) => r.status === 401)).toBe(true);

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: employee.email, password: 'Wrong@12345' });

    expect(blocked.status).toBe(429);
  });
});
