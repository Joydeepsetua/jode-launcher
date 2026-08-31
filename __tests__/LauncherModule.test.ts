/**
 * The wrapper is the layer that decides which native failures are user-visible
 * state and which are real errors, so those decisions are pinned down here.
 */
import type {AppInfo} from '../src/types/app';

// Defined inside the factory: babel hoists every `import` above module-level
// `const`s, so a mock built outside would not exist yet when the module under
// test is first required.
jest.mock('../src/native/NativeLauncher', () => ({
  __esModule: true,
  default: {
    getInstalledApps: jest.fn(),
    refreshInstalledApps: jest.fn(),
    launchApp: jest.fn(),
    getRecentAppIds: jest.fn(),
    getScreenTime: jest.fn(),
    hasUsageAccess: jest.fn(),
    canLockScreen: jest.fn(),
    lockScreen: jest.fn(),
    requestLockScreenPermission: jest.fn(),
    isSetupComplete: jest.fn(),
    completeSetup: jest.fn(),
    requestUsageAccess: jest.fn(),
    isDefaultLauncher: jest.fn(),
    requestDefaultLauncher: jest.fn(),
    onAppsChanged: jest.fn(),
    onHomePressed: jest.fn(),
  },
}));

import NativeLauncher from '../src/native/NativeLauncher';
import {
  canLockScreen,
  getInstalledApps,
  getRecentAppIds,
  getScreenTime,
  hasUsageAccess,
  isDefaultLauncher,
  isSetupComplete,
  launchApp,
  lockScreen,
  requestDefaultLauncher,
} from '../src/native/LauncherModule';

const mockNative = NativeLauncher as unknown as {
  [K in keyof typeof NativeLauncher]: jest.Mock;
};

const CHROME: AppInfo = {
  id: 'com.android.chrome/com.google.android.apps.chrome.Main',
  name: 'Chrome',
  packageName: 'com.android.chrome',
  activityName: 'com.google.android.apps.chrome.Main',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getInstalledApps', () => {
  it('gives every app a stable id built from package and activity', async () => {
    mockNative.getInstalledApps.mockResolvedValue([
      {
        packageName: 'com.android.chrome',
        activityName: 'com.google.android.apps.chrome.Main',
        name: 'Chrome',
      },
    ]);

    await expect(getInstalledApps()).resolves.toEqual([CHROME]);
  });

  it('keeps two launcher activities of one package apart', async () => {
    mockNative.getInstalledApps.mockResolvedValue([
      {packageName: 'com.example', activityName: '.One', name: 'Alpha'},
      {packageName: 'com.example', activityName: '.Two', name: 'Beta'},
    ]);

    const apps = await getInstalledApps();
    expect(apps.map(a => a.id)).toEqual(['com.example/.One', 'com.example/.Two']);
  });

  it('uses the refresh path only when asked', async () => {
    mockNative.getInstalledApps.mockResolvedValue([]);
    mockNative.refreshInstalledApps.mockResolvedValue([]);

    await getInstalledApps();
    expect(mockNative.refreshInstalledApps).not.toHaveBeenCalled();

    await getInstalledApps(true);
    expect(mockNative.refreshInstalledApps).toHaveBeenCalledTimes(1);
  });

  it('propagates a PackageManager failure so the UI can show it', async () => {
    mockNative.getInstalledApps.mockRejectedValue(new Error('binder died'));
    await expect(getInstalledApps()).rejects.toThrow('binder died');
  });
});

describe('launchApp', () => {
  it('resolves true when the app starts', async () => {
    mockNative.launchApp.mockResolvedValue(true);
    await expect(launchApp(CHROME)).resolves.toBe(true);
    expect(mockNative.launchApp).toHaveBeenCalledWith(
      CHROME.packageName,
      CHROME.activityName,
    );
  });

  it('resolves false when the app has no usable launch intent', async () => {
    mockNative.launchApp.mockResolvedValue(false);
    await expect(launchApp(CHROME)).resolves.toBe(false);
  });

  it('never throws when the native call rejects', async () => {
    mockNative.launchApp.mockRejectedValue(new Error('activity not found'));
    await expect(launchApp(CHROME)).resolves.toBe(false);
  });
});

