import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AppState,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon, type IconName} from '../components/Icon';
import {
  canLockScreen,
  hasUsageAccess,
  isDefaultLauncher,
  requestDefaultLauncher,
  requestLockScreenPermission,
  requestUsageAccess,
} from '../native/LauncherModule';
import {usePreferences, type FontFamily, type ThemeMode} from '../preferences';
import {FONT_SCALES, SCRIM_STEPS, useTheme, type Theme} from '../theme';

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

/** One option in a {@link Segmented} row. */
type Choice<T> = {
  value: T;
  label: string;
  /** Left off where the options have no picture to give them, as the wash has. */
  icon?: IconName;
};

const THEME_CHOICES: readonly Choice<ThemeMode>[] = [
  {value: 'system', label: 'System', icon: 'contrast'},
  {value: 'dark', label: 'Dark', icon: 'moon'},
  {value: 'light', label: 'Light', icon: 'sun'},
];

const TYPEFACE_CHOICES: readonly Choice<FontFamily>[] = [
  {value: 'system', label: 'System'},
  {value: 'serif', label: 'Serif'},
  {value: 'mono', label: 'Mono'},
  {value: 'condensed', label: 'Narrow'},
];

/** One label per step in {@link FONT_SCALES}, in the same order. */
const SIZE_LABELS = ['Small', 'Default', 'Large', 'Huge'] as const;

const SIZE_CHOICES: readonly Choice<number>[] = FONT_SCALES.map(
  (scale, position) => ({
    value: scale,
    label: SIZE_LABELS[position] ?? `${Math.round(scale * 100)}%`,
  }),
);

/**
 * The two documents the Play listing is required to point at, served as static
 * pages from the repository rather than from anywhere this app talks to. The
 * launcher makes no network requests of its own; opening one of these hands the
 * address to the browser and is the only time anything leaves the device.
 */
const PRIVACY_URL =
  'https://joydeepsetua.github.io/jode-launcher/privacy-policy.html';
const TERMS_URL = 'https://joydeepsetua.github.io/jode-launcher/terms.html';

/** The listing, addressed to a browser and to the Play Store app in turn. */
const LISTING_URL =
  'https://play.google.com/store/apps/details?id=com.zypido.jode';
const LISTING_APP_URL = 'market://details?id=com.zypido.jode';

/**
 * Hands an address to whatever the device opens it with.
 *
 * A failure here is a device with nothing willing to open the link — no
 * browser, or a work profile that forbids it. There is nothing this screen can
 * do about that and nothing useful it could say, so the tap does nothing rather
 * than raising a dialog about it.
 */
function openUrl(url: string): void {
  Linking.openURL(url).catch(error => {
    if (__DEV__) {
      console.warn(`[settings] could not open ${url}`, error);
    }
  });
}

/**
 * The listing in the Play Store app, or in a browser on a device that has no
 * Play Store — which is every sideloaded install, and the case where sending
 * the user to a `market://` address they cannot open would be the whole of what
 * the row did.
 */
function rate(): void {
  Linking.openURL(LISTING_APP_URL).catch(() => openUrl(LISTING_URL));
}

/** The system share sheet, with the listing to send on. */
function share(): void {
  Share.share({
    message: `JODE Launcher — a home screen that is just a search box.\n${LISTING_URL}`,
  }).catch(error => {
    if (__DEV__) {
      console.warn('[settings] could not open the share sheet', error);
    }
  });
}

/** A row that leaves the app: the last group on the screen. */
type Destination = {
  key: string;
  title: string;
  body: string;
  icon: IconName;
  open: () => void;
};

