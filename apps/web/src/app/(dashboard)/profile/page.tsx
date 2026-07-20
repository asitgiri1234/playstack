import type { Metadata } from 'next';
import { ProfileView } from '@/components/profile/profile-view';

export const metadata: Metadata = { title: 'My Profile · Playstack' };

export default function ProfilePage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-display text-content">My profile</h1>
        <p className="mt-1 text-sm text-content-muted">
          Your details. Contact HR to change anything you can&apos;t edit here.
        </p>
      </div>
      <ProfileView />
    </div>
  );
}
