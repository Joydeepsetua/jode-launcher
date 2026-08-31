import {useCallback, useEffect, useState} from 'react';
import {
  completeSetup,
  hasUsageAccess,
  isDefaultLauncher,
  isSetupComplete,
} from '../native/LauncherModule';

export type Setup = {
  /** True only on a first run that still has something to ask for. */
  needsSetup: boolean;
  /** Ends first run for good, whether the steps were taken or skipped. */
  finish: () => void;
};

/**
 * Whether to show the welcome screen.
 *
 * Read synchronously so the very first frame is either the welcome or the
 * launcher, never one and then the other — a home screen that flashes a
 * different screen on the way in feels broken no matter how briefly it does it.
 *
 * A run with nothing left to ask for is not a first run: someone who already
 * granted both, or who is reinstalling over an existing grant, goes straight to
 * the launcher and never sees the welcome at all.
 */
export function useSetup(): Setup {
  const [complete, setComplete] = useState(
    () => isSetupComplete() || (hasUsageAccess() && isDefaultLauncher()),
  );

  useEffect(() => {
    // Includes the nothing-to-ask case, so a later change of mind about the
    // home app cannot resurrect a first-run flow.
    if (complete) {
      completeSetup();
    }
  }, [complete]);

  const finish = useCallback(() => {
    setComplete(true);
  }, []);

  return {needsSetup: !complete, finish};
}
