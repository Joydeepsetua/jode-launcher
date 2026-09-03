/**
 * A slider with a small, fixed number of stops.
 *
 * Built from views and one pan responder rather than from a slider package,
 * for the same reason the icons are drawn rather than typed: this is the only
 * slider in the app, it has four positions, and none of the platform control's
 * range handling, stepping or accessibility plumbing is needed to move a dot
 * between them.
 *
 * It is a *stepped* slider, not a continuous one rounded off at the end. The
 * thumb sits on a stop at every moment of a drag, including mid-gesture, so the
 * setting under your finger is always one of the ones on offer — and because
 * each stop is applied as it is crossed, the wallpaper behind the screen
 * changes as you drag rather than when you let go.
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';

export type SliderProps = {
  /** How many stops there are. The first is at the far left, the last at the far right. */
  count: number;
  /** Which stop is current, from 0 to `count - 1`. */
  index: number;
  /**
   * Called with a stop as it is reached — during a drag as well as at its end,
   * so it will fire many times per gesture, but never twice for the same stop
   * in a row.
   */
  onChange: (index: number) => void;
  /** The travelled part of the track, and the thumb. */
  color: string;
  /** The part not yet travelled. */
  trackColor: string;
  /** Read out in place of a number, e.g. `Medium`. */
  label: string;
};

const TRACK = 4;
const THUMB = 18;
/**
 * The thumb's travel is inset by its own radius at each end, so that at the
 * first and last stop it sits *on* the end of the track rather than hanging off
 * it. Everything below measures fractions of that inset span, not of the width.
 */
const INSET = THUMB / 2;

export function Slider({
  count,
  index,
  onChange,
  color,
  trackColor,
  label,
}: SliderProps) {
  const [width, setWidth] = useState(0);

  /**
   * The live values the gesture reads.
   *
   * A pan responder is created once and captures whatever was in scope then, so
   * a handler closing over `width` or `index` directly would go on answering
   * with the first render's numbers for the life of the component. The ref is
   * how the handlers see the present.
   */
  const latest = useRef({width, index, onChange, count});
  latest.current = {width, index, onChange, count};

  /**
   * Where the track's left edge is on the screen, learned from the touch that
   * started the gesture: a touch reports both its position on the page and its
   * position within the view it landed on, and the difference between the two
   * is the view's origin. Kept because a moving finger only reports page
   * coordinates.
   */
  const origin = useRef(0);

  /** The stop nearest a finger, given where the track starts and ends. */
  const stopAt = useCallback((x: number) => {
    const {width: trackWidth, count: stops} = latest.current;
    const span = trackWidth - INSET * 2;
    if (span <= 0) {
      return 0;
    }
    const fraction = Math.max(0, Math.min(1, (x - INSET) / span));
    return Math.round(fraction * (stops - 1));
  }, []);

  /** Move to the stop nearest an x, if that is not the stop we are on. */
  const apply = useCallback(
    (x: number) => {
      const stop = stopAt(x);
      if (stop !== latest.current.index) {
        latest.current.onChange(stop);
      }
    },
    [stopAt],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Claimed on touch down rather than on movement: a tap on the track is
        // a way to set the value, and waiting for a drag would swallow it.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The scroll view this sits inside must not be able to take the gesture
        // back partway through a drag.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: event => {
          const {pageX, locationX} = event.nativeEvent;
          origin.current = pageX - locationX;
          apply(locationX);
        },
        onPanResponderMove: (_event, gesture) => {
          apply(gesture.moveX - origin.current);
        },
      }),
    [apply],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const span = Math.max(0, width - INSET * 2);
  const travelled = count > 1 ? (index / (count - 1)) * span : 0;

  return (
    <View
      onLayout={onLayout}
      // The row is taller than the track it draws so there is something to hit:
      // a 4px line is not a touch target, and the padding is the target.
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityValue={{min: 0, max: count - 1, now: index, text: label}}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={event => {
        const next =
          event.nativeEvent.actionName === 'increment' ? index + 1 : index - 1;
        if (next >= 0 && next < count) {
          onChange(next);
        }
      }}
      {...responder.panHandlers}>
      <View style={[styles.track, {backgroundColor: trackColor}]} />
      <View
        style={[
          styles.track,
          styles.fill,
          // Runs from the start of the track to the centre of the thumb, so
          // the two meet without the fill showing past it.
          {backgroundColor: color, width: travelled},
        ]}
      />
      <View
        style={[
          styles.thumb,
          {backgroundColor: color, transform: [{translateX: travelled}]},
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 34,
    justifyContent: 'center',
  },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    marginHorizontal: INSET,
  },
  fill: {
    position: 'absolute',
    left: INSET,
    marginHorizontal: 0,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
});
