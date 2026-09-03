/**
 * Design tokens.
 *
 * Dark is the primary experience; the light palette exists so the launcher is
 * usable on a device set to light, and the two are structurally identical so
 * neither can drift.
 *
 * There are two things this file deliberately does not hold. There is no
 * typeface: every screen renders in the system's own face, which is the one the
 * device is already set up to read well at any size and in any language it has
 * been localised into. And there is no colour: the palette is a ground, three
 * weights of ink on it, and the inversion of the two, which is the whole
 * vocabulary the app has for saying that something is on, selected, or worth
 * doing next.
 */
import {useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {usePreferences} from '../preferences';

export type ThemeColors = {
  /**
   * The launcher window is transparent and the device wallpaper shows through
   * it, so there is no background colour — there is a scrim: a translucent
   * wash laid over the wallpaper so that text stays readable on top of a
   * photograph as easily as on top of a flat colour.
   *
   * It is off by default: the wallpaper is shown exactly as the user set it,
   * with nothing between it and the launcher's text. How much wash to lay over
   * it is a setting — see {@link SCRIM_STEPS} — for the wallpapers whose text
   * cannot otherwise be read.
   */
  scrim: string;
  /**
   * Opaque ground for the screens that do not sit on the wallpaper: first run,
   * which is the app introducing itself, and settings. Neither is a home
   * screen, and neither is improved by being read through someone's
   * photograph.
   */
  canvas: string;
  /**
   * Ground for a card sitting on {@link canvas}: the grouped rows on the
   * settings screen, and nothing on the wallpaper — a raised surface only
   * reads as raised against an opaque background.
   */
  surface: string;
  /** Matched text, app names, the clock. */
  text: string;
  /** Unmatched parts of a name, the placeholder. */
  textSecondary: string;
  /** Hints and transient notices. */
  textMuted: string;
  caret: string;
  selection: string;
  /**
   * One step further up than {@link surface}: an icon's tile, the trough a
   * chooser's segments slide along, a chip that is only stating a fact.
   *
   * There is no colour anywhere in this app — no accent, no green for granted,
   * no red for anything. The palette is ink on paper and the greys between,
   * which means every distinction this screen draws has to be made with
   * lightness, weight or position instead. This is the lightness half of that:
   * three grounds — canvas, surface, elevated — and a thing's depth in the
   * stack is what says how much it matters.
   */
  elevated: string;
  /**
   * Ink for something sitting on {@link text} used as a ground.
   *
   * Inverting is how this palette shouts: the lit segment of a chooser and the
   * one action worth taking are filled with the text colour and lettered in the
   * canvas colour. It is the strongest emphasis available without a hue, so it
   * is spent on one thing at a time.
   */
  textInverse: string;
  /** Hairline between rows sharing a card, and around a card on canvas. */
  border: string;
};

export type Theme = {
  scheme: 'dark' | 'light';
  colors: ThemeColors;
  spacing: {
    /** Horizontal margin shared by every element, forming a single left rail. */
    gutter: number;
    rowHeight: number;
  };
};

/**
 * The colour each scheme's scrim is mixed from. Only its alpha is the user's
 * to choose, on the settings screen; the ink itself belongs to the palette.
 */
const SCRIM_INK = {dark: '8, 8, 10', light: '251, 251, 249'} as const;

/** How much wash the settings screen offers, and what each step is worth. */
export const SCRIM_STEPS = [0, 0.25, 0.45, 0.65] as const;

const dark: ThemeColors = {
  scrim: `rgba(${SCRIM_INK.dark}, 0)`,
  canvas: '#000000',
  surface: '#131316',
  text: '#EDEDE9',
  textSecondary: '#7C7C84',
  textMuted: '#55555C',
  caret: '#EDEDE9',
  selection: '#2A2A2E',
  elevated: '#1F1F23',
  textInverse: '#0A0A0C',
  border: 'rgba(255, 255, 255, 0.07)',
};

const light: ThemeColors = {
  scrim: `rgba(${SCRIM_INK.light}, 0)`,
  canvas: '#FBFBF9',
  surface: '#FFFFFF',
  text: '#121214',
  textSecondary: '#84848C',
  textMuted: '#A6A6AE',
  caret: '#121214',
  selection: '#E4E4E0',
  elevated: '#F1F1EE',
  textInverse: '#FBFBF9',
  border: 'rgba(0, 0, 0, 0.07)',
};

const spacing = {
  gutter: 28,
  rowHeight: 54,
} as const;

export const DARK_THEME: Theme = {scheme: 'dark', colors: dark, spacing};
export const LIGHT_THEME: Theme = {
  scheme: 'light',
  colors: light,
  spacing,
};

/** A palette with the chosen amount of wash over the wallpaper. */
export function themeFor(
  scheme: 'dark' | 'light',
  scrimOpacity: number,
): Theme {
  const base = scheme === 'light' ? LIGHT_THEME : DARK_THEME;
  if (scrimOpacity <= 0) {
    return base;
  }
  return {
    ...base,
    colors: {
      ...base.colors,
      scrim: `rgba(${SCRIM_INK[scheme]}, ${scrimOpacity})`,
    },
  };
}

/**
 * The palette in force: the appearance chosen in settings, or the device's own
 * when that choice is to follow it, washed by however much scrim was asked for.
 */
export function useTheme(): Theme {
  const system = useColorScheme();
  const {themeMode, scrimOpacity} = usePreferences();
  const scheme: 'dark' | 'light' =
    themeMode === 'system'
      ? system === 'light'
        ? 'light'
        : 'dark'
      : themeMode;
  return useMemo(() => themeFor(scheme, scrimOpacity), [scheme, scrimOpacity]);
}
