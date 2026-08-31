# JODE Launcher

A minimal Android launcher. It does one thing: search installed apps by name and
launch them.

No widgets, folders, categories, weather, news, contacts, web search, icons,
icon packs, accounts, backend, or analytics. It works entirely offline and
requests no runtime permissions. Usage statistics are read on the device, with
the user's explicit grant, for two purposes — ordering the five recents and
totalling today's screen time — and are never stored or sent anywhere.

## Stack

React Native Community CLI 0.87 · TypeScript · Kotlin · New Architecture
(TurboModule + Fabric, bridgeless). No Expo, no backend, no database.

## Requirements

- Node >= 22.11
- JDK 17
- Android SDK with `compileSdk 37`, NDK `27.1.12297006` (the app compiles its own
  codegen'd C++, so the NDK is required)
- `minSdk 24`, `targetSdk 36`

## Running

```bash
npm install
npm start                 # Metro
npm run android           # debug build + install
npm run android:release   # release build
```

Then make it the home app: launch it once and tap **Set as default launcher** at
the bottom of the screen, or go to Android Settings → Apps → Default apps → Home
app. The launcher stays openable from the app drawer and `adb shell am start`
either way, so development is unaffected.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # jest
```

## Architecture

```
src/
├── native/
│   ├── NativeLauncher.ts     TurboModule spec (input to codegen)
│   └── LauncherModule.ts     typed wrapper — the only file that touches native
├── screens/                  WelcomeScreen (first run), LauncherScreen
├── components/               Clock, ScreenTimeRing, SearchInput, AppListItem
├── hooks/                    useInstalledApps, useRecentApps, useScreenTime,
│                             useSetup, useClock, useKeyboardHeight
├── utils/appSearch.ts        the search engine
├── types/app.ts
├── assets/logo.png           the mark, for the first-run screen
└── theme/                    dark (primary) + light palettes

android/app/src/main/java/com/zypido/jode/launcher/
├── LauncherModule.kt         the TurboModule
├── LauncherPackage.kt        registration
├── AppRepository.kt          PackageManager queries + in-memory cache
├── RecentApps.kt             recents from UsageStatsManager, with a local fallback
├── ScreenTime.kt             today's usage, and the busiest day on record
├── SetupState.kt             remembers that first run happened
├── LockAdminReceiver.kt      device admin, held for force-lock only
└── LauncherActivityBridge.kt lets MainActivity report HOME presses
```

### Native surface

```ts
getInstalledApps(): Promise<NativeAppInfo[]>      // served from the native cache
refreshInstalledApps(): Promise<NativeAppInfo[]>  // forces a PackageManager sweep
launchApp(packageName, activityName): Promise<boolean>
getRecentAppIds(): Promise<string[]>               // most recently opened first
getScreenTime(): Promise<NativeScreenTime>         // today, and the record
hasUsageAccess(): boolean                          // synchronous
requestUsageAccess(): void
isSetupComplete(): boolean                         // synchronous
completeSetup(): void
canLockScreen(): boolean                           // synchronous
lockScreen(): boolean                              // synchronous
requestLockScreenPermission(): void
isDefaultLauncher(): boolean                      // synchronous
requestDefaultLauncher(): void
onAppsChanged / onHomePressed                     // codegen event emitters
```

Every PackageManager call runs on a background pool. Blocking the UI thread would
show up directly as dropped keystrokes.

### Discovery

`queryIntentActivities` for `MAIN`/`LAUNCHER`, so only apps Android considers
launchable are listed. One entry per launcher activity, keyed
`packageName/activityName`, sorted once with a locale-aware `Collator`. The app
never lists itself. Package visibility comes from a narrow `<queries>` element —
`QUERY_ALL_PACKAGES` is deliberately not requested.

`<queries>` declares two intents, not one. MAIN/LAUNCHER covers the drawer;
MAIN/HOME covers home apps, which the first does not, because a launcher
deliberately exposes MAIN/HOME and not MAIN/LAUNCHER. Without the second, the
app holding the Home role is invisible behind the visibility filter, and any
attempt to resolve it answers with the only HOME activity we can see — our own.
`isDefaultLauncher()` therefore asks `RoleManager.isRoleHeld` where it can:
a question about the caller cannot be filtered. The resolution is the pre-Q
fallback only.

### Search

Match keys are precomputed once per app list. Each keystroke is one linear pass
that sorts hits into bands — exact, whole-name prefix, word prefix, initials,
substring — and concatenates them, so alphabetical order survives inside each
band. Case- and diacritic-insensitive; folding preserves string length so match
offsets stay valid for highlighting. Names only: package names, contacts, the
web, files and settings are never searched.

```
you  → YouTube, YouTube Music
wh   → WhatsApp
ytm  → YouTube Music        (initials)
wa   → WhatsApp             (initials; "wa" appears nowhere in "whatsapp")
```

### The default screen

At rest the screen is a clock, today's screen time, and the five apps most
recently opened **on the device**, newest first, in exactly the order the system
reports. There is no search field until it is asked for — the drawer below holds
it, along with every installed app.

Order comes from `UsageStatsManager.queryEvents` over the last seven days,
reading `ACTIVITY_RESUMED`, so it counts every way an app can be opened — from
here, from a notification, from a link, from Recents — not just launches this
launcher performed. Events are used rather than aggregated `UsageStats`, whose
buckets are coarse enough to get two apps opened minutes apart the wrong way
round.

Nothing is added to pad the list and nothing is reordered. The only entries
dropped are ones that could not be a row: a package uninstalled since it was
last opened, or one with no launchable activity at all — system UI, input
methods, background services, and the launcher itself.

This needs `PACKAGE_USAGE_STATS`, which is special access rather than a runtime
permission: there is no prompt to show, so the footer offers **Allow usage
access for recent apps**, which opens the system list. Until it is granted the
same five rows come from this launcher's own launches, recorded in
`SharedPreferences` on each successful `launchApp` — sixteen are kept so
uninstalling one of the five closes the gap instead of leaving it.

### Appearance

The window itself draws nothing: `windowShowWallpaper` puts the device wallpaper
behind it, and a single translucent scrim (`theme.colors.scrim`) is all that
sits between the two — enough to keep text readable over an arbitrary
photograph, and the one value to change to let more or less of it through. The
clock is twelve-hour, and one face — `casual`, Coming Soon, the one playful
display font Android ships — sets the whole screen: the time, the search field
and its placeholder, every app name. There is a single `fonts.ui` token, so
swapping the launcher's entire typography is one line. Any other font is a file
in `android/app/src/main/assets/fonts/`; see the README there.

The icon is one mark — a black `J` with no background of its own — and every
file is derived from it: the adaptive `foreground` and `monochrome` layers at
108dp with the mark inside the 72dp a mask always shows, the legacy square and
round icons at five densities, and `src/assets/logo.png` for the first-run
screen. The plate under it is plain white, declared once as
`ic_launcher_background` and baked into the legacy icons and the logo, so the
mark meets the same white wherever it appears — including on the dark welcome
screen, where a black mark on the canvas would be a black mark on black.

### First run

Three screens: an introduction, then one request per screen — usage access,
then the Home role. That order is deliberate: usage access is the one Android
will never prompt for on its own — there is no dialog, only a list in Settings
the user has to find — and it is what makes the launcher's first screen worth
looking at. The Home role is asked for last, once the app has something to show
and has explained itself.

These are the only opaque screens in the app, and the only ones drawn dark
whatever the device is set to. Everywhere else the wallpaper shows through a
scrim; a welcome read through someone's photograph is a welcome nobody
designed.

Both steps are skippable. Neither permission is needed to search and launch
apps, and a launcher that holds its own front door shut until you agree to
something has misunderstood what it is. Skipped steps carry on living in the
launcher's footer, where they can be taken up at any time.

What is remembered is only that the user was *asked*, not what they answered —
gating on the grants themselves would show the welcome screen on every Home
press to anyone who declined. A step the system already satisfies is passed over
without being drawn, so returning from Settings advances the screen by itself,
and a run with nothing left to ask goes straight to the launcher.

### Screen time

A ring to the right of the clock, filled with today's screen time against the
busiest day this phone has ever had — full means today has matched the record, a
quarter means a quarter of it. A personal record rather than a round number of
hours, so it says something true about the day instead of scolding against a
target nobody set.

Today's figure is meant to agree with the number in Settings rather than to be
defensible on its own, and Settings does not measure it either: it reads what
`UsageStatsManager` has already accounted. That accounting knows things no
caller can see — which activity *instance* a stop event belongs to, which task
an activity was rooted in (`Usage Source=TASK_ROOT_ACTIVITY`), and when the
device clock jumped. So there are two sources here, in order:

1. **The system's own daily totals.** `queryUsageStats(INTERVAL_DAILY)`, summed
   per package. These are the numbers Settings lists app by app. Daily buckets
   roll at midnight, so they usually describe exactly the window wanted; a
   device booted mid-morning starts one then, which is still inside today. The
   bucket that began *before* today is dropped whole — it carries yesterday's
   evening in its totals and no API can take those minutes back out. What that
   loses is a session running through midnight, which is minutes.
2. **A walk over the event stream**, when no bucket can be used. It follows the
   same model the system does: a package is in front while *any* of its
   activities is resumed, so what is tracked is a set of activities per package
   rather than one interval overall. That distinction is the whole game — moving
   between two activities of one app is reported as `A paused, B resumed, A
   stopped`, in that order, and taking the trailing stop for the end of the
   app's session drops everything up to its next resume, which on a phone left
   sitting inside one app is most of the day. `SCREEN_NON_INTERACTIVE`,
   `KEYGUARD_SHOWN` and `DEVICE_SHUTDOWN` end every open stretch, a resume
   behind a dark screen opens none, and a stretch still open at the end counts
   only while the display is on. The walk deliberately does not reach back
   before midnight to catch a session already running: the last thing a phone
   reports before being switched off is an app in front, and opening that
   stretch hands the morning every hour the phone spent powered down.

Either way the launcher's own time comes out of the total. Settings counts time
in apps, and the seconds spent looking at a clock on the way somewhere else are
not usage; here the home screen is this app, and on a phone whose owner is
building the launcher it is otherwise the largest entry in the list.

Debug builds say which source answered, what the other would have said, and
where the minutes went:

```
adb logcat -s ScreenTime
D/ScreenTime: today 99m from system daily totals; the walk says 141m; launcher 70m not counted
D/ScreenTime: by app: com.fatakpaysales 72m, com.google.android.apps.nexuslauncher 16m, …
```

The two disagreeing is not by itself a bug. An emulator whose host went to sleep
is suspended with an app in front and its clock jumps on resume; the system
adjusts its own accounting for that, and a walk over event timestamps cannot.
Long stretches with no events of any kind in them are the fingerprint.

What remains is small: Settings rounds to the minute, reads at its own moments,
holds back the currently open session until it ends, and sees packages that
package visibility hides from this app.

The record is kept in `SharedPreferences` and only ever grows. On first run it is
seeded from `queryUsageStats(INTERVAL_DAILY)` over the last 90 days — minus the
launcher's own time, so the record measures the same thing today does — because
otherwise day one would be the record by definition and the ring would be full
from the off. The key is versioned: a maximum over past readings has to be
dropped when the measurement beneath it changes, or a phone carries an old
inflated number forward and the ring never fills again. It is floored at two hours, so a device with no history behind it
still draws something meaningful.

The ring is plain views, in three parts: two half-rings, each clipped to one
half of the dial and rotated within it; a dot the width of the stroke at each
end of the arc, which is what rounds the ends that a clipped border leaves
blunt; and the reading in the middle, where a gauge puts its value. Every
rotator is the full size of the dial, so it turns about the dial's centre —
that is the whole trick, and no canvas or charting library is involved. The ring
renders nothing at all without usage access.

### The drawer

The search field is not on screen at rest and the keyboard never opens by
itself. A swipe up — anywhere, over the recents as readily as over the
wallpaper — raises the drawer: the search field with the caret already in it,
and under it every installed app in alphabetical order, sorted natively with a
locale `Collator`. Typing narrows that list to matches. A swipe down from the
top of it, or Back, sends it away again.

It rises from below the bottom edge over 260ms on an ease-out curve and falls
back through it in 190ms on an ease-in one — leaving is always quicker than
arriving. Position and opacity are the only things animated, so the whole
transition runs on the native driver and holds its frames while the list behind
it is still rendering rows. The recents fade out underneath as it comes up,
driven by the same value, and the clock stays where it is: the drawer takes the
screen below the clock, not the screen. Arrivals are the exception — coming home
or back from another app shuts it with no animation, because sliding away a
drawer the user never saw open is animating nothing.

The gestures are a single `PanResponder` on the root view, which also owns the
double tap below. A drag is taken off a list through the capture phase in
exactly two cases: upwards while the drawer is down, where the resting screen is
five rows with nothing to scroll, and downwards from the very top of the drawer,
where there is likewise nothing above to scroll to. Every other drag belongs to
the list under the finger. A drag that travels less than 44dp, or further
sideways than up, is not a swipe; anything that moves at all is not a tap, so a
swipe can never land as half of the double tap.

The query outlives the closing animation by design — emptying it on the way out
would swap three results for the whole library in the middle of the frames the
user is watching — and is cleared when the drawer unmounts. One muted line at
the bottom says `Swipe up for all apps` while it is down. A control nobody can
see is a control nobody finds.

### Double tap to lock

Two taps on empty space turn the display off. Only taps nothing else wanted
reach the handler — a result row, the search field and the footer each claim
their own through the responder system, and a scroll takes the responder away
before any tap lands — so the gesture is effectively "double tap the wallpaper"
and cannot fire while the launcher is being used normally.

Turning the screen off is not something an ordinary app may do. Android puts
`lockNow()` behind device administration and offers no lighter permission, so
the app registers a `DeviceAdminReceiver` holding exactly one policy,
`force-lock`. It cannot wipe the device, read or expire passwords, disable the
camera, or monitor anything, and the receiver overrides none of the callbacks
that would let it try. The cost is real and worth stating: device admin must be
revoked in Settings before the app can be uninstalled, which is why the feature
is opt-in and why the double tap does nothing until it is granted.

The first double tap without the policy answers with a tappable notice that
opens the system's request, so the gesture explains itself rather than failing
silently.

### Freshness

A runtime `BroadcastReceiver` on `PACKAGE_ADDED`/`REMOVED`/`REPLACED`/`CHANGED`
drops the cache and tells JS; the list also refreshes when the launcher returns
to the foreground. A launch that fails because the app vanished resolves `false`
rather than throwing, shows a one-line notice, and triggers a re-read.

### Lifecycle

`singleTask` + `CATEGORY_HOME`. Pressing HOME while the launcher is already
foreground does not change `AppState`, so `MainActivity.onNewIntent` reports it
through `LauncherActivityBridge` and the launcher returns to rest the same way
it does on return from another app. Back closes the search, and is otherwise
swallowed — there is nothing behind a home screen.

### Keyboard

The window draws edge-to-edge, so `adjustResize` no longer shrinks it on modern
Android; the keyboard simply covers the bottom. `useKeyboardHeight` reads React
Native's IME inset and the screen reserves that space plus the navigation bar,
which the inset is measured above.

## Permissions

No runtime permissions, ever — nothing the app can prompt for, and nothing it
asks for at install.

`PACKAGE_USAGE_STATS` is declared, and it is special access: declaring it grants
nothing and shows nothing. It does something only if the user goes to Settings →
Apps → Special app access → Usage access and switches it on, which the footer
link opens directly. It buys two things — device-wide ordering for the
five recents, and today's screen time — the data is read on the device and never
stored or sent, and the launcher works without it, showing neither.

`INTERNET` lives only in `android/app/src/debug/AndroidManifest.xml`, for
reaching Metro during development. The release APK has no network permission at
all, so nothing read here could leave the device even in principle.
