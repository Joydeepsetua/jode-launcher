package com.zypido.jode

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.zypido.jode.launcher.LauncherActivityBridge

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "JodeLauncher"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)

  /**
   * As a `singleTask` home activity we are re-delivered the HOME intent instead
   * of being recreated. AppState never changes in that case, so JS would keep
   * whatever the user last typed. Tell the module so the search resets, exactly
   * as it does when returning from another app.
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (Intent.ACTION_MAIN == intent.action &&
        intent.hasCategory(Intent.CATEGORY_HOME)) {
      LauncherActivityBridge.notifyHomePressed()
    }
  }

  /**
   * A home app must not be dismissible with Back — there is nothing behind it.
   * Back is handled entirely in JS (it clears the query); swallowing it here
   * keeps the launcher on screen when JS has nothing to clear.
   */
  override fun invokeDefaultOnBackPressed() = Unit
}
