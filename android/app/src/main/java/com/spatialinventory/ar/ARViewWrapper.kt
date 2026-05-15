package com.spatialinventory.ar

import android.view.MotionEvent
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.ar.core.Config
import com.google.ar.core.Plane
import com.google.ar.core.Session
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.arcore.configure

class ARViewWrapper(private val reactContext: ReactContext) : FrameLayout(reactContext) {
  private val arSceneView = ARSceneView(reactContext)
  private var selectedModelUrl: String = ""

  init {
    addView(
      arSceneView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    setupTapPlacement()
  }

  fun setSelectedModelUrl(url: String) {
    selectedModelUrl = url
  }

  fun dispose() {
    arSceneView.destroy()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    arSceneView.resume()
    arSceneView.session?.let { configureSession(it) }
    post { arSceneView.session?.let { configureSession(it) } }
  }

  override fun onDetachedFromWindow() {
    arSceneView.pause()
    super.onDetachedFromWindow()
  }

  private fun configureSession(session: Session) {
    session.configure { config ->
      config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
      config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR
      config.depthMode =
        if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
          Config.DepthMode.AUTOMATIC
        } else {
          Config.DepthMode.DISABLED
        }
    }
  }

  private fun setupTapPlacement() {
    arSceneView.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_UP) {
        placeModelOnPlane(event.x, event.y)
      }
      true
    }
  }

  private fun placeModelOnPlane(x: Float, y: Float) {
    val frame = arSceneView.frame ?: return
    val hitResult =
      frame.hitTest(x, y).firstOrNull { hit ->
        val trackable = hit.trackable
        trackable is Plane && trackable.isPoseInPolygon(hit.hitPose)
      } ?: return

    val anchor = hitResult.createAnchor()
    // TODO: Load and attach selectedModelUrl (.glb) to this anchor using ModelLoader/ModelNode.
    // This boilerplate focuses on ARCore hit-test + anchor placement bridge wiring.
    anchor.detach()

    val pose = hitResult.hitPose
    val params = Arguments.createMap().apply {
      putString("modelUrl", selectedModelUrl)
      putDouble("x", pose.tx().toDouble())
      putDouble("y", pose.ty().toDouble())
      putDouble("z", pose.tz().toDouble())
    }
    reactContext.getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(id, "onModelPlaced", params)
  }
}
