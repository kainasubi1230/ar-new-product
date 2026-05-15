package com.spatialinventory.ar

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class ARViewManager : SimpleViewManager<ARViewWrapper>() {
  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext): ARViewWrapper {
    return ARViewWrapper(reactContext)
  }

  @ReactProp(name = "selectedModelUrl")
  fun setSelectedModelUrl(view: ARViewWrapper, selectedModelUrl: String?) {
    view.setSelectedModelUrl(selectedModelUrl ?: "")
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return MapBuilder.of(
      "onModelPlaced",
      MapBuilder.of("registrationName", "onModelPlaced")
    )
  }

  override fun onDropViewInstance(view: ARViewWrapper) {
    super.onDropViewInstance(view)
    view.dispose()
  }

  companion object {
    const val REACT_CLASS = "ARViewManager"
  }
}
