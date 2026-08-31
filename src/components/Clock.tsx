import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useClock} from '../hooks/useClock';
import {useTheme} from '../theme';

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
            {color: theme.colors.text, fontFamily: theme.fonts.ui},
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
            {color: theme.colors.textSecondary, fontFamily: theme.fonts.ui},
          ]}>
          {meridiem}
        </Text>
      </View>

      <Text
        style={[
          styles.date,
          // Full strength, not the dimmed secondary: at 14px over a wallpaper
          // there is not enough of it on screen to survive being quiet.
          {color: theme.colors.text, fontFamily: theme.fonts.ui},
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
    fontSize: 52,
    // A display face carries its own spacing; tracking it further either way
    // fights the drawing.
    letterSpacing: 0,
    includeFontPadding: false,
  },
  meridiem: {
    marginLeft: 10,
    fontSize: 18,
    letterSpacing: 2,
    includeFontPadding: false,
  },
  date: {
    // Pulled up into the empty descender space the 52px line reserves below
    // digits that have no descenders. Zero margin still left a visible gap,
    // because the gap was never margin — it was the line box. This sits the
    // date's caps just under the digits' baseline — the end of the empty space,
    // and as close as the two go before the glyphs themselves meet.
    marginTop: -16,
    fontSize: 14,
    letterSpacing: 1.2,
    includeFontPadding: false,
  },
});

export const Clock = memo(ClockComponent);
