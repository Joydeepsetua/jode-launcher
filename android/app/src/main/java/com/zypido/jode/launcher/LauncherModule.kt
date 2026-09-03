package com.zypido.jode.launcher

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableArray
import com.facebook.react.module.annotations.ReactModule
import com.zypido.jode.R
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The single native surface of the launcher: discover launchable apps, launch
 * one, and read what the system knows about recent use.
 *
 * Every PackageManager call runs on a small background pool — none of them is
 * cheap enough for the UI thread, and blocking it would show up directly as
 * dropped keystrokes in the search field.
 */
@ReactModule(name = LauncherModule.NAME)
class LauncherModule(reactContext: ReactApplicationContext) : NativeLauncherSpec(reactContext) {

  private val repository = AppRepository(reactContext.applicationContext)
  private val recentApps = RecentApps(reactContext.applicationContext)
  private val screenTime = ScreenTime(reactContext.applicationContext)
  private val setupState = SetupState(reactContext.applicationContext)
  private val preferences = Preferences(reactContext.applicationContext)

  private val executor: ExecutorService =
      Executors.newFixedThreadPool(WORKER_THREADS) { runnable ->
        Thread(runnable, "launcher-io").apply { isDaemon = true }
      }

  private val receiverRegistered = AtomicBoolean(false)

