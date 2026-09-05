# Bundled fonts

Nothing is bundled here, and the launcher does not need anything to be. The
faces the settings screen offers — System, Serif, Mono and Narrow — are family
names Android resolves itself, so each one is a face the device already has, in
every script it already covers. They are listed in `FONT_FACES` in
`src/theme/index.ts`.

To add a face of your own:

1. Copy the font file into this folder, e.g. `Bazooka.ttf`. Anything dropped
   here is packaged into the APK and available to React Native by file name —
   no linking step, no `react-native.config.js`, no library. Android picks up
   `assets/` automatically. Keep the name simple: no spaces, and it is what you
   will refer to the font by.
2. Add it to `FontFamily` in `src/native/LauncherModule.ts`, to the
   `FONT_FAMILIES` list beside it, and to `FONT_FACES` in `src/theme/index.ts`
   under the file name without its extension:

   ```ts
   bazooka: 'Bazooka',
   ```

3. Add a `Choice` for it to `TYPEFACE_CHOICES` in
   `src/screens/SettingsScreen.tsx`, which is what puts it on screen.
4. Rebuild — `npm run android`. A Metro reload is not enough, because the file
   has to be packaged into the APK first.

Both `.ttf` and `.otf` work. If the name is wrong or the file is missing,
Android silently falls back to the default face rather than failing the build,
so a segment that changes nothing when you tap it means the name in `FONT_FACES`
and the file name disagree.
