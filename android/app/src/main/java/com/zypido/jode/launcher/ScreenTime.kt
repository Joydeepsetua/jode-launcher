package com.zypido.jode.launcher

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.util.Log
import com.zypido.jode.BuildConfig
import java.util.Calendar

/** Today's screen time, and the most any single day has ever reached. */
internal data class ScreenTimeSnapshot(
    val todayMs: Long,
    val recordMs: Long,
    /** False when usage access is off, in which case there is nothing to show. */
    val available: Boolean,
)

/**
 * How long the phone has been used today, meant to agree with the number in
 * Settings rather than to be defensible on its own.
 *
 * Settings does not measure this itself either: it reads what
 * [UsageStatsManager] has already accounted, and that accounting knows things no
 * caller can see — which activity instance a stop event belongs to, which task
 * an activity was rooted in, and when the device clock jumped. So the system's
 * own daily totals are the first choice here, and the event stream is walked
 * only when those totals cover more than today and cannot be cut down to it.
 * Two sources, one answer, and the debug log says which one spoke.
 *
 * Time on the home screen is left out of both. Settings counts time in apps,
 * and the seconds spent looking at a clock on the way somewhere else are not
 * usage; here the home screen is this launcher.
 *
 * Safe to call from any thread, but [snapshot] queries the system and must not
 * run on the UI thread.
 */
internal class ScreenTime(context: Context) {

  private val appContext = context.applicationContext

  private val preferences =
      appContext.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  fun snapshot(hasUsageAccess: Boolean): ScreenTimeSnapshot {
    if (!hasUsageAccess) {
      return UNAVAILABLE
    }
    val manager =
        try {
          appContext.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        } catch (e: Exception) {
          Log.w(TAG, "no usage stats service", e)
          null
        } ?: return UNAVAILABLE

    val now = System.currentTimeMillis()
    val startOfToday = startOfDay(now)

    val daily = dailyTotals(manager, startOfToday, now)
    // The walk is the fallback, and in debug builds it is also the thing the
    // system's totals get checked against.
    val walked =
        if (daily == null || BuildConfig.DEBUG) {
          walkEvents(manager, startOfToday, now)
        } else {
          null
        }
    val byPackage = daily ?: walked ?: emptyMap()

    val launcherMs = byPackage[appContext.packageName] ?: 0L
    val todayMs = maxOf(0L, byPackage.values.sum() - launcherMs)

    if (BuildConfig.DEBUG) {
      logSources(daily, walked, byPackage, todayMs, launcherMs)
    }

    var recordMs = preferences.getLong(KEY_RECORD, UNSEEDED)
    if (recordMs == UNSEEDED) {
      // First run with access. The system keeps daily buckets for months, so
      // the record starts from real history rather than from today — otherwise
      // day one is by definition the record and the ring is full from the off.
      recordMs = seedFromHistory(manager, now)
    }
    if (todayMs > recordMs) {
      recordMs = todayMs
    }
    persist(recordMs)

    // Floor the denominator. On a device with no history to compare against,
    // a record of a few minutes would put the ring at full for an ordinary
    // morning and tell the user nothing.
    return ScreenTimeSnapshot(todayMs, maxOf(recordMs, MIN_RECORD_MS), true)
  }

  /**
   * What the system itself has accounted for today, per package, or null if
   * none of it can be used.
   *
   * These are the numbers Settings lists app by app. Daily buckets normally roll
   * at midnight, in which case they describe exactly the window wanted here, and
   * a device booted mid-morning starts one then, which is still inside today.
   * The bucket that began *before* today is the one that cannot be used: it
   * carries yesterday's evening inside its totals, and nothing in the API can
   * take those minutes back out again. It is dropped whole. What that loses is
   * a session running through midnight, which is minutes; what reconstructing
   * it from events would cost is a phone switched off overnight coming back
   * with hours it never spent, because the last thing it reported was an app in
   * front and the clock moved on without it.
   */
  private fun dailyTotals(
      manager: UsageStatsManager,
      from: Long,
      to: Long,
  ): Map<String, Long>? {
    val buckets =
        try {
          manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, from, to)
        } catch (e: Exception) {
          Log.w(TAG, "could not read daily usage stats", e)
          null
        }
    if (buckets.isNullOrEmpty()) {
      return null
    }

