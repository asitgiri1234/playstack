/**
 * Typed API client.
 *
 * Two things here are load-bearing and easy to get wrong: where the access
 * token lives, and what happens when several requests 401 at once.
 */

import type { EmployeeDTO, PaginationMeta, Permission, Role } from '@playstack/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

/**
 * The access token lives HERE — a module-scope variable, in memory only.
 *
 * Not localStorage, not sessionStorage, not a readable cookie. All three are
 * readable by any JavaScript running on this origin, so a single XSS — a
 * compromised dependency, a bad third-party script — turns into
 * `localStorage.getItem('token')` and a working session in the attacker's
 * hands. A module variable dies with the tab and is not reachable from an
 * injected script that does not already share this closure.
 *
 * The cost is that a page refresh loses the token. That is the point of the
 * httpOnly refresh cookie from Phase 1: on mount we call /api/auth/refresh (or
 * /me) and get a new access token without the user logging in again. Surviving
 * refresh is the cookie's job, not localStorage's.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when refresh fails — the session is unrecoverable. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => undefined;

export function setOnSessionExpired(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Field-level messages from the API's ZodError rendering: { email: [...] }. */
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Present on 400s — lets a form map errors back onto its inputs. */
  readonly fields?: FieldErrors;
  /** Present on 403s from sanitizeFields. */
  readonly rejectedFields?: string[];

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: FieldErrors,
    rejectedFields?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields !== undefined) this.fields = fields;
    if (rejectedFields !== undefined) this.rejectedFields = rejectedFields;
  }
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

function parseError(status: number, body: unknown): ApiError {
  const parsed = body as ApiErrorBody;
  const code = parsed.error?.code ?? 'UNKNOWN';
  const message = parsed.error?.message ?? 'Something went wrong.';
  const details = parsed.error?.details;

  // VALIDATION_ERROR details are `{ field: string[] }` — see errorHandler.ts.
  if (code === 'VALIDATION_ERROR' && details !== null && typeof details === 'object') {
    return new ApiError(status, code, message, details as FieldErrors);
  }
  if (code === 'FORBIDDEN' && details !== null && typeof details === 'object') {
    const rejected = (details as { rejectedFields?: unknown }).rejectedFields;
    if (Array.isArray(rejected)) {
      return new ApiError(status, code, message, undefined, rejected.map(String));
    }
  }
  return new ApiError(status, code, message);
}

// ---------------------------------------------------------------------------
// Refresh coordination
// ---------------------------------------------------------------------------

/**
 * The in-flight refresh, shared by every caller that 401s.
 *
 * Without this, a page that fires five parallel requests on mount 401s five
 * times and fires five refreshes. That is not merely wasteful: refresh tokens
 * ROTATE (Phase 1), so refresh #1 revokes the token that refreshes #2-5 are
 * still presenting. They arrive with an already-revoked token, the API reads
 * that as reuse — the signal of a stolen token — and revokes the entire family.
 * The user is hard-logged-out by their own dashboard loading.
 *
 * So: the first 401 starts a refresh, everyone else awaits the same promise.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshPromise ??= (async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        // The refresh token is an httpOnly cookie; it rides on this request
        // only because of `credentials`. Nothing reads it in JS — by design.
        credentials: 'include',
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { accessToken?: string };
      if (typeof body.accessToken !== 'string') return false;
      setAccessToken(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared regardless of outcome so a later 401 can try again.
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Internal: prevents a refresh loop. */
  isRetry?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isRetry = false, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken !== null) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal !== undefined ? { signal } : {}),
  });

  if (response.status === 401 && !isRetry) {
    // One attempt, then give up — `isRetry` is what stops a 401 on the retried
    // request from recursing forever.
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...options, isRetry: true });
    }
    setAccessToken(null);
    onSessionExpired();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : {};

  if (!response.ok) throw parseError(response.status, payload);

  return payload as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  designation?: string;
  status?: string;
  profileImage?: string | null;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  permissions: Permission[];
}

interface MeResponse {
  user: AuthUser;
  permissions: Permission[];
}

export interface EmployeeListResponse {
  data: EmployeeDTO[];
  pagination: PaginationMeta;
}

export interface EmployeeStats {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  departmentCount: number;
  byDepartment: { department: string; count: number }[];
  byRole: { role: Role; count: number }[];
}

export const api = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setAccessToken(result.accessToken);
    return result;
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      // Clear locally even if the network call failed — the user asked to be
      // logged out, and the server-side revocation is idempotent.
      setAccessToken(null);
    }
  },

  me(): Promise<MeResponse> {
    return request<MeResponse>('/api/auth/me');
  },

  listEmployees(query: string): Promise<EmployeeListResponse> {
    return request<EmployeeListResponse>(`/api/employees${query.length > 0 ? `?${query}` : ''}`);
  },

  getEmployee(id: string): Promise<{ data: EmployeeDTO }> {
    return request<{ data: EmployeeDTO }>(`/api/employees/${id}`);
  },

  createEmployee(body: unknown): Promise<{ data: EmployeeDTO; temporaryPassword?: string }> {
    return request('/api/employees', { method: 'POST', body });
  },

  updateEmployee(id: string, body: unknown): Promise<{ data: EmployeeDTO }> {
    return request(`/api/employees/${id}`, { method: 'PUT', body });
  },

  updateSelf(body: unknown): Promise<{ data: EmployeeDTO }> {
    return request('/api/employees/me', { method: 'PATCH', body });
  },

  deleteEmployee(id: string): Promise<{ data: EmployeeDTO }> {
    return request(`/api/employees/${id}`, { method: 'DELETE' });
  },

  stats(): Promise<EmployeeStats> {
    return request<EmployeeStats>('/api/employees/stats');
  },
};

/** Exported for the refresh-on-mount path in AuthProvider. */
export { refreshAccessToken };
