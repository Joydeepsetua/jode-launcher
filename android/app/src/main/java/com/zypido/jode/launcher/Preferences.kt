package com.zypido.jode.launcher

import android.content.Context
import android.util.Log

/**
 * The handful of choices the settings screen owns.
 *
 * A launcher is read before it is interacted with: it is on screen the instant
 * Home is pressed, and the first frame has to be the one the user chose. So
 * these are held in SharedPreferences and read synchronously, the same way
 * [SetupState] is — an appearance that arrives a frame late is an appearance
 * that flickers.
 *
 * Values are stored, never validated, on the way in; the JS side owns what a
 * legal theme mode is, and an unreadable or unrecognised value falls back to
 * the default rather than failing.
 *
 * Safe to call from any thread.
 */
internal class Preferences(context: Context) {

  private val preferences =
      context.applicationContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  /** `system`, `dark` or `light` — whatever JS last wrote. */
  fun themeMode(): String =
      try {
        preferences.getString(KEY_THEME_MODE, DEFAULT_THEME_MODE) ?: DEFAULT_THEME_MODE
      } catch (e: Exception) {
        Log.w(TAG, "could not read theme mode", e)
        DEFAULT_THEME_MODE
      }

  fun setThemeMode(mode: String) {
    write { putString(KEY_THEME_MODE, mode) }
  }

  /** How much wash sits between the wallpaper and the text, from 0 to 1. */
  fun scrimOpacity(): Double =
      try {
        preferences.getFloat(KEY_SCRIM_OPACITY, DEFAULT_SCRIM_OPACITY).toDouble()
      } catch (e: Exception) {
        Log.w(TAG, "could not read scrim opacity", e)
        DEFAULT_SCRIM_OPACITY.toDouble()
      }

  fun setScrimOpacity(value: Double) {
    write { putFloat(KEY_SCRIM_OPACITY, value.toFloat()) }
  }

  /** The face the launcher draws its own text in — whatever JS last wrote. */
  fun fontFamily(): String =
      try {
        preferences.getString(KEY_FONT_FAMILY, DEFAULT_FONT_FAMILY) ?: DEFAULT_FONT_FAMILY
      } catch (e: Exception) {
        Log.w(TAG, "could not read font family", e)
        DEFAULT_FONT_FAMILY
      }

  fun setFontFamily(family: String) {
    write { putString(KEY_FONT_FAMILY, family) }
  }

  /** What the launcher's own text sizes are multiplied by. */
  fun fontScale(): Double =
      try {
        preferences.getFloat(KEY_FONT_SCALE, DEFAULT_FONT_SCALE).toDouble()
      } catch (e: Exception) {
        Log.w(TAG, "could not read font scale", e)
        DEFAULT_FONT_SCALE.toDouble()
      }

  fun setFontScale(value: Double) {
    write { putFloat(KEY_FONT_SCALE, value.toFloat()) }
  }

  /** How many rows the home screen shows before anything has been typed. */
  fun homeRowCount(): Double =
      try {
        preferences.getInt(KEY_HOME_ROW_COUNT, DEFAULT_HOME_ROW_COUNT).toDouble()
      } catch (e: Exception) {
        Log.w(TAG, "could not read the home row count", e)
        DEFAULT_HOME_ROW_COUNT.toDouble()
      }

  fun setHomeRowCount(value: Double) {
    write { putInt(KEY_HOME_ROW_COUNT, Math.round(value).toInt()) }
  }

  /** Whether the home screen lists apps at all before anything is typed. */
  fun showHomeApps(): Boolean =
      try {
        preferences.getBoolean(KEY_SHOW_HOME_APPS, DEFAULT_SHOW_HOME_APPS)
      } catch (e: Exception) {
        Log.w(TAG, "could not read whether to show home apps", e)
        DEFAULT_SHOW_HOME_APPS
      }

  fun setShowHomeApps(value: Boolean) {
    write { putBoolean(KEY_SHOW_HOME_APPS, value) }
  }

  /** Whether the home screen carries the clock and the date at all. */
  fun showClock(): Boolean =
      try {
        preferences.getBoolean(KEY_SHOW_CLOCK, DEFAULT_SHOW_CLOCK)
      } catch (e: Exception) {
        Log.w(TAG, "could not read whether to show the clock", e)
        DEFAULT_SHOW_CLOCK
      }

  fun setShowClock(value: Boolean) {
    write { putBoolean(KEY_SHOW_CLOCK, value) }
  }

  /** `recent` or `chosen`: where the home screen's list comes from. */
  fun homeAppSource(): String =
      try {
        preferences.getString(KEY_HOME_APP_SOURCE, DEFAULT_HOME_APP_SOURCE)
            ?: DEFAULT_HOME_APP_SOURCE
      } catch (e: Exception) {
        Log.w(TAG, "could not read the home app source", e)
        DEFAULT_HOME_APP_SOURCE
      }

  fun setHomeAppSource(source: String) {
    write { putString(KEY_HOME_APP_SOURCE, source) }
  }

  /**
   * The apps the user chose for the home screen, newline-separated, in the
   * order they picked them.
   *
   * A string rather than a string set, because a set has no order and the order
   * is the whole of what the user arranged. Ids are `package/activity`, which
   * cannot contain a newline, so the separator is unambiguous.
   */
  fun homeAppIds(): String =
      try {
        preferences.getString(KEY_HOME_APP_IDS, "") ?: ""
      } catch (e: Exception) {
        Log.w(TAG, "could not read the chosen home apps", e)
        ""
      }

  fun setHomeAppIds(ids: String) {
    write { putString(KEY_HOME_APP_IDS, ids) }
  }

  private inline fun write(edit: android.content.SharedPreferences.Editor.() -> Unit) {
    try {
      preferences.edit().apply(edit).apply()
    } catch (e: Exception) {
      Log.w(TAG, "could not persist a preference", e)
    }
  }

  private companion object {
    const val TAG = "Preferences"
    const val STORE = "launcher_preferences"
    const val KEY_THEME_MODE = "theme_mode"
    const val KEY_SCRIM_OPACITY = "scrim_opacity"
    const val KEY_FONT_FAMILY = "font_family"
    const val KEY_FONT_SCALE = "font_scale"
    const val KEY_HOME_ROW_COUNT = "home_row_count"
    const val KEY_SHOW_HOME_APPS = "show_home_apps"
    const val KEY_SHOW_CLOCK = "show_clock"
    const val KEY_HOME_APP_SOURCE = "home_app_source"
    const val KEY_HOME_APP_IDS = "home_app_ids"

    /** Follow the device, and show the wallpaper with nothing over it. */
    const val DEFAULT_THEME_MODE = "system"
    const val DEFAULT_SCRIM_OPACITY = 0f

    /** The device's own face, at the size the launcher was drawn for. */
    const val DEFAULT_FONT_FAMILY = "system"
    const val DEFAULT_FONT_SCALE = 1f

    /** Four recents: enough to be useful, short enough to still be a clear screen. */
    const val DEFAULT_HOME_ROW_COUNT = 4

    /** The list is on until it is turned off; an empty home screen is asked for. */
    const val DEFAULT_SHOW_HOME_APPS = true

    /** The clock is there until it is turned off, as the apps are. */
    const val DEFAULT_SHOW_CLOCK = true

    /** What is on the home screen until someone picks apps for it themselves. */
    const val DEFAULT_HOME_APP_SOURCE = "recent"
  }
}
