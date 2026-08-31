package com.zypido.jode.launcher

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log

/**
 * The apps most recently opened **on the device**, most recent first.
 *
 * The order comes from [UsageStatsManager], so it reflects every way an app can
 * be opened — from here, from a notification, from a link in another app, from
 * Recents — and not merely the launches this launcher performed. That reach is
 * the whole point, and it is also why it costs something: `PACKAGE_USAGE_STATS`
 * is a special-access permission that no app can request with a normal runtime
 * prompt. The user has to grant it by hand in Settings, and until they do,
 * [ids] falls back to the launches we can see ourselves — the ones made from
 * this launcher, recorded in [record].
 *
 * Ids are `packageName/activityName`, matching the identity JS builds in
 * `src/native/LauncherModule.ts`. Usage stats are reported per *package*, so a
 * package is resolved to its launchable activity through the app list; anything
 * with no launchable activity — system UI, input methods, background services,
 * and this launcher itself — cannot be shown as a row and drops out.
 *
 * Safe to call from any thread. [ids] queries the system and must not run on
 * the UI thread.
 */
internal class RecentApps(context: Context) {

  private val appContext = context.applicationContext

  private val preferences =
      appContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  private val lock = Any()
  /** Mirrors the fallback history on disk, so a read never touches storage twice. */
  @Volatile private var cachedHistory: List<String>? = null

  /** Whether the user has granted usage access in Settings. Cheap; no query. */
  fun hasUsageAccess(): Boolean =
      try {
        val appOps = appContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              appOps.unsafeCheckOpNoThrow(
                  AppOpsManager.OPSTR_GET_USAGE_STATS,
                  Process.myUid(),
                  appContext.packageName,
              )
            } else {
              @Suppress("DEPRECATION")
              appOps.checkOpNoThrow(
                  AppOpsManager.OPSTR_GET_USAGE_STATS,
                  Process.myUid(),
                  appContext.packageName,
              )
            }
        mode == AppOpsManager.MODE_ALLOWED
      } catch (e: Exception) {
        Log.w(TAG, "could not check usage access", e)
        false
      }

  /**
   * Recent ids in the order the apps were last opened, newest first.
   *
   * [apps] supplies the package → launchable activity mapping and is the only
   * thing filtered against: the order itself is passed through exactly as the
   * system reports it.
   */
  fun ids(apps: List<LaunchableApp>): List<String> {
    val launchable = HashMap<String, String>(apps.size)
    for (app in apps) {
      // First launcher activity wins, which is the one the app list shows first.
      launchable.putIfAbsent(app.packageName, "${app.packageName}/${app.activityName}")
    }

    val packages = if (hasUsageAccess()) queryUsageOrder() else emptyList()
    val source = if (packages.isNotEmpty()) packages else historyPackages()

    val ids = ArrayList<String>(source.size)
    for (packageName in source) {
      val id = launchable[packageName] ?: continue
      ids.add(id)
    }
    return ids
  }

  /**
   * Packages in last-opened order. Read from the event stream rather than from
   * aggregated [android.app.usage.UsageStats], whose buckets are coarse enough
   * to get the ordering of two apps opened minutes apart wrong.
   */
  private fun queryUsageOrder(): List<String> {
    val manager =
        try {
          appContext.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        } catch (e: Exception) {
          Log.w(TAG, "no usage stats service", e)
          null
        } ?: return emptyList()

    val now = System.currentTimeMillis()
    val since = now - WINDOW_MS

    val lastOpened = HashMap<String, Long>()
    try {
      // Foregrounding an activity is the moment a user would call "opening" an
      // app. The two constants are the same value; the name changed in Q.
      val foreground =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            UsageEvents.Event.ACTIVITY_RESUMED
          } else {
            @Suppress("DEPRECATION") UsageEvents.Event.MOVE_TO_FOREGROUND
          }

      val events = manager.queryEvents(since, now) ?: return emptyList()
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        if (event.eventType != foreground) continue
        val packageName = event.packageName ?: continue
        // Events arrive oldest first, so the last one written wins.
        lastOpened[packageName] = event.timeStamp
      }
    } catch (e: Exception) {
      // Access revoked between the check and the query, or a dead system
      // service. The caller falls back to our own launch history.
      Log.w(TAG, "usage event query failed", e)
      return emptyList()
    }

    return lastOpened.entries.sortedByDescending { it.value }.map { it.key }
  }

  /** Fallback ordering: the launches made from this launcher. */
  private fun historyPackages(): List<String> =
      history().mapNotNull { id -> id.substringBefore('/').ifEmpty { null } }

  /**
   * Moves an app to the front of the fallback history. Re-launching the app
   * already at the front is the common case and is not written back to disk.
   */
  fun record(packageName: String, activityName: String) {
    val id = "$packageName/$activityName"
    synchronized(lock) {
      val current = cachedHistory ?: read().also { cachedHistory = it }
      if (current.firstOrNull() == id) {
        return
      }
      val next = ArrayList<String>(current.size + 1)
      next.add(id)
      for (existing in current) {
        if (existing != id && next.size < HISTORY) {
          next.add(existing)
        }
      }
      cachedHistory = next
      write(next)
    }
  }

  private fun history(): List<String> {
    cachedHistory?.let { return it }
    synchronized(lock) {
      cachedHistory?.let { return it }
      return read().also { cachedHistory = it }
    }
  }

  private fun read(): List<String> =
      try {
        preferences.getString(KEY, null)
            ?.split(SEPARATOR)
            ?.filter { it.isNotEmpty() }
            ?.take(HISTORY)
            ?: emptyList()
      } catch (e: Exception) {
        // A corrupt or unreadable store costs the user their fallback recents
        // and nothing more.
        Log.w(TAG, "could not read recent apps", e)
        emptyList()
      }

  private fun write(ids: List<String>) {
    try {
      preferences.edit().putString(KEY, ids.joinToString(SEPARATOR)).apply()
    } catch (e: Exception) {
      Log.w(TAG, "could not persist recent apps", e)
    }
  }

  private companion object {
    const val TAG = "RecentApps"
    const val STORE = "launcher_recents"
    const val KEY = "ids"
    /** A newline cannot occur in a package or class name, so it cannot collide. */
    const val SEPARATOR = "\n"
    const val HISTORY = 16
    /** How far back to look. Long enough to always fill the list, short enough
     * that the event scan stays cheap. */
    const val WINDOW_MS = 7L * 24 * 60 * 60 * 1_000
  }
}