describe('getRecentAppIds', () => {
  it('passes the native order through untouched', async () => {
    mockNative.getRecentAppIds.mockResolvedValue([CHROME.id, 'com.example/.Main']);
    await expect(getRecentAppIds()).resolves.toEqual([
      CHROME.id,
      'com.example/.Main',
    ]);
  });

  it('returns nothing rather than throwing when the store is unreadable', async () => {
    // The wrapper logs this in dev; the warning is expected, not a test failure.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNative.getRecentAppIds.mockRejectedValue(new Error('prefs unavailable'));

    await expect(getRecentAppIds()).resolves.toEqual([]);

    warn.mockRestore();
  });
});

describe('getScreenTime', () => {
  it('passes the reading through', async () => {
    const reading = {todayMs: 5_400_000, recordMs: 21_600_000, available: true};
    mockNative.getScreenTime.mockResolvedValue(reading);
    await expect(getScreenTime()).resolves.toEqual(reading);
  });

  it('reports nothing to draw when the query fails', async () => {
    // The wrapper logs this in dev; the warning is expected, not a test failure.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNative.getScreenTime.mockRejectedValue(new Error('access revoked'));

    await expect(getScreenTime()).resolves.toEqual({
      todayMs: 0,
      recordMs: 0,
      available: false,
    });

    warn.mockRestore();
  });
});

describe('screen lock', () => {
  it('reports whether the lock policy is held', () => {
    mockNative.canLockScreen.mockReturnValue(true);
    expect(canLockScreen()).toBe(true);
  });

  it('reports false when the policy was revoked', () => {
    // The caller shows the way to grant it again rather than a dead gesture.
    mockNative.lockScreen.mockReturnValue(false);
    expect(lockScreen()).toBe(false);
  });

  it('never throws out of a gesture handler', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNative.lockScreen.mockImplementation(() => {
      throw new Error('no device policy manager');
    });

    expect(lockScreen()).toBe(false);

    warn.mockRestore();
  });
});

describe('usage access', () => {
  it('reports the current grant', () => {
    mockNative.hasUsageAccess.mockReturnValue(true);
    expect(hasUsageAccess()).toBe(true);
  });

  it('assumes "not granted" if the check itself fails', () => {
    mockNative.hasUsageAccess.mockImplementation(() => {
      throw new Error('no app ops service');
    });
    expect(hasUsageAccess()).toBe(false);
  });
});

describe('isSetupComplete', () => {
  it('reports the stored answer', () => {
    mockNative.isSetupComplete.mockReturnValue(false);
    expect(isSetupComplete()).toBe(false);
  });

  it('assumes first run is done if the check itself fails', () => {
    // Repeating the welcome screen on every Home press is the worse failure.
    mockNative.isSetupComplete.mockImplementation(() => {
      throw new Error('no preferences');
    });
    expect(isSetupComplete()).toBe(true);
  });
});

describe('default launcher helpers', () => {
  it('reports the current default', () => {
    mockNative.isDefaultLauncher.mockReturnValue(true);
    expect(isDefaultLauncher()).toBe(true);
  });

  it('assumes "not default" if the check itself fails', () => {
    mockNative.isDefaultLauncher.mockImplementation(() => {
      throw new Error('no package manager');
    });
    expect(isDefaultLauncher()).toBe(false);
  });

  it('does not throw when the settings screen cannot be opened', () => {
    // The wrapper logs this in dev; the warning is expected, not a test failure.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockNative.requestDefaultLauncher.mockImplementation(() => {
      throw new Error('no activity');
    });

    expect(() => requestDefaultLauncher()).not.toThrow();

    warn.mockRestore();
  });
});
