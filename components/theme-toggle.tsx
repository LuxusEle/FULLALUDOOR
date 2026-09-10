'use client';

// Shared dark/light switch. Reads and writes the single theme key used across
// the application, so the choice is consistent on every route.

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readStoredTheme, type AppTheme } from '../lib/theme';

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const select = (next: AppTheme) => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className={`theme-seg ${className ?? ''}`} role="group" aria-label="Colour theme" suppressHydrationWarning>
      <button
        type="button"
        onClick={() => select('light')}
        aria-pressed={theme === 'light'}
        title="Light mode"
        className={theme === 'light' ? 'active' : ''}
      >
        <Sun size={14} /> <span className="seg-txt">Light</span>
      </button>
      <button
        type="button"
        onClick={() => select('dark')}
        aria-pressed={theme === 'dark'}
        title="Dark mode"
        className={theme === 'dark' ? 'active' : ''}
      >
        <Moon size={14} /> <span className="seg-txt">Dark</span>
      </button>
    </div>
  );
}
