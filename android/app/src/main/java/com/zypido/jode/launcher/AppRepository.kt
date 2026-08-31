package com.zypido.jode.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.os.Build
import android.util.Log
import java.text.Collator
import java.util.Locale

/** One launchable entry: a single activity exposing MAIN/LAUNCHER. */
internal data class LaunchableApp(
    val packageName: String,
    val activityName: String,
    val label: String,
)

/**
 * Queries [PackageManager] for launchable activities and caches the result in
 * memory. All public methods are safe to call from any thread, but [getApps] and
 * [refresh] block on PackageManager and must never run on the UI thread.
 */
internal class AppRepository(private val context: Context) {

  @Volatile private var cached: List<LaunchableApp>? = null
  private val lock = Any()

  /** Cached list, querying PackageManager only on the first call after a miss. */
  fun getApps(): List<LaunchableApp> {
    cached?.let { return it }
    synchronized(lock) {
      // Re-check: another thread may have populated the cache while we waited.
      cached?.let { return it }
      return query().also { cached = it }
    }
  }

  /** Forces a fresh PackageManager query and replaces the cache. */
  fun refresh(): List<LaunchableApp> = synchronized(lock) { query().also { cached = it } }

  /** Marks the cache stale; the next [getApps] re-queries. */
  fun invalidate() {
    cached = null
  }

  private fun query(): List<LaunchableApp> {
    val packageManager = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

    val resolved: List<ResolveInfo> =
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
          } else {
            @Suppress("DEPRECATION") packageManager.queryIntentActivities(intent, 0)
          }
        } catch (e: Exception) {
          // A dead PackageManager or a transient binder failure must not take the
          // launcher down; an empty list surfaces as the "no apps" state in JS.
          Log.e(TAG, "queryIntentActivities failed", e)
          return emptyList()
        }

    val self = context.packageName
    val seen = HashSet<String>(resolved.size)
    val apps = ArrayList<LaunchableApp>(resolved.size)

    for (info in resolved) {
      val activityInfo = info.activityInfo ?: continue
      val packageName = activityInfo.packageName ?: continue
      val activityName = activityInfo.name ?: continue
      // Listing ourselves would let the user "launch" the launcher from the launcher.
      if (packageName == self) continue
      if (!seen.add("$packageName/$activityName")) continue

      val label = resolveLabel(packageManager, info, packageName)
      apps.add(LaunchableApp(packageName, activityName, label))
    }

    val collator =
        Collator.getInstance(Locale.getDefault()).apply { strength = Collator.PRIMARY }
    // Locale-aware ordering done once here, so JS can keep the native order for
    // the empty query and never needs Intl.
    apps.sortWith(
        Comparator { a, b ->
          val byLabel = collator.compare(a.label, b.label)
          if (byLabel != 0) byLabel else a.packageName.compareTo(b.packageName)
        }
    )
    return apps
  }

  /**
   * Activity label, falling back to the application label and finally the package
   * name. An app with a broken label resource stays reachable instead of
   * disappearing from search.
   */
  private fun resolveLabel(
      packageManager: PackageManager,
      info: ResolveInfo,
      packageName: String,
  ): String {
    val activityLabel = runCatching { info.loadLabel(packageManager)?.toString() }.getOrNull()
    if (!activityLabel.isNullOrBlank()) return activityLabel.trim()

    val applicationLabel =
        runCatching {
              packageManager.getApplicationLabel(info.activityInfo.applicationInfo).toString()
            }
            .getOrNull()
    if (!applicationLabel.isNullOrBlank()) return applicationLabel.trim()

    return packageName
  }

  private companion object {
    const val TAG = "AppRepository"
  }
}
