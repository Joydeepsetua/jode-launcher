/**
 * The search engine is the product, so it is tested against a realistic drawer
 * rather than a handful of names.
 */
import {buildSearchIndex, fold, searchApps} from '../src/utils/appSearch';
import type {AppInfo} from '../src/types/app';

const app = (name: string, packageName: string): AppInfo => ({
  id: `${packageName}/${packageName}.Main`,
  name,
  packageName,
  activityName: `${packageName}.Main`,
});

/** 24 entries, alphabetical, as the native side delivers them. */
const APPS: AppInfo[] = [
  app('Calculator', 'com.android.calculator2'),
  app('Calendar', 'com.google.android.calendar'),
  app('Camera', 'com.android.camera'),
  app('Chrome', 'com.android.chrome'),
  app('Clock', 'com.android.deskclock'),
  app('Contacts', 'com.android.contacts'),
  app('Drive', 'com.google.android.apps.docs'),
  app('Files', 'com.android.documentsui'),
  app('Gmail', 'com.google.android.gm'),
  app('Google Maps', 'com.google.android.apps.maps'),
  app('Instagram', 'com.instagram.android'),
  app('Messages', 'com.google.android.apps.messaging'),
  app('Phone', 'com.android.dialer'),
  app('Photos', 'com.google.android.apps.photos'),
  app('Play Store', 'com.android.vending'),
  app('Settings', 'com.android.settings'),
  app('Signal', 'org.thoughtcrime.securesms'),
  app('Slack', 'com.Slack'),
  app('Spotify', 'com.spotify.music'),
  app('Telegram', 'org.telegram.messenger'),
  app('WhatsApp', 'com.whatsapp'),
  app('YouTube', 'com.google.android.youtube'),
  app('YouTube Music', 'com.google.android.apps.youtube.music'),
  app('Zoom', 'us.zoom.videomeetings'),
];

const index = buildSearchIndex(APPS);
const names = (query: string): string[] =>
  searchApps(index, query).map(result => result.app.name);

describe('searchApps', () => {
  it('covers a realistic drawer of 20+ apps', () => {
    expect(APPS.length).toBeGreaterThanOrEqual(20);
    expect(names('')).toHaveLength(APPS.length);
  });

  it('returns every app alphabetically for an empty query', () => {
    const all = names('');
    expect(all[0]).toBe('Calculator');
    expect(all[all.length - 1]).toBe('Zoom');
    expect([...all]).toEqual([...all].sort((a, b) => a.localeCompare(b)));
  });

  it('treats whitespace-only input as an empty query', () => {
    expect(names('   ')).toHaveLength(APPS.length);
  });

  it('matches the documented example: "you"', () => {
    expect(names('you')).toEqual(['YouTube', 'YouTube Music']);
  });

  it('matches the documented example: "wh"', () => {
    expect(names('wh')).toEqual(['WhatsApp']);
  });

  it('is case-insensitive', () => {
    expect(names('WHATSAPP')).toEqual(['WhatsApp']);
    expect(names('wHaTs')).toEqual(['WhatsApp']);
  });

  it('matches partial names', () => {
    expect(names('cal')).toEqual(['Calculator', 'Calendar']);
  });

  it('ranks a whole-name prefix above a mid-word hit', () => {
    // "Signal" starts with it; "Settings" and "Messages" only contain it.
    const results = names('s');
    expect(results.indexOf('Settings')).toBeLessThan(results.indexOf('Messages'));
  });

  it('ranks an exact name first', () => {
    expect(names('clock')[0]).toBe('Clock');
  });

  it('matches a later word by its own prefix', () => {
    expect(names('maps')).toEqual(['Google Maps']);
    expect(names('store')).toEqual(['Play Store']);
  });

  it('matches initials, including camel case', () => {
    expect(names('ytm')).toEqual(['YouTube Music']);
    // "wa" appears nowhere inside "whatsapp", so this can only be the initials
    // of WhatsApp.
    expect(names('wa')).toEqual(['WhatsApp']);
  });

  it('ignores single-letter initials so results stay meaningful', () => {
    // A lone "g" should not drag in every app whose first word starts with g
    // via the initials path ahead of real prefix matches.
    expect(names('g')[0]).toBe('Gmail');
  });

  it('falls back to a substring match anywhere in the name', () => {
    expect(names('gram')).toEqual(['Instagram', 'Telegram']);
  });

  it('returns nothing for a query that matches no name', () => {
    expect(names('qqqq')).toEqual([]);
  });

  it('never matches package names', () => {
    // Nothing is called "vending" or "thoughtcrime", but those packages exist.
    expect(names('vending')).toEqual([]);
    expect(names('thoughtcrime')).toEqual([]);
    expect(names('com.')).toEqual([]);
  });

  it('reports the matched span so the UI can highlight it', () => {
    const [hit] = searchApps(index, 'tube');
    expect(hit.app.name).toBe('YouTube');
    expect(hit.app.name.slice(hit.matchStart, hit.matchStart + hit.matchLength)).toBe(
      'Tube',
    );
  });

  it('reports no span for an initials match', () => {
    const [hit] = searchApps(index, 'ytm');
    expect(hit.matchStart).toBe(-1);
    expect(hit.matchLength).toBe(0);
  });
});

