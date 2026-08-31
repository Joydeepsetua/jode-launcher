import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {getRecentAppIds, hasUsageAccess} from '../native/LauncherModule';
import type {AppInfo} from '../types/app';

/** How many rows the launcher shows before anything has been typed. */
export const DEFAULT_ROW_COUNT = 5;

const NO_IDS: string[] = [];

/**
 * Survives unmounts for the same reason the app list does: recents are the
 * first thing on screen, and they should be there on the first frame.
 */
let warmIds: string[] | null = null;

export type RecentApps = {
  /** Up to {@link DEFAULT_ROW_COUNT} apps, most recently opened first. */
  apps: AppInfo[];
  /**
   * False while the order is only this launcher's own launches, because the
   * user has not granted usage access. The screen offers the way to fix it.
   */
  usageAccess: boolean;
};

/**
 * The default list: the apps most recently opened **on the device**, newest
 * first, in exactly the order the system reports them.
 *
 * Nothing is added to pad the list out and nothing is reordered. The only
 * entries dropped are the ones that could not be a row in the first place — an
 * app uninstalled since it was last opened, or a package with no launchable
 * activity at all, like system UI and background services.
 */
export function useRecentApps(apps: readonly AppInfo[]): RecentApps {
  const [ids, setIds] = useState<string[]>(() => warmIds ?? NO_IDS);
  const [usageAccess, setUsageAccess] = useState<boolean>(hasUsageAccess);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    // Read first: granting access in Settings brings us back to the foreground,
    // and this is the moment the answer changes.
    const granted = hasUsageAccess();
    const next = await getRecentAppIds();
    if (!mounted.current) {
      return;
    }
    warmIds = next;
    setUsageAccess(granted);
    setIds(previous =>
      previous.length === next.length && previous.every((id, i) => id === next[i])
        ? previous
        : next,
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();

    // Returning to the launcher is exactly the moment the order has changed:
    // the app the user just came back from is now the most recent one.
    const appState = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') {
          load();
        }
      },
    );

    return () => {
      mounted.current = false;
      appState.remove();
    };
  }, [load]);

  const resolved = useMemo(() => {
    const byId = new Map(apps.map(app => [app.id, app]));
    const chosen: AppInfo[] = [];

    for (const id of ids) {
      if (chosen.length === DEFAULT_ROW_COUNT) {
        break;
      }
      const app = byId.get(id);
      if (app !== undefined) {
        chosen.push(app);
      }
    }

    return chosen;
  }, [apps, ids]);

  return useMemo(
    () => ({apps: resolved, usageAccess}),
    [resolved, usageAccess],
  );
}