const DESTINATIONS: readonly Destination[] = [
  {
    key: 'privacy',
    title: 'Privacy policy',
    body: 'What the launcher reads, and everything it does not.',
    icon: 'shield',
    open: () => openUrl(PRIVACY_URL),
  },
  {
    key: 'terms',
    title: 'Terms & conditions',
    body: 'The terms the app is offered under.',
    icon: 'fileText',
    open: () => openUrl(TERMS_URL),
  },
  {
    key: 'share',
    title: 'Share JODE',
    body: 'Send the app on to someone who would use it.',
    icon: 'share',
    open: share,
  },
  {
    key: 'rate',
    title: 'Rate JODE',
    body: 'Leave a review on the Play Store.',
    icon: 'star',
    open: rate,
  },
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
 * The wash as the segmented row wants it: the opacity to store, under the word
 * for it. A step the labels have not been extended to cover names itself in
 * percent rather than going blank, so adding a stop cannot silently ship an
 * unlabelled segment.
 */
const WASH_CHOICES: readonly Choice<number>[] = SCRIM_STEPS.map(
  (step, position) => ({
    value: step,
    label: SCRIM_LABELS[position] ?? `${Math.round(step * 100)}%`,
  }),
);

/**
 * The stop a stored number is nearest to.
 *
 * Both the wash and the text size are stored as the thing itself rather than as
 * a position, so what is on disk need not be one of the stops on offer: an
 * older build wrote it, or the stops have since moved. Rounding to the nearest
 * one keeps a segment lit in either case, where matching exactly would light
 * none and read as a setting with no value at all.
 */
function nearestChoice(
  choices: readonly Choice<number>[],
  value: number,
): number {
  let best = choices[0]?.value ?? 0;
  let gap = Number.POSITIVE_INFINITY;
  for (const choice of choices) {
    const distance = Math.abs(choice.value - value);
    if (distance < gap) {
      best = choice.value;
      gap = distance;
    }
  }
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
  const {
    themeMode,
    scrimOpacity,
    fontFamily,
    fontScale,
    setThemeMode,
    setScrimOpacity,
    setFontFamily,
    setFontScale,
  } = usePreferences();

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

  // A segment's value is the thing to store, so choosing one needs nothing in
  // between — the setters below take it as it comes. Only reading goes the long
  // way round, through the nearest stop.
  const wash = nearestChoice(WASH_CHOICES, scrimOpacity);
  const size = nearestChoice(SIZE_CHOICES, fontScale);

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
                  <Icon name="palette" size={17} color={theme.colors.text} />
                </View>
                <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                  Theme
                </Text>
              </View>
              <Segmented
                theme={theme}
                choices={THEME_CHOICES}
                selected={themeMode}
                onChange={setThemeMode}
                name="theme"
              />
            </View>

            <View
              style={[
                styles.control,
                styles.divided,
                {borderTopColor: theme.colors.border},
              ]}>
              <View style={styles.controlHead}>
                <View style={[styles.mark, {borderColor: theme.colors.border}]}>
                  <Icon name="image" size={17} color={theme.colors.text} />
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
              <Segmented
                theme={theme}
                choices={WASH_CHOICES}
                selected={wash}
                onChange={setScrimOpacity}
                name="wallpaper wash"
              />
            </View>
          </Card>
        </Section>

        <Section theme={theme} title="Text">
          <Card theme={theme}>
            <View style={styles.control}>
              <View style={styles.controlHead}>
                <View style={[styles.mark, {borderColor: theme.colors.border}]}>
                  <Icon name="letter" size={17} color={theme.colors.text} />
                </View>
                <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                  Typeface
                </Text>
              </View>
              <Segmented
                theme={theme}
                choices={TYPEFACE_CHOICES}
                selected={fontFamily}
                onChange={setFontFamily}
                name="typeface"
              />
            </View>

            <View
              style={[
                styles.control,
                styles.divided,
                {borderTopColor: theme.colors.border},
              ]}>
              <View style={styles.controlHead}>
                <View style={[styles.mark, {borderColor: theme.colors.border}]}>
                  <Icon name="expand" size={17} color={theme.colors.text} />
                </View>
                <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                  Size
                </Text>
              </View>
              <Segmented
                theme={theme}
                choices={SIZE_CHOICES}
                selected={size}
                onChange={setFontScale}
                name="text size"
              />
            </View>
          </Card>
          <Callout
            theme={theme}
            icon="home"
            body="Both apply to the home screen — app names, the clock and what you type. This screen keeps its own size, so its controls stay where you left them."
          />
        </Section>

        <Section theme={theme} title="About">
          <Card theme={theme}>
            {DESTINATIONS.map((destination, position) => (
              <Pressable
                key={destination.key}
                onPress={destination.open}
                accessibilityRole="button"
                accessibilityLabel={destination.title}
                accessibilityHint="Opens outside the launcher"
                style={({pressed}) => [
                  styles.row,
                  position > 0 && [
                    styles.divided,
                    {borderTopColor: theme.colors.border},
                  ],
                  {opacity: pressed ? 0.5 : 1},
                ]}>
                <Tile theme={theme} icon={destination.icon} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, {color: theme.colors.text}]}>
                    {destination.title}
                  </Text>
                  <Text
                    style={[styles.rowBody, {color: theme.colors.textMuted}]}>
                    {destination.body}
                  </Text>
                </View>
                {/* No chip on these rows: a chip states what something is set
                    to, and none of these is set to anything. */}
                <Icon
                  name="chevronRight"
                  size={16}
                  color={theme.colors.textMuted}
                />
              </Pressable>
            ))}
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
 * A row of choices with every one of them showing, the current one filled in.
 *
 * Both appearance settings are a short closed list, and at this length laying
 * the options out is shorter than hiding all but one behind a menu: there is
 * nothing to open, and what is set now can be read without tapping anything.
 * The wash was a slider until it was this, which asked the user to land on one
 * of four positions by dragging to say something as coarse as "a bit darker".
 *
 * Generic over the value because the two lists hold different things — the
 * theme stores a name, the wash stores the opacity itself — so a choice can
 * carry the value to store rather than an index the caller has to look up.
 * Nothing is filled in when the current value is not one of the choices, which
 * is a truthful thing to show and the reason the wash rounds to a stop first.
 */
function Segmented<T>({
  theme,
  choices,
  selected,
  onChange,
  name,
}: {
  theme: Theme;
  choices: readonly Choice<T>[];
  selected: T;
  onChange: (value: T) => void;
  /** What the choices are of, for a screen reader that hears no heading. */
  name: string;
}) {
  return (
    <View style={[styles.segments, {backgroundColor: theme.colors.canvas}]}>
      {choices.map(choice => {
        const isSelected = choice.value === selected;
        const ink = isSelected
          ? theme.colors.textInverse
          : theme.colors.textSecondary;
        return (
          <Pressable
            key={choice.label}
            onPress={() => onChange(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{selected: isSelected}}
            accessibilityLabel={`${choice.label} ${name}`}
            style={({pressed}) => [
              styles.segment,
              isSelected && {backgroundColor: theme.colors.text},
              {opacity: pressed && !isSelected ? 0.6 : 1},
            ]}>
            {choice.icon !== undefined ? (
              <Icon name={choice.icon} size={15} color={ink} />
            ) : null}
            <Text
              style={[
                styles.segmentText,
                choice.icon === undefined && styles.segmentTextAlone,
                {color: ink},
              ]}>
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
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
  // The gap belongs to the icon, so a label standing on its own gives it back
  // and sits centred in the segment rather than pushed off it.
  segmentTextAlone: {
    marginLeft: 0,
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
