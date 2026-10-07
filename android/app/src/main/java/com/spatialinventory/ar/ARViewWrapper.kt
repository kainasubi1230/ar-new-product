package com.spatialinventory.ar

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
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
import dev.romainguy.kotlin.math.Float3
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.arcore.configure
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.node.CubeNode
import io.github.sceneview.node.Node
import java.util.concurrent.CopyOnWriteArrayList

class ARViewWrapper(private val reactContext: ReactContext) : FrameLayout(reactContext) {
  private val arSceneView = ARSceneView(reactContext)
  private var cardTitle: String = "AR Info Card"
  private var cardDescription: String = "Spatial info card"
  private var cardColor: String = "#00E5FF"
  private var cardIcon: String = "📌"
  private var selectedModelUrl: String = ""
  private var hasRequestedCameraPermission = false

  private val placedCardNodes = CopyOnWriteArrayList<Node>()

  init {
    addView(
      arSceneView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    arSceneView.onSessionFailed = { error ->
      Log.e(TAG, "AR session failed: ${error.message}", error)
    }

    // Billboard loop: Rotate placed card nodes to face camera on every frame
    arSceneView.onFrame = { _ ->
      val cameraNode = arSceneView.cameraNode
      val cameraPos = cameraNode.worldPosition
      placedCardNodes.forEach { node ->
        try {
          node.lookAt(cameraPos)
        } catch (_: Throwable) {
          // Ignore if node is detached
        }
      }
    }

    setupTapPlacement()
  }

  fun setCardTitle(title: String) {
    if (title.isNotBlank()) cardTitle = title
  }

  fun setCardDescription(desc: String) {
    cardDescription = desc
  }

  fun setCardColor(color: String) {
    if (color.isNotBlank()) cardColor = color
  }

  fun setCardIcon(icon: String) {
    if (icon.isNotBlank()) cardIcon = icon
  }

  fun setSelectedModelUrl(url: String) {
    selectedModelUrl = url
  }

  fun dispose() {
    placedCardNodes.clear()
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
        placeCardOnPlane(event.x, event.y)
      }
      false
    }
  }

  private fun placeCardOnPlane(x: Float, y: Float) {
    val frame = arSceneView.frame ?: return
    val hitResult =
      frame.hitTest(x, y).firstOrNull { hit ->
        val trackable = hit.trackable
        trackable is Plane && trackable.isPoseInPolygon(hit.hitPose)
      } ?: return

    val anchor = hitResult.createAnchor()
    val anchorNode = AnchorNode(arSceneView.engine, anchor)
    anchorNode.isEditable = true

    val cardNode = createCardNode()
    cardNode.isEditable = true
    cardNode.isPositionEditable = true
    cardNode.isRotationEditable = true

    anchorNode.addChildNode(cardNode)
    arSceneView.addChildNode(anchorNode)
    placedCardNodes.add(cardNode)

    val pose = hitResult.hitPose
    val params = Arguments.createMap().apply {
      putString("cardTitle", cardTitle)
      putString("cardDescription", cardDescription)
      putString("cardColor", cardColor)
      putString("cardIcon", cardIcon)
      putString("modelUrl", cardTitle)
      putDouble("x", pose.tx().toDouble())
      putDouble("y", pose.ty().toDouble())
      putDouble("z", pose.tz().toDouble())
    }

    val emitter = reactContext.getJSModule(RCTEventEmitter::class.java)
    emitter.receiveEvent(id, "onCardPlaced", params)
    emitter.receiveEvent(id, "onModelPlaced", params)
  }

  private fun createCardNode(): Node {
    val parsedColor = try {
      Color.parseColor(if (cardColor.startsWith("#")) cardColor else "#00E5FF")
    } catch (_: Throwable) {
      Color.parseColor("#00E5FF")
    }

    val material = arSceneView.materialLoader.createColorInstance(
      parsedColor,
      0.1f,
      0.9f,
      0.1f
    )

    val cardNode = CubeNode(
      arSceneView.engine,
      Float3(0.36f, 0.22f, 0.01f),
      Float3(0.0f, 0.11f, 0.0f),
      material
    )
    return cardNode
  }

  private fun createCardBitmap(
    title: String,
    description: String,
    icon: String,
    hexColor: String
  ): Bitmap {
    val width = 720
    val height = 440
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val accentColor = try {
      Color.parseColor(if (hexColor.startsWith("#")) hexColor else "#00E5FF")
    } catch (_: Throwable) {
      Color.parseColor("#00E5FF")
    }

    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(242, 13, 19, 34)
      style = Paint.Style.FILL
    }
    val cardRect = RectF(16f, 16f, (width - 16).toFloat(), (height - 16).toFloat())
    canvas.drawRoundRect(cardRect, 32f, 32f, bgPaint)

    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = accentColor
      style = Paint.Style.STROKE
      strokeWidth = 6f
    }
    canvas.drawRoundRect(cardRect, 32f, 32f, borderPaint)

    val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = accentColor
      style = Paint.Style.FILL
    }
    canvas.drawRoundRect(RectF(40f, 44f, 52f, 104f), 6f, 6f, barPaint)

    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = 42f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val displayTitle = if (icon.isNotBlank()) "$icon  $title" else title
    canvas.drawText(displayTitle, 72f, 88f, titlePaint)

    val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(50, 255, 255, 255)
      strokeWidth = 3f
    }
    canvas.drawLine(40f, 124f, (width - 40).toFloat(), 124f, dividerPaint)

    val descTextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(200, 215, 240)
      textSize = 30f
    }
    val descWidth = width - 80
    val staticLayout = StaticLayout.Builder
      .obtain(description, 0, description.length, descTextPaint, descWidth)
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setLineSpacing(0f, 1.2f)
      .build()

    canvas.save()
    canvas.translate(40f, 144f)
    staticLayout.draw(canvas)
    canvas.restore()

    return bitmap
  }

  private companion object {
    const val TAG = "ARViewWrapper"
    const val CAMERA_PERMISSION_REQUEST_CODE = 1001
  }
}

