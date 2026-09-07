import type { Metadata } from 'next';
import AccessGate from '../../components/auth/access-gate';
import { ApprovedInsidePanel } from '../../components/auth/gate-screens';

export const metadata: Metadata = {
  title: 'Device access | FullAluDoor',
};

export default function DeviceDeniedPage() {
  return (
    <AccessGate>
      <div className="gate-page">
        <ApprovedInsidePanel />
      </div>
    </AccessGate>
  );
}
