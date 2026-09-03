/**
 * The launcher's icons, drawn rather than typed.
 *
 * There is no icon font here and there will not be one: the app ships a single
 * display typeface with a thin glyph set, and a second font loaded for nine
 * pictures would cost more than the pictures are worth. These are stroked
 * paths on a 24×24 grid — the grid every icon set uses — so they inherit the
 * colour of whatever they sit on and stay sharp at any size.
 *
 * Every path is stroke-only with round caps and joins, at a weight of 2 on the
 * 24 grid. Keeping that uniform is what makes a set of unrelated shapes read as
 * one family, so a new icon added here should follow it rather than fill.
 */
import React from 'react';
import Svg, {Circle, Path, Rect} from 'react-native-svg';

/** Every picture this app can draw. */
export type IconName =
  | 'home'
  | 'clock'
  | 'lock'
  | 'shield'
  | 'brush'
  | 'droplet'
  | 'sun'
  | 'moon'
  | 'sparkle'
  | 'contrast'
  | 'chevronLeft'
  | 'chevronRight';

export type IconProps = {
  name: IconName;
  /** Both dimensions; the grid is square. Defaults to 24, the grid itself. */
  size?: number;
  color: string;
  /**
   * Stroke weight *on the 24 grid*, scaled with the icon like the rest of the
   * drawing — so an icon at half size has a half-weight line, the way a shrunk
   * picture does, rather than a line that grows relatively heavier as the icon
   * gets smaller.
   */
  weight?: number;
};

/**
 * One picture.
 *
 * ```tsx
 * <Icon name="lock" size={22} color={theme.colors.text} />
 * ```
 *
 * Decorative by default: it carries no accessibility label of its own, because
 * every icon in this app sits beside the words it illustrates and a screen
 * reader announcing both would read the row twice.
 */
export function Icon({name, size = 24, color, weight = 2}: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      // Resolves `currentColor` for the one or two shapes that need a filled
      // area rather than a line.
      color={color}
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round">
      {SHAPES[name]}
    </Svg>
  );
}

/**
 * The drawings, one entry per {@link IconName}.
 *
 * Held as elements rather than as functions because none of them takes an
 * argument: colour and weight are inherited from the `Svg` above, which is the
 * whole reason the paths can be shared this way.
 */
const SHAPES: Record<IconName, React.ReactNode> = {
  // A pitched roof over a box, with the door left out — at 24px a door is two
  // pixels of noise.
  home: (
    <>
      <Path d="M3.5 10.2 12 3.5l8.5 6.7" />
      <Path d="M5.5 9.2V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.2" />
      <Path d="M9.5 20.5v-5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5.2" />
    </>
  ),
  // Hands at ten past eleven: the two are furthest apart there, so neither is
  // lost against the other at small sizes.
  clock: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.2V12l3.4 2" />
    </>
  ),
  lock: (
    <>
      <Rect x={4.5} y={10.5} width={15} height={10} rx={2.5} />
      <Path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
      <Path d="M12 14.4v2.2" />
    </>
  ),
  // A crest: flat across the top, tapering to a point. The screen's reassuring
  // shape, used where the copy says nothing here is required.
  shield: (
    <Path d="M12 3.2 19 5.8v5.6c0 4.2-2.8 7.6-7 9.4-4.2-1.8-7-5.2-7-9.4V5.8z" />
  ),
  // A brush held at the angle a hand holds it, which is the only thing that
  // separates the shape from an arrow.
  brush: (
    <>
      <Path d="m14 4.6 5.4 5.4" />
      <Path d="M16.7 7.3 8.9 15.1a3 3 0 0 0-.8 1.5l-.7 3.2 3.2-.7a3 3 0 0 0 1.5-.8l7.8-7.8z" />
      <Path d="m7.4 19.8-2.2 1" />
    </>
  ),
  // A drop: a point at the top, a circle at the bottom, the two sides run
  // between them. What a wash of anything looks like.
  droplet: (
    <Path d="M12 3.4c3.6 4 6 6.9 6 9.8a6 6 0 0 1-12 0c0-2.9 2.4-5.8 6-9.8z" />
  ),
  sun: (
    <>
      <Circle cx={12} cy={12} r={4.2} />
      <Path d="M12 2.6v2.1M12 19.3v2.1M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5" />
    </>
  ),
  // The crescent is the gap between two circles, drawn as one path so it is a
  // moon rather than an eclipse.
  moon: <Path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.6 8.6 0 1 0 10.2 10.2z" />,
  // A four-pointed star with concave sides — the shape that has meant "this
  // was made for you" since long before it meant anything about machines.
  sparkle: (
    <>
      <Path d="M12 3.6c.7 4.2 2.2 5.7 6.4 6.4-4.2.7-5.7 2.2-6.4 6.4-.7-4.2-2.2-5.7-6.4-6.4 4.2-.7 5.7-2.2 6.4-6.4z" />
      <Path d="M17.8 16.2c.35 2 1.05 2.7 3.05 3.05-2 .35-2.7 1.05-3.05 3.05-.35-2-1.05-2.7-3.05-3.05 2-.35 2.7-1.05 3.05-3.05z" />
    </>
  ),
  // Half a disc filled, half left open: the two appearances at once, which is
  // what following the device amounts to.
  contrast: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
    </>
  ),
  chevronLeft: <Path d="m14.5 5.5-7 6.5 7 6.5" />,
  chevronRight: <Path d="m9.5 5.5 7 6.5-7 6.5" />,
};
