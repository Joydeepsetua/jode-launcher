import React, {memo, useCallback} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {typeStyle, useTheme} from '../theme';
import type {SearchResult} from '../types/app';

/** The size a name is drawn at, before the user's scale is applied. */
const SIZE_NAME = 21;

type Props = {
  result: SearchResult;
  onPress: (result: SearchResult) => void;
};

/**
 * One result row: the app name and nothing else, with the matched span of the
 * name at full strength and the rest dimmed. The highlight is the only feedback
 * the list gives about *why* a result is here — no icons, no badges, no
 * secondary text. Names are what you search, so names are what you read.
 */
function AppListItemComponent({result, onPress}: Props) {
  const theme = useTheme();
  const {app, matchStart, matchLength} = result;

  const handlePress = useCallback(() => {
    onPress(result);
  }, [onPress, result]);

  const hasHighlight = matchStart >= 0 && matchLength > 0;
  const before = hasHighlight ? app.name.slice(0, matchStart) : '';
  const matched = hasHighlight
    ? app.name.slice(matchStart, matchStart + matchLength)
    : app.name;
  const after = hasHighlight ? app.name.slice(matchStart + matchLength) : '';

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${app.name}`}
      style={({pressed}) => [
        styles.row,
        {
          height: theme.spacing.rowHeight,
          paddingHorizontal: theme.spacing.gutter,
          opacity: pressed ? 0.45 : 1,
        },
      ]}>
      <Text
        style={[
          styles.name,
          typeStyle(theme, SIZE_NAME),
          {color: theme.colors.textSecondary},
        ]}
        numberOfLines={1}
        ellipsizeMode="tail">
        {before}
        <Text style={{color: theme.colors.text}}>{matched}</Text>
        {after}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    justifyContent: 'center',
  },
  name: {
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
});

/**
 * Rows are re-rendered on every keystroke, so equality is checked by value: the
 * result object is new each search but usually describes the same row.
 */
export const AppListItem = memo(
  AppListItemComponent,
  (previous, next) =>
    previous.onPress === next.onPress &&
    previous.result.app.id === next.result.app.id &&
    previous.result.app.name === next.result.app.name &&
    previous.result.matchStart === next.result.matchStart &&
    previous.result.matchLength === next.result.matchLength,
);
