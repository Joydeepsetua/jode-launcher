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
  DEFAULT_HOME_ROW_COUNT,
  getFontFamily,
  getFontScale,
  getHomeAppIds,
  getHomeAppSource,
  getHomeRowCount,
  getScrimOpacity,
  getShowClock,
  getShowHomeApps,
  getThemeMode,
  setFontFamily as persistFontFamily,
  setFontScale as persistFontScale,
  setHomeAppIds as persistHomeAppIds,
  setHomeAppSource as persistHomeAppSource,
  setHomeRowCount as persistHomeRowCount,
  setScrimOpacity as persistScrimOpacity,
  setShowClock as persistShowClock,
  setShowHomeApps as persistShowHomeApps,
  setThemeMode as persistThemeMode,
  type FontFamily,
  type HomeAppSource,
  type ThemeMode,
} from '../native/LauncherModule';

export type {FontFamily, HomeAppSource, ThemeMode};

export type Preferences = {
  /** Follow the device, or override it in one direction. */
  themeMode: ThemeMode;
  /** How much wash sits between the wallpaper and the text, from 0 to 1. */
  scrimOpacity: number;
  /** The face the launcher draws its own text in. */
  fontFamily: FontFamily;
  /** What the launcher's own text sizes are multiplied by. */
  fontScale: number;
  /** Whether the home screen carries the clock and the date. */
  showClock: boolean;
  /** Whether the home screen lists apps at all before anything is typed. */
  showHomeApps: boolean;
  /** Where that list comes from: the apps last opened, or the ones picked. */
  homeAppSource: HomeAppSource;
  /** How many recents it lists, when the recents are what it lists. */
  homeRowCount: number;
  /** The apps picked by hand, in the order they were picked. */
  homeAppIds: string[];
  setThemeMode: (mode: ThemeMode) => void;
  setScrimOpacity: (value: number) => void;
  setFontFamily: (family: FontFamily) => void;
  setFontScale: (value: number) => void;
  setHomeRowCount: (value: number) => void;
  setShowClock: (value: boolean) => void;
  setShowHomeApps: (value: boolean) => void;
  setHomeAppSource: (source: HomeAppSource) => void;
  setHomeAppIds: (ids: string[]) => void;
};

/** What the launcher looks like before anyone has been to settings. */
const DEFAULTS: Preferences = {
  themeMode: 'system',
  scrimOpacity: 0,
  fontFamily: 'system',
  fontScale: 1,
  showClock: true,
  showHomeApps: true,
  homeAppSource: 'recent',
  homeRowCount: DEFAULT_HOME_ROW_COUNT,
  homeAppIds: [],
  setThemeMode: () => {},
  setScrimOpacity: () => {},
  setFontFamily: () => {},
  setFontScale: () => {},
  setHomeRowCount: () => {},
  setShowClock: () => {},
  setShowHomeApps: () => {},
  setHomeAppSource: () => {},
  setHomeAppIds: () => {},
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({children}: {children: ReactNode}) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const [scrimOpacity, setScrimOpacityState] =
    useState<number>(getScrimOpacity);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(getFontFamily);
  const [fontScale, setFontScaleState] = useState<number>(getFontScale);
  const [homeRowCount, setHomeRowCountState] =
    useState<number>(getHomeRowCount);
  const [showClock, setShowClockState] = useState<boolean>(getShowClock);
  const [showHomeApps, setShowHomeAppsState] =
    useState<boolean>(getShowHomeApps);
  const [homeAppSource, setHomeAppSourceState] =
    useState<HomeAppSource>(getHomeAppSource);
  const [homeAppIds, setHomeAppIdsState] = useState<string[]>(getHomeAppIds);

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

  const setHomeRowCount = useCallback((value: number) => {
    setHomeRowCountState(value);
    persistHomeRowCount(value);
  }, []);

  const setShowHomeApps = useCallback((value: boolean) => {
    setShowHomeAppsState(value);
    persistShowHomeApps(value);
  }, []);

  const setShowClock = useCallback((value: boolean) => {
    setShowClockState(value);
    persistShowClock(value);
  }, []);

  const setHomeAppSource = useCallback((source: HomeAppSource) => {
    setHomeAppSourceState(source);
    persistHomeAppSource(source);
  }, []);

  const setHomeAppIds = useCallback((ids: string[]) => {
    setHomeAppIdsState(ids);
    persistHomeAppIds(ids);
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      themeMode,
      scrimOpacity,
      fontFamily,
      fontScale,
      showClock,
      showHomeApps,
      homeAppSource,
      homeRowCount,
      homeAppIds,
      setThemeMode,
      setScrimOpacity,
      setFontFamily,
      setFontScale,
      setHomeRowCount,
      setShowClock,
      setShowHomeApps,
      setHomeAppSource,
      setHomeAppIds,
    }),
    [
      themeMode,
      scrimOpacity,
      fontFamily,
      fontScale,
      showClock,
      showHomeApps,
      homeAppSource,
      homeRowCount,
      homeAppIds,
      setThemeMode,
      setScrimOpacity,
      setFontFamily,
      setFontScale,
      setHomeRowCount,
      setShowClock,
      setShowHomeApps,
      setHomeAppSource,
      setHomeAppIds,
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
