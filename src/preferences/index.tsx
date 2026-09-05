/**
 * The choices the settings screen owns, held once for the whole app.
 *
 * Read synchronously out of native SharedPreferences on the first render, for
 * the same reason first run is: a home screen is on the display the instant
 * HOME is pressed, and an appearance that arrives a frame late is one the user
 * watches change.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getFontFamily,
  getFontScale,
  getScrimOpacity,
  getThemeMode,
  setFontFamily as persistFontFamily,
  setFontScale as persistFontScale,
  setScrimOpacity as persistScrimOpacity,
  setThemeMode as persistThemeMode,
  type FontFamily,
  type ThemeMode,
} from '../native/LauncherModule';

export type {FontFamily, ThemeMode};

export type Preferences = {
  /** Follow the device, or override it in one direction. */
  themeMode: ThemeMode;
  /** How much wash sits between the wallpaper and the text, from 0 to 1. */
  scrimOpacity: number;
  /** The face the launcher draws its own text in. */
  fontFamily: FontFamily;
  /** What the launcher's own text sizes are multiplied by. */
  fontScale: number;
  setThemeMode: (mode: ThemeMode) => void;
  setScrimOpacity: (value: number) => void;
  setFontFamily: (family: FontFamily) => void;
  setFontScale: (value: number) => void;
};

/** What the launcher looks like before anyone has been to settings. */
const DEFAULTS: Preferences = {
  themeMode: 'system',
  scrimOpacity: 0,
  fontFamily: 'system',
  fontScale: 1,
  setThemeMode: () => {},
  setScrimOpacity: () => {},
  setFontFamily: () => {},
  setFontScale: () => {},
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({children}: {children: ReactNode}) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const [scrimOpacity, setScrimOpacityState] =
    useState<number>(getScrimOpacity);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(getFontFamily);
  const [fontScale, setFontScaleState] = useState<number>(getFontScale);

  // State first, store second: the screen the user is looking at responds to
  // the tap, and the write that outlives the process follows behind it.
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    persistThemeMode(mode);
  }, []);

  const setScrimOpacity = useCallback((value: number) => {
    setScrimOpacityState(value);
    persistScrimOpacity(value);
  }, []);

  const setFontFamily = useCallback((family: FontFamily) => {
    setFontFamilyState(family);
    persistFontFamily(family);
  }, []);

  const setFontScale = useCallback((value: number) => {
    setFontScaleState(value);
    persistFontScale(value);
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      themeMode,
      scrimOpacity,
      fontFamily,
      fontScale,
      setThemeMode,
      setScrimOpacity,
      setFontFamily,
      setFontScale,
    }),
    [
      themeMode,
      scrimOpacity,
      fontFamily,
      fontScale,
      setThemeMode,
      setScrimOpacity,
      setFontFamily,
      setFontScale,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

/**
 * The current preferences.
 *
 * Outside a provider this reports the defaults with setters that do nothing,
 * so a component rendered on its own — in a test, say — still gets a launcher
 * that looks the way an untouched install does.
 */
export function usePreferences(): Preferences {
  return useContext(PreferencesContext) ?? DEFAULTS;
}
