package com.zypido.jode.launcher

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.util.Log
import java.io.File
import java.io.FileOutputStream

/**
 * App icons, rendered once to PNG files in the cache directory and handed to JS
 * as `file://` URIs.
 *
 * A file rather than a base64 string, so that the bridge carries a short path
 * instead of kilobytes per row, and React Native's image pipeline does the
 * decoding and caching it already knows how to do. The file name carries the
 * package's last update time, so an app that ships a new icon gets a new file
 * even when the update happened while the launcher was not running.
 *
 * Every method touches PackageManager or the disk and must stay off the UI
 * thread.
 */
internal class AppIcons(private val context: Context) {

  private val directory: File
    get() = File(context.cacheDir, DIRECTORY).apply { mkdirs() }

  /** The icon's URI, rendering it first if needed. Null when there is none to draw. */
  fun uri(packageName: String, activityName: String): String? {
    val file = File(directory, fileName(packageName, activityName) ?: return null)
    if (file.exists() && file.length() > 0) return Uri.fromFile(file).toString()

    val drawable = load(packageName, activityName) ?: return null
    return try {
      val bitmap = render(drawable)
      // Written aside and renamed, so a reader never sees half a PNG.
      val partial = File(file.parentFile, "${file.name}.part")
      FileOutputStream(partial).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      bitmap.recycle()
      if (!partial.renameTo(file)) {
        partial.delete()
        return null
      }
      Uri.fromFile(file).toString()
    } catch (e: Exception) {
      Log.w(TAG, "could not render the icon for $packageName", e)
      null
    }
  }

  /** Drops every icon rendered for [packageName]: it was updated or removed. */
  fun forget(packageName: String) {
    val prefix = "$packageName$SEPARATOR"
    directory.listFiles()?.forEach { if (it.name.startsWith(prefix)) it.delete() }
  }

  private fun fileName(packageName: String, activityName: String): String? {
    val updated =
        try {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager
                .getPackageInfo(
                    packageName,
                    PackageManager.PackageInfoFlags.of(0L),
                )
                .lastUpdateTime
          } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(packageName, 0).lastUpdateTime
          }
        } catch (e: Exception) {
          // Not installed any more: there is nothing to draw.
          return null
        }
    // Activity names are dotted class names and safe in a file name; the hash
    // keeps the name short and free of anything a file system might refuse.
    val activity = Integer.toHexString(activityName.hashCode())
    return "$packageName$SEPARATOR$activity$SEPARATOR$updated.png"
  }

  private fun load(packageName: String, activityName: String): Drawable? {
    val packageManager = context.packageManager
    val activityIcon =
        if (activityName.isNotEmpty()) {
          runCatching { packageManager.getActivityIcon(ComponentName(packageName, activityName)) }
              .getOrNull()
        } else null
    return activityIcon
        ?: runCatching { packageManager.getApplicationIcon(packageName) }.getOrNull()
  }

  private fun render(drawable: Drawable): Bitmap {
    val size = (SIZE_DP * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, size, size)
    drawable.draw(canvas)
    return bitmap
  }

  private companion object {
    const val TAG = "AppIcons"
    const val DIRECTORY = "app_icons"
    const val SEPARATOR = "__"
    /** Larger than any row draws it, so the icon is scaled down and never up. */
    const val SIZE_DP = 48
  }
}
