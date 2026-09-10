'use client';

import { useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import AccessGate from '../../../components/auth/access-gate';
import DoorDesigner from '../../door-designer';
import WorkspaceState from '../../../components/project/workspace-state';
import { parseProjectId } from '../../../lib/project-routing';

// The project id is part of the URL so a refresh or deep link reloads exactly
// the authorized project. It is read from the router params and, as a fallback,
// straight from the URL path. Until it is known we show the project loading
// state rather than falling back to the internal dashboard.
const subscribeToLocation = () => () => undefined;
const readPathProjectId = () =>
  typeof window === 'undefined' ? '' : parseProjectId(window.location.pathname) ?? '';
const readServerProjectId = () => '';

export default function ProjectWorkspacePage() {
  const params = useParams<{ projectId?: string | string[] }>();
  const raw = params?.projectId;
  const paramId = Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
  const pathId = useSyncExternalStore(subscribeToLocation, readPathProjectId, readServerProjectId);
  const projectId = paramId || pathId;

  return (
    <AccessGate>
      {projectId ? (
        <DoorDesigner initialProjectId={projectId} />
      ) : (
        <WorkspaceState state="loading" message={null} projectId={null} onRetry={() => undefined} />
      )}
    </AccessGate>
  );
}
