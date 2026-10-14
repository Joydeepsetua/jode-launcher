/**
 * What holding an app offers, as a small card beside the row that was held —
 * the shape Android's own launchers give their long-press menus.
 *
 * The things only this launcher can do sit in the list: a place on the home
 * screen, a name of your own, out of sight altogether. The things the system
 * does — App info, Share, Uninstall — sit along the bottom as a row of icons,
 * the way the stock launcher keeps its system shortcuts apart from the app's.
 *
 * Renaming happens in the same card: it swaps its list for a field rather
 * than stacking a dialog on a menu.
 */
import React, {useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon, type IconName} from './Icon';
import type {MenuAnchor} from './AppListItem';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import {useTheme, type Theme} from '../theme';
import type {AppInfo} from '../types/app';

/** Narrow enough to read as a popup, wide enough for "Remove from home". */
const CARD_WIDTH = 236;

/** Space kept between the card and the row it belongs to. */
const GAP = 4;

/** Space the card always keeps from the edges of the screen. */
const MARGIN = 16;

type Props = {
  /** The app held, or null while the menu is closed. */
  app: AppInfo | null;
  /** Where the held row sits on screen. */
  anchor: MenuAnchor | null;
  /** Whether the app is one of the chosen home screen apps. */
  onHome: boolean;
  /** The chosen list is full, so adding is not on offer. */
  homeFull: boolean;
  onClose: () => void;
  onToggleHome: (app: AppInfo) => void;
  /** An empty name, or the app's own, puts the app's own name back. */
  onRename: (app: AppInfo, name: string) => void;
  onHide: (app: AppInfo) => void;
  onInfo: (app: AppInfo) => void;
  onShare: (app: AppInfo) => void;
  onUninstall: (app: AppInfo) => void;
};

type Action = {
  key: string;
  label: string;
  icon: IconName;
  run: () => void;
};

export function AppActionsMenu({
  app,
  anchor,
  onHome,
  homeFull,
  onClose,
  onToggleHome,
  onRename,
  onHide,
  onInfo,
  onShare,
  onUninstall,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  // Mounted afresh for every hold (the caller keys it by app), so each one
  // starts on the list with the current name, never half-way through a rename.
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(app?.name ?? '');
  // Measured, because the list is shorter for an app that cannot be added.
  const [cardHeight, setCardHeight] = useState(0);
  const pop = useRef(new Animated.Value(0)).current;

  if (app === null || anchor === null) {
    return null;
  }

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (cardHeight === 0) {
      // Pops out only once its size is known, so it never jumps into place.
      Animated.timing(pop, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    setCardHeight(height);
  };

  // Below the row when it fits, above it when it does not — and above the
  // keyboard while renaming, which is where the field has to be to be seen.
  const floor = window.height - insets.bottom - MARGIN - keyboardHeight;
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - cardHeight;
  const opensBelow = below + cardHeight <= floor;
  const top = Math.max(
    insets.top + MARGIN,
    Math.min(opensBelow ? below : above, floor - cardHeight),
  );
  const left = Math.min(
    theme.spacing.gutter - 8,
    window.width - CARD_WIDTH - MARGIN,
  );

  const renamed = app.name !== app.label;

  // Each option closes the menu first: the system screens they open arrive
  // over the launcher, and coming back should land on the home screen.
  const act = (run: (target: AppInfo) => void) => () => {
    onClose();
    run(app);
  };

  const listed: Action[] = [
    ...(onHome || !homeFull
      ? [
          {
            key: 'home',
            label: onHome ? 'Remove from home' : 'Add to home',
            icon: 'home' as const,
            run: act(onToggleHome),
          },
        ]
      : []),
    {
      key: 'rename',
      label: 'Rename',
      icon: 'edit',
      run: () => setRenaming(true),
    },
    {key: 'hide', label: 'Hide', icon: 'eyeOff', run: act(onHide)},
  ];

  const system: Action[] = [
    {key: 'info', label: 'App info', icon: 'info', run: act(onInfo)},
    {key: 'share', label: 'Share', icon: 'share', run: act(onShare)},
    ...(app.uninstallable
      ? [
          {
            key: 'uninstall',
            label: 'Uninstall',
            icon: 'trash' as const,
            run: act(onUninstall),
          },
        ]
      : []),
  ];

  const save = () => {
    onRename(app, draft.trim());
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, StyleSheet.absoluteFill]}
        onPress={onClose}
        accessibilityLabel="Close app options"
      />
      <Animated.View
        onLayout={handleLayout}
        style={[
          styles.card,
          {
            top,
            left,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: pop,
            transform: [
              {
                scale: pop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
              {
                translateY: pop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [opensBelow ? -8 : 8, 0],
                }),
              },
            ],
          },
        ]}>
        {renaming ? (
          <View style={styles.rename}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={save}
              autoFocus
              selectTextOnFocus
              placeholder={app.label}
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="done"
              autoCorrect={false}
              disableFullscreenUI
              underlineColorAndroid="transparent"
              cursorColor={theme.colors.caret}
              selectionColor={theme.colors.selection}
              maxLength={60}
              style={[
                styles.field,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.elevated,
                },
              ]}
            />
            <View style={styles.buttons}>
              {renamed ? (
                <TextButton
                  theme={theme}
                  label="Reset"
                  onPress={() => {
                    onRename(app, '');
                    onClose();
                  }}
                />
              ) : null}
              <View style={styles.spacer} />
              <TextButton
                theme={theme}
                label="Cancel"
                onPress={() => setRenaming(false)}
              />
              <TextButton theme={theme} label="Save" onPress={save} strong />
            </View>
          </View>
        ) : (
          <>
            {listed.map(action => (
              <Pressable
                key={action.key}
                onPress={action.run}
                accessibilityRole="button"
                style={({pressed}) => [
                  styles.item,
                  pressed && {backgroundColor: theme.colors.elevated},
                ]}>
                <Icon
                  name={action.icon}
                  size={18}
                  color={theme.colors.textSecondary}
                />
                <Text style={[styles.itemLabel, {color: theme.colors.text}]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <View
              style={[styles.system, {borderTopColor: theme.colors.border}]}>
              {system.map(action => (
                <Pressable
                  key={action.key}
                  onPress={action.run}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  hitSlop={4}
                  style={({pressed}) => [
                    styles.systemButton,
                    pressed && {backgroundColor: theme.colors.elevated},
                  ]}>
                  <Icon
                    name={action.icon}
                    size={20}
                    color={theme.colors.text}
                  />
                </Pressable>
              ))}
            </View>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

function TextButton({
  theme,
  label,
  onPress,
  strong = false,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  strong?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({pressed}) => [styles.textButton, {opacity: pressed ? 0.5 : 1}]}>
      <Text
        style={[
          styles.textButtonLabel,
          strong && styles.textButtonStrong,
          {color: strong ? theme.colors.text : theme.colors.textSecondary},
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Just enough to say the launcher behind is not what the finger is on now.
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    overflow: 'hidden',
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 44,
    paddingHorizontal: 18,
  },
  itemLabel: {
    fontSize: 15,
    letterSpacing: 0.1,
  },
  system: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 6,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  systemButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rename: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  field: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spacer: {
    flex: 1,
  },
  textButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  textButtonLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  textButtonStrong: {
    fontWeight: '700',
  },
});
