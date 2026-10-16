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

  @ReactProp(name = "cardTitle")
  fun setCardTitle(view: ARViewWrapper, title: String?) {
    view.setCardTitle(title ?: "")
  }

  @ReactProp(name = "cardDescription")
  fun setCardDescription(view: ARViewWrapper, desc: String?) {
    view.setCardDescription(desc ?: "")
  }

  @ReactProp(name = "cardColor")
  fun setCardColor(view: ARViewWrapper, color: String?) {
    view.setCardColor(color ?: "")
  }

  @ReactProp(name = "cardIcon")
  fun setCardIcon(view: ARViewWrapper, icon: String?) {
    view.setCardIcon(icon ?: "")
  }

  @ReactProp(name = "placeTrigger")
  fun setPlaceTrigger(view: ARViewWrapper, trigger: Int?) {
    if (trigger != null && trigger > 0) {
      view.placeCardAtCenter()
    }
  }

  @ReactProp(name = "isPreviewActive")
  fun setIsPreviewActive(view: ARViewWrapper, active: Boolean?) {
    // Handle preview active state on Android
  }

  @ReactProp(name = "selectedModelUrl")
  fun setSelectedModelUrl(view: ARViewWrapper, selectedModelUrl: String?) {
    view.setSelectedModelUrl(selectedModelUrl ?: "")
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return MapBuilder.of(
      "onScreenTapped",
      MapBuilder.of("registrationName", "onScreenTapped"),
      "onCardPlaced",
      MapBuilder.of("registrationName", "onCardPlaced"),
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

