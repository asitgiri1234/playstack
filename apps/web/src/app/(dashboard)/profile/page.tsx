import type { Metadata } from 'next';
import { ProfileView } from '@/components/profile/profile-view';

export const metadata: Metadata = { title: 'My Profile · Playstack' };

export default function ProfilePage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">My Profile</h1>
        <p className="mt-1 text-base text-content-muted">
          Your details. Contact HR to change anything not editable here.
        </p>
      </div>
      <ProfileView />
    </div>
  );
}