describe('searchApps with awkward names', () => {
  const awkward = buildSearchIndex([
    app(
      'Super Long Application Name That Overflows Every Reasonable Row Width',
      'com.example.verylong',
    ),
    app('Café Réservation', 'com.example.cafe'),
    app('7-Zip', 'com.example.sevenzip'),
    app('  Padded Name  ', 'com.example.padded'),
    app('', 'com.example.unnamed'),
    app('日本語アプリ', 'com.example.jp'),
  ]);

  it('matches a long name without truncating the query', () => {
    const [hit] = searchApps(awkward, 'overflows');
    expect(hit.app.packageName).toBe('com.example.verylong');
    expect(
      hit.app.name.slice(hit.matchStart, hit.matchStart + hit.matchLength),
    ).toBe('Overflows');
  });

  it('folds diacritics in both the name and the query', () => {
    expect(searchApps(awkward, 'cafe')).toHaveLength(1);
    expect(searchApps(awkward, 'café')).toHaveLength(1);
    expect(searchApps(awkward, 'reservation')).toHaveLength(1);
  });

  it('keeps highlight offsets valid across folded characters', () => {
    const [hit] = searchApps(awkward, 'reservation');
    expect(
      hit.app.name.slice(hit.matchStart, hit.matchStart + hit.matchLength),
    ).toBe('Réservation');
  });

  it('handles digits and punctuation in names', () => {
    expect(searchApps(awkward, '7-z')).toHaveLength(1);
    expect(searchApps(awkward, 'zip')).toHaveLength(1);
  });

  it('does not crash on an empty or non-latin name', () => {
    expect(() => searchApps(awkward, 'a')).not.toThrow();
    expect(searchApps(awkward, '日本')).toHaveLength(1);
  });

  it('scores a padded name on its visible text', () => {
    expect(searchApps(awkward, 'padded')).toHaveLength(1);
  });
});

describe('fold', () => {
  it('preserves length so match offsets stay usable', () => {
    for (const sample of ['Café', 'ÅNGSTRÖM', 'YouTube', '日本語', 'Ω mega']) {
      expect(fold(sample)).toHaveLength(sample.length);
    }
  });
});

describe('performance', () => {
  it('searches a large drawer well inside a keystroke', () => {
    const many: AppInfo[] = [];
    for (let i = 0; i < 1000; i++) {
      many.push(app(`Application ${i}`, `com.example.app${i}`));
    }
    const large = buildSearchIndex(many);

    const started = Date.now();
    for (const query of ['a', 'ap', 'app', 'appl', 'appli']) {
      searchApps(large, query);
    }
    // Generous for CI; the real figure is well under a millisecond per query.
    expect(Date.now() - started).toBeLessThan(250);
  });
});
