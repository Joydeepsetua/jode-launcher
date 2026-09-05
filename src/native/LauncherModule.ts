/**
 * The app's only entry point to the native launcher bridge.
 *
 * Everything above this file works with {@link AppInfo}; nothing else in the app
 * touches `NativeModules` or the codegen spec directly.
 */
import type {EventSubscription} from 'react-native';
import NativeLauncher, {
  type NativeAppInfo,
  type NativeScreenTime,
} from './NativeLauncher';
import type {AppInfo} from '../types/app';

/** A package may expose more than one launcher activity, so identity is the pair. */
const identify = (packageName: string, activityName: string): string =>
  `${packageName}/${activityName}`;

const toAppInfo = (raw: NativeAppInfo): AppInfo => ({
  id: identify(raw.packageName, raw.activityName),
  name: raw.name,
  packageName: raw.packageName,
  activityName: raw.activityName,
});

/**
 * Launchable apps, newest known state first from the native cache.
 *
 * @param forceRefresh re-query PackageManager instead of using the native cache.
 */
export async function getInstalledApps(
  forceRefresh = false,
): Promise<AppInfo[]> {
  const raw = forceRefresh
    ? await NativeLauncher.refreshInstalledApps()
    : await NativeLauncher.getInstalledApps();
  return raw.map(toAppInfo);
}

/**
 * Launches an app. Resolves `false` when it could not be started — uninstalled,
 * disabled, or missing a launch intent — and never throws for those cases, so
 * callers can treat a failed launch as ordinary UI state.
 */
