'use client';

// Top navigation shared by the dashboard and project-list landing pages.
// Uses full-page anchors because vinext RSC client-navigation for these
// routes is not used elsewhere in the app.

import { FolderKanban, Hexagon, LayoutDashboard, LogOut, Shield } from 'lucide-react';
import { useAccessSession } from '../auth/access-gate';
import { ROUTES } from '../../lib/project-routing';
import ThemeToggle from '../theme-toggle';

interface AppNavProps {
  active: 'dashboard' | 'projects';
}

export default function AppNav({ active }: AppNavProps) {
  const { role, signedInEmail, signOut } = useAccessSession();

  return (
    <header className="appnav">
      <a className="appnav-brand" href={ROUTES.dashboard} aria-label="FullAluDoor dashboard">
        <span className="appnav-mark" aria-hidden="true">
          <Hexagon size={17} strokeWidth={2.3} />
        </span>
        <span className="appnav-name">FullAluDoor Pro</span>
        <span className="appnav-sub">CAD/CAM</span>
      </a>

      <nav className="appnav-links" aria-label="Application sections">
        <a
          href={ROUTES.dashboard}
          className={`appnav-link ${active === 'dashboard' ? 'active' : ''}`}
          aria-current={active === 'dashboard' ? 'page' : undefined}
        >
          <LayoutDashboard size={15} /> Dashboard
        </a>
        <a
          href={ROUTES.projects}
          className={`appnav-link ${active === 'projects' ? 'active' : ''}`}
          aria-current={active === 'projects' ? 'page' : undefined}
        >
          <FolderKanban size={15} /> Projects
        </a>
        {role === 'admin' && (
          <a href={ROUTES.admin} className="appnav-link">
            <Shield size={15} /> Admin
          </a>
        )}
      </nav>

      <div className="appnav-user">
        <ThemeToggle />
        {signedInEmail ? <span className="appnav-email" title={signedInEmail}>{signedInEmail}</span> : null}
        <button type="button" className="appnav-signout" onClick={() => void signOut()} title="Sign out">
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
