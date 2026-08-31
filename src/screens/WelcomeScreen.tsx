import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  hasUsageAccess,
  isDefaultLauncher,
  requestDefaultLauncher,
  requestUsageAccess,
} from '../native/LauncherModule';
import {DARK_THEME} from '../theme';

const LOGO = require('../assets/logo.png');

type Props = {
  /** Called once there is nothing left to ask; first run never repeats. */
  onDone: () => void;
};

type Request = {
  key: string;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  /** True once the system says this no longer needs asking. */
  satisfied: boolean;
};

/**
 * First run, in three screens: an introduction, then one request per screen.
 *
 * Usage access is asked for before the Home role because it is the one Android
 * will never prompt for on its own — there is no dialog, only a list in
 * Settings the user has to find — and because it is what makes the launcher's
 * first screen worth looking at. The Home role comes last, once the app has
 * something to show and has explained itself.
 *
 * Both requests are skippable. Neither permission is needed to search and
 * launch apps, and a launcher that holds its own front door shut until you
 * agree to something has misunderstood what it is. Skipped requests carry on
 * living in the footer of the launcher itself.
 *
 * A request the system already satisfies is passed over without being drawn, so
 * granting usage access in Settings and coming back moves the flow on by
 * itself.
 *
 * The dark palette is used here whatever the device is set to. These screens
 * are opaque — the only ones in the app that are — and they are the app
 * introducing itself, which is a moment worth having one appearance for.
 */
