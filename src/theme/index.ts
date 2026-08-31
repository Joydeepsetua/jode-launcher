/**
 * Design tokens.
 *
 * Dark is the primary experience; the light palette exists so the launcher is
 * usable on a device set to light, and the two are structurally identical so
 * neither can drift.
 */
import {useColorScheme} from 'react-native';

export type ThemeColors = {
  /**
   * The launcher window is transparent and the device wallpaper shows through
   * it, so there is no background colour — there is a scrim: a translucent
   * wash laid over the wallpaper so that text stays readable on top of a
   * photograph as easily as on top of a flat colour. Lower the alpha to let
   * more wallpaper through, raise it for more contrast.
   */
  scrim: string;
  /**
   * Opaque ground for the screens that do not sit on the wallpaper. First run
   * is the only one: it is the app introducing itself, and a welcome read
   * through someone's photograph is a welcome nobody designed.
   */
  canvas: string;
  /** Matched text, app names, the clock. */
  text: string;
  /** Unmatched parts of a name, the placeholder. */
  textSecondary: string;
  /** Hints and transient notices. */
  textMuted: string;
  caret: string;
  selection: string;
};

export type Theme = {
  scheme: 'dark' | 'light';
  colors: ThemeColors;
  fonts: {
    /**
     * One face for the whole launcher — the clock, the search field and its
     * placeholder, every app name, and the notices under them. There is not
     * enough on this screen to justify a second, and a single face is what
     * makes a screen of plain text read as designed rather than as default.
     *
     * `casual` is Coming Soon, a playful display face Android has shipped since
     * API 21 — the closest the system gets to a novelty font without bundling
     * one. To use a real display font instead, drop its `.ttf` into
     * `android/app/src/main/assets/fonts/` and set this to the file's name
     * without the extension. That is the whole change; nothing else names a
     * font.
     */
    ui: string;
  };
  spacing: {
    /** Horizontal margin shared by every element, forming a single left rail. */
    gutter: number;
    rowHeight: number;
  };
};

const dark: ThemeColors = {
  scrim: 'rgba(8, 8, 10, 0.6)',
  canvas: '#000000',
  text: '#EDEDE9',
  textSecondary: '#7C7C84',
  textMuted: '#55555C',
  caret: '#EDEDE9',
  selection: '#2A2A2E',
};

const light: ThemeColors = {
  scrim: 'rgba(251, 251, 249, 0.65)',
  canvas: '#FBFBF9',
  text: '#121214',
  textSecondary: '#84848C',
  textMuted: '#A6A6AE',
  caret: '#121214',
  selection: '#E4E4E0',
};

const fonts = {
  ui: 'casual',
} as const;

const spacing = {
  gutter: 28,
  rowHeight: 54,
} as const;

export const DARK_THEME: Theme = {scheme: 'dark', colors: dark, fonts, spacing};
export const LIGHT_THEME: Theme = {scheme: 'light', colors: light, fonts, spacing};

/** Follows the system setting, defaulting to dark. */
export function useTheme(): Theme {
  return useColorScheme() === 'light' ? LIGHT_THEME : DARK_THEME;
}
