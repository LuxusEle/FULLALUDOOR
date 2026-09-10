import type { Metadata } from 'next';
import AccessGate from '../../components/auth/access-gate';
import LandingDashboard from '../../components/dashboard/landing-dashboard';

export const metadata: Metadata = {
  title: 'Dashboard | FullAluDoor',
  description: 'Project management dashboard for aluminium door and window fabrication.',
};

export default function DashboardPage() {
  return (
    <AccessGate>
      <LandingDashboard />
    </AccessGate>
  );
}
