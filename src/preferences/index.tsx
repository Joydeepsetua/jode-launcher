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
  getScrimOpacity,
  getThemeMode,
  setScrimOpacity as persistScrimOpacity,
  setThemeMode as persistThemeMode,
  type ThemeMode,
} from '../native/LauncherModule';

export type {ThemeMode};

export type Preferences = {
  /** Follow the device, or override it in one direction. */
  themeMode: ThemeMode;
  /** How much wash sits between the wallpaper and the text, from 0 to 1. */
  scrimOpacity: number;
  setThemeMode: (mode: ThemeMode) => void;
  setScrimOpacity: (value: number) => void;
};

/** What the launcher looks like before anyone has been to settings. */
const DEFAULTS: Preferences = {
  themeMode: 'system',
  scrimOpacity: 0,
  setThemeMode: () => {},
  setScrimOpacity: () => {},
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({children}: {children: ReactNode}) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const [scrimOpacity, setScrimOpacityState] =
    useState<number>(getScrimOpacity);

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

  const value = useMemo<Preferences>(
    () => ({themeMode, scrimOpacity, setThemeMode, setScrimOpacity}),
    [themeMode, scrimOpacity, setThemeMode, setScrimOpacity],
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
