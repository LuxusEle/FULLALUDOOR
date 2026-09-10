'use client';

import { useParams } from 'next/navigation';
import AccessGate from '../../../components/auth/access-gate';
import DoorDesigner from '../../door-designer';

// Project-scoped workspace. The project id is part of the URL so a refresh or a
// deep link reloads exactly the authorized project.
export default function ProjectWorkspacePage() {
  const params = useParams<{ projectId?: string | string[] }>();
  const raw = params?.projectId;
  const projectId = Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
  return (
    <AccessGate>
      <DoorDesigner initialProjectId={projectId} />
    </AccessGate>
  );
}
