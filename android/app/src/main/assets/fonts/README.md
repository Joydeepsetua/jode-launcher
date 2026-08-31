# Bundled fonts

Anything dropped in this folder is packaged into the APK and available to React
Native by file name — no linking step, no `react-native.config.js`, no library.
Android picks up `assets/` automatically.

1. Copy the font file here, e.g. `Bazooka.ttf`. Keep the name simple: no spaces,
   and it is what you will refer to the font by.
2. Set `fonts.clock` in `src/theme/index.ts` to the name without the extension:

   ```ts
   clock: 'Bazooka',
   ```

3. Rebuild — `npm run android`. A Metro reload is not enough, because the file
   has to be packaged into the APK first.

Both `.ttf` and `.otf` work. If the name is wrong or the file is missing, Android
silently falls back to the default face rather than failing the build, so a clock
that suddenly looks like plain Roboto means the name and the file name disagree.

The current setting needs nothing here: `casual` is one of Android's own family
names, resolved by the system.
