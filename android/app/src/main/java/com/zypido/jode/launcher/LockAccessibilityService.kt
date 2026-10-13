package com.zypido.jode.launcher

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import java.lang.ref.WeakReference

/**
 * Exists for one global action: `GLOBAL_ACTION_LOCK_SCREEN`, which turns the
 * display off exactly as the power button does.
 *
 * Preferred over device administration because `lockNow()` is treated as a
 * policy lock: the next unlock demands the PIN or pattern and fingerprint and
 * face unlock are refused. The global action is an ordinary lock, so biometrics
 * keep working, and nothing has to be deactivated before uninstall.
 *
 * The service subscribes to no events and cannot read window content
 * (`res/xml/lock_accessibility_service.xml`); it only acts when asked.
 */
class LockAccessibilityService : AccessibilityService() {

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = WeakReference(this)
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    instance = null
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  companion object {
    @Volatile private var instance: WeakReference<LockAccessibilityService>? = null

    /** The lock action exists from Android 9; below that there is no lock. */
    val isSupported: Boolean
      get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

    fun component(context: Context): ComponentName =
        ComponentName(context, LockAccessibilityService::class.java)

    /** Whether the user has switched the service on in Accessibility settings. */
    fun isEnabled(context: Context): Boolean {
      val enabled =
          Settings.Secure.getString(
              context.contentResolver,
              Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
          ) ?: return false
      val ours = component(context)
      return enabled.split(':').any {
        ComponentName.unflattenFromString(it) == ours
      }
    }

    /** Turns the display off. False when the service is not running. */
    fun lock(): Boolean {
      if (!isSupported) return false
      val service = instance?.get() ?: return false
      return service.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
    }
  }
}
