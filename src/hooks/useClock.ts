import {useEffect, useState} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

/** The time, split so each part can be set at its own size. */
export type ClockTime = {
  /** `9:45`. The hour is never zero-padded; the minute always is. */
  time: string;
  /** `AM` or `PM`. */
  meridiem: string;
  /** `07 aug 2026`. */
  date: string;
};

/** Lower case and clipped to three letters, to sit quietly under the time. */
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/**
 * Twelve-hour time, computed rather than delegated to `toLocaleTimeString`:
 * the format is a deliberate choice here, not something that should flip to 24h
 * because of the device locale, and doing the arithmetic removes any dependency
 * on `Intl` being present.
 */
function formatTime(now: Date): ClockTime {
  const hours = now.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return {
    time: `${hour12}:${minutes}`,
    meridiem: hours < 12 ? 'AM' : 'PM',
    // Built by hand for the same reason the time is: a fixed format, and no
    // dependency on `Intl`. The date comes along on the minute tick, so it
    // turns over at midnight without a timer of its own.
    date: `${day} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
  };
}

/**
 * The current time, re-rendering once a minute.
 *
 * The timer is aligned to the next minute boundary rather than ticking every
 * second, so an idle launcher wakes 60 times an hour instead of 3600, and it
 * re-syncs on foreground because timers do not fire while the device sleeps.
 */
export function useClock(): ClockTime {
  const [time, setTime] = useState<ClockTime>(() => formatTime(new Date()));

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const now = new Date();
      const next = formatTime(now);
      // The minute is the only thing that changes 23 hours out of 24; keeping
      // the same object when it has not spares every consumer a re-render.
      setTime(previous =>
        previous.time === next.time &&
        previous.meridiem === next.meridiem &&
        previous.date === next.date
          ? previous
          : next,
      );
      const untilNextMinute =
        60_000 - (now.getSeconds() * 1_000 + now.getMilliseconds());
      // A small margin keeps us from firing a hair early and showing the
      // previous minute twice.
      timeout = setTimeout(tick, untilNextMinute + 50);
    };

    tick();

    const appState = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') {
          if (timeout !== undefined) {
            clearTimeout(timeout);
          }
          tick();
        }
      },
    );

    return () => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      appState.remove();
    };
  }, []);

  return time;
}
