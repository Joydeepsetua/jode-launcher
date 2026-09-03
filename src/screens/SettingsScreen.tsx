import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon, type IconName} from '../components/Icon';
import {Slider} from '../components/Slider';
import {
  canLockScreen,
  hasUsageAccess,
  isDefaultLauncher,
  requestDefaultLauncher,
  requestLockScreenPermission,
  requestUsageAccess,
} from '../native/LauncherModule';
import {usePreferences, type ThemeMode} from '../preferences';
import {SCRIM_STEPS, useTheme, type Theme} from '../theme';

/** A permission the launcher can use but never requires. */
type Permission = {
  key: string;
  title: string;
  body: string;
  granted: boolean;
  icon: IconName;
  /** What the system shows when the row is tapped. */
  request: () => void;
};

const THEME_CHOICES: readonly {
  value: ThemeMode;
  label: string;
  icon: IconName;
}[] = [
  {value: 'system', label: 'System', icon: 'contrast'},
  {value: 'dark', label: 'Dark', icon: 'moon'},
  {value: 'light', label: 'Light', icon: 'sun'},
];

/**
 * The margin this screen holds, narrower than the launcher's own rail.
 *
 * The launcher is a list of words on a wallpaper and needs the room; this is a
 * page of cards, and a card that stops well short of the edge reads as a
 * cramped column rather than as a screen of grouped settings.
 */
const GUTTER = 12;

/** The size of a row's coloured tile, and the gap between it and the words. */
const TILE = 48;
const TILE_GAP = 14;

/** One label per step in {@link SCRIM_STEPS}, in the same order. */
const SCRIM_LABELS = ['None', 'Subtle', 'Medium', 'Strong'] as const;

/**
 * Which stop a stored wash is on.
 *
 * A value that is not one of the stops — one an older build wrote, or one the
 * steps were later moved away from — reads as the nearest stop rather than as
 * an error, so the slider always has somewhere to put its thumb.
 */
function nearestStep(opacity: number): number {
  let best = 0;
  let gap = Number.POSITIVE_INFINITY;
  SCRIM_STEPS.forEach((step, position) => {
    const distance = Math.abs(step - opacity);
    if (distance < gap) {
      best = position;
      gap = distance;
    }
  });
  return best;
}

