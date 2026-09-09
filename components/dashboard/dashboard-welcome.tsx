'use client';

import { FolderOpen, Plus, Search } from 'lucide-react';

interface DashboardWelcomeProps {
  projectName: string | null;
  onCreateProject: () => void;
  onOpenProject: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  canSearch: boolean;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardWelcome({
  projectName,
  onCreateProject,
  onOpenProject,
  searchQuery,
  onSearchQueryChange,
  canSearch,
}: DashboardWelcomeProps) {
  return (
    <section className="db-welcome" aria-label="Welcome">
      <div className="db-welcome-main">
        <p className="db-welcome-kicker">FULLALUDOOR · FABRICATION WORKSPACE</p>
        <h1 className="db-welcome-title">{greeting()}</h1>
        <p className="db-welcome-sub">
          {projectName
            ? `Currently working on “${projectName}”. Continue a saved project or start a fresh aluminium schedule.`
            : 'Welcome back. Manage aluminium door & window projects, openings, cutting and quotations.'}
        </p>
      </div>

      <div className="db-welcome-actions">
        <button type="button" className="btn btn-primary" onClick={onCreateProject}>
          <Plus size={16} strokeWidth={2.6} /> Create New Project
        </button>
        <button type="button" className="btn" onClick={onOpenProject}>
          <FolderOpen size={16} /> Open Project
        </button>
      </div>

      {canSearch && (
        <div className="db-command" role="search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search projects, clients, project numbers…"
            aria-label="Search projects"
            spellCheck={false}
          />
          {searchQuery && (
            <button
              type="button"
              className="db-command-clear"
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </section>
  );
}
