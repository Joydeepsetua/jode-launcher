/**
 * TurboModule spec for the native Android launcher bridge.
 *
 * This file is consumed by React Native Codegen at build time; it generates the
 * abstract Kotlin/Java spec (`NativeLauncherSpec`) that `LauncherModule.kt`
 * implements. Nothing in the app should import this module directly — use the
 * typed wrapper in `src/native/LauncherModule.ts` instead.
 */
import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';
import type {EventEmitter} from 'react-native/Libraries/Types/CodegenTypes';

/** Raw shape returned by the native side. One entry per launchable activity. */
export type NativeAppInfo = {
  /** Owning package, e.g. `com.android.chrome`. */
  packageName: string;
  /** Fully qualified launcher activity, e.g. `com.google.android.apps.chrome.Main`. */
  activityName: string;
  /** User-visible label resolved through PackageManager. */
  name: string;
};

/** Today's usage against the busiest day on record, both in milliseconds. */
export type NativeScreenTime = {
  todayMs: number;
  recordMs: number;
  /** False when usage access is off; the other two are then meaningless. */
  available: boolean;
};

export interface Spec extends TurboModule {
  /**
   * Launchable apps, served from the native in-memory cache when warm.
   * Sorted with a locale-aware collator on the native side.
   */
  getInstalledApps(): Promise<NativeAppInfo[]>;

  /** Drops the native cache and re-queries PackageManager. */
  refreshInstalledApps(): Promise<NativeAppInfo[]>;

  /**
   * Starts the given launcher activity. Resolves `false` when the app is no
   * longer installed or exposes no usable launch intent; rejects only on
   * unexpected platform failures.
   */
  launchApp(packageName: string, activityName: string): Promise<boolean>;

  /**
   * The apps most recently opened on the device, newest first, as
   * `packageName/activityName` strings — the same identity `LauncherModule.ts`
   * builds. Read from `UsageStatsManager` when usage access has been granted,
   * and from this launcher's own launch history when it has not.
   */
  getRecentAppIds(): Promise<string[]>;

  /**
   * How long the phone has been used today, and the most any day has reached.
   * Accumulated from the same usage events the recents order comes from.
   */
  getScreenTime(): Promise<NativeScreenTime>;

  /** Whether the user has granted usage access, which device-wide recents need. */
  hasUsageAccess(): boolean;

  /** Opens the system usage-access list. There is no runtime prompt for it. */
  requestUsageAccess(): void;

  /**
   * Whether the user has been through first run. Records only that they were
   * asked, not what they answered — both steps are skippable.
   */
  isSetupComplete(): boolean;

  /** Remembers that first run is done, so it never runs again. */
  completeSetup(): void;

  /**
   * The appearance the user chose on the settings screen: `system`, `dark` or
   * `light`. Synchronous, because the first frame has to be the chosen one.
   */
  getThemeMode(): string;

  setThemeMode(mode: string): void;

  /** How much wash sits over the wallpaper, from 0 (none) to 1 (opaque). */
  getScrimOpacity(): number;

  setScrimOpacity(value: number): void;

  /**
   * The face the launcher draws its own text in: `system`, `serif`, `mono` or
   * `condensed`. Synchronous for the same reason the theme is — the first frame
   * has to be the one the user chose.
   */
  getFontFamily(): string;

  setFontFamily(family: string): void;

  /** What the launcher's own text sizes are multiplied by. 1 draws them as designed. */
  getFontScale(): number;

  setFontScale(value: number): void;

  /**
   * Whether the app currently holds the device-admin `force-lock` policy, which
   * is the only way Android lets an app turn the display off.
   */
  canLockScreen(): boolean;

  /** Turns the display off. False when the policy is not held. */
  lockScreen(): boolean;

  /** Opens the system's device-admin request for the lock policy. */
  requestLockScreenPermission(): void;

  /** Whether this app is currently the system default Home app. */
  isDefaultLauncher(): boolean;

  /** Opens the platform UI for choosing the default Home app. */
  requestDefaultLauncher(): void;

  /** Fires when packages are installed, replaced or removed. */
  readonly onAppsChanged: EventEmitter<void>;

  /** Fires when HOME is pressed while the launcher is already in the foreground. */
  readonly onHomePressed: EventEmitter<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Launcher');
