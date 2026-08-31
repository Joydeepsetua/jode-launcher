package com.zypido.jode.launcher

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers [LauncherModule] as a lazily created TurboModule. */
class LauncherPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == LauncherModule.NAME) LauncherModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        LauncherModule.NAME to
            ReactModuleInfo(
                LauncherModule.NAME,
                LauncherModule::class.java.name,
                /* canOverrideExistingModule = */ false,
                /* needsEagerInit = */ false,
                /* isCxxModule = */ false,
                /* isTurboModule = */ true,
            )
    )
  }
}
