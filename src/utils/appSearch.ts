/**
 * Name-only app search.
 *
 * Matching runs against app names and nothing else — not package names, not the
 * web, not device content. Keys are computed once per app list in
 * {@link buildSearchIndex}; {@link searchApps} is then a single linear pass and
 * runs comfortably inside a keystroke even with several hundred apps.
 */
import type {AppInfo, IndexedApp, SearchResult} from '../types/app';

/** Characters that separate words in an app name. */
const SEPARATORS = new Set([
  ' ',
  ' ',
  '-',
  '–',
  '_',
  '.',
  ',',
  ':',
  ';',
  '/',
  '\\',
  '&',
  '+',
  '(',
  ')',
  '[',
  ']',
  "'",
  '"',
]);

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const COMBINING_MARKS = /[̀-ͯ]/g;

const CAN_NORMALIZE = typeof String.prototype.normalize === 'function';

/**
 * Lowercases and strips diacritics **without changing length**, so an offset in
 * the folded string is also a valid offset in the original name and can be used
 * directly to highlight the match.
 */
export function fold(input: string): string {
  // Overwhelmingly the common case, and length-preserving by construction.
  if (PRINTABLE_ASCII.test(input)) {
    return input.toLowerCase();
  }

  let folded = '';
  for (const character of input) {
    let mapped = character.toLowerCase();
    if (CAN_NORMALIZE && mapped.length === 1) {
      const stripped = mapped.normalize('NFD').replace(COMBINING_MARKS, '');
      if (stripped.length === 1) {
        mapped = stripped;
      }
    }
    // Anything that would change the length (ligatures, some Turkish and Greek
    // forms, astral pairs) keeps its original character instead.
    folded += mapped.length === character.length ? mapped : character;
  }
  return folded;
}

/**
 * Word boundaries: the start of the name, anything after a separator, and
 * lower-to-upper transitions so "YouTube" yields both `y` and `t`.
 */
function findWordStarts(name: string, needle: string): number[] {
  const starts: number[] = [];
  let previousWasSeparator = true;

  for (let index = 0; index < name.length; index++) {
    const character = name[index];
    const isSeparator = SEPARATORS.has(character);

    if (isSeparator) {
      previousWasSeparator = true;
      continue;
    }

    const isCamelHump =
      index > 0 &&
      character !== needle[index] && // upper-case in the original
      name[index - 1] === needle[index - 1] && // preceded by lower-case
      !SEPARATORS.has(name[index - 1]);

    if (previousWasSeparator || isCamelHump) {
      starts.push(index);
    }
    previousWasSeparator = false;
  }

  return starts;
}

/** Prepares an app list for searching. Call once per list, not per keystroke. */
export function buildSearchIndex(apps: readonly AppInfo[]): IndexedApp[] {
  const index: IndexedApp[] = new Array(apps.length);
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    const needle = fold(app.name);
    const wordStarts = findWordStarts(app.name, needle);
    let initials = '';
    for (const start of wordStarts) {
      initials += needle[start];
    }
    index[i] = {app, needle, wordStarts, initials};
  }
  return index;
}

/**
 * Relevance bands. Results are grouped into these and concatenated, so within a
 * band the incoming order — locale-sorted alphabetical — is preserved.
 */
const TIER_EXACT = 0;
const TIER_PREFIX = 1;
const TIER_WORD_PREFIX = 2;
const TIER_INITIALS = 3;
const TIER_CONTAINS = 4;
const TIER_COUNT = 5;

/** Shortest query that may match on initials, to avoid noisy single-letter hits. */
const MIN_INITIALS_LENGTH = 2;

/**
 * Matches `query` against app names.
 *
 * Case-insensitive, partial, and diacritic-insensitive. An empty query returns
 * every app in its original alphabetical order.
 */
export function searchApps(
  index: readonly IndexedApp[],
  query: string,
): SearchResult[] {
  const needle = fold(query.trim());

  if (needle.length === 0) {
    return index.map(entry => ({app: entry.app, matchStart: -1, matchLength: 0}));
  }

  const tiers: SearchResult[][] = Array.from({length: TIER_COUNT}, () => []);

  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    const at = entry.needle.indexOf(needle);

    if (at === 0) {
      const tier = entry.needle.length === needle.length ? TIER_EXACT : TIER_PREFIX;
      tiers[tier].push({app: entry.app, matchStart: 0, matchLength: needle.length});
    } else if (at > 0 && entry.wordStarts.includes(at)) {
      // "tube" should find "YouTube" ahead of an incidental mid-word hit.
      tiers[TIER_WORD_PREFIX].push({
        app: entry.app,
        matchStart: at,
        matchLength: needle.length,
      });
    } else if (
      needle.length >= MIN_INITIALS_LENGTH &&
      entry.initials.startsWith(needle)
    ) {
      // "ytm" finds "YouTube Music"; the match has no single span to highlight.
      tiers[TIER_INITIALS].push({app: entry.app, matchStart: -1, matchLength: 0});
    } else if (at > 0) {
      tiers[TIER_CONTAINS].push({
        app: entry.app,
        matchStart: at,
        matchLength: needle.length,
      });
    }
  }

  const results: SearchResult[] = [];
  for (const tier of tiers) {
    for (const result of tier) {
      results.push(result);
    }
  }
  return results;
}
