'use client';

import { useEffect } from 'react';
import { ROUTES } from '../../lib/project-routing';
import { LoadingView } from './gate-screens';

// Rendered by the /login, /device-pending and /device-denied routes once the
// access gate reports an approved session. Sends the user to the dashboard
// instead of the old workspace root.
export default function PostAuthRedirect() {
  useEffect(() => {
    window.location.replace(ROUTES.dashboard);
  }, []);
  return <LoadingView message="Access approved — opening your dashboard…" />;
}
