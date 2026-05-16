package com.spatialinventory.ar

import android.Manifest
import android.graphics.Color
import android.content.pm.PackageManager
import android.util.Log
import android.view.MotionEvent
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.ar.core.Config
import com.google.ar.core.Plane
import com.google.ar.core.Session
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.ar.arcore.configure
import io.github.sceneview.node.CubeNode
import io.github.sceneview.node.ModelNode
import dev.romainguy.kotlin.math.Float3

class ARViewWrapper(private val reactContext: ReactContext) : FrameLayout(reactContext) {
  private val arSceneView = ARSceneView(reactContext)
  private var selectedModelUrl: String = ""
  private var hasRequestedCameraPermission = false

  init {
    addView(
      arSceneView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    arSceneView.onSessionFailed = { error ->
      Log.e(TAG, "AR session failed: ${error.message}", error)
    }
    setupTapPlacement()
  }

  fun setSelectedModelUrl(url: String) {
    selectedModelUrl = url
  }

  fun dispose() {
    // ARSceneView manages its own lifecycle via attached activity/lifecycle.
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attachLifecycleAndConfigureSession()
  }

  override fun onDetachedFromWindow() {
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

  private fun attachLifecycleAndConfigureSession() {
    val activity = reactContext.currentActivity as? ComponentActivity
    if (activity != null) {
      arSceneView.lifecycle = activity.lifecycle
    }

    if (!ensureCameraPermission()) {
      postDelayed({ if (isAttachedToWindow) attachLifecycleAndConfigureSession() }, 1000)
      return
    }

    arSceneView.session?.let {
      configureSession(it)
      return
    }

    postDelayed({ if (isAttachedToWindow) attachLifecycleAndConfigureSession() }, 500)
  }

  private fun ensureCameraPermission(): Boolean {
    val granted =
      ContextCompat.checkSelfPermission(
        reactContext,
        Manifest.permission.CAMERA
      ) == PackageManager.PERMISSION_GRANTED

    if (granted) {
      return true
    }

    if (!hasRequestedCameraPermission) {
      val activity = reactContext.currentActivity
      if (activity != null) {
        ActivityCompat.requestPermissions(
          activity,
          arrayOf(Manifest.permission.CAMERA),
          CAMERA_PERMISSION_REQUEST_CODE
        )
        hasRequestedCameraPermission = true
      }
    }
    return false
  }

  private fun setupTapPlacement() {
    arSceneView.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_UP) {
        placeModelOnPlane(event.x, event.y)
      }
      false
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
    val anchorNode = AnchorNode(arSceneView.engine, anchor)
    anchorNode.isEditable = true
    anchorNode.isPositionEditable = true
    anchorNode.isRotationEditable = true
    anchorNode.isScaleEditable = true

    val modelNode = createModelNode(selectedModelUrl)
    modelNode.isEditable = true
    modelNode.isPositionEditable = true
    modelNode.isRotationEditable = true
    modelNode.isScaleEditable = true

    anchorNode.addChildNode(modelNode)
    arSceneView.addChildNode(anchorNode)

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

  private fun createModelNode(modelUrl: String): io.github.sceneview.node.Node {
    return try {
      val modelPath = modelUrl.ifBlank { "models/chair.glb" }
      val modelInstance = arSceneView.modelLoader.createModelInstance(modelPath)
      ModelNode(modelInstance)
    } catch (_: Throwable) {
      val material = arSceneView.materialLoader.createColorInstance(
        Color.parseColor("#2D8CFF"),
        0.2f,
        0.8f,
        0.2f
      )
      CubeNode(
        arSceneView.engine,
        Float3(0.18f, 0.18f, 0.18f),
        Float3(0.0f, 0.09f, 0.0f),
        material
      )
    }
  }

  private companion object {
    const val TAG = "ARViewWrapper"
    const val CAMERA_PERMISSION_REQUEST_CODE = 1001
  }
}
