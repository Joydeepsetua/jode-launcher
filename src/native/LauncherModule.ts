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