export function WelcomeScreen({onDone}: Props) {
  const theme = DARK_THEME;
  const insets = useSafeAreaInsets();

  const [started, setStarted] = useState(false);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [usageAccess, setUsageAccess] = useState(hasUsageAccess);
  const [isDefault, setIsDefault] = useState(isDefaultLauncher);

  // Both requests are answered in Settings, so coming back is the only moment
  // either answer can have changed.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') {
          setUsageAccess(hasUsageAccess());
          setIsDefault(isDefaultLauncher());
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const requests = useMemo<Request[]>(
    () => [
      {
        key: 'usage',
        title: 'Usage access',
        body:
          'Shows the apps you opened most recently — in the order you really ' +
          'opened them — and today’s screen time on the dial beside the clock. ' +
          'Android keeps this behind a switch only you can turn on. It is read ' +
          'on this phone, never stored, never sent anywhere.',
        action: 'Open settings',
        onAction: requestUsageAccess,
        satisfied: usageAccess,
      },
      {
        key: 'home',
        title: 'Make it home',
        body:
          'Press Home and land on the search field, ready to type. You can ' +
          'change your mind later in Android Settings, and the app stays ' +
          'openable from the app drawer either way.',
        action: 'Set as default',
        onAction: requestDefaultLauncher,
        satisfied: isDefault,
      },
    ],
    [usageAccess, isDefault],
  );

  /**
   * The request on screen: the first that is neither answered nor waved away.
   *
   * Derived rather than stepped through. A page counter has to be advanced, and
   * anything that advances it twice — a doubled press, an effect that runs
   * again on a re-render — silently swallows a whole page. There is nothing
   * here to advance: a request leaves the queue when it is answered or
   * dismissed, and dismissing the same one twice is the same as once.
   */
  const pending = useMemo(
    () => requests.filter(r => !r.satisfied && !dismissed.includes(r.key)),
    [requests, dismissed],
  );
  const current = pending[0];

  const dismiss = useCallback((key: string) => {
    setDismissed(previous =>
      previous.includes(key) ? previous : [...previous, key],
    );
  }, []);

  // Leaving is a committed state change rather than a side effect of drawing,
  // so it happens here and not in the render below.
  useEffect(() => {
    if (started && current === undefined) {
      onDone();
    }
  }, [started, current, onDone]);

  const frame = [
    styles.screen,
    {
      backgroundColor: theme.colors.canvas,
      paddingTop: insets.top + 64,
      paddingBottom: insets.bottom + 36,
      paddingHorizontal: theme.spacing.gutter,
    },
  ];

  if (!started) {
    return (
      <View style={frame}>
        <View style={styles.intro}>
          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text
            style={[
              styles.wordmark,
              {color: theme.colors.text, fontFamily: theme.fonts.ui},
            ]}>
            JODE
          </Text>
          <Text
            style={[
              styles.tagline,
              {color: theme.colors.textSecondary, fontFamily: theme.fonts.ui},
            ]}>
            A home screen that is a search field and nothing else. Type a
            letter, open an app, get on with your day.
          </Text>
        </View>

        <View style={styles.footerEnd}>
          <Pressable
            onPress={() => setStarted(true)}
            accessibilityRole="button"
            style={({pressed}) => [
              styles.button,
              {backgroundColor: theme.colors.text, opacity: pressed ? 0.6 : 1},
            ]}>
            <Text
              style={[
                styles.buttonText,
                {color: theme.colors.canvas, fontFamily: theme.fonts.ui},
              ]}>
              Get started
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (current === undefined) {
    return null;
  }

  const position = requests.indexOf(current) + 1;
  const isLast = pending.length === 1;

  return (
    <View style={frame}>
      <Text
        style={[
          styles.wordmarkSmall,
          {color: theme.colors.text, fontFamily: theme.fonts.ui},
        ]}>
        JODE
      </Text>

      <View style={styles.body}>
        <Text
          style={[
            styles.eyebrow,
            {color: theme.colors.textMuted, fontFamily: theme.fonts.ui},
          ]}>
          {`${position} of ${requests.length}`}
        </Text>
        <Text
          style={[
            styles.title,
            {color: theme.colors.text, fontFamily: theme.fonts.ui},
          ]}>
          {current.title}
        </Text>
        <Text
          style={[
            styles.copy,
            {color: theme.colors.textSecondary, fontFamily: theme.fonts.ui},
          ]}>
          {current.body}
        </Text>
      </View>

      <View style={styles.footerBetween}>
        <Pressable
          onPress={() => dismiss(current.key)}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Skip and open the launcher' : 'Skip'}
          hitSlop={12}
          style={({pressed}) => [styles.skip, {opacity: pressed ? 0.5 : 1}]}>
          <Text
            style={[
              styles.skipText,
              {color: theme.colors.textMuted, fontFamily: theme.fonts.ui},
            ]}>
            Not now
          </Text>
        </Pressable>

        <Pressable
          onPress={current.onAction}
          accessibilityRole="button"
          style={({pressed}) => [
            styles.button,
            {backgroundColor: theme.colors.text, opacity: pressed ? 0.6 : 1},
          ]}>
          <Text
            style={[
              styles.buttonText,
              {color: theme.colors.canvas, fontFamily: theme.fonts.ui},
            ]}>
            {current.action}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // The introduction has nothing to rank, so it sits in the middle of its own
  // space rather than being pinned to the top like the requests that follow.
  intro: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    width: 104,
    height: 104,
  },
  wordmark: {
    marginTop: 30,
    fontSize: 44,
    letterSpacing: 4,
    includeFontPadding: false,
  },
  tagline: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 25,
  },
  wordmarkSmall: {
    fontSize: 20,
    letterSpacing: 3,
    includeFontPadding: false,
  },
  // Takes the space between the wordmark and the actions, so the request sits
  // in the middle of the screen wherever the copy happens to end.
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    includeFontPadding: false,
  },
  title: {
    marginTop: 10,
    fontSize: 34,
    includeFontPadding: false,
  },
  copy: {
    marginTop: 18,
    fontSize: 16,
    lineHeight: 25,
  },
  footerEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  // The way past on the left, the way forward on the right, which is the side
  // a thumb reaches and the side this flow moves towards.
  footerBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // The one filled element in the app. Everything else here is text, so the
  // step forward is the only thing that needs to look like it can be pressed.
  button: {
    // A fixed height that centres its label, rather than vertical padding that
    // merely surrounds it: padding leaves the glyphs wherever the font's line
    // box puts them, which for a face with a deep descent and a label with no
    // descenders is visibly above the middle.
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    // Half the height, so the ends are true semicircles at any label length.
    borderRadius: 26,
  },
  buttonText: {
    fontSize: 17,
    letterSpacing: 0.3,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  skip: {
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 14,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
});
