'use client';

// Shared dark/light switch. Reads and writes the same localStorage key the
// workspace uses, so the choice is consistent across every route.

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_STORAGE_KEY = 'fullaludoor.theme.v1';

type Theme = 'dark' | 'light';

function currentTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return 'dark';
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const apply = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode) — the in-session theme still applies.
    }
  };

  return (
    <div className={`theme-seg ${className ?? ''}`} role="group" aria-label="Colour theme" suppressHydrationWarning>
      <button
        type="button"
        onClick={() => apply('light')}
        aria-pressed={theme === 'light'}
        title="Light mode"
        className={theme === 'light' ? 'active' : ''}
      >
        <Sun size={14} /> <span className="seg-txt">Light</span>
      </button>
      <button
        type="button"
        onClick={() => apply('dark')}
        aria-pressed={theme === 'dark'}
        title="Dark mode"
        className={theme === 'dark' ? 'active' : ''}
      >
        <Moon size={14} /> <span className="seg-txt">Dark</span>
      </button>
    </div>
  );
}