/**
 * Everything the launcher lets you change, which is deliberately not much.
 *
 * Reached by holding the home screen — the gesture Android has meant "this
 * screen's own settings" since long before this launcher — and pushed onto the
 * stack, so it arrives from the right and leaves back to it.
 *
 * The three permissions are the same three the footer nags about; this is the
 * place to grant one on purpose rather than when the launcher happens to ask.
 * None of them is required, and the screen says so rather than dressing an
 * optional grant up as a warning.
 *
 * Opaque, unlike the launcher behind it. This is a screen of settings rather
 * than a home screen: reading it over someone's wallpaper would cost legibility
 * for a view of a photograph nobody came here to look at, and it is also what
 * makes the slide in from the right read as a screen arriving.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {themeMode, scrimOpacity, setThemeMode, setScrimOpacity} =
    usePreferences();

  const [usageAccess, setUsageAccess] = useState(hasUsageAccess);
  const [isDefault, setIsDefault] = useState(isDefaultLauncher);
  const [canLock, setCanLock] = useState(canLockScreen);

  const refresh = useCallback(() => {
    setUsageAccess(hasUsageAccess());
    setIsDefault(isDefaultLauncher());
    setCanLock(canLockScreen());
  }, []);

  // Every one of these is answered in a system screen, so coming back is the
  // only moment any of the answers can have changed.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') {
          refresh();
        }
      },
    );
    return () => subscription.remove();
  }, [refresh]);

  /**
   * Back leaves this screen rather than the launcher.
   *
   * The launcher swallows Back outright — a home app has nothing behind it —
   * and its handler is still registered underneath us, so this one has to be
   * here to be reached first and pop the stack.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        navigation.goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [navigation]);

  const permissions = useMemo<Permission[]>(
    () => [
      {
        key: 'home',
        title: 'Default home app',
        body: 'Press Home and land here, ready to type.',
        granted: isDefault,
        icon: 'home',
        request: requestDefaultLauncher,
      },
      {
        key: 'usage',
        title: 'Usage access',
        body: 'Orders your recent apps and draws today’s screen time.',
        granted: usageAccess,
        icon: 'clock',
        request: requestUsageAccess,
      },
      {
        key: 'lock',
        title: 'Double tap to lock',
        body: 'Turns the display off when you tap the wallpaper twice.',
        granted: canLock,
        icon: 'lock',
        request: requestLockScreenPermission,
      },
    ],
    [isDefault, usageAccess, canLock],
  );

  // The wash is stored as the opacity itself; the slider counts stops, and this
  // is where one becomes the other.
  const scrimIndex = nearestStep(scrimOpacity);
  const chooseWash = useCallback(
    (position: number) => {
      const step = SCRIM_STEPS[position];
      if (step !== undefined) {
        setScrimOpacity(step);
      }
    },
    [setScrimOpacity],
  );

  return (
    <View
      style={[
        styles.screen,
        {backgroundColor: theme.colors.canvas, paddingTop: insets.top + 6},
      ]}>
      {/* A title bar: the way back on the left, the name of the screen in the
          middle of the same line, and nothing else on it. */}
      <View style={styles.header}>
        <Pressable
          onPress={navigation.goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to the home screen"
          hitSlop={12}
          style={({pressed}) => [
            styles.back,
            {
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.5 : 1,
            },
          ]}>
          <Icon name="chevronLeft" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.title, {color: theme.colors.text}]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          {paddingBottom: insets.bottom + 36},
        ]}
        showsVerticalScrollIndicator={false}>
        <Section theme={theme} title="Permissions">
          <Card theme={theme}>
            {permissions.map((permission, position) => (
              <Pressable
                key={permission.key}
                onPress={permission.request}
                accessibilityRole="button"
                accessibilityState={{checked: permission.granted}}
                accessibilityHint={
                  permission.granted
                    ? 'Opens the system screen where it can be turned off'
                    : 'Opens the system screen where it can be granted'
                }
                style={({pressed}) => [
                  styles.row,
                  position > 0 && [
                    styles.divided,
                    {borderTopColor: theme.colors.border},
                  ],
                  {opacity: pressed ? 0.5 : 1},
                ]}>
                <Tile theme={theme} icon={permission.icon} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                    {permission.title}
                  </Text>
                  <Text
                    style={[
                      styles.rowBody,
                      {
                        color: theme.colors.textMuted,
                      },
                    ]}>
                    {permission.body}
                  </Text>
                </View>
                {/* Granted is a fact and states itself quietly; not granted is
                    the thing to do next, and inverting is how this palette says
                    so without a colour to say it in. */}
                <View
                  style={[
                    styles.chip,
                    permission.granted
                      ? {backgroundColor: theme.colors.elevated}
                      : {backgroundColor: theme.colors.text},
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: permission.granted
                          ? theme.colors.textSecondary
                          : theme.colors.textInverse,
                      },
                    ]}>
                    {permission.granted ? 'On' : 'Grant'}
                  </Text>
                </View>
                <Icon
                  name="chevronRight"
                  size={16}
                  color={theme.colors.textMuted}
                />
              </Pressable>
            ))}
          </Card>
          <Callout
            theme={theme}
            icon="shield"
            body="None of these is required. The launcher searches and opens apps without any of them."
          />
        </Section>

        <Section theme={theme} title="Appearance">
          <Card theme={theme}>
            <View style={styles.control}>
              <View style={styles.controlHead}>
                <View style={[styles.mark, {borderColor: theme.colors.border}]}>
                  <Icon name="brush" size={17} color={theme.colors.text} />
                </View>
                <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                  Theme
                </Text>
              </View>
              {/* Three words in a row rather than a menu: with this few
                  choices, showing them all is shorter than hiding two. */}
              <View
                style={[
                  styles.segments,
                  {backgroundColor: theme.colors.canvas},
                ]}>
                {THEME_CHOICES.map(choice => {
                  const selected = choice.value === themeMode;
                  const ink = selected
                    ? theme.colors.textInverse
                    : theme.colors.textSecondary;
                  return (
                    <Pressable
                      key={choice.value}
                      onPress={() => setThemeMode(choice.value)}
                      accessibilityRole="radio"
                      accessibilityState={{selected}}
                      style={({pressed}) => [
                        styles.segment,
                        selected && {backgroundColor: theme.colors.text},
                        {opacity: pressed && !selected ? 0.6 : 1},
                      ]}>
                      <Icon name={choice.icon} size={15} color={ink} />
                      <Text style={[styles.segmentText, {color: ink}]}>
                        {choice.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.control,
                styles.divided,
                {borderTopColor: theme.colors.border},
              ]}>
              <View style={styles.controlHead}>
                <View style={[styles.mark, {borderColor: theme.colors.border}]}>
                  <Icon name="droplet" size={17} color={theme.colors.text} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                    Wallpaper wash
                  </Text>
                  <Text
                    style={[
                      styles.rowBody,
                      {
                        color: theme.colors.textMuted,
                      },
                    ]}>
                    Darkens the wallpaper behind the text. Raise it if a busy
                    photograph makes the app names hard to read.
                  </Text>
                </View>
              </View>
              <View style={styles.slider}>
                <Slider
                  count={SCRIM_STEPS.length}
                  index={scrimIndex}
                  onChange={chooseWash}
                  color={theme.colors.text}
                  trackColor={theme.colors.selection}
                  label={SCRIM_LABELS[scrimIndex] ?? SCRIM_LABELS[0]}
                />
                {/* The stops named, and each name a way to reach its stop —
                    four positions are fiddly to land on exactly by dragging. */}
                <View style={styles.stops}>
                  {SCRIM_LABELS.map((label, position) => (
                    <Pressable
                      key={label}
                      onPress={() => chooseWash(position)}
                      accessibilityRole="button"
                      accessibilityLabel={label + ' wallpaper wash'}
                      hitSlop={8}
                      style={styles.stop}>
                      <Text
                        style={[
                          styles.stopText,
                          position === 0 && styles.stopFirst,
                          position === SCRIM_LABELS.length - 1 &&
                            styles.stopLast,
                          {
                            color:
                              position === scrimIndex
                                ? theme.colors.text
                                : theme.colors.textMuted,
                          },
                        ]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </Card>
        </Section>

        <Callout
          theme={theme}
          icon="sparkle"
          filled
          title="Minimal by design"
          body="No widgets. No folders. Just search and go."
        />
      </ScrollView>
    </View>
  );
}

/** A labelled group: the name of the category, then everything under it. */
function Section({
  theme,
  title,
  children,
}: {
  theme: Theme;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, {color: theme.colors.textMuted}]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * The ground a group of rows shares.
 *
 * The card is what does the grouping: the label names the category from
 * outside, and everything belonging to it sits on one raised surface.
 */
function Card({theme, children}: {theme: Theme; children: React.ReactNode}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      {children}
    </View>
  );
}

/**
 * A rounded square holding one pictogram — what makes a row findable at a
 * glance rather than only readable.
 *
 * With no colour to tell the rows apart, the drawing has to do all of it, so
 * the tile is a quiet ground and the icon on it is at full ink. A row's picture
 * is the only thing on the screen that differs from the row above it before you
 * have read a word.
 */
function Tile({
  theme,
  icon,
  size = TILE,
}: {
  theme: Theme;
  icon: IconName;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: theme.colors.elevated,
          borderColor: theme.colors.border,
        },
      ]}>
      <Icon
        name={icon}
        size={Math.round(size * 0.46)}
        color={theme.colors.text}
      />
    </View>
  );
}

/**
 * A card that says something rather than does something: the line about none of
 * the permissions being required, and the one at the foot of the screen.
 *
 * Deliberately a card of the same family as the rows above it. A note set loose
 * on the canvas reads as an afterthought, and both of these are things the
 * screen means.
 */
function Callout({
  theme,
  icon,
  title,
  body,
  filled = false,
}: {
  theme: Theme;
  icon: IconName;
  title?: string;
  body: string;
  /** True for a filled tile, false for the quieter outlined ring. */
  filled?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        styles.callout,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      {filled ? (
        <Tile theme={theme} icon={icon} size={40} />
      ) : (
        <View style={[styles.mark, {borderColor: theme.colors.border}]}>
          <Icon name={icon} size={17} color={theme.colors.textSecondary} />
        </View>
      )}
      <View style={styles.rowText}>
        {title !== undefined ? (
          <Text style={[styles.calloutTitle, {color: theme.colors.text}]}>
            {title}
          </Text>
        ) : null}
        <Text
          style={[
            styles.rowBody,
            title === undefined && styles.calloutBody,
            {color: theme.colors.textMuted},
          ]}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginBottom: 18,
  },
  back: {
    // Taken out of the row so the title is centred on the screen rather than on
    // whatever space the button leaves behind. Being out of the row also takes
    // it out of the header's padding — an absolute child measures from the
    // padding edge — so the gutter has to be spelled out here.
    position: 'absolute',
    left: GUTTER,
    width: 44,
    height: 44,
    // The same corner as a row's tile, so the one control in the header reads
    // as part of the family of squares below it rather than as a stray dot.
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: GUTTER,
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: TILE_GAP,
  },
  /** The tile's quiet counterpart, for a row that is a control of our own. */
  mark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 17,
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
  },
  control: {
    paddingVertical: 16,
  },
  controlHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segments: {
    flexDirection: 'row',
    borderRadius: 15,
    padding: 4,
    marginTop: 14,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 14,
    marginLeft: 7,
  },
  slider: {
    marginTop: 16,
  },
  stops: {
    flexDirection: 'row',
    marginTop: 2,
  },
  stop: {
    flex: 1,
  },
  stopText: {
    fontSize: 13,
    textAlign: 'center',
  },
  // The outermost two sit against the ends of the track rather than over the
  // middle of their share of the row, which is where their stops are.
  stopFirst: {
    textAlign: 'left',
  },
  stopLast: {
    textAlign: 'right',
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 12,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  calloutBody: {
    marginTop: 0,
  },
});