    val totals = HashMap<String, Long>()
    var usable = false
    for (bucket in buckets) {
      if (bucket.firstTimeStamp < from) {
        continue
      }
      usable = true
      val time = bucket.totalTimeInForeground
      if (time > 0L) {
        totals[bucket.packageName] = (totals[bucket.packageName] ?: 0L) + time
      }
    }
    return if (usable) totals else null
  }

  /**
   * The same question answered from raw events, for when the buckets cannot be.
   *
   * This follows how the system accounts foreground time: a package is in front
   * while any of its activities is resumed, so what is tracked is a set of
   * activities per package rather than one interval overall. That distinction is
   * the whole game. Moving between two activities of the same app is reported as
   * `A paused, B resumed, A stopped` — in that order — and taking the trailing
   * stop for the end of the app's session drops everything up to its next
   * resume, which on a phone left sitting inside one app is most of the day.
   */
  private fun walkEvents(
      manager: UsageStatsManager,
      from: Long,
      to: Long,
  ): Map<String, Long> {
    val resumed: Int
    val paused: Int
    val stopped: Int
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      resumed = UsageEvents.Event.ACTIVITY_RESUMED
      paused = UsageEvents.Event.ACTIVITY_PAUSED
      stopped = UsageEvents.Event.ACTIVITY_STOPPED
    } else {
      @Suppress("DEPRECATION")
      resumed = UsageEvents.Event.MOVE_TO_FOREGROUND
      @Suppress("DEPRECATION")
      paused = UsageEvents.Event.MOVE_TO_BACKGROUND
      stopped = NO_SUCH_EVENT
    }

    val totals = HashMap<String, Long>()
    /** Resumed activities per package; a package is in front while it has any. */
    val live = HashMap<String, MutableSet<String>>()
    /** When each package's current stretch in front began. */
    val since = HashMap<String, Long>()
    // The display state as the stream reports it, assumed on at the start of
    // the lookback where there is nothing yet to attribute either way.
    var screenOn = true

    fun end(packageName: String, at: Long) {
      val start = since.remove(packageName) ?: return
      val slice = overlap(start, at, from, to)
      if (slice > 0L) {
        totals[packageName] = (totals[packageName] ?: 0L) + slice
      }
    }

    fun endAll(at: Long) {
      for (packageName in since.keys.toList()) {
        end(packageName, at)
      }
      live.clear()
    }

    try {
      // Only events inside the window open a stretch. Reaching back to catch a
      // session that began before it sounds better than it is: the last thing a
      // phone reports before being switched off is an app in front, and opening
      // that stretch hands the morning every hour the phone spent powered down.
      val events = manager.queryEvents(from, to) ?: return totals
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val at = event.timeStamp
        val packageName = event.packageName ?: continue
        val className = event.className ?: ""

        when (event.eventType) {
          resumed -> {
            val activities = live.getOrPut(packageName) { HashSet() }
            // Apps resume behind a dark screen — an alarm, a media session, a
            // system app doing its rounds. Nobody is looking at any of it, and
            // a stretch opened here would run until the phone was next picked
            // up and land the whole night on the total.
            if (activities.isEmpty() && screenOn) {
              since[packageName] = at
            }
            activities.add(className)
          }
          paused,
          stopped -> {
            val activities = live[packageName]
            activities?.remove(className)
            if (activities.isNullOrEmpty()) {
              end(packageName, at)
            }
          }
          UsageEvents.Event.SCREEN_NON_INTERACTIVE,
          DEVICE_SHUTDOWN -> {
            // Screen time is time spent looking at the phone. Whatever was in
            // front stops counting here even if it is never paused — which is
            // what otherwise turns a night on the bedside table into eight
            // hours of screen time.
            endAll(at)
            screenOn = false
          }
          UsageEvents.Event.KEYGUARD_SHOWN -> {
            // The lock screen is in front now, not the app that was, but the
            // display is still on and an unlock may follow in a second.
            endAll(at)
          }
          UsageEvents.Event.SCREEN_INTERACTIVE -> {
            screenOn = true
          }
        }
      }
    } catch (e: Exception) {
      // Access revoked mid-query, or a dead system service. Reporting nothing
      // hides the ring rather than drawing a wrong one.
      Log.w(TAG, "usage event query failed", e)
      return emptyMap()
    }

    // Whatever is on screen right now has not been paused yet, and that
    // includes this launcher while the user is looking at it. If the display is
    // off, these are stretches no close event ever arrived for, and counting
    // them up to now would invent time nobody spent.
    if (screenOn && isInteractive()) {
      endAll(to)
    }
    return totals
  }

  /**
   * The part of one stretch in front that falls inside the window, or zero if
   * none of it does.
   */
  private fun overlap(openedAt: Long, closedAt: Long, from: Long, to: Long): Long {
    val start = maxOf(openedAt, from)
    val end = minOf(closedAt, to)
    return if (end > start) end - start else 0L
  }

  /** Whether the display is on. Cheap, and needs no permission. */
  private fun isInteractive(): Boolean =
      try {
        val power = appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        power?.isInteractive ?: true
      } catch (e: Exception) {
        Log.w(TAG, "could not read the display state", e)
        true
      }

  /**
   * Which source answered, what the other would have said, and where the
   * minutes went — debug builds only.
   *
   * The two disagreeing is not by itself a bug: the walk cannot see a clock
   * that jumped, which is routine on an emulator whose host went to sleep. But
   * it is the first thing worth knowing when this number does not match
   * Settings.
   *
   *     adb logcat -s ScreenTime
   */
  private fun logSources(
      daily: Map<String, Long>?,
      walked: Map<String, Long>?,
      byPackage: Map<String, Long>,
      todayMs: Long,
      launcherMs: Long,
  ) {
    val self = appContext.packageName
    val walkedTotal = walked?.let { it.values.sum() - (it[self] ?: 0L) }
    Log.d(
        TAG,
        "today ${m(todayMs)} from " +
            (if (daily == null) "the event walk" else "system daily totals") +
            "; the walk says ${walkedTotal?.let { m(it) } ?: "-"}" +
            "; launcher ${m(launcherMs)} not counted",
    )
    Log.d(
        TAG,
        "by app: " +
            byPackage.entries
                .sortedByDescending { it.value }
                .take(BREAKDOWN_ROWS)
                .joinToString(", ") { "${it.key} ${m(it.value)}" },
    )
  }

  /** Milliseconds as whole minutes, which is the only precision worth reading. */
  private fun m(ms: Long): String = "${ms / 60_000}m"

  /** The busiest day in whatever history the system still holds. */
  private fun seedFromHistory(manager: UsageStatsManager, now: Long): Long =
      try {
        val stats =
            manager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                now - HISTORY_MS,
                now,
            )
        val perDay = HashMap<Long, Long>()
        if (stats != null) {
          for (entry in stats) {
            // Left out of the daily totals for the same reason it is left out
            // of today's: a record that counts the home screen is not a record
            // today can be measured against.
            if (entry.packageName == appContext.packageName) {
              continue
            }
            val day = startOfDay(entry.firstTimeStamp)
            perDay[day] = (perDay[day] ?: 0L) + entry.totalTimeInForeground
          }
        }
        // Today is still accruing and is compared separately.
        perDay.remove(startOfDay(now))
        perDay.values.maxOrNull() ?: 0L
      } catch (e: Exception) {
        Log.w(TAG, "could not read usage history", e)
        0L
      }

  private fun persist(recordMs: Long) {
    try {
      preferences.edit().putLong(KEY_RECORD, recordMs).apply()
    } catch (e: Exception) {
      Log.w(TAG, "could not persist the screen time record", e)
    }
  }

  /** Local midnight before [timestamp], which is where "today" begins. */
  private fun startOfDay(timestamp: Long): Long =
      Calendar.getInstance()
          .apply {
            timeInMillis = timestamp
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
          }
          .timeInMillis

  private companion object {
    const val TAG = "ScreenTime"
    const val STORE = "launcher_screen_time"
    /**
     * Versioned: the record is a maximum over past readings, so it has to be
     * thrown away whenever the measurement changes underneath it, or a device
     * carries an old inflated number forward and the ring never fills again.
     */
    const val KEY_RECORD = "record_ms_v3"
    /** Distinguishes "never seeded" from a genuine record of zero. */
    const val UNSEEDED = -1L
    /** No event carries this type, so the branch is simply never taken. */
    const val NO_SUCH_EVENT = -1
    /**
     * `UsageEvents.Event.DEVICE_SHUTDOWN`, which the public SDK does not name.
     * A device that goes down mid-session sends this and nothing else.
     */
    const val DEVICE_SHUTDOWN = 26
    /** How many apps the debug breakdown names before it stops. */
    const val BREAKDOWN_ROWS = 12
    const val HISTORY_MS = 90L * 24 * 60 * 60 * 1_000
    const val MIN_RECORD_MS = 2L * 60 * 60 * 1_000

    val UNAVAILABLE = ScreenTimeSnapshot(0L, 0L, false)
  }
}
