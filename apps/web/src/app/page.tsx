import { redirect } from 'next/navigation';

/** There is no marketing page. Middleware decides whether this lands on /login. */
export default function IndexPage(): never {
  redirect('/employees');
}
