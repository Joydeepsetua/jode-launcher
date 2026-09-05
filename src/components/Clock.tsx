import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useClock} from '../hooks/useClock';
import {typeStyle, useTheme} from '../theme';

/**
 * The sizes the clock is drawn at, before the user's scale is applied.
 *
 * Held here rather than in the stylesheet because the size that ships is the
 * one {@link typeStyle} multiplies, and a stylesheet entry naming a size the
 * theme then overrides is a size that lies about what appears on screen.
 */
const SIZE = {
  /** The reading itself, and the largest thing on the home screen. */
  time: 52,
  /** A qualifier: at full size AM/PM competes with the time it qualifies. */
  meridiem: 18,
  date: 14,
} as const;

/** The one piece of ambient information on the screen. */
function ClockComponent() {
  const theme = useTheme();
  const {time, meridiem, date} = useClock();

  return (
    <View accessibilityRole="text">
      <View style={styles.row}>
        <Text
          style={[
            styles.time,
            typeStyle(theme, SIZE.time),
            {color: theme.colors.text},
          ]}
          // Never let a long format push the layout around.
          numberOfLines={1}>
          {time}
        </Text>
        {/* Set well down from the digits: it is a qualifier, not part of the
            reading, and at full size AM/PM competes with the time itself. */}
        <Text
          style={[
            styles.meridiem,
            typeStyle(theme, SIZE.meridiem),
            {color: theme.colors.textSecondary},
          ]}>
          {meridiem}
        </Text>
      </View>

      <Text
        style={[
          styles.date,
          typeStyle(theme, SIZE.date),
          // Full strength, not the dimmed secondary: at this size over a
          // wallpaper there is not enough of it on screen to survive being
          // quiet.
          {color: theme.colors.text},
        ]}
        numberOfLines={1}>
        {date}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // Sits the meridiem on the digits' baseline rather than their box, which
    // the two font sizes would otherwise leave visibly misaligned.
    alignItems: 'baseline',
  },
  time: {
    // A display face carries its own spacing; tracking it further either way
    // fights the drawing.
    letterSpacing: 0,
    includeFontPadding: false,
  },
  meridiem: {
    marginLeft: 10,
    letterSpacing: 2,
    includeFontPadding: false,
  },
  date: {
    letterSpacing: 1.2,
    includeFontPadding: false,
  },
});

export const Clock = memo(ClockComponent);
