import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
} from 'react-native';
import {AppState} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppListItem} from '../components/AppListItem';
import {Clock} from '../components/Clock';
import {ScreenTimeRing} from '../components/ScreenTimeRing';
import {SearchInput, type SearchInputHandle} from '../components/SearchInput';
import {useInstalledApps} from '../hooks/useInstalledApps';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {useRecentApps} from '../hooks/useRecentApps';
import {
  addHomePressedListener,
  isDefaultLauncher,
  launchApp,
  lockScreen,
  requestDefaultLauncher,
  requestLockScreenPermission,
  requestUsageAccess,
} from '../native/LauncherModule';
import type {RootStackParamList} from '../navigation/types';
import {usePreferences} from '../preferences';
import {useTheme} from '../theme';
import type {AppInfo, SearchResult} from '../types/app';
import {searchApps} from '../utils/appSearch';

/** How long a transient failure message stays on screen. */
const NOTICE_DURATION_MS = 2_600;

/** Two taps on empty space closer together than this are one gesture. */
const DOUBLE_TAP_MS = 280;

/** How far up the finger must travel, in dp, before it counts as a swipe. */
const SWIPE_UP_MIN_DY = 44;

/** Movement under this, in dp, is a finger that meant to stay still. */
const TAP_SLOP = 12;

/**
 * How long a still finger on the wallpaper waits before settings open.
 *
 * The same hold Android has meant "this screen's own settings" since long
 * before this launcher, and the platform's own long-press duration.
 */
const LONG_PRESS_MS = 500;

/**
 * Empty space held above the drawer's first row, scrolled out of sight.
 *
 * Android's scroll view claims a vertical drag the moment it passes the touch
 * slop, whether or not it has anywhere left to go, and cancels the JS gesture
 * that was watching for a swipe down. So the swipe-to-close cannot be read off
 * the finger once it lands on the list — it has to be read off the list's own
 * scrolling. This slack is what gives it something to read: at rest the drawer
 * sits {@link PULL_SLACK} in, and pulling down runs it back out to zero, which
 * is the same dismissal a swipe down means anywhere else on the screen.
 */
const PULL_SLACK = 64;

/** How long the drawer takes to rise, and to fall — leaving is always quicker. */
const OPEN_MS = 260;
const CLOSE_MS = 190;

/** An upward drag, rather than a sideways one that happened to drift. */
function isSwipeUp(gesture: PanResponderGestureState): boolean {
  return (
    gesture.dy <= -SWIPE_UP_MIN_DY &&
    Math.abs(gesture.dy) > Math.abs(gesture.dx)
  );
}

/** The same gesture the other way, which sends the drawer back down. */
function isSwipeDown(gesture: PanResponderGestureState): boolean {
  return (
    gesture.dy >= SWIPE_UP_MIN_DY && Math.abs(gesture.dy) > Math.abs(gesture.dx)
  );
}

/** A transient line in the footer, sometimes with a way to act on it. */
type Notice = {text: string; action?: () => void};

