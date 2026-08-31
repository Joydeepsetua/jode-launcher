import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {addAppsChangedListener, getInstalledApps} from '../native/LauncherModule';
import {buildSearchIndex} from '../utils/appSearch';
import type {AppInfo, IndexedApp} from '../types/app';

const EMPTY: AppInfo[] = [];

/**
 * Survives unmounts so a returning launcher paints its list on the first frame
 * instead of flashing empty while the native call resolves.
 */
let warmCache: AppInfo[] | null = null;

export type InstalledApps = {
  apps: AppInfo[];
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
    if (a[i].id !== b[i].id || a[i].name !== b[i].name) {
      return false;
    }
  }
  return true;
}

/**
 * The installed-app list, kept current without ever querying PackageManager on
 * the render path. It refreshes when the system reports a package change and
 * when the launcher comes back to the foreground.
 */
export function useInstalledApps(): InstalledApps {
  const [apps, setApps] = useState<AppInfo[]>(() => warmCache ?? EMPTY);
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

  const index = useMemo(() => buildSearchIndex(apps), [apps]);
  const reload = useCallback(() => {
    load(true);
  }, [load]);

  return {apps, index, loading, error, reload};
}
