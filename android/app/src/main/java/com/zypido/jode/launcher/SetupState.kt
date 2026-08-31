package com.zypido.jode.launcher

import android.content.Context
import android.util.Log

/**
 * Whether the user has been through first run.
 *
 * A home screen cannot keep asking. The two things setup covers — usage access
 * and the Home role — are both optional and both skippable, so "has it been
 * granted" is the wrong question to gate on: a user who declines would meet the
 * welcome screen every time they pressed Home. What is remembered here is only
 * that they were asked. The footer carries the two prompts from then on, for as
 * long as either is outstanding.
 *
 * Safe to call from any thread.
 */
internal class SetupState(context: Context) {

  private val preferences =
      context.applicationContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  fun isComplete(): Boolean =
      try {
        preferences.getBoolean(KEY, false)
      } catch (e: Exception) {
        // An unreadable store would otherwise repeat first run forever; treating
        // it as done is the failure that costs the user the least.
        Log.w(TAG, "could not read setup state", e)
        true
      }

  fun markComplete() {
    try {
      if (preferences.getBoolean(KEY, false)) {
        return
      }
      preferences.edit().putBoolean(KEY, true).apply()
    } catch (e: Exception) {
      Log.w(TAG, "could not persist setup state", e)
    }
  }

  private companion object {
    const val TAG = "SetupState"
    const val STORE = "launcher_setup"
    const val KEY = "complete"
  }
}
