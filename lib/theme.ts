// Single source of truth for the FullAluDoor colour theme.
//
// Dark is the application identity and the default. A user's explicit choice is
// persisted and restored; when there is no valid stored preference the theme
// falls back to dark.

export type AppTheme = 'dark' | 'light';

// v2 resets the key so any earlier stored preference starts from the dark
// default. Future selections persist under this key.
export const THEME_STORAGE_KEY = 'fullaludoor.theme.v2';

export function readStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

/** Theme currently applied to the document, or the dark default. */
export function currentDomTheme(): AppTheme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return 'dark';
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage may be unavailable (private mode) — the in-session theme still applies.
    }
  }
}
