/** Preferences shared by the landing page and the app.
 *  Both pages read and write the same localStorage keys, so a theme or language
 *  chosen on one carries straight into the other. */
import { el } from './dom.js';
import { themeIcon, type ThemeMode } from './icons.js';

export type { ThemeMode };

const THEME_KEY = 'hm-theme';
const LANG_KEY = 'hm-lang';

export function savedThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'auto' || v === 'light' || v === 'dark') return v;
  } catch { /* private mode */ }
  return 'dark';
}
export function storeThemeMode(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
}
/** 'auto' leaves data-theme off the root so the OS preference decides; the others pin it.
 *  Call before the first paint so nothing has to be repainted to correct it. */
export function applyThemeMode(mode: ThemeMode): void {
  const isDark = mode === 'dark' || (mode === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  document.documentElement.classList.toggle('dark', Boolean(isDark));
  document.documentElement.classList.toggle('light', !isDark);
}

export function savedLang(fallback: string): string {
  try { return localStorage.getItem(LANG_KEY) ?? fallback; } catch { return fallback; }
}
export function storeLang(lang: string): void {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
}

export interface ThemeLabels { theme: string; themeAuto: string; themeLight: string; themeDark: string }

/** Auto/Light/Dark as icon buttons. The glyph carries no text, so the translated
 *  word rides on aria-label and title instead. */
export function buildThemeSeg(host: HTMLElement, labels: ThemeLabels, current: ThemeMode, onPick: (m: ThemeMode) => void): void {
  host.setAttribute('aria-label', labels.theme);
  host.replaceChildren();
  const modes: [ThemeMode, string][] = [['auto', labels.themeAuto], ['light', labels.themeLight], ['dark', labels.themeDark]];
  for (const [m, label] of modes) {
    host.append(el('button', {
      class: 'icon', 'aria-pressed': String(m === current), 'aria-label': label, title: label,
      onclick: () => onPick(m),
    }, themeIcon(m)));
  }
}

export function buildLangSeg(host: HTMLElement, langs: string[], current: string, onPick: (l: string) => void): void {
  host.replaceChildren();
  for (const l of langs) {
    host.append(el('button', { 'aria-pressed': String(l === current), onclick: () => onPick(l) }, l.toUpperCase()));
  }
}
