/**
 * A rename moves the renamed app and nothing else: every other app keeps the
 * order the native collator gave it.
 */
// Only the pure function is under test; the hook's native calls never run.
jest.mock('../src/native/NativeLauncher', () => ({
  __esModule: true,
  default: {},
}));

import {applyNames} from '../src/hooks/useInstalledApps';
import type {AppInfo} from '../src/types/app';

const app = (name: string, packageName: string): AppInfo => ({
  id: `${packageName}/.Main`,
  name,
  label: name,
  packageName,
  activityName: '.Main',
  uninstallable: true,
});

// Native order, including two apps that share a label.
const APPS: AppInfo[] = [
  app('Calendar', 'com.a.calendar'),
  app('Camera', 'com.a.camera'),
  app('Camera', 'com.b.camera'),
  app('Chrome', 'com.android.chrome'),
  app('Zoom', 'us.zoom'),
];

const names = (apps: AppInfo[]) => apps.map(a => `${a.name}:${a.packageName}`);

describe('applyNames', () => {
  it('returns the native order untouched when nothing is renamed', () => {
    expect(applyNames(APPS, {})).toEqual(APPS);
  });

  it('moves only the renamed app, keeping the rest in native order', () => {
    const result = applyNames(APPS, {'us.zoom/.Main': 'Browser meetings'});
    expect(names(result)).toEqual([
      'Browser meetings:us.zoom',
      'Calendar:com.a.calendar',
      'Camera:com.a.camera',
      'Camera:com.b.camera',
      'Chrome:com.android.chrome',
    ]);
  });

  it('places a renamed app at the end when it sorts after everything', () => {
    const result = applyNames(APPS, {'com.a.calendar/.Main': 'Zzz'});
    expect(names(result).slice(-2)).toEqual([
      'Zoom:us.zoom',
      'Zzz:com.a.calendar',
    ]);
  });

  it('keeps the system label alongside the new name', () => {
    const [first] = applyNames(APPS, {'us.zoom/.Main': 'Aaa'});
    expect(first.name).toBe('Aaa');
    expect(first.label).toBe('Zoom');
  });
});
