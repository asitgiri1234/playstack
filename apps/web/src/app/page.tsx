import { redirect } from 'next/navigation';

/**
 * No marketing page. Middleware sends the unauthenticated to /login; everyone
 * else lands on /dashboard, whose own guard bounces an EMPLOYEE (no
 * DASHBOARD:READ) onward to /profile. One entry point, role-correct by delegation.
 */
export default function IndexPage(): never {
  redirect('/dashboard');
}
