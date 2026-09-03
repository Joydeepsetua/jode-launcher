import React, {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useScreenTime} from '../hooks/useScreenTime';
import {useTheme} from '../theme';

const SIZE = 96;
const STROKE = 5;
const HALF = SIZE / 2;

/** `4h 12m`, or `48m` before the first hour. Never zero-padded. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

/**
 * Today's screen time as a ring, filled against the busiest day on record —
 * so a full ring means today has matched the most this phone has ever been
 * used, and a quarter ring means a quarter of that. Measured against a personal
 * record rather than a round number of hours, it says something true about the
 * day instead of scolding with a target nobody set.
 *
 * Drawn with plain views rather than a charting library, in three parts:
 *
 *   the arc     two half-rings, each clipped to one half of the dial and
 *               rotated within it. The first half of the sweep happens on the
 *               right, the second on the left.
 *   the caps    a dot the width of the stroke at each end of the arc, which is
 *               what rounds the ends — a clipped border has blunt ones.
 *   the reading inside the ring, where a gauge puts its value.
 *
 * Every rotator is the full size of the dial, so it turns about the dial's
 * centre. That is the whole trick; nothing here needs a canvas.
 *
 * Renders nothing without usage access; the footer is where that gets asked
 * for, and an empty gauge would only be a question the user cannot answer here.
 */
function ScreenTimeRingComponent() {
  const theme = useTheme();
  const {todayMs, recordMs, available} = useScreenTime();

  if (!available) {
    return null;
  }

  const progress =
    recordMs > 0 ? Math.max(0, Math.min(1, todayMs / recordMs)) : 0;
  // Each half of the dial owns half of the sweep.
  const rightSweep = Math.min(progress, 0.5) * 360;
  const leftSweep = Math.max(0, progress - 0.5) * 360;
  const endCapAngle = progress * 360;

  const label = formatDuration(todayMs);
  const fill = {borderColor: theme.colors.text};
  const cap = {backgroundColor: theme.colors.text};

  return (
    <View
      style={styles.dial}
      accessibilityRole="text"
      accessibilityLabel={`${label} of screen time today`}>
      <View
        style={[
          styles.ring,
          styles.atOrigin,
          {borderColor: theme.colors.textMuted},
        ]}
      />

      {/* 0–50% sweeps through the right half. The half-ring inside starts on
          the left, hidden, and rotates into view from the top. */}
      <View style={[styles.region, styles.regionRight]}>
        <View
          style={[
            styles.rotator,
            styles.pulledLeft,
            {transform: [{rotate: `${rightSweep}deg`}]},
          ]}>
          <View style={[styles.region, styles.regionLeft]}>
            <View style={[styles.ring, styles.atOrigin, fill]} />
          </View>
        </View>
      </View>

      {/* 50–100% continues through the left half, from the bottom back up. */}
      <View style={[styles.region, styles.regionLeft]}>
        <View
          style={[
            styles.rotator,
            styles.atOrigin,
            {transform: [{rotate: `${leftSweep}deg`}]},
          ]}>
          <View style={[styles.region, styles.regionRight]}>
            <View style={[styles.ring, styles.pulledLeft, fill]} />
          </View>
        </View>
      </View>

      {/* The ends, drawn over the arc. The first sits at twelve o'clock and
          never moves; the second rides the full sweep. A day with no use yet
          gets neither, so the track is left clean rather than pipped. */}
      {progress > 0 ? (
        <>
          <View style={[styles.cap, cap]} />
          <View
            style={[
              styles.rotator,
              styles.atOrigin,
              {transform: [{rotate: `${endCapAngle}deg`}]},
            ]}>
            <View style={[styles.cap, cap]} />
          </View>
        </>
      ) : null}

      <View style={styles.reading} pointerEvents="none">
        <Text
          style={[
            styles.value,
            {color: theme.colors.text},
          ]}
          numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[
            styles.unit,
            {color: theme.colors.textSecondary},
          ]}
          numberOfLines={1}>
          TODAY
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    width: SIZE,
    height: SIZE,
  },
  ring: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: HALF,
    borderWidth: STROKE,
  },
  // Half of the dial, and a hard edge: nothing drawn inside can escape it.
  region: {
    position: 'absolute',
    top: 0,
    width: HALF,
    height: SIZE,
    overflow: 'hidden',
  },
  regionLeft: {
    left: 0,
  },
  regionRight: {
    left: HALF,
  },
  // Full-size, and positioned so its centre is the dial's centre — a view
  // rotates about its own middle, and that is the only reason this works.
  rotator: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
  },
  atOrigin: {
    left: 0,
  },
  pulledLeft: {
    left: -HALF,
  },
  // As wide as the stroke and sitting on it: top edge flush with the dial puts
  // the dot's centre on the stroke's centre line, which is where an arc ends.
  cap: {
    position: 'absolute',
    top: 0,
    left: (SIZE - STROKE) / 2,
    width: STROKE,
    height: STROKE,
    borderRadius: STROKE / 2,
  },
  reading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    // Sized to the chord it sits on rather than to the dial: the reading is a
    // line or two above centre, where the circle is already narrowing, and a
    // display face is wide. Room to spare on both sides beats a tight fit.
    fontSize: 16,
    letterSpacing: 0,
    includeFontPadding: false,
  },
  unit: {
    marginTop: 2,
    fontSize: 9,
    letterSpacing: 1.6,
    includeFontPadding: false,
  },
});

export const ScreenTimeRing = memo(ScreenTimeRingComponent);