export function LauncherScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const inputRef = useRef<SearchInputHandle | null>(null);
  const listRef = useRef<FlatList<SearchResult> | null>(null);

  const {index, apps, loading, error, reload} = useInstalledApps();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isDefault, setIsDefault] = useState<boolean>(isDefaultLauncher);
  // The drawer is not on screen until it is asked for. A launcher at rest is a
  // clock and the apps you last used; the keyboard is an interruption, and it
  // should arrive only when the user reaches for it.
  const [searchOpen, setSearchOpen] = useState(false);
  // Rendered separately from `searchOpen`, because a drawer on its way out is
  // still a drawer on screen. Unmounts when the closing animation lands.
  const [drawerMounted, setDrawerMounted] = useState(false);
  // The height the drawer falls through, measured rather than assumed.
  const [contentHeight, setContentHeight] = useState(0);

  // Read by the back handler and the launch guard, which must not re-subscribe
  // or be re-created on every keystroke.
  const queryRef = useRef(query);
  queryRef.current = query;
  const launching = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of the last unclaimed tap, for the double tap that locks.
  const lastTap = useRef(0);
  // Read by the gesture handlers, which are created once and must see the
  // current state rather than the state at the time they were made.
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;
  // Which way a drag was going when it was taken off the list mid-gesture, so
  // the release knows the gesture was already claimed as a swipe.
  const claimedSwipe = useRef<'up' | 'down' | null>(null);
  // Where the drawer's list is scrolled to. A swipe down only closes the
  // drawer from the top of the list; below that it is a scroll and nothing else.
  const drawerOffset = useRef(0);
  // The hold that opens settings, and whether this gesture already spent
  // itself on one — a hold that has fired must not also read as a tap.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  // Whether a finger is on the drawer's list right now. Only a drag reaching
  // the top closes it — a fling that happens to land there is the user asking
  // for the first row, not for the drawer to go away.
  const drawerDragging = useRef(false);
  // 0 while the drawer is down, 1 while it is up, and every frame between.
  const rise = useRef(new Animated.Value(0)).current;
  // Lets the auto-launch below tell typing apart from deleting.
  const previousQueryLength = useRef(0);

  // What the resting screen lists, as set on the settings screen: nothing, the
  // apps last opened, or the ones the user picked by hand. Both lists are asked
  // for empty when they are not the one on show, so the settings behind them —
  // the count, the picks — are kept for when they are.
  const {showClock, showHomeApps, homeAppSource, homeRowCount, homeAppIds} =
    usePreferences();
  const showsRecents = showHomeApps && homeAppSource === 'recent';
  const {apps: recents, usageAccess} = useRecentApps(
    apps,
    showsRecents ? homeRowCount : 0,
  );

  /**
   * The picked apps, in the order they were picked, resolved against what is
   * installed now — a pick whose app has since been uninstalled is dropped
   * rather than shown as a row that cannot open anything.
   */
  const chosen = useMemo<AppInfo[]>(() => {
    if (!showHomeApps || homeAppSource !== 'chosen') {
      return [];
    }
    const byId = new Map(apps.map(app => [app.id, app]));
    const picked: AppInfo[] = [];
    for (const id of homeAppIds) {
      const app = byId.get(id);
      if (app !== undefined) {
        picked.push(app);
      }
    }
    return picked;
  }, [apps, homeAppIds, homeAppSource, showHomeApps]);

  /** The empty-query screen. These rows carry no match span to highlight. */
  const defaultRows = useMemo<SearchResult[]>(
    () =>
      (homeAppSource === 'chosen' ? chosen : recents).map(app => ({
        app,
        matchStart: -1,
        matchLength: 0,
      })),
    [chosen, homeAppSource, recents],
  );

  /** Every installed app, in the alphabetical order the native side sorts it. */
  const allRows = useMemo<SearchResult[]>(
    () => apps.map(app => ({app, matchStart: -1, matchLength: 0})),
    [apps],
  );

  // The drawer opens on the whole library, alphabetically, the way a drawer is
  // expected to. Typing narrows it to matches; the recents on the resting
  // screen are a different list for a different moment.
  const results = useMemo(
    () => (query.trim().length === 0 ? allRows : searchApps(index, query)),
    [allRows, index, query],
  );

  // How tall the drawer's list is on screen, which decides whether it has the
  // content to scroll at all.
  const [listHeight, setListHeight] = useState(0);

  /**
   * The slack above the first row, or none when there is nothing to scroll.
   *
   * A list that does not fill its viewport cannot be scrolled into the slack,
   * so the slack would be a gap under the search field that never goes away —
   * and a drawer narrowed to two results is one the user leaves by picking a
   * result or by Back, not by pulling it down.
   */
  const pullSlack = useMemo(() => {
    const rows = results.length * theme.spacing.rowHeight + 18;
    return listHeight > 0 && rows >= listHeight ? PULL_SLACK : 0;
  }, [listHeight, results.length, theme.spacing.rowHeight]);

  // Read by the gesture and scroll handlers, which must see the slack in force
  // now rather than the one in force when they were made.
  const pullSlackRef = useRef(pullSlack);
  pullSlackRef.current = pullSlack;

  /** The list's resting offset, expressed once so nothing drifts from it. */
  const drawerRest = useMemo(() => ({x: 0, y: pullSlack}), [pullSlack]);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    setListHeight(event.nativeEvent.layout.height);
  }, []);

  // Space the content must leave at the bottom of an edge-to-edge window. The
  // IME inset React Native reports is measured *above* the navigation bar, so
  // the bar has to be added back or the last row hides under the keyboard.
  const bottomInset =
    keyboardHeight > 0 ? keyboardHeight + insets.bottom : insets.bottom;

  const focusSearch = useCallback(() => {
    // Focus requested in the same frame as a lifecycle transition is sometimes
    // dropped by Android; one frame later it reliably raises the keyboard.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const scrollToTop = useCallback(() => {
    // The top of the list is the far side of the slack, not offset zero.
    listRef.current?.scrollToOffset({
      offset: pullSlackRef.current,
      animated: false,
    });
    drawerOffset.current = pullSlackRef.current;
  }, []);

  /**
   * Send the drawer away and put the launcher back to rest: no query, no
   * field, no keyboard.
   *
   * This is the dismissal — Back, or a swipe down from the top of the drawer —
   * and it is animated. Arrivals take {@link closeInstantly} instead.
   */
  const resetSearch = useCallback(() => {
    setNotice(null);
    setSearchOpen(false);
    scrollToTop();
    // The field unmounts with the keyboard still up unless it is told to go.
    Keyboard.dismiss();
    // The query is left until the drawer has gone: emptying it now would swap
    // three results for the whole library in the middle of the closing frames.
  }, [scrollToTop]);

  /**
   * Shut with no animation, for arrivals rather than dismissals.
   *
   * Coming home, or back from another app, the drawer was never on this
   * screen — sliding it away would be animating something the user did not see
   * open.
   */
  const closeInstantly = useCallback(() => {
    setQuery('');
    setNotice(null);
    setSearchOpen(false);
    setDrawerMounted(false);
    rise.setValue(0);
    Keyboard.dismiss();
  }, [rise]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  /** The hold on the wallpaper: settings, sliding in from the right. */
  const openSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  /** Reveal the field and put the caret in it, on a swipe up. */
  const openSearch = useCallback(() => {
    if (searchOpenRef.current) {
      return;
    }
    setSearchOpen(true);
    // `autoFocus` covers the mount; this covers the frame Android drops it in.
    focusSearch();
  }, [focusSearch]);

  /** The × in the field: empty the query, but stay in the drawer. */
  const handleClear = useCallback(() => {
    setQuery('');
    setNotice(null);
    scrollToTop();
    focusSearch();
  }, [focusSearch, scrollToTop]);

  // The drawer rises from the bottom edge and falls back through it. Position
  // and opacity are all it animates, so the whole thing runs on the native
  // driver and keeps its frames while the list below is still rendering rows.
  useEffect(() => {
    if (searchOpen) {
      setDrawerMounted(true);
    }
    const animation = Animated.timing(rise, {
      toValue: searchOpen ? 1 : 0,
      duration: searchOpen ? OPEN_MS : CLOSE_MS,
      // Out on the way up, in on the way down: the drawer arrives gently and
      // leaves briskly, which is what makes dismissing it feel free.
      easing: searchOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({finished}) => {
      if (finished && !searchOpen) {
        setDrawerMounted(false);
        setQuery('');
        drawerOffset.current = pullSlackRef.current;
      }
    });
    return () => animation.stop();
  }, [searchOpen, rise]);

  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    setContentHeight(event.nativeEvent.layout.height);
  }, []);

  const handleDrawerScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      drawerOffset.current = offset;

      // The drag ran the list out of slack: the finger is still travelling
      // down with nowhere left to go, which is the swipe down the list ate.
      if (
        drawerDragging.current &&
        pullSlackRef.current > 0 &&
        searchOpenRef.current &&
        offset <= 0
      ) {
        resetSearch();
      }
    },
    [resetSearch],
  );

  const handleDrawerScrollBeginDrag = useCallback(() => {
    drawerDragging.current = true;
  }, []);

  /** Take the list back to rest when a pull stopped short of dismissing. */
  const settleDrawerScroll = useCallback((offset: number) => {
    if (!searchOpenRef.current || offset >= pullSlackRef.current) {
      return;
    }
    listRef.current?.scrollToOffset({
      offset: pullSlackRef.current,
      animated: true,
    });
  }, []);

  const handleDrawerScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      drawerDragging.current = false;
      // A release with speed left in it hands over to a fling, and settling
      // now would only fight the momentum that is about to run.
      if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) {
        settleDrawerScroll(event.nativeEvent.contentOffset.y);
      }
    },
    [settleDrawerScroll],
  );

  const handleDrawerMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleDrawerScroll(event.nativeEvent.contentOffset.y);
    },
    [settleDrawerScroll],
  );

  /** The drawer's travel: fully below the content area, up to in place. */
  const drawerStyle = useMemo(
    () => ({
      opacity: rise,
      transform: [
        {
          translateY: rise.interpolate({
            inputRange: [0, 1],
            outputRange: [contentHeight, 0],
          }),
        },
      ],
    }),
    [rise, contentHeight],
  );

  /** The recents underneath, which give the drawer the screen as it arrives. */
  const restingStyle = useMemo(
    () => ({
      opacity: rise.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
    }),
    [rise],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      // Each keystroke produces a new result set; the old scroll offset means
      // nothing against it, and the best match is always at the top.
      scrollToTop();
    },
    [scrollToTop],
  );

  const showNotice = useCallback((text: string, action?: () => void) => {
    if (noticeTimer.current !== null) {
      clearTimeout(noticeTimer.current);
    }
    setNotice({text, action});
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
  }, []);

  /**
   * Two taps on empty space turn the display off.
   *
   * Only taps nothing else wanted arrive here: a result row, the search field
   * and the footer each claim their own, so the gesture is effectively "double
   * tap the wallpaper" and cannot be triggered by using the launcher normally.
   * A scroll takes the responder away and never lands as a tap at all.
   */
  const handleBackgroundTap = useCallback(() => {
    const now = Date.now();
    const isSecondTap = now - lastTap.current <= DOUBLE_TAP_MS;
    lastTap.current = isSecondTap ? 0 : now;

    if (!isSecondTap || lockScreen()) {
      return;
    }
    // Never granted, or revoked since. A gesture that silently does nothing is
    // worse than one that says what it needs, so the notice carries the fix.
    showNotice(
      'Double tap to lock needs device admin. Tap to allow.',
      requestLockScreenPermission,
    );
  }, [showNotice]);

  /**
   * Every touch the launcher's own controls did not want: the swipe up that
   * opens the search, and the double tap that locks.
   *
   * A drag is taken away from a list mid-gesture in exactly two cases: upwards
   * while the drawer is down — the resting screen is a handful of rows that do
   * not scroll, so nothing is lost — and downwards from the very top of the
   * drawer, where there is likewise nothing above to scroll to. Every other
   * drag belongs to the list under the finger.
   */
  const gestures = useMemo(
    () =>
      PanResponder.create({
        // Taps on empty space, as before. Anything deeper — a row, the field,
        // a footer — claims its own touch first and never reaches here.
        onStartShouldSetPanResponder: () => true,
        // A finger that lands on the wallpaper and stays there is asking for
        // settings. Only on the resting screen: with the drawer up there is no
        // wallpaper to hold, and a gesture claimed off a list is already a
        // swipe rather than a hold.
        onPanResponderGrant: () => {
          longPressFired.current = false;
          if (searchOpenRef.current || claimedSwipe.current !== null) {
            return;
          }
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            longPressFired.current = true;
            openSettings();
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (_event, gesture) => {
          if (
            Math.abs(gesture.dx) > TAP_SLOP ||
            Math.abs(gesture.dy) > TAP_SLOP
          ) {
            cancelLongPress();
          }
        },
        onMoveShouldSetPanResponderCapture: (_event, gesture) => {
          if (!searchOpenRef.current && isSwipeUp(gesture)) {
            claimedSwipe.current = 'up';
            return true;
          }
          // Pulling down from the top of the drawer sends it back. Anywhere
          // below the top the same drag is a scroll, and stays one.
          if (
            searchOpenRef.current &&
            drawerOffset.current <= pullSlackRef.current &&
            isSwipeDown(gesture)
          ) {
            claimedSwipe.current = 'down';
            return true;
          }
          return false;
        },
        onPanResponderRelease: (_event, gesture) => {
          cancelLongPress();
          // Claimed off a list above, or begun on the background — where we
          // were already the responder and the capture phase never ran.
          const claimed = claimedSwipe.current;
          claimedSwipe.current = null;

          // The hold already answered this gesture; letting go of it is not a
          // second thing the user asked for.
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }

          if (
            claimed === 'up' ||
            (!searchOpenRef.current && isSwipeUp(gesture))
          ) {
            openSearch();
            return;
          }
          if (
            claimed === 'down' ||
            (searchOpenRef.current &&
              drawerOffset.current <= pullSlackRef.current &&
              isSwipeDown(gesture))
          ) {
            resetSearch();
            return;
          }
          // A finger that travelled is a scroll or an abandoned swipe, and
          // must not read as one half of the double tap that locks.
          if (
            Math.abs(gesture.dx) > TAP_SLOP ||
            Math.abs(gesture.dy) > TAP_SLOP
          ) {
            return;
          }
          handleBackgroundTap();
        },
        onPanResponderTerminate: () => {
          cancelLongPress();
          longPressFired.current = false;
          claimedSwipe.current = null;
        },
      }),
    [
      cancelLongPress,
      handleBackgroundTap,
      openSearch,
      openSettings,
      resetSearch,
    ],
  );

  // Returning from another app: hand the user the resting screen back.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') {
          launching.current = false;
          setIsDefault(isDefaultLauncher());
          closeInstantly();
        }
      },
    );
    return () => subscription.remove();
  }, [closeInstantly]);

  // HOME pressed while we are already foreground. AppState does not change in
  // that case, so the reset has to come from the activity.
  //
  // HOME means the home screen, so it also leaves settings: a user who presses
  // it expects the launcher, not the screen they wandered off to.
  useEffect(() => {
    const subscription = addHomePressedListener(() => {
      navigation.popToTop();
      closeInstantly();
    });
    return () => subscription.remove();
  }, [closeInstantly, navigation]);

  // A home app has nothing to go back to: Back closes the search, and is
  // otherwise swallowed so the launcher stays on screen.
  //
  // Bound to focus rather than to mount, because this screen stays mounted
  // underneath settings and a handler that swallows every Back would leave the
  // user no way out of the screen above it.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (searchOpenRef.current || queryRef.current.length > 0) {
            resetSearch();
          }
          return true;
        },
      );
      return () => subscription.remove();
    }, [resetSearch]),
  );

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) {
        clearTimeout(noticeTimer.current);
      }
      if (longPressTimer.current !== null) {
        clearTimeout(longPressTimer.current);
      }
    },
    [],
  );

  const handleLaunch = useCallback(
    async (result: SearchResult) => {
      // A double tap during the launch transition must not start two activities.
      if (launching.current) {
        return;
      }
      launching.current = true;
      const launched = await launchApp(result.app);
      launching.current = false;

      if (!launched) {
        // Uninstalled or disabled since the list was built. Tell the user
        // plainly and re-read the list so the stale row disappears.
        showNotice(`${result.app.name} can no longer be opened`);
        reload();
      }
    },
    [reload, showNotice],
  );

  const handleSubmit = useCallback(() => {
    // With nothing typed the drawer is the whole library in alphabetical
    // order, and its first row is an accident of the alphabet rather than an
    // answer to anything.
    const first = query.trim().length === 0 ? undefined : results[0];
    if (first !== undefined) {
      handleLaunch(first);
    }
  }, [query, results, handleLaunch]);

  // Narrowing to a single app is an unambiguous choice, so make it: typing the
  // one letter that isolates an app opens it, with no tap to follow.
  useEffect(() => {
    const grew = query.length > previousQueryLength.current;
    previousQueryLength.current = query.length;

    // Only ever on the way forward. Backspacing through a one-result query
    // would otherwise re-launch the app the user is trying to type past, and
    // there would be no way to edit a query back down.
    if (!grew || query.trim().length === 0 || results.length !== 1) {
      return;
    }
    handleLaunch(results[0]);
  }, [query, results, handleLaunch]);

  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<SearchResult>) => (
      <AppListItem result={item} onPress={handleLaunch} />
    ),
    [handleLaunch],
  );

  const keyExtractor = useCallback((item: SearchResult) => item.app.id, []);

  // Rows are a fixed height, so the list can skip measurement entirely.
  const getItemLayout = useCallback(
    (_data: ArrayLike<SearchResult> | null | undefined, itemIndex: number) => ({
      length: theme.spacing.rowHeight,
      offset: theme.spacing.rowHeight * itemIndex,
      index: itemIndex,
    }),
    [theme.spacing.rowHeight],
  );

  /** Shared by both lists: the reasons neither can show anything. */
  const listProblem = useMemo(() => {
    if (loading) {
      return null;
    }
    if (error !== null) {
      return 'Could not read installed apps. Tap to retry.';
    }
    if (apps.length === 0) {
      return 'No launchable apps found.';
    }
    return undefined;
  }, [loading, error, apps.length]);

  const restingMessage = useMemo(() => {
    // An empty resting screen the user asked for is not a screen with anything
    // missing from it, so it says nothing at all: the clock and the wallpaper
    // are the whole of what was wanted.
    if (!showHomeApps) {
      return null;
    }
    if (listProblem !== undefined) {
      return listProblem;
    }
    // The list is the user's own and they have not filled it yet, so the way
    // to fill it is what the screen says.
    if (homeAppSource === 'chosen') {
      return 'No apps chosen yet. Hold here to open settings and pick some.';
    }
    // Nothing has been opened yet — a first run, or a device where usage
    // access is off and nothing has been launched from here either.
    return 'Recently opened apps appear here. Swipe up for all apps.';
  }, [homeAppSource, listProblem, showHomeApps]);

  const drawerMessage = useMemo(() => {
    if (listProblem !== undefined) {
      return listProblem;
    }
    // The drawer is never empty with a blank query; this is a search that
    // matched nothing.
    return `No apps match “${query.trim()}”`;
  }, [listProblem, query]);

  // What the launcher still needs from the user, most costly to leave unfixed
  // first. Both can be outstanding at once and each is a separate trip into
  // Settings, so both are shown: ranking them would hide the second behind the
  // first, and the second is the only route to a permission with no prompt of
  // its own. A transient notice replaces them for its few seconds.
  const prompts = useMemo<{text: string; action: () => void}[]>(() => {
    if (notice !== null) {
      return [];
    }
    const pending: {text: string; action: () => void}[] = [];
    if (!isDefault) {
      pending.push({
        text: 'Set as default launcher',
        action: requestDefaultLauncher,
      });
    }
    if (!usageAccess) {
      pending.push({
        text: 'Allow usage access for screen time and recents',
        action: requestUsageAccess,
      });
    }
    return pending;
  }, [notice, isDefault, usageAccess]);

  /** The one line a list shows in place of rows it does not have. */
  const renderEmpty = (message: string | null) =>
    message === null ? undefined : (
      <Pressable
        onPress={error !== null ? reload : undefined}
        style={{paddingHorizontal: theme.spacing.gutter}}>
        <Text style={[styles.empty, {color: theme.colors.textMuted}]}>
          {message}
        </Text>
      </Pressable>
    );

  return (
    <View
      // Touches that no control claimed — the wallpaper, in effect.
      {...gestures.panHandlers}
      style={[
        styles.screen,
        {
          // The window is transparent and the device wallpaper is behind it;
          // this translucent wash is the only thing between the two, and it is
          // what keeps the text readable over an arbitrary photograph.
          backgroundColor: theme.colors.scrim,
          // The keyboard overlays the window rather than resizing it, so the
          // screen gives back exactly the space the system takes from it.
          paddingBottom: bottomInset,
        },
      ]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 18,
            paddingHorizontal: theme.spacing.gutter,
          },
        ]}>
        {/* With the clock gone the ring has nothing to be spaced away from,
            so the row stops spreading and keeps it on the right-hand rail. */}
        <View style={[styles.headerTop, !showClock && styles.headerTopAlone]}>
          {showClock ? <Clock /> : null}
          <ScreenTimeRing />
        </View>
      </View>

      {/* Everything below the clock. Clipped, so the drawer waiting outside the
          bottom edge stays out of sight until it is asked for. */}
      <View style={styles.content} onLayout={handleContentLayout}>
        <Animated.View
          style={[StyleSheet.absoluteFill, restingStyle]}
          // The drawer is what receives touches once it is up, even during the
          // frames when it is still translucent.
          pointerEvents={searchOpen ? 'none' : 'auto'}>
          <FlatList
            style={styles.list}
            data={defaultRows}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmpty(restingMessage)}
          />
        </Animated.View>

        {drawerMounted ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, drawerStyle]}
            pointerEvents={searchOpen ? 'auto' : 'none'}>
            <View
              style={[
                styles.searchWrapper,
                {paddingHorizontal: theme.spacing.gutter},
              ]}>
              <SearchInput
                value={query}
                onChangeText={handleQueryChange}
                onSubmit={handleSubmit}
                onClear={handleClear}
                inputRef={inputRef}
              />
            </View>

            <FlatList
              ref={listRef}
              style={styles.list}
              data={results}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
              onLayout={handleListLayout}
              // The drawer starts past its own slack, so the first row sits
              // under the field and the space above is there to be pulled into.
              contentOffset={drawerRest}
              onScroll={handleDrawerScroll}
              onScrollBeginDrag={handleDrawerScrollBeginDrag}
              onScrollEndDrag={handleDrawerScrollEndDrag}
              onMomentumScrollEnd={handleDrawerMomentumEnd}
              scrollEventThrottle={16}
              // Tapping a result while the keyboard is up must launch on the
              // first tap, not spend it dismissing the keyboard.
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              // No `removeClippedSubviews`: its clipping is computed against
              // the parent, and this list spends its first frames inside one
              // that is still moving. Windowing already keeps the row count
              // down, and the whole library is only a few hundred rows.
              initialNumToRender={14}
              maxToRenderPerBatch={12}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.listContent,
                {paddingTop: styles.listContent.paddingTop + pullSlack},
              ]}
              ListEmptyComponent={renderEmpty(drawerMessage)}
            />
          </Animated.View>
        ) : null}
      </View>

      {notice !== null ? (
        <Pressable
          onPress={notice.action}
          disabled={notice.action === undefined}
          accessibilityRole={notice.action === undefined ? 'text' : 'button'}
          style={({pressed}) => [
            styles.footer,
            {
              paddingHorizontal: theme.spacing.gutter,
              opacity: pressed && notice.action !== undefined ? 0.5 : 1,
            },
          ]}>
          <Text
            style={[styles.footerText, {color: theme.colors.textMuted}]}
            numberOfLines={1}>
            {notice.text}
          </Text>
        </Pressable>
      ) : null}

      {prompts.map(prompt => (
        <Pressable
          key={prompt.text}
          onPress={prompt.action}
          accessibilityRole="button"
          style={({pressed}) => [
            styles.footer,
            {
              paddingHorizontal: theme.spacing.gutter,
              opacity: pressed ? 0.5 : 1,
            },
          ]}>
          <Text
            style={[styles.footerText, {color: theme.colors.textMuted}]}
            numberOfLines={1}>
            {prompt.text}
          </Text>
        </Pressable>
      ))}

      {/* A control nobody can see is a control nobody finds. One muted line,
          gone the moment the field it describes is on screen. */}
      {!searchOpen && notice === null ? (
        <View
          style={[styles.footer, {paddingHorizontal: theme.spacing.gutter}]}
          pointerEvents="none">
          <Text
            style={[styles.footerText, {color: theme.colors.textMuted}]}
            numberOfLines={1}>
            Swipe up for all apps
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingBottom: 30,
  },
  content: {
    flex: 1,
    // The drawer starts a full screen below where it ends up.
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    // Clock left, screen time hard right, and the gap between them belongs to
    // neither — which is what lets the ring sit on the same rail as everything
    // else on the screen.
    justifyContent: 'space-between',
  },
  headerTopAlone: {
    justifyContent: 'flex-end',
  },
  searchWrapper: {
    marginBottom: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 12,
    flexGrow: 1,
  },
  empty: {
    fontSize: 16,
    letterSpacing: 0.2,
    paddingTop: 10,
  },
  footer: {
    // The screen already reserves the system inset, so this is pure breathing
    // room. Kept tight because two of these can stack.
    paddingTop: 7,
    paddingBottom: 7,
  },
  footerText: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
