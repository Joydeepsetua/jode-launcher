package com.zypido.jode.launcher

/**
 * Lets [com.zypido.jode.MainActivity] reach the live [LauncherModule].
 *
 * The activity receives HOME presses that never reach JS on their own (pressing
 * HOME while the launcher is already foreground does not change AppState), so it
 * needs a way to tell the module. The reference is cleared when the module is
 * torn down, which keeps a destroyed React instance from being retained.
 */
object LauncherActivityBridge {

  @Volatile private var module: LauncherModule? = null

  internal fun attach(instance: LauncherModule) {
    module = instance
  }

  internal fun detach(instance: LauncherModule) {
    // Only clear if we are still holding this exact instance: a reload may have
    // already installed a newer module.
    if (module === instance) module = null
  }

  /** No-op when JS is not running yet. */
  @JvmStatic
  fun notifyHomePressed() {
    module?.notifyHomePressed()
  }
}
