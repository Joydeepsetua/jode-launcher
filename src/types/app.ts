/** A single launchable entry in the app list. */
export type AppInfo = {
  /** Stable identity: `packageName/activityName`. An app may expose several. */
  id: string;
  /** User-visible label. */
  name: string;
  packageName: string;
  activityName: string;
};

/**
 * An {@link AppInfo} with its match keys precomputed, so that a keystroke costs
 * a scan over prepared primitives instead of re-deriving them per app.
 */
export type IndexedApp = {
  app: AppInfo;
  /** Case- and diacritic-folded name. Always the same length as `app.name`. */
  needle: string;
  /** Offsets in `needle` where a word begins, including 0. */
  wordStarts: readonly number[];
  /** First letter of every word, e.g. `ytm` for "YouTube Music". */
  initials: string;
};

/** A search hit and the span of `app.name` that matched, for highlighting. */
export type SearchResult = {
  app: AppInfo;
  /** Start offset into `app.name`, or -1 when there is no single span. */
  matchStart: number;
  matchLength: number;
};
