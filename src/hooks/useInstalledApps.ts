import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {
  addAppsChangedListener,
  clearAppIconCache,
  getInstalledApps,
} from '../native/LauncherModule';
import {usePreferences} from '../preferences';
import {buildSearchIndex} from '../utils/appSearch';
import type {AppInfo, IndexedApp} from '../types/app';

const EMPTY: AppInfo[] = [];

/**
 * Survives unmounts so a returning launcher paints its list on the first frame
 * instead of flashing empty while the native call resolves.
 */
let warmCache: AppInfo[] | null = null;

export type InstalledApps = {
  /** Every app not hidden, under the user's names, in alphabetical order. */
  apps: AppInfo[];
  /** The apps the user hid, for settings to offer back. */
  hiddenApps: AppInfo[];
  /** Precomputed search keys; feed this to `searchApps`. */
  index: IndexedApp[];
  /** True only before the very first list arrives. */
  loading: boolean;
  error: Error | null;
  reload: () => void;
};

/** Cheap identity check so an unchanged refresh does not re-render the list. */
function sameApps(a: readonly AppInfo[], b: readonly AppInfo[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].name !== b[i].name ||
      a[i].uninstallable !== b[i].uninstallable
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Applies the user's names without disturbing the native order.
 *
 * Native sorts with the device's own collator, and only a renamed app has a
 * reason to move: the rest keep exactly the order they arrived in, and each
 * renamed one is slotted in before the first app whose name it precedes.
 */
export function applyNames(
  installed: readonly AppInfo[],
  names: Readonly<Record<string, string>>,
): AppInfo[] {
  const kept: AppInfo[] = [];
  const moved: AppInfo[] = [];
  for (const app of installed) {
    const name = names[app.id];
    if (name === undefined || name === app.name) {
      kept.push(app);
    } else {
      moved.push({...app, name});
    }
  }
  if (moved.length === 0) {
    return kept;
  }
  const precedes = (a: AppInfo, b: AppInfo) =>
    a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}) < 0;
  for (const app of moved) {
    const at = kept.findIndex(other => precedes(app, other));
    kept.splice(at === -1 ? kept.length : at, 0, app);
  }
  return kept;
}

const InstalledAppsContext = createContext<InstalledApps | null>(null);

/**
 * The installed-app list, held once for the whole app and kept current
 * without ever querying PackageManager on the render path. It refreshes when
 * the system reports a package change and when the launcher comes back to the
 * foreground.
 *
 * One provider rather than a hook per screen: settings and the app picker sit
 * on top of the launcher, and each copy would re-query PackageManager and
 * clear the icon cache on every package change.
 */
export function InstalledAppsProvider({children}: {children: ReactNode}) {
  const {
    hiddenAppIds,
    appNames,
    homeAppIds,
    setHiddenAppIds,
    setAppNames,
    setHomeAppIds,
  } = usePreferences();
  const [installed, setApps] = useState<AppInfo[]>(() => warmCache ?? EMPTY);
  const [loading, setLoading] = useState(warmCache === null);
  const [error, setError] = useState<Error | null>(null);

  const mounted = useRef(true);
  // Guards against an older in-flight query resolving after a newer one.
  const generation = useRef(0);

  const load = useCallback(async (forceRefresh: boolean) => {
    const token = ++generation.current;
    try {
      const next = await getInstalledApps(forceRefresh);
      if (!mounted.current || token !== generation.current) {
        return;
      }
      warmCache = next;
      setApps(previous => (sameApps(previous, next) ? previous : next));
      setError(null);
    } catch (cause) {
      if (!mounted.current || token !== generation.current) {
        return;
      }
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (mounted.current && token === generation.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // The native cache is already warm at this point, so this is near-instant.
    load(false);

    const packages = addAppsChangedListener(() => {
      // An updated app may have shipped a new icon under a new file.
      clearAppIconCache();
      load(true);
    });

    const appState = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') {
          load(true);
        }
      },
    );

    return () => {
      mounted.current = false;
      packages.remove();
      appState.remove();
    };
  }, [load]);

  /**
   * Forgets what was set for apps that are gone: an uninstalled app's name,
   * its hidden flag and its place on the home screen. Left behind, a hidden
   * app reinstalled months later would arrive invisible, and a dead home pick
   * would hold a slot nothing can show. Hidden apps leave the home list too.
   *
   * Only against a list that loaded: an empty one is a PackageManager that
   * failed, not a phone with nothing installed, and must not wipe anything.
   */
  useEffect(() => {
    if (loading || error !== null || installed.length === 0) {
      return;
    }
    const present = new Set(installed.map(app => app.id));
    const hidden = hiddenAppIds.filter(id => present.has(id));
    if (hidden.length !== hiddenAppIds.length) {
      setHiddenAppIds(hidden);
    }
    const hiddenSet = new Set(hidden);
    const home = homeAppIds.filter(id => present.has(id) && !hiddenSet.has(id));
    if (home.length !== homeAppIds.length) {
      setHomeAppIds(home);
    }
    const ids = Object.keys(appNames);
    if (ids.some(id => !present.has(id))) {
      const names: Record<string, string> = {};
      for (const id of ids) {
        if (present.has(id)) {
          names[id] = appNames[id];
        }
      }
      setAppNames(names);
    }
  }, [
    appNames,
    error,
    hiddenAppIds,
    homeAppIds,
    installed,
    loading,
    setAppNames,
    setHiddenAppIds,
    setHomeAppIds,
  ]);

  // The user's names replace the system's, and hidden apps leave the list —
  // and with it search, recents and the home screen, which are all built on it.
  const {apps, hiddenApps} = useMemo(() => {
    const hidden = new Set(hiddenAppIds);
    const named = applyNames(installed, appNames);
    return {
      apps: named.filter(app => !hidden.has(app.id)),
      hiddenApps: named.filter(app => hidden.has(app.id)),
    };
  }, [appNames, hiddenAppIds, installed]);

  const index = useMemo(() => buildSearchIndex(apps), [apps]);
  const reload = useCallback(() => {
    load(true);
  }, [load]);

  const value = useMemo<InstalledApps>(
    () => ({apps, hiddenApps, index, loading, error, reload}),
    [apps, hiddenApps, index, loading, error, reload],
  );

  return createElement(InstalledAppsContext.Provider, {value}, children);
}

/** What a list renders before any provider has anything to say. */
const NO_APPS: InstalledApps = {
  apps: EMPTY,
  hiddenApps: EMPTY,
  index: [],
  loading: false,
  error: null,
  reload: () => {},
};

/**
 * The installed apps, from the one {@link InstalledAppsProvider}.
 *
 * Outside a provider this reports an empty list, so a screen rendered on its
 * own — in a test, say — still renders.
 */
export function useInstalledApps(): InstalledApps {
  return useContext(InstalledAppsContext) ?? NO_APPS;
}
