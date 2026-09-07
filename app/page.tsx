import AccessGate from '../components/auth/access-gate';
import DoorDesigner from './door-designer';

export default function Home() {
  return (
    <AccessGate>
      <DoorDesigner />
    </AccessGate>
  );
}
