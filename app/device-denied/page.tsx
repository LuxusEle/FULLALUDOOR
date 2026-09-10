import type { Metadata } from 'next';
import AccessGate from '../../components/auth/access-gate';
import PostAuthRedirect from '../../components/auth/post-auth-redirect';

export const metadata: Metadata = {
  title: 'Device access | FullAluDoor',
};

export default function DeviceDeniedPage() {
  return (
    <AccessGate>
      <div className="gate-page">
        <PostAuthRedirect />
      </div>
    </AccessGate>
  );
}
