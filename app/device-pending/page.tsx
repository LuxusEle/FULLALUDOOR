import type { Metadata } from 'next';
import AccessGate from '../../components/auth/access-gate';
import PostAuthRedirect from '../../components/auth/post-auth-redirect';

export const metadata: Metadata = {
  title: 'Device approval | FullAluDoor',
};

export default function DevicePendingPage() {
  return (
    <AccessGate>
      <div className="gate-page">
        <PostAuthRedirect />
      </div>
    </AccessGate>
  );
}