  /**
   * Keeps the cache honest while the launcher is alive: an app installed or
   * uninstalled from elsewhere shows up without the user having to leave and
   * come back.
   */
  private val packageReceiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          repository.invalidate()
          emitSafely { emitOnAppsChanged() }
        }
      }

  override fun initialize() {
    super.initialize()
    LauncherActivityBridge.attach(this)
    registerPackageReceiver()
    // Warm the cache now so the first JS query is served from memory rather
    // than paying for the PackageManager sweep at the moment of first paint.
    runCatching { executor.execute { runCatching { repository.getApps() } } }
  }

  override fun invalidate() {
    LauncherActivityBridge.detach(this)
    unregisterPackageReceiver()
    executor.shutdownNow()
    super.invalidate()
  }

  // region App discovery

  override fun getInstalledApps(promise: Promise) {
    submit(promise) { promise.resolve(serialise(repository.getApps())) }
  }

  override fun refreshInstalledApps(promise: Promise) {
    submit(promise) { promise.resolve(serialise(repository.refresh())) }
  }

  private fun serialise(apps: List<LaunchableApp>): WritableArray {
    val array = Arguments.createArray()
    for (app in apps) {
      array.pushMap(
          Arguments.createMap().apply {
            putString("packageName", app.packageName)
            putString("activityName", app.activityName)
            putString("name", app.label)
          }
      )
    }
    return array
  }

  // endregion

  // region Launching

  override fun launchApp(packageName: String, activityName: String, promise: Promise) {
    submit(promise) {
      val intent = buildLaunchIntent(packageName, activityName)
      if (intent == null) {
        // The cached entry outlived the app, or the app has no launch intent.
        // Drop the cache so the next query reflects reality, and report the
        // miss to JS rather than throwing.
        repository.invalidate()
        emitSafely { emitOnAppsChanged() }
        promise.resolve(false)
        return@submit
      }
      UiThreadUtil.runOnUiThread {
        val started = startActivitySafely(intent)
        if (started) {
          // Recorded here rather than in JS so the order can only ever reflect
          // launches that really happened, and is already on disk by the time
          // the launcher is resumed and asks for it.
          runCatching { executor.execute { recentApps.record(packageName, activityName) } }
        } else {
          repository.invalidate()
          emitSafely { emitOnAppsChanged() }
        }
        promise.resolve(started)
      }
    }
  }

  private fun buildLaunchIntent(packageName: String, activityName: String): Intent? {
    val packageManager = reactApplicationContext.packageManager

    if (activityName.isNotEmpty()) {
      val explicit =
          Intent(Intent.ACTION_MAIN)
              .addCategory(Intent.CATEGORY_LAUNCHER)
              .setComponent(ComponentName(packageName, activityName))
      if (runCatching { explicit.resolveActivity(packageManager) }.getOrNull() != null) {
        return explicit.withLauncherFlags()
      }
    }

    // The recorded activity is gone (app updated and renamed its entry point):
    // fall back to whatever PackageManager now considers the way in.
    return runCatching { packageManager.getLaunchIntentForPackage(packageName) }
        .getOrNull()
        ?.withLauncherFlags()
  }

  private fun Intent.withLauncherFlags(): Intent = apply {
    // RESET_TASK_IF_NEEDED gives the standard "launched from home" behaviour:
    // an already-running app resumes at its root rather than mid-stack.
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
  }

  private fun startActivitySafely(intent: Intent): Boolean =
      try {
        val activity = reactApplicationContext.currentActivity
        if (activity != null) activity.startActivity(intent)
        else reactApplicationContext.startActivity(intent)
        true
      } catch (e: ActivityNotFoundException) {
        Log.w(TAG, "no activity for ${intent.component}", e)
        false
      } catch (e: SecurityException) {
        Log.w(TAG, "not permitted to launch ${intent.component}", e)
        false
      } catch (e: Exception) {
        Log.w(TAG, "failed to launch ${intent.component}", e)
        false
      }

  // endregion

  // region Recents

  override fun getRecentAppIds(promise: Promise) {
    submit(promise) {
      // The app list is what turns a usage-stats package into a launchable row,
      // and it is already cached, so this stays a single system query.
      val array = Arguments.createArray()
      for (id in recentApps.ids(repository.getApps())) {
        array.pushString(id)
      }
      promise.resolve(array)
    }
  }

  override fun getScreenTime(promise: Promise) {
    submit(promise) {
      val snapshot = screenTime.snapshot(recentApps.hasUsageAccess())
      promise.resolve(
          Arguments.createMap().apply {
            putDouble("todayMs", snapshot.todayMs.toDouble())
            putDouble("recordMs", snapshot.recordMs.toDouble())
            putBoolean("available", snapshot.available)
          }
      )
    }
  }

  override fun hasUsageAccess(): Boolean = recentApps.hasUsageAccess()

  override fun requestUsageAccess() {
    UiThreadUtil.runOnUiThread {
      val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread
      try {
        // There is no runtime prompt for this one: the only way in is the
        // system's usage-access list, where the user finds us and flips it on.
        activity.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
      } catch (e: Exception) {
        Log.w(TAG, "usage access settings unavailable", e)
        runCatching { activity.startActivity(Intent(Settings.ACTION_SETTINGS)) }
            .onFailure { Log.w(TAG, "could not open settings", it) }
      }
    }
  }

  // endregion

  // region First run

  override fun isSetupComplete(): Boolean = setupState.isComplete()

  override fun completeSetup() {
    setupState.markComplete()
  }

  // endregion

  // region Settings

  override fun getThemeMode(): String = preferences.themeMode()

  override fun setThemeMode(mode: String) {
    preferences.setThemeMode(mode)
  }

  override fun getScrimOpacity(): Double = preferences.scrimOpacity()

  override fun setScrimOpacity(value: Double) {
    preferences.setScrimOpacity(value)
  }

  // endregion

  // region Screen lock

  /** The component Android knows as this app's device administrator. */
  private val adminComponent: ComponentName
    get() = ComponentName(reactApplicationContext, LockAdminReceiver::class.java)

  private val devicePolicyManager: DevicePolicyManager?
    get() =
        reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE)
            as? DevicePolicyManager

  override fun canLockScreen(): Boolean =
      try {
        devicePolicyManager?.isAdminActive(adminComponent) == true
      } catch (e: Exception) {
        Log.w(TAG, "could not read device admin state", e)
        false
      }

  override fun lockScreen(): Boolean =
      try {
        val manager = devicePolicyManager
        if (manager == null || !manager.isAdminActive(adminComponent)) {
          // Revoked since we last looked. Reporting it lets JS offer the way
          // back rather than leaving a gesture that quietly does nothing.
          false
        } else {
          manager.lockNow()
          true
        }
      } catch (e: SecurityException) {
        Log.w(TAG, "not permitted to lock the screen", e)
        false
      } catch (e: Exception) {
        Log.w(TAG, "could not lock the screen", e)
        false
      }

  override fun requestLockScreenPermission() {
    UiThreadUtil.runOnUiThread {
      val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread
      try {
        val intent =
            Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                .putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    reactApplicationContext.getString(R.string.lock_admin_explanation),
                )
        activity.startActivity(intent)
      } catch (e: Exception) {
        Log.w(TAG, "could not open the device admin request", e)
      }
    }
  }

  // endregion

  // region Default home app

  override fun isDefaultLauncher(): Boolean {
    try {
      // Ask about ourselves rather than about the field. Resolving the HOME
      // intent looks like the obvious way to answer this and is a trap: from
      // Android 11 the result is filtered by package visibility, and a launcher
      // exposes MAIN/HOME but not MAIN/LAUNCHER, so the home app currently
      // holding the role is invisible to us and the resolver hands back the
      // only HOME activity we can see — our own. That reads as "yes, we are the
      // default" on a device where we are nothing of the kind. Asking the role
      // holder about the caller cannot be filtered.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        holdsHomeRole()?.let { return it }
      }

      // Below Q there is no role manager. The manifest declares a HOME query so
      // that this resolution can see past the visibility filter.
      val packageManager = reactApplicationContext.packageManager
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      @Suppress("DEPRECATION")
      val resolved = packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)
      return resolved?.activityInfo?.packageName == reactApplicationContext.packageName
    } catch (e: Exception) {
      Log.w(TAG, "could not determine the current home app", e)
      return false
    }
  }

  /** Null when the role is unavailable on this device, so the caller falls back. */
  @RequiresApi(Build.VERSION_CODES.Q)
  private fun holdsHomeRole(): Boolean? {
    val roleManager =
        reactApplicationContext.getSystemService(RoleManager::class.java) ?: return null
    if (!roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
      return null
    }
    return roleManager.isRoleHeld(RoleManager.ROLE_HOME)
  }

  override fun requestDefaultLauncher() {
    UiThreadUtil.runOnUiThread {
      val activity = reactApplicationContext.currentActivity ?: return@runOnUiThread
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && requestHomeRole(activity)) {
        return@runOnUiThread
      }
      openHomeSettings(activity)
    }
  }

  /** The direct "make this your home app" dialog. Not offered by every OEM. */
  @RequiresApi(Build.VERSION_CODES.Q)
  private fun requestHomeRole(activity: Activity): Boolean =
      try {
        val roleManager = activity.getSystemService(RoleManager::class.java)
        when {
          roleManager == null -> false
          !roleManager.isRoleAvailable(RoleManager.ROLE_HOME) -> false
          roleManager.isRoleHeld(RoleManager.ROLE_HOME) -> true
          else -> {
            activity.startActivityForResult(
                roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME),
                REQUEST_CODE_HOME_ROLE,
            )
            true
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "home role request unavailable", e)
        false
      }

  private fun openHomeSettings(activity: Activity) {
    try {
      activity.startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
    } catch (e: Exception) {
      runCatching { activity.startActivity(Intent(Settings.ACTION_SETTINGS)) }
          .onFailure { Log.w(TAG, "could not open settings", it) }
    }
  }

  // endregion

  // region Events

  /** Called by [MainActivity] when HOME is pressed while we are already resumed. */
  internal fun notifyHomePressed() {
    emitSafely { emitOnHomePressed() }
  }

  /**
   * The generated spec emits through a callback that is only installed once the
   * TurboModule is fully wired to JS. Emitting before or after that window is a
   * no-op, never a crash.
   */
  private inline fun emitSafely(emit: () -> Unit) {
    try {
      emit()
    } catch (t: Throwable) {
      Log.d(TAG, "event dropped, JS not attached", t)
    }
  }

  private fun registerPackageReceiver() {
    if (!receiverRegistered.compareAndSet(false, true)) return
    val filter =
        IntentFilter().apply {
          addAction(Intent.ACTION_PACKAGE_ADDED)
          addAction(Intent.ACTION_PACKAGE_REMOVED)
          addAction(Intent.ACTION_PACKAGE_REPLACED)
          addAction(Intent.ACTION_PACKAGE_CHANGED)
          addDataScheme("package")
        }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        reactApplicationContext.registerReceiver(
            packageReceiver,
            filter,
            Context.RECEIVER_NOT_EXPORTED,
        )
      } else {
        reactApplicationContext.registerReceiver(packageReceiver, filter)
      }
    } catch (e: Exception) {
      receiverRegistered.set(false)
      // Losing live updates is survivable: JS still refreshes on resume.
      Log.w(TAG, "package broadcast registration failed", e)
    }
  }

  private fun unregisterPackageReceiver() {
    if (!receiverRegistered.compareAndSet(true, false)) return
    runCatching { reactApplicationContext.unregisterReceiver(packageReceiver) }
  }

  // endregion

  /** Runs [block] off the UI thread, turning any escape into a promise rejection. */
  private fun submit(promise: Promise, block: () -> Unit) {
    try {
      executor.execute {
        try {
          block()
        } catch (t: Throwable) {
          promise.reject(ERROR_UNEXPECTED, t.message ?: t.javaClass.simpleName, t)
        }
      }
    } catch (e: RejectedExecutionException) {
      promise.reject(ERROR_UNAVAILABLE, "Launcher module is shutting down", e)
    }
  }

  companion object {
    const val NAME: String = "Launcher"

    private const val TAG = "LauncherModule"
    private const val WORKER_THREADS = 3
    private const val REQUEST_CODE_HOME_ROLE = 4711
    private const val ERROR_UNEXPECTED = "E_LAUNCHER_UNEXPECTED"
    private const val ERROR_UNAVAILABLE = "E_LAUNCHER_UNAVAILABLE"
  }
}
