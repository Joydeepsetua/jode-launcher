/**
 * The list the user builds their own home screen out of.
 *
 * Reached from settings, and only meaningful there: the home screen shows what
 * is picked here when its source is set to the chosen apps. Every launchable
 * app is on it, in the same alphabetical order the drawer uses, with a search
 * field for the phones that have two hundred of them.
 *
 * A tap toggles one app and the store is written on the spot — there is no
 * Save, because there is nothing here that could be half-done. Order is the
 * order things were picked, so the home screen lists them the way the user
 * built the list rather than the way the alphabet happens to fall.
 *
 * Opaque, like settings and for the same reasons.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon} from '../components/Icon';
import {useInstalledApps} from '../hooks/useInstalledApps';
import {MAX_HOME_APPS} from '../native/LauncherModule';
import {usePreferences} from '../preferences';
import {useTheme, type Theme} from '../theme';
import type {AppInfo} from '../types/app';
import {searchApps} from '../utils/appSearch';

/** The same margin the settings screen holds, so the two read as one place. */
const GUTTER = 12;

/** One app, and whether it is on the home screen. */
type Row = {
  app: AppInfo;
  chosen: boolean;
  /** False for an unpicked app while the list is full: nothing left to give. */
  enabled: boolean;
};

export function ChooseAppsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {homeAppIds, setHomeAppIds} = usePreferences();
  const {apps, index, loading, error} = useInstalledApps();
  const [query, setQuery] = useState('');

  /**
   * Back leaves this screen, for the same reason it has to on settings: the
   * launcher's own handler is still registered underneath and swallows it.
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

  // Membership is asked once per keystroke rather than once per row.
  const picked = useMemo(() => new Set(homeAppIds), [homeAppIds]);
  const full = homeAppIds.length >= MAX_HOME_APPS;

  /**
   * Adds an app to the end of the list, or takes it out of the middle.
   *
   * Appending is what makes the order the user's: they pick top to bottom and
   * the home screen reads the same way. Removing leaves the rest as they were,
   * so taking one out is not a reshuffle of everything below it.
   */
  const toggle = useCallback(
    (app: AppInfo) => {
      if (picked.has(app.id)) {
        setHomeAppIds(homeAppIds.filter(id => id !== app.id));
      } else if (homeAppIds.length < MAX_HOME_APPS) {
        setHomeAppIds([...homeAppIds, app.id]);
      }
    },
    [homeAppIds, picked, setHomeAppIds],
  );

  const rows = useMemo<Row[]>(() => {
    const matches =
      query.trim().length === 0
        ? apps
        : searchApps(index, query).map(result => result.app);
    return matches.map(app => {
      const chosen = picked.has(app.id);
      return {app, chosen, enabled: chosen || !full};
    });
  }, [apps, full, index, picked, query]);

  const renderItem = useCallback(
    ({item, index: position}: ListRenderItemInfo<Row>) => (
      <AppRow
        theme={theme}
        row={item}
        divided={position > 0}
        onPress={toggle}
      />
    ),
    [theme, toggle],
  );

  const keyExtractor = useCallback((row: Row) => row.app.id, []);

  /** What sits where the list would be when there is no list to show. */
  const emptyMessage = useMemo(() => {
    if (error !== null) {
      return 'Could not read the app list.';
    }
    if (loading) {
      return 'Reading the app list…';
    }
    if (apps.length === 0) {
      return 'No launchable apps found.';
    }
    return 'No app matches that.';
  }, [apps.length, error, loading]);

  return (
    <View
      style={[
        styles.screen,
        {backgroundColor: theme.colors.canvas, paddingTop: insets.top + 6},
      ]}>
      <View style={styles.header}>
        <Pressable
          onPress={navigation.goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
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
        <Text style={[styles.title, {color: theme.colors.text}]}>
          Choose apps
        </Text>
      </View>

      {/* The count is the one thing about this screen that changes as it is
          used, so it is said in words above the list rather than left for the
          user to add up from the ticks. */}
      <Text style={[styles.count, {color: theme.colors.textMuted}]}>
        {homeAppIds.length === 0
          ? `Nothing chosen yet — up to ${MAX_HOME_APPS}`
          : `${homeAppIds.length} of ${MAX_HOME_APPS} chosen${
              full ? ' — the list is full' : ''
            }`}
      </Text>

      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Icon name="search" size={17} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search apps"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.fieldInput, {color: theme.colors.text}]}
          // Unlike the launcher's own field this one does not open the keyboard
          // on arrival: the list is the point here, and typing is the shortcut.
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          disableFullscreenUI
          underlineColorAndroid="transparent"
          cursorColor={theme.colors.caret}
          selectionColor={theme.colors.selection}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            hitSlop={12}>
            <Text style={[styles.clear, {color: theme.colors.textMuted}]}>
              ×
            </Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        // A tap on a row while the keyboard is up should pick that app, not
        // spend itself dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
        ListEmptyComponent={
          <Text style={[styles.empty, {color: theme.colors.textMuted}]}>
            {emptyMessage}
          </Text>
        }
        ListFooterComponent={<View style={{height: insets.bottom + 28}} />}
      />
    </View>
  );
}

/**
 * One app on the list: its name, and a box that is ticked when the app is on
 * the home screen.
 *
 * A row that cannot be picked because the list is already full is dimmed rather
 * than hidden — the app is still installed, and what has run out is room, which
 * the line above the list says in words.
 */
function AppRow({
  theme,
  row,
  divided,
  onPress,
}: {
  theme: Theme;
  row: Row;
  divided: boolean;
  onPress: (app: AppInfo) => void;
}) {
  const {app, chosen, enabled} = row;
  return (
    <Pressable
      onPress={() => onPress(app)}
      disabled={!enabled}
      accessibilityRole="checkbox"
      accessibilityState={{checked: chosen, disabled: !enabled}}
      accessibilityLabel={app.name}
      accessibilityHint={
        chosen
          ? 'Takes it off the home screen'
          : 'Puts it on the home screen'
      }
      style={({pressed}) => [
        styles.row,
        divided && [styles.divided, {borderTopColor: theme.colors.border}],
        {opacity: pressed ? 0.5 : enabled ? 1 : 0.4},
      ]}>
      <Text
        style={[styles.name, {color: theme.colors.text}]}
        numberOfLines={1}
        ellipsizeMode="tail">
        {app.name}
      </Text>
      <View
        style={[
          styles.box,
          chosen
            ? {backgroundColor: theme.colors.text, borderColor: theme.colors.text}
            : {borderColor: theme.colors.border},
        ]}>
        {chosen ? (
          <Icon name="check" size={14} color={theme.colors.textInverse} />
        ) : null}
      </View>
    </Pressable>
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
    marginBottom: 14,
  },
  back: {
    position: 'absolute',
    left: GUTTER,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  count: {
    fontSize: 13,
    marginHorizontal: GUTTER + 4,
    marginBottom: 12,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: GUTTER,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 11,
    marginLeft: 10,
    includeFontPadding: false,
  },
  clear: {
    fontSize: 22,
    paddingLeft: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    marginHorizontal: GUTTER,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    // A card with nothing in it should still look like the card the rows will
    // arrive on, rather than collapsing to a line.
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  name: {
    flex: 1,
    fontSize: 17,
    paddingRight: 14,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 18,
  },
});
