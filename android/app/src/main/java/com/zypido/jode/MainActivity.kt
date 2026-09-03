package com.zypido.jode

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.zypido.jode.launcher.LauncherActivityBridge

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "JodeLauncher"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)

  /**
   * `null` rather than the saved state, as react-native-screens requires: the
   * navigator's fragments are rebuilt from JS on every start, and handing the
   * platform a saved fragment hierarchy to restore alongside them crashes on
   * the way back in after the activity has been recreated.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

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
