import React, {memo} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useTheme} from '../theme';

/** Imperative handle on the search field, used to restore focus. */
export type SearchInputHandle = React.ComponentRef<typeof TextInput>;

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  /** Fired by the keyboard's action key; launches the top result. */
  onSubmit: () => void;
  onClear: () => void;
  inputRef: React.RefObject<SearchInputHandle | null>;
};

/**
 * The launcher's primary control. It is deliberately chrome-free: no box, no
 * border, no search button — just text on the background with a caret.
 */
function SearchInputComponent({
  value,
  onChangeText,
  onSubmit,
  onClear,
  inputRef,
}: Props) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Search apps"
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          {color: theme.colors.text, fontFamily: theme.fonts.ui},
        ]}
        // Open ready to type, and stay open after the action key so a mistyped
        // query can be corrected without tapping back into the field.
        autoFocus
        blurOnSubmit={false}
        returnKeyType="go"
        // A launcher search box should never be autocorrected, capitalised or
        // suggested into something other than what was typed.
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        importantForAutofill="no"
        // Without this, landscape typing hijacks the whole screen with the
        // system's fullscreen editor.
        disableFullscreenUI
        underlineColorAndroid="transparent"
        cursorColor={theme.colors.caret}
        selectionColor={theme.colors.selection}
        selectionHandleColor={theme.colors.caret}
      />

      {value.length > 0 ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={16}
          style={({pressed}) => [styles.clear, {opacity: pressed ? 0.4 : 1}]}>
          <Text style={[styles.clearGlyph, {color: theme.colors.textSecondary}]}>
            ×
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    // Above the 21pt result rows, so the field still reads as the thing you
    // type into rather than the first item in the list, but only just — the
    // query is a means to the results, not the point of the screen.
    fontSize: 23,
    // A display face carries its own spacing; the negative tracking that suited
    // Roboto here only crowds it.
    letterSpacing: 0,
    // Strip every trace of the platform EditText so only the glyphs remain.
    padding: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    minHeight: 44,
  },
  clear: {
    paddingLeft: 16,
  },
  clearGlyph: {
    fontSize: 28,
    lineHeight: 32,
    includeFontPadding: false,
  },
});

export const SearchInput = memo(SearchInputComponent);
