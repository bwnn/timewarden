/**
 * Theme management — applies 'dark' class to <html> based on the
 * stored GlobalSettings.theme preference.
 *
 * Supports three modes:
 * - 'light': always light
 * - 'dark': always dark
 * - 'system': follows prefers-color-scheme media query
 *
 * Usage: call `initTheme()` on mount in each UI entry page.
 * Call `applyTheme(theme)` when the user changes the theme setting.
 */

import type { GlobalSettings } from './types';

/** Apply a theme setting to the document root. */
export function applyTheme(theme: GlobalSettings['theme']): void {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // 'system' — follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}

/**
 * Initialize the theme system.
 * Loads the theme setting from storage and applies it.
 * Also listens for OS theme changes when in 'system' mode.
 *
 * Returns a cleanup function to remove the media query listener.
 */
export function initTheme(settingsTheme?: GlobalSettings['theme']): () => void {
  const theme = settingsTheme ?? 'system';
  applyTheme(theme);

  // Listen for OS preference changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let currentTheme = theme;

  function handleChange(): void {
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  }

  mediaQuery.addEventListener('change', handleChange);

  return () => {
    mediaQuery.removeEventListener('change', handleChange);
  };
}

/**
 * Update the tracked theme and re-apply it.
 * Used when the user changes the theme in settings.
 */
export function setTheme(theme: GlobalSettings['theme']): void {
  applyTheme(theme);
}
