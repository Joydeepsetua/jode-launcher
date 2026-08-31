package com.zypido.jode.launcher

import android.app.admin.DeviceAdminReceiver

/**
 * Exists so the app can hold one policy and one only: `force-lock`, which is
 * what [android.app.admin.DevicePolicyManager.lockNow] requires.
 *
 * Turning the screen off is not something an ordinary app may do; Android puts
 * it behind device administration, and there is no lighter permission for it.
 * The policy list in `res/xml/device_admin.xml` is deliberately a single line —
 * nothing here can wipe the device, read a password, or enforce anything, and
 * the receiver overrides none of the callbacks that would let it try.
 *
 * The user can revoke it at any time in Settings, and must revoke it before the
 * app can be uninstalled, which is the real cost of the feature and the reason
 * it stays optional.
 */
class LockAdminReceiver : DeviceAdminReceiver()
