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

    /** Follow the device, and show the wallpaper with nothing over it. */
    const val DEFAULT_THEME_MODE = "system"
    const val DEFAULT_SCRIM_OPACITY = 0f

    /** The device's own face, at the size the launcher was drawn for. */
    const val DEFAULT_FONT_FAMILY = "system"
    const val DEFAULT_FONT_SCALE = 1f
  }
}
