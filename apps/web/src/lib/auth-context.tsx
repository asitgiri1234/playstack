'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { can, type Permission } from '@playstack/shared';
import { api, refreshAccessToken, setOnSessionExpired, type AuthUser } from './api';
import { clearSessionHint, setSessionHint } from './session-hint';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Starts true: until the rehydrate below settles we genuinely do not know
  // whether there is a session, and rendering "logged out" during that window
  // is the flash-of-login-screen bug.
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  /**
   * Rehydrate on mount.
   *
   * The access token lives in memory, so a page refresh always starts with
   * none — that is the deliberate trade for not putting it in localStorage.
   * The httpOnly refresh cookie survives, so we spend one refresh call to mint
   * a new access token and then ask who we are. Refreshing the page must not
   * log you out.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          if (!cancelled) {
            clearSessionHint();
            setIsLoading(false);
          }
          return;
        }
        const { user: me } = await api.me();
        if (!cancelled) {
          setUser(me);
          setSessionHint();
        }
      } catch {
        if (!cancelled) clearSessionHint();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** The client's last line: a refresh failure mid-session ends it. */
  useEffect(() => {
    setOnSessionExpired(() => {
      setUser(null);
      clearSessionHint();
      router.replace('/login');
    });
  }, [router]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    setUser(result.user);
    setSessionHint();
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    clearSessionHint();
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

/**
 * Delegates to can() from the shared matrix — the same function the Express
 * middleware calls. The UI never keeps its own copy of who may do what, so a
 * rendered button and an accepting endpoint cannot disagree.
 *
 * This decides what to SHOW. It is not security: the API re-checks every
 * request, and must, because anything here is editable in a devtools console.
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (user === null) return false;
  return can(user.role, permission);
}
