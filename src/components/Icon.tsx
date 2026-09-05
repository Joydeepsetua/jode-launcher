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
  | 'palette'
  | 'image'
  | 'letter'
  | 'expand'
  | 'list'
  | 'search'
  | 'check'
  | 'fileText'
  | 'share'
  | 'star'
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
  // A painter's palette: the disc every other round icon here is drawn on,
  // with the thumb notch bitten out of the bottom right and four wells of
  // paint on it. The wells are the only filled shapes in the set apart from
  // the half disc below, and they have to be — four more rings at this size
  // would read as holes rather than as colour.
  palette: (
    <>
      <Path d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5s3.8 8.5 8.5 8.5c1.2 0 1.9-1 1.4-2c-.4-.9.3-1.9 1.3-1.9h1.8c2.4 0 4.3-2 4.3-4.4c0-4.8-3.9-8.7-8.8-8.7z" />
      <Circle cx={7.4} cy={12.2} r={1} fill="currentColor" stroke="none" />
      <Circle cx={8.4} cy={7.8} r={1} fill="currentColor" stroke="none" />
      <Circle cx={12.6} cy={6.7} r={1} fill="currentColor" stroke="none" />
      <Circle cx={16.4} cy={9.3} r={1} fill="currentColor" stroke="none" />
    </>
  ),
  // A framed picture, sun over a ridge — the landscape every photograph icon
  // has been since the first one, and the shape a wallpaper takes on a screen.
  // The ridge stops short of the frame rather than running under it: there is
  // no clip here, and a line crossing the border would read as a mistake.
  image: (
    <>
      <Rect x={3.5} y={4.5} width={17} height={15} rx={3} />
      <Circle cx={8} cy={8.6} r={2} />
      <Path d="M4.8 17.6 10.2 12.2a1.9 1.9 0 0 1 2.7 0l4.6 4.6" />
    </>
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
  // A capital A, which is what a typeface looks like when you have room for
  // one letter of it. The crossbar sits low, where the eye expects it.
  letter: (
    <>
      <Path d="M6 19.5 12 4.5l6 15" />
      <Path d="M8.4 14h7.2" />
    </>
  ),
  // Two chevrons pointing away from each other: the size of a thing, said as
  // the direction it can move rather than as a picture of a letter, which at
  // this size is a smudge whichever letter you pick.
  expand: (
    <>
      <Path d="m8 10 4-4 4 4" />
      <Path d="m8 14 4 4 4-4" />
    </>
  ),
  // Three rows, each a dot and the line it labels: a list, said as the shape a
  // list has rather than as anything the rows contain.
  list: (
    <>
      <Path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
      <Path d="M9 7h10.5M9 12h10.5M9 17h10.5" />
    </>
  ),
  // A lens and its handle, at the angle every magnifier since the first one
  // has been drawn at.
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m15.8 15.8 4 4" />
    </>
  ),
  // A tick, drawn long enough that the short arm reads as deliberate rather
  // than as a stray corner.
  check: <Path d="m5 12.5 4.5 4.5L19 7" />,
  // A page with the corner turned down and writing on it. The fold is what
  // separates a document from a card, so it is drawn rather than implied.
  fileText: (
    <>
      <Path d="M13.8 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.7z" />
      <Path d="M13.8 3.5v5.2h4.7" />
      <Path d="M9 13.5h6M9 16.5h4" />
    </>
  ),
  // Android's own share mark: one thing on the left going out to two on the
  // right. The rings are open, like the sun in `image`, so a filled dot never
  // has to compete with them.
  share: (
    <>
      <Circle cx={17} cy={6.2} r={2} />
      <Circle cx={7} cy={12} r={2} />
      <Circle cx={17} cy={17.8} r={2} />
      <Path d="M9.6 10.5 14.4 7.7" />
      <Path d="M9.6 13.5 14.4 16.3" />
    </>
  ),
  // Five points, outlined rather than filled: a filled star reads as a rating
  // already given, and this row is an invitation to give one.
  star: (
    <Path d="M12 3.7 14 9.3 19.9 9.4 15.2 13 16.9 18.7 12 15.4 7.1 18.7 8.8 13 4.1 9.4 10 9.3z" />
  ),
  chevronLeft: <Path d="m14.5 5.5-7 6.5 7 6.5" />,
  chevronRight: <Path d="m9.5 5.5 7 6.5-7 6.5" />,
};