export async function launchApp(app: AppInfo): Promise<boolean> {
  try {
    return await NativeLauncher.launchApp(app.packageName, app.activityName);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[launcher] failed to launch ${app.id}`, error);
    }
    return false;
  }
}

/**
 * Ids of the apps most recently opened on the device, newest first — every way
 * an app can be opened, not just launches made from here.
 *
 * A failed read resolves empty rather than throwing: recents are a convenience,
 * and the launcher is still a search box without them.
 */
export async function getRecentAppIds(): Promise<string[]> {
  try {
    return await NativeLauncher.getRecentAppIds();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not read recent apps', error);
    }
    return [];
  }
}

/** Nothing to draw: what an unreadable or ungranted screen-time query returns. */
const NO_SCREEN_TIME: NativeScreenTime = {
  todayMs: 0,
  recordMs: 0,
  available: false,
};

/**
 * Today's screen time against the busiest day on record. `available` is false
 * when usage access is off, which is the caller's cue to show nothing at all
 * rather than an empty gauge.
 */
export async function getScreenTime(): Promise<NativeScreenTime> {
  try {
    return await NativeLauncher.getScreenTime();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not read screen time', error);
    }
    return NO_SCREEN_TIME;
  }
}

/**
 * Whether usage access has been granted. Device-wide recents need it; without
 * it {@link getRecentAppIds} reports this launcher's own launches instead.
 * Synchronous and cheap — it reads an app-op, not usage data.
 */
export function hasUsageAccess(): boolean {
  try {
    return NativeLauncher.hasUsageAccess();
  } catch {
    return false;
  }
}

/** Opens the system usage-access list. There is no runtime prompt to show. */
export function requestUsageAccess(): void {
  try {
    NativeLauncher.requestUsageAccess();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not open usage access settings', error);
    }
  }
}

/**
 * Whether first run is done. Assumes it is when the check fails, because the
 * failure that repeats a welcome screen on every Home press is the worse one.
 */
export function isSetupComplete(): boolean {
  try {
    return NativeLauncher.isSetupComplete();
  } catch {
    return true;
  }
}

/** Remembers that first run is done. Idempotent. */
export function completeSetup(): void {
  try {
    NativeLauncher.completeSetup();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist setup state', error);
    }
  }
}

/** The appearances the settings screen offers, and the stored value's domain. */
export type ThemeMode = 'system' | 'dark' | 'light';

const THEME_MODES: readonly ThemeMode[] = ['system', 'dark', 'light'];

/**
 * The stored appearance, or `system` when nothing has been chosen — and also
 * when the store holds something this build does not recognise, so a value
 * written by a later version cannot leave the launcher without a theme.
 */
export function getThemeMode(): ThemeMode {
  try {
    const stored = NativeLauncher.getThemeMode() as ThemeMode;
    return THEME_MODES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Remembers the chosen appearance. */
export function setThemeMode(mode: ThemeMode): void {
  try {
    NativeLauncher.setThemeMode(mode);
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the theme mode', error);
    }
  }
}

/**
 * The stored wash over the wallpaper, clamped to 0..1. Defaults to none: the
 * launcher shows the wallpaper as the user set it until they ask otherwise.
 */
export function getScrimOpacity(): number {
  try {
    const stored = NativeLauncher.getScrimOpacity();
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 0), 1) : 0;
  } catch {
    return 0;
  }
}

/** Remembers how much wash to lay over the wallpaper. */
export function setScrimOpacity(value: number): void {
  try {
    NativeLauncher.setScrimOpacity(Math.min(Math.max(value, 0), 1));
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the scrim opacity', error);
    }
  }
}

/** The faces the settings screen offers, and the stored value's domain. */
export type FontFamily = 'system' | 'serif' | 'mono' | 'condensed';

const FONT_FAMILIES: readonly FontFamily[] = [
  'system',
  'serif',
  'mono',
  'condensed',
];

/**
 * The stored face, or the device's own when nothing has been chosen — and also
 * when the store holds a name this build does not know, for the same reason
 * {@link getThemeMode} falls back: a value written by a later version must not
 * leave the launcher with no face at all.
 */
export function getFontFamily(): FontFamily {
  try {
    const stored = NativeLauncher.getFontFamily() as FontFamily;
    return FONT_FAMILIES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Remembers the chosen face. */
export function setFontFamily(family: FontFamily): void {
  try {
    NativeLauncher.setFontFamily(family);
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the font family', error);
    }
  }
}

/**
 * What the launcher's own text sizes are multiplied by, clamped to a range
 * either end of which is still a usable home screen. Defaults to 1: the sizes
 * the launcher was drawn at.
 */
export function getFontScale(): number {
  try {
    const stored = NativeLauncher.getFontScale();
    return Number.isFinite(stored) && stored > 0
      ? Math.min(Math.max(stored, MIN_FONT_SCALE), MAX_FONT_SCALE)
      : 1;
  } catch {
    return 1;
  }
}

/** Remembers how large to draw the launcher's own text. */
export function setFontScale(value: number): void {
  try {
    NativeLauncher.setFontScale(
      Math.min(Math.max(value, MIN_FONT_SCALE), MAX_FONT_SCALE),
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the font scale', error);
    }
  }
}

/**
 * The bounds of the scale, wider than the steps the settings screen offers so
 * that moving those steps later cannot strand a value someone already has.
 */
const MIN_FONT_SCALE = 0.5;
const MAX_FONT_SCALE = 2;

/**
 * The rows a home screen has before anyone has chosen a number: four recents,
 * enough to be worth reading and short enough to still be a clear screen.
 */
export const DEFAULT_HOME_ROW_COUNT = 4;

/**
 * The bounds of the count, again wider than the steps on offer. The floor is
 * one rather than zero: a home screen someone has set to no rows at all is
 * indistinguishable from one that has lost its recents, and the way to an
 * empty resting screen is to stop opening apps.
 */
export const MIN_HOME_ROW_COUNT = 1;
export const MAX_HOME_ROW_COUNT = 12;

/** A count as it has to be stored: a whole number of rows, inside the bounds. */
function clampRowCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_HOME_ROW_COUNT;
  }
  return Math.min(
    Math.max(Math.round(value), MIN_HOME_ROW_COUNT),
    MAX_HOME_ROW_COUNT,
  );
}

/**
 * How many apps the home screen lists before anything has been typed, or five
 * when nothing has been chosen — and also when the store holds something this
 * build cannot use, so a bad value leaves a short list rather than none.
 */
export function getHomeRowCount(): number {
  try {
    return clampRowCount(NativeLauncher.getHomeRowCount());
  } catch {
    return DEFAULT_HOME_ROW_COUNT;
  }
}

/** Remembers how many apps the home screen should list. */
export function setHomeRowCount(value: number): void {
  try {
    NativeLauncher.setHomeRowCount(clampRowCount(value));
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the home row count', error);
    }
  }
}

/**
 * Whether the home screen lists apps at all, or waits with nothing but the
 * clock. On unless it has been turned off — and on again if the store cannot
 * be read, because a launcher that silently shows no apps looks broken in a way
 * one that shows them never does.
 */
export function getShowHomeApps(): boolean {
  try {
    return NativeLauncher.getShowHomeApps();
  } catch {
    return true;
  }
}

/** Remembers whether the home screen lists apps. */
export function setShowHomeApps(value: boolean): void {
  try {
    NativeLauncher.setShowHomeApps(value);
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the home apps toggle', error);
    }
  }
}

/**
 * Whether the home screen carries the clock and the date. On unless it has
 * been turned off, and on again when the store cannot be read — for the same
 * reason the app list is: a launcher missing the things it is meant to show
 * reads as broken rather than as configured.
 */
export function getShowClock(): boolean {
  try {
    return NativeLauncher.getShowClock();
  } catch {
    return true;
  }
}

/** Remembers whether the home screen carries the clock. */
export function setShowClock(value: boolean): void {
  try {
    NativeLauncher.setShowClock(value);
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the clock toggle', error);
    }
  }
}

/** Where the home screen's list comes from, and the stored value's domain. */
export type HomeAppSource = 'recent' | 'chosen';

const HOME_APP_SOURCES: readonly HomeAppSource[] = ['recent', 'chosen'];

/**
 * The stored source, or the recents when nothing has been chosen — and also
 * when the store holds a name this build does not know, for the same reason
 * {@link getThemeMode} falls back.
 */
export function getHomeAppSource(): HomeAppSource {
  try {
    const stored = NativeLauncher.getHomeAppSource() as HomeAppSource;
    return HOME_APP_SOURCES.includes(stored) ? stored : 'recent';
  } catch {
    return 'recent';
  }
}

/** Remembers where the home screen's list comes from. */
export function setHomeAppSource(source: HomeAppSource): void {
  try {
    NativeLauncher.setHomeAppSource(source);
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the home app source', error);
    }
  }
}

/**
 * How many apps the home screen can be pinned with.
 *
 * A ceiling for the same reason the recents count has one, and a lower one:
 * the resting screen does not scroll, so a list longer than the screen is a
 * list with rows nobody can reach. Eight rows still clear the fold on a small
 * phone at the largest text size the launcher offers.
 */
export const MAX_HOME_APPS = 8;

/** The separator the ids are stored under. An id can never contain one. */
const ID_SEPARATOR = '\n';

/**
 * The apps the user picked for the home screen, in the order they picked them.
 *
 * Empty is a legitimate answer — nothing chosen yet — and so is what an
 * unreadable store returns, because a home screen that lists nothing is at
 * worst a screen the user has to visit settings to fill.
 */
export function getHomeAppIds(): string[] {
  try {
    return NativeLauncher.getHomeAppIds()
      .split(ID_SEPARATOR)
      .filter(id => id.length > 0)
      .slice(0, MAX_HOME_APPS);
  } catch {
    return [];
  }
}

/** Remembers the chosen apps, in the given order. */
export function setHomeAppIds(ids: readonly string[]): void {
  try {
    NativeLauncher.setHomeAppIds(
      ids.slice(0, MAX_HOME_APPS).join(ID_SEPARATOR),
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not persist the chosen home apps', error);
    }
  }
}

/**
 * Whether double tap to lock is available — that is, whether the user has
 * granted the device-admin lock policy. Synchronous and cheap.
 */
export function canLockScreen(): boolean {
  try {
    return NativeLauncher.canLockScreen();
  } catch {
    return false;
  }
}

/**
 * Turns the display off, reporting `false` when the policy is missing or has
 * been revoked — the caller then has something to say rather than a gesture
 * that silently does nothing.
 */
export function lockScreen(): boolean {
  try {
    return NativeLauncher.lockScreen();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not lock the screen', error);
    }
    return false;
  }
}

/** Opens the system device-admin screen where the lock policy is granted. */
export function requestLockScreenPermission(): void {
  try {
    NativeLauncher.requestLockScreenPermission();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not open the device admin request', error);
    }
  }
}

/** Whether this app is the system default Home app. Synchronous and cheap. */
export function isDefaultLauncher(): boolean {
  try {
    return NativeLauncher.isDefaultLauncher();
  } catch {
    return false;
  }
}

/** Opens the platform "choose a home app" flow. */
export function requestDefaultLauncher(): void {
  try {
    NativeLauncher.requestDefaultLauncher();
  } catch (error) {
    if (__DEV__) {
      console.warn('[launcher] could not open home app settings', error);
    }
  }
}

/** Fires when a package is installed, replaced or removed. */
export function addAppsChangedListener(
  listener: () => void,
): EventSubscription {
  return NativeLauncher.onAppsChanged(listener);
}

/** Fires when HOME is pressed while the launcher is already in the foreground. */
export function addHomePressedListener(
  listener: () => void,
): EventSubscription {
  return NativeLauncher.onHomePressed(listener);
}
