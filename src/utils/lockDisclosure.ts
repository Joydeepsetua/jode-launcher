/**
 * The disclosure that stands in front of the Accessibility settings.
 *
 * JODE is not an accessibility tool, so Google Play requires that, before the
 * user is sent to switch the lock service on, the app says in its own words
 * what the service does and does not touch, and asks for an explicit yes. Only
 * "Agree" goes on to the system screen; "No thanks" changes nothing. The dialog
 * cannot be dismissed by tapping outside it, so silence is never taken as
 * consent.
 *
 * Every path to {@link requestLockScreenPermission} goes through here.
 */
import {Alert} from 'react-native';
import {requestLockScreenPermission} from '../native/LauncherModule';

const TITLE = 'Allow double tap to lock?';

const BODY =
  'JODE uses Android’s Accessibility Service for one thing only: turning the ' +
  'display off when you double tap the home screen, just like the power ' +
  'button. Fingerprint and face unlock keep working.\n\n' +
  'JODE does not read your screen, see what you type, or collect, store or ' +
  'share any data through this service.\n\n' +
  'If you agree, Android’s Accessibility settings will open. Find JODE there ' +
  'and switch it on. You can switch it off at any time.';

/** Explains the lock service and, only on "Agree", opens Accessibility settings. */
export function askToEnableLock(): void {
  Alert.alert(
    TITLE,
    BODY,
    [
      {text: 'No thanks', style: 'cancel'},
      {text: 'Agree', onPress: requestLockScreenPermission},
    ],
    {cancelable: false},
  );
}
