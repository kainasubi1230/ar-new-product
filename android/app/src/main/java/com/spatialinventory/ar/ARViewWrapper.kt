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

  private var lastTapX: Float? = null
  private var lastTapY: Float? = null

  private fun setupTapPlacement() {
    arSceneView.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_UP) {
        lastTapX = event.x
        lastTapY = event.y
        val params = Arguments.createMap().apply {
          putDouble("x", event.x.toDouble())
          putDouble("y", event.y.toDouble())
        }
        val emitter = reactContext.getJSModule(RCTEventEmitter::class.java)
        emitter.receiveEvent(id, "onScreenTapped", params)
      }
      false
    }
  }

  fun placeCardAtCenter() {
    post {
      val targetX = lastTapX ?: (width / 2f)
      val targetY = lastTapY ?: (height / 2f)
      lastTapX = null
      lastTapY = null
      placeCardOnPlane(targetX, targetY)
    }
  }

  private fun placeCardOnPlane(x: Float, y: Float) {
    val frame = arSceneView.frame
    val hitResult = frame?.hitTest(x, y)?.firstOrNull { hit ->
      val trackable = hit.trackable
      trackable is Plane && trackable.isPoseInPolygon(hit.hitPose)
    }

    val anchor = hitResult?.createAnchor()
    val anchorNode = if (anchor != null) {
      AnchorNode(arSceneView.engine, anchor)
    } else {
      // Fallback: place in front of camera (0.7m)
      val cameraPos = arSceneView.cameraNode.worldPosition
      val cameraRot = arSceneView.cameraNode.worldRotation
      val forward = arSceneView.cameraNode.forward
      val fallbackNode = AnchorNode(arSceneView.engine)
      fallbackNode.worldPosition = Float3(
        cameraPos.x + forward.x * 0.7f,
        cameraPos.y + forward.y * 0.7f,
        cameraPos.z + forward.z * 0.7f
      )
      fallbackNode
    }

    anchorNode.isEditable = true

    val cardNode = createCardNode()
    cardNode.isEditable = true
    cardNode.isPositionEditable = true
    cardNode.isRotationEditable = true

    // Look at camera once at placement, then stay fixed
    try {
      cardNode.lookAt(arSceneView.cameraNode.worldPosition)
    } catch (_: Throwable) {}

    anchorNode.addChildNode(cardNode)
    arSceneView.addChildNode(anchorNode)
    placedCardNodes.add(cardNode)

    val poseX = hitResult?.hitPose?.tx()?.toDouble() ?: anchorNode.worldPosition.x.toDouble()
    val poseY = hitResult?.hitPose?.ty()?.toDouble() ?: anchorNode.worldPosition.y.toDouble()
    val poseZ = hitResult?.hitPose?.tz()?.toDouble() ?: anchorNode.worldPosition.z.toDouble()

    val params = Arguments.createMap().apply {
      putString("cardTitle", cardTitle)
      putString("cardDescription", cardDescription)
      putString("cardColor", cardColor)
      putString("cardIcon", cardIcon)
      putString("modelUrl", cardTitle)
      putDouble("x", poseX)
      putDouble("y", poseY)
      putDouble("z", poseZ)
    }

    val emitter = reactContext.getJSModule(RCTEventEmitter::class.java)
    emitter.receiveEvent(id, "onCardPlaced", params)
    emitter.receiveEvent(id, "onModelPlaced", params)
  }

  private fun createCardNode(): Node {
    val parsedColor = try {
      Color.parseColor(if (cardColor.startsWith("#")) cardColor else "#29B6F6")
    } catch (_: Throwable) {
      Color.parseColor("#29B6F6")
    }

    val defaultMaterial = arSceneView.materialLoader.createColorInstance(
      parsedColor,
      0.2f,
      0.8f,
      0.1f
    )

    // Card only (no blue cube)
    val cardMaterial = try {
      val bitmap = createCardBitmap(cardTitle, cardDescription, cardIcon, cardColor)
      arSceneView.materialLoader.createBitmapInstance(bitmap)
    } catch (_: Throwable) {
      defaultMaterial
    }

    val cardNode = CubeNode(
      arSceneView.engine,
      Float3(0.38f, 0.24f, 0.005f),
      Float3(0.0f, 0.0f, 0.0f),
      cardMaterial
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

    val strokeColor = try {
      Color.parseColor(if (hexColor.startsWith("#")) hexColor else "#10B981")
    } catch (_: Throwable) {
      Color.parseColor("#10B981")
    }

    // Frosted Glass Body (semi-transparent white)
    val cardRect = RectF(14f, 14f, (width - 14).toFloat(), (height - 14).toFloat())
    val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(210, 255, 255, 255) // 82% white
      style = Paint.Style.FILL
    }
    canvas.drawRoundRect(cardRect, 36f, 36f, bgPaint)

    // Soft Glowing Border
    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = strokeColor
      style = Paint.Style.STROKE
      strokeWidth = 6f
    }
    canvas.drawRoundRect(cardRect, 36f, 36f, borderPaint)

    // Top Subtle Reflection
    val shinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(180, 255, 255, 255)
      style = Paint.Style.FILL
    }
    val shineRect = RectF(36f, 18f, (width - 36).toFloat(), 21f)
    canvas.drawRoundRect(shineRect, 2f, 2f, shinePaint)

    // Message Body Text (Large, prominent)
    val displayText = if (description.isNotBlank()) description else "ここの席、午後の光が最高。"
    val descTextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(30, 41, 59)
      textSize = 42f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val descWidth = width - 88
    val staticLayout = StaticLayout.Builder
      .obtain(displayText, 0, displayText.length, descTextPaint, descWidth)
      .setAlignment(Layout.Alignment.ALIGN_NORMAL)
      .setLineSpacing(0f, 1.2f)
      .build()

    canvas.save()
    canvas.translate(44f, 48f)
    staticLayout.draw(canvas)
    canvas.restore()

    // Tags Row ("#カフェ  #日常")
    val tagPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(16, 185, 129) // Emerald Green
      textSize = 30f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    canvas.drawText("#カフェ  #日常", 44f, 290f, tagPaint)

    // Divider line
    val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(180, 226, 232, 240)
      strokeWidth = 2f
    }
    canvas.drawLine(44f, 335f, (width - 44).toFloat(), 335f, dividerPaint)

    // Author Name ("sora")
    val authorName = if (title.isNotBlank()) title else "sora"
    val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(51, 65, 85)
      textSize = 32f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    canvas.drawText(authorName, 100f, 390f, namePaint)

    // Likes ("♡ 42")
    val likesPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(148, 163, 184)
      textSize = 30f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    canvas.drawText("♡ 42", (width - 140).toFloat(), 390f, likesPaint)

    return bitmap
  }

  private companion object {
    const val TAG = "ARViewWrapper"
    const val CAMERA_PERMISSION_REQUEST_CODE = 1001
  }
}

