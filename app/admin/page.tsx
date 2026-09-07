import type { Metadata } from 'next';
import AccessGate from '../../components/auth/access-gate';
import AdminDevicePanel from '../../components/admin/admin-device-panel';

export const metadata: Metadata = {
  title: 'Device administration | FullAluDoor',
};

export default function AdminPage() {
  return (
    <AccessGate requireAdmin>
      <AdminDevicePanel />
    </AccessGate>
  );
}
