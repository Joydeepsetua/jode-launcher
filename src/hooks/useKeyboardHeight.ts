import {useEffect, useState} from 'react';
import {Keyboard} from 'react-native';

/**
 * Height of the on-screen keyboard in dp, or 0 while it is hidden.
 *
 * The app draws edge-to-edge, which means `adjustResize` no longer shrinks the
 * window on modern Android — the keyboard simply covers the bottom of the
 * screen. React Native still reports the IME inset, measured above the
 * navigation bar, so the layout can reserve that space itself and keep the last
 * result reachable instead of hidden behind the keys.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setHeight(0);
    });

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}
