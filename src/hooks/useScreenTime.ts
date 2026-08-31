import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {getScreenTime} from '../native/LauncherModule';
import type {NativeScreenTime} from '../native/NativeLauncher';

const NONE: NativeScreenTime = {todayMs: 0, recordMs: 0, available: false};

/** Survives unmounts, so the ring is drawn on the first frame rather than filled in. */
let warm: NativeScreenTime | null = null;

/**
 * Today's screen time and the day it is measured against.
 *
 * Read once on mount and again whenever the launcher comes back to the
 * foreground — which is exactly when the number has changed, because the time
 * that passed was spent in another app. It deliberately does not tick while the
 * launcher is on screen: the reading would creep up by a minute at a time and
 * turn an ambient mark into something that asks to be watched.
 */
export function useScreenTime(): NativeScreenTime {
  const [screenTime, setScreenTime] = useState<NativeScreenTime>(
    () => warm ?? NONE,
  );
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const next = await getScreenTime();
    if (!mounted.current) {
      return;
    }
    warm = next;
    setScreenTime(previous =>
      previous.todayMs === next.todayMs &&
      previous.recordMs === next.recordMs &&
      previous.available === next.available
        ? previous
        : next,
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();

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

  return screenTime;
}
