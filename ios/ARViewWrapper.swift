import ARKit
import Combine
import RealityKit
import React
import UIKit

final class ARViewWrapper: UIView, ARCoachingOverlayViewDelegate {
  @objc var cardTitle: NSString = "" {
    didSet {
      currentCardTitle = cardTitle as String
      updateGhostCardTexture()
    }
  }

  @objc var cardDescription: NSString = "" {
    didSet {
      currentCardDescription = cardDescription as String
      updateGhostCardTexture()
    }
  }

  @objc var cardColor: NSString = "" {
    didSet { currentCardColor = cardColor as String }
  }

  @objc var cardIcon: NSString = "" {
    didSet { currentCardIcon = cardIcon as String }
  }

  @objc var isPreviewActive: Bool = false {
    didSet {
      DispatchQueue.main.async { [weak self] in
        self?.handlePreviewActiveChanged()
      }
    }
  }

  private var lastHandledTrigger: Int?
  private var lastValidPreviewPosition: SIMD3<Float>?
  private var lastValidPreviewOrientation: simd_quatf?

  @objc var placeTrigger: NSNumber? {
    didSet {
      guard let trigger = placeTrigger?.intValue else { return }
      // Initial mount: record baseline trigger value without placing a card
      guard let last = lastHandledTrigger else {
        lastHandledTrigger = trigger
        return
      }
      // Only trigger placement when placeTrigger actually increments (> last)
      guard trigger > 0, trigger > last else {
        lastHandledTrigger = trigger
        return
      }
      lastHandledTrigger = trigger
      DispatchQueue.main.async { [weak self] in
        self?.placeCardAtTarget()
      }
    }
  }

  @objc var selectedModelUrl: NSString = "" {
    didSet { currentModelUrl = selectedModelUrl as String }
  }

  @objc var onScreenTapped: RCTDirectEventBlock?
  @objc var onCardPlaced: RCTDirectEventBlock?
  @objc var onModelPlaced: RCTDirectEventBlock?

  private let arView = ARView(frame: .zero)
  private let coachingOverlay = ARCoachingOverlayView()
  private var lastTapLocation: CGPoint?
  private var currentCardTitle: String = "Ken"
  private var currentCardDescription: String = "テスト2"
  private var currentCardColor: String = "#29B6F6"
  private var currentCardIcon: String = "@ken_loca"
  private var currentModelUrl: String = ""
  private var rootAnchor = AnchorEntity(world: .zero)
  private var previewAnchor = AnchorEntity(world: .zero)
  private var reticleEntity: ModelEntity?
  private var ghostCardEntity: ModelEntity?
  private var updateCancellable: Cancellable?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupARView()
    setupCoachingOverlay()
    setupTapGesture()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupARView()
    setupCoachingOverlay()
    setupTapGesture()
  }

  deinit {
    updateCancellable?.cancel()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    arView.frame = bounds
    coachingOverlay.frame = bounds
  }

  private func setupARView() {
    addSubview(arView)
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arView.scene.addAnchor(rootAnchor)
    arView.scene.addAnchor(previewAnchor)

    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal, .vertical]
    config.environmentTexturing = .automatic

    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      config.sceneReconstruction = .mesh
      arView.environment.sceneUnderstanding.options.insert(.occlusion)
    }

    arView.environment.lighting.intensityExponent = 1.0

    arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])

    setupPreviewEntities()
    setupPreviewSubscription()
  }

  private func setupPreviewEntities() {
    // 1. レティクル（平面接地リング）
    let reticleSize: Float = 0.28
    let reticleMesh = MeshResource.generatePlane(width: reticleSize, depth: reticleSize, cornerRadius: reticleSize / 2)
    var reticleMaterial = UnlitMaterial()
    if #available(iOS 15.0, *) {
      reticleMaterial.blending = .transparent(opacity: .init(scale: 0.95))
    }
    let reticleImg = createReticleImage()
    if let cgImage = reticleImg.cgImage,
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      reticleMaterial.color = .init(tint: .white, texture: .init(texture))
    }
    let reticle = ModelEntity(mesh: reticleMesh, materials: [reticleMaterial])
    previewAnchor.addChild(reticle)
    self.reticleEntity = reticle

    // 2. ゴーストカード（配置される言葉のシルエットプレビュー）
    let planeWidth: Float = 0.38
    let planeHeight: Float = 0.24
    let planeDepth: Float = 0.001
    let ghostMesh = MeshResource.generateBox(
      size: SIMD3<Float>(planeWidth, planeHeight, planeDepth),
      cornerRadius: 0.016
    )
    var ghostMaterial = UnlitMaterial()
    if #available(iOS 15.0, *) {
      ghostMaterial.blending = .transparent(opacity: .init(scale: 0.88))
    }
    let ghostImg = createGhostCardImage()
    if let cgImage = ghostImg.cgImage,
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      ghostMaterial.color = .init(tint: .white, texture: .init(texture))
    }
    let ghost = ModelEntity(mesh: ghostMesh, materials: [ghostMaterial])
    ghost.position = SIMD3<Float>(0, 0.15, 0)
    previewAnchor.addChild(ghost)
    self.ghostCardEntity = ghost

    // 平面が検出されるまで非表示
    previewAnchor.isEnabled = false
  }

  private func handlePreviewActiveChanged() {
    if isPreviewActive {
      updateGhostCardTexture()
    } else {
      previewAnchor.isEnabled = false
      lastTapLocation = nil
    }
  }

  private func updateGhostCardTexture() {
    guard let ghost = ghostCardEntity else { return }
    let ghostImg = createGhostCardImage(text: currentCardDescription)
    if let cgImage = ghostImg.cgImage,
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      var material = UnlitMaterial()
      if #available(iOS 15.0, *) {
        material.blending = .transparent(opacity: .init(scale: 0.88))
      }
      material.color = .init(tint: .white, texture: .init(texture))
      ghost.model?.materials = [material]
    }
  }

  private func setupPreviewSubscription() {
    updateCancellable = arView.scene.subscribe(to: SceneEvents.Update.self) { [weak self] _ in
      self?.updatePreview()
    }
  }

  private func updatePreview() {
    guard isPreviewActive else {
      previewAnchor.isEnabled = false
      return
    }

    guard arView.bounds.width > 0, arView.bounds.height > 0 else { return }

    // 配置プレビュー中は画面中央（レティクル中心）の平面をレイキャストして追従
    let targetPoint = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)

    var hits = arView.raycast(
      from: targetPoint,
      allowing: .existingPlaneGeometry,
      alignment: .any
    )
    if hits.isEmpty {
      hits = arView.raycast(
        from: targetPoint,
        allowing: .existingPlaneInfinite,
        alignment: .any
      )
    }
    if hits.isEmpty {
      hits = arView.raycast(
        from: targetPoint,
        allowing: .estimatedPlane,
        alignment: .any
      )
    }

    guard let hit = hits.first else {
      previewAnchor.isEnabled = false
      return
    }

    previewAnchor.isEnabled = true

    let hitPos = SIMD3<Float>(
      hit.worldTransform.columns.3.x,
      hit.worldTransform.columns.3.y,
      hit.worldTransform.columns.3.z
    )
    previewAnchor.position = hitPos

    let normalY = hit.worldTransform.columns.1.y
    let isHorizontal = abs(normalY) > 0.5

    if isHorizontal {
      reticleEntity?.orientation = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))
      ghostCardEntity?.position = SIMD3<Float>(0, 0.15, 0)
    } else {
      let normal = SIMD3<Float>(
        hit.worldTransform.columns.1.x,
        hit.worldTransform.columns.1.y,
        hit.worldTransform.columns.1.z
      )
      reticleEntity?.orientation = simd_quatf(angle: 0, axis: SIMD3<Float>(1, 0, 0))
      ghostCardEntity?.position = normal * 0.05
    }

    if let cameraTransform = arView.session.currentFrame?.camera.transform {
      let cameraPosition = SIMD3<Float>(
        cameraTransform.columns.3.x,
        cameraTransform.columns.3.y,
        cameraTransform.columns.3.z
      )
      if let ghost = ghostCardEntity {
        let entityWorldPos = previewAnchor.position + ghost.position
        ghost.look(at: cameraPosition, from: entityWorldPos, relativeTo: nil)
        ghost.orientation = ghost.orientation * simd_quatf(angle: .pi, axis: SIMD3<Float>(0, 1, 0))

        // プレビューカードの最新ワールド位置・回転を保存
        self.lastValidPreviewPosition = entityWorldPos
        self.lastValidPreviewOrientation = ghost.orientation(relativeTo: nil)
      }
    }
  }

  private func setupCoachingOverlay() {
    coachingOverlay.session = arView.session
    coachingOverlay.delegate = self
    coachingOverlay.goal = .anyPlane
    coachingOverlay.activatesAutomatically = true
    coachingOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(coachingOverlay)
  }

  private func setupTapGesture() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    arView.addGestureRecognizer(tap)
  }

  func placeCardAtTarget() {
    // プレビュー位置が保存されている場合は、100%寸分違わずその位置・向きに実体化
    if let targetPos = lastValidPreviewPosition,
       let targetRot = lastValidPreviewOrientation {
      spawnCardEntity(at: targetPos, exactOrientation: targetRot)
      lastValidPreviewPosition = nil
      lastValidPreviewOrientation = nil
      lastTapLocation = nil
      previewAnchor.isEnabled = false
      return
    }

    // 万が一プレビュー位置が記録されていない場合のフォールバック
    let targetPoint = CGPoint(
      x: arView.bounds.midX > 0 ? arView.bounds.midX : UIScreen.main.bounds.midX,
      y: arView.bounds.midY > 0 ? arView.bounds.midY : UIScreen.main.bounds.midY
    )
    placeCard(atScreenPoint: targetPoint)
  }

  func placeCardAtCenter() {
    lastTapLocation = nil
    placeCardAtTarget()
  }

  @objc
  private func handleTap(_ recognizer: UITapGestureRecognizer) {
    // 配置プレビュー中は画面タップで余計な座標更新やモーダル発火を行わない
    if isPreviewActive {
      return
    }
    let location = recognizer.location(in: arView)
    lastTapLocation = location
    onScreenTapped?(["x": location.x, "y": location.y])
  }

  private func placeCard(atScreenPoint location: CGPoint) {
    // 1. Raycast with hierarchical precision fallback:
    // a. Existing plane geometry (highest accuracy, within detected plane bounds)
    var hits = arView.raycast(
      from: location,
      allowing: .existingPlaneGeometry,
      alignment: .any
    )

    // b. Existing plane infinite (extends the detected plane)
    if hits.isEmpty {
      hits = arView.raycast(
        from: location,
        allowing: .existingPlaneInfinite,
        alignment: .any
      )
    }

    // c. Estimated plane (fallback to point cloud estimation)
    if hits.isEmpty {
      hits = arView.raycast(
        from: location,
        allowing: .estimatedPlane,
        alignment: .any
      )
    }

    let position: SIMD3<Float>
    if let hit = hits.first {
      let hitPos = SIMD3<Float>(
        hit.worldTransform.columns.3.x,
        hit.worldTransform.columns.3.y,
        hit.worldTransform.columns.3.z
      )
      // Elevate slightly so the card doesn't sink into the plane
      let normalY = hit.worldTransform.columns.1.y
      if abs(normalY) > 0.5 {
        // Horizontal plane (table/floor): elevate center by half-height(0.12m) + 3cm hover
        position = SIMD3<Float>(hitPos.x, hitPos.y + 0.15, hitPos.z)
      } else {
        // Vertical plane (wall): offset 5cm along normal to prevent clipping into wall
        let normal = SIMD3<Float>(
          hit.worldTransform.columns.1.x,
          hit.worldTransform.columns.1.y,
          hit.worldTransform.columns.1.z
        )
        position = hitPos + normal * 0.05
      }
    } else if let cameraTransform = arView.session.currentFrame?.camera.transform {
      // Fallback only if no plane could be detected: place 0.7m directly in front of camera
      let forward = -SIMD3<Float>(cameraTransform.columns.2.x, cameraTransform.columns.2.y, cameraTransform.columns.2.z)
      let camPos = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)
      position = camPos + forward * 0.7
    } else {
      position = SIMD3<Float>(0, 0, -0.7)
    }

    spawnCardEntity(at: position)
  }

  private func spawnCardEntity(at position: SIMD3<Float>, exactOrientation: simd_quatf? = nil) {
    let anchor = AnchorEntity(world: position)

    let cardEntity = makeCardEntity()

    if let orientation = exactOrientation {
      cardEntity.orientation = orientation
    } else if let cameraTransform = arView.session.currentFrame?.camera.transform {
      let cameraPosition = SIMD3<Float>(
        cameraTransform.columns.3.x,
        cameraTransform.columns.3.y,
        cameraTransform.columns.3.z
      )
      // Look at camera position initially
      cardEntity.look(at: cameraPosition, from: position, relativeTo: nil)
      // Rotate 180 degrees around Y so textured front faces the user
      cardEntity.orientation = cardEntity.orientation * simd_quatf(angle: .pi, axis: SIMD3<Float>(0, 1, 0))
    }

    anchor.addChild(cardEntity)
    arView.scene.addAnchor(anchor)

    arView.installGestures([.translation, .rotation], for: cardEntity)

    let eventData: [String: Any] = [
      "cardTitle": currentCardTitle,
      "cardDescription": currentCardDescription,
      "cardColor": currentCardColor,
      "cardIcon": currentCardIcon,
      "modelUrl": currentCardTitle,
      "x": position.x,
      "y": position.y,
      "z": position.z,
    ]

    onCardPlaced?(eventData)
    onModelPlaced?(eventData)
  }

  private func makeCardEntity() -> ModelEntity {
    let authorName = currentCardTitle.isEmpty ? "Ken" : currentCardTitle
    let messageText = currentCardDescription.isEmpty ? "テスト2" : currentCardDescription
    let handle = currentCardIcon.isEmpty ? "@ken_loca" : currentCardIcon
    let accentColor = currentCardColor.isEmpty ? "#29B6F6" : currentCardColor

    let cardImage = createCardImage(
      name: authorName,
      handle: handle,
      text: messageText,
      hexColor: accentColor
    )

    // Ultra-thin Box with smooth rounded corners
    let planeWidth: Float = 0.38
    let planeHeight: Float = 0.24
    let planeDepth: Float = 0.001
    let mesh = MeshResource.generateBox(
      size: SIMD3<Float>(planeWidth, planeHeight, planeDepth),
      cornerRadius: 0.016
    )

    var material = UnlitMaterial()
    // Enable alpha transparency blending for true glassmorphism
    if #available(iOS 15.0, *) {
      material.blending = .transparent(opacity: .init(scale: 1.0))
    }

    if let cgImage = cardImage.cgImage,
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      material.color = .init(tint: .white, texture: .init(texture))
    } else {
      material.color = .init(tint: UIColor.white.withAlphaComponent(0.8))
    }

    let entity = ModelEntity(mesh: mesh, materials: [material])
    entity.generateCollisionShapes(recursive: true)
    return entity
  }

  private func createCardImage(name: String, handle: String, text: String, hexColor: String) -> UIImage {
    let size = CGSize(width: 760, height: 480)
    let renderer = UIGraphicsImageRenderer(size: size)

    return renderer.image { context in
      let strokeColor = parseHexColor(hexColor)

      // 1. Frosted Glass Body (semi-transparent white, calm clean aesthetic)
      let cardRect = CGRect(origin: .zero, size: size).insetBy(dx: 14, dy: 14)
      let cardPath = UIBezierPath(roundedRect: cardRect, cornerRadius: 36)

      // 82% frosted white body
      UIColor(white: 1.0, alpha: 0.82).setFill()
      cardPath.fill()

      // 2. Subtle soft glowing border line
      strokeColor.withAlphaComponent(0.85).setStroke()
      cardPath.lineWidth = 6
      cardPath.stroke()

      // 3. Top subtle glass reflection line
      let shineRect = CGRect(x: cardRect.minX + 32, y: cardRect.minY + 5, width: cardRect.width - 64, height: 2.5)
      let shinePath = UIBezierPath(roundedRect: shineRect, cornerRadius: 1.5)
      UIColor.white.withAlphaComponent(0.8).setFill()
      shinePath.fill()

      // 4. Message Body Text (Upper main area, large and elegant)
      let displayText = text.isEmpty ? "ここの席、午後の光が最高。" : text
      let textAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 44, weight: .bold),
        .foregroundColor: UIColor(red: 30/255.0, green: 41/255.0, blue: 59/255.0, alpha: 1.0)
      ]
      let textRect = CGRect(x: 52, y: 52, width: size.width - 104, height: 210)
      displayText.draw(in: textRect, withAttributes: textAttributes)

      // 5. Tags Row ("#カフェ  #日常")
      let tagString = "#カフェ  #日常"
      let tagAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 32, weight: .semibold),
        .foregroundColor: UIColor(red: 16/255.0, green: 185/255.0, blue: 129/255.0, alpha: 1.0) // Emerald Green
      ]
      let tagRect = CGRect(x: 52, y: 284, width: size.width - 104, height: 44)
      tagString.draw(in: tagRect, withAttributes: tagAttributes)

      // 6. Divider line
      let cgContext = context.cgContext
      cgContext.setStrokeColor(UIColor(red: 226/255.0, green: 232/255.0, blue: 240/255.0, alpha: 0.8).cgColor)
      cgContext.setLineWidth(1.5)
      cgContext.move(to: CGPoint(x: 52, y: 346))
      cgContext.addLine(to: CGPoint(x: size.width - 52, y: 346))
      cgContext.strokePath()

      // 7. Footer: Circular Avatar
      let authorDisplay = name.isEmpty ? "sora" : name
      let avatarRect = CGRect(x: 52, y: 372, width: 50, height: 50)
      let avatarPath = UIBezierPath(ovalIn: avatarRect)
      UIColor(red: 52/255.0, green: 211/255.0, blue: 153/255.0, alpha: 0.35).setFill()
      avatarPath.fill()
      let avatarInitial = String(authorDisplay.prefix(1))
      let initialAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 26, weight: .bold),
        .foregroundColor: UIColor(red: 5/255.0, green: 150/255.0, blue: 105/255.0, alpha: 1.0)
      ]
      let initialSize = (avatarInitial as NSString).size(withAttributes: initialAttrs)
      let initialRect = CGRect(x: avatarRect.midX - initialSize.width / 2, y: avatarRect.midY - initialSize.height / 2, width: initialSize.width, height: initialSize.height)
      avatarInitial.draw(in: initialRect, withAttributes: initialAttrs)

      // 8. Footer: Author Name ("sora")
      let nameAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 34, weight: .bold),
        .foregroundColor: UIColor(red: 51/255.0, green: 65/255.0, blue: 85/255.0, alpha: 1.0)
      ]
      let nameRect = CGRect(x: 114, y: 378, width: 300, height: 44)
      authorDisplay.draw(in: nameRect, withAttributes: nameAttributes)

      // 9. Footer: Likes ("♡ 42")
      let likesString = "♡ 42"
      let likesAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 32, weight: .semibold),
        .foregroundColor: UIColor(red: 148/255.0, green: 163/255.0, blue: 184/255.0, alpha: 1.0)
      ]
      let likesSize = (likesString as NSString).size(withAttributes: likesAttributes)
      let likesRect = CGRect(x: size.width - 52 - likesSize.width, y: 380, width: likesSize.width, height: 44)
      likesString.draw(in: likesRect, withAttributes: likesAttributes)
    }
  }

  private func parseHexColor(_ hex: String) -> UIColor {
    var cString = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if cString.hasPrefix("#") { cString.remove(at: cString.startIndex) }
    if cString.count != 6 { return UIColor(red: 41/255.0, green: 182/255.0, blue: 246/255.0, alpha: 1.0) }
    var rgbValue: UInt64 = 0
    Scanner(string: cString).scanHexInt64(&rgbValue)
    return UIColor(
      red: CGFloat((rgbValue & 0xFF0000) >> 16) / 255.0,
      green: CGFloat((rgbValue & 0x00FF00) >> 8) / 255.0,
      blue: CGFloat(rgbValue & 0x0000FF) / 255.0,
      alpha: 1.0
    )
  }

  private func createReticleImage() -> UIImage {
    let size = CGSize(width: 256, height: 256)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      let cg = context.cgContext
      let emerald = UIColor(red: 16/255.0, green: 185/255.0, blue: 129/255.0, alpha: 1.0)

      // Inner subtle tint circle
      let innerRect = CGRect(x: 20, y: 20, width: 216, height: 216)
      emerald.withAlphaComponent(0.12).setFill()
      cg.fillEllipse(in: innerRect)

      // Outer ring
      let ringRect = CGRect(x: 16, y: 16, width: 224, height: 224)
      emerald.withAlphaComponent(0.9).setStroke()
      cg.setLineWidth(5.0)
      cg.strokeEllipse(in: ringRect)

      // 4 Direction indicator ticks
      cg.setStrokeColor(emerald.cgColor)
      cg.setLineWidth(3.5)
      // Top
      cg.move(to: CGPoint(x: 128, y: 4))
      cg.addLine(to: CGPoint(x: 128, y: 22))
      // Bottom
      cg.move(to: CGPoint(x: 128, y: 234))
      cg.addLine(to: CGPoint(x: 128, y: 252))
      // Left
      cg.move(to: CGPoint(x: 4, y: 128))
      cg.addLine(to: CGPoint(x: 22, y: 128))
      // Right
      cg.move(to: CGPoint(x: 234, y: 128))
      cg.addLine(to: CGPoint(x: 252, y: 128))
      cg.strokePath()

      // Center glowing dot
      let dotRect = CGRect(x: 123, y: 123, width: 10, height: 10)
      emerald.setFill()
      cg.fillEllipse(in: dotRect)
    }
  }

  private func createGhostCardImage(text: String? = nil) -> UIImage {
    let size = CGSize(width: 760, height: 480)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      let emerald = UIColor(red: 16/255.0, green: 185/255.0, blue: 129/255.0, alpha: 1.0)
      let cardRect = CGRect(origin: .zero, size: size).insetBy(dx: 14, dy: 14)
      let cardPath = UIBezierPath(roundedRect: cardRect, cornerRadius: 36)

      // Semi-transparent frosted glass body
      UIColor(white: 1.0, alpha: 0.75).setFill()
      cardPath.fill()

      // Emerald dashed glowing border
      emerald.withAlphaComponent(0.9).setStroke()
      let dashes: [CGFloat] = [12.0, 8.0]
      cardPath.setLineDash(dashes, count: 2, phase: 0)
      cardPath.lineWidth = 4.5
      cardPath.stroke()

      // Top badge: "📍 配置プレビュー"
      let badgeRect = CGRect(x: 52, y: 44, width: 230, height: 42)
      let badgePath = UIBezierPath(roundedRect: badgeRect, cornerRadius: 21)
      emerald.withAlphaComponent(0.18).setFill()
      badgePath.fill()

      let badgeAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 22, weight: .bold),
        .foregroundColor: emerald
      ]
      let badgeText = "📍 配置プレビュー"
      badgeText.draw(in: CGRect(x: 68, y: 52, width: 200, height: 30), withAttributes: badgeAttrs)

      // Message Body Text (Upper main area, large and elegant)
      let rawText = (text != nil && !text!.isEmpty) ? text! : (self.currentCardDescription.isEmpty ? "ここの席、午後の光が最高。" : self.currentCardDescription)
      let textAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 42, weight: .bold),
        .foregroundColor: UIColor(red: 30/255.0, green: 41/255.0, blue: 59/255.0, alpha: 1.0)
      ]
      let textRect = CGRect(x: 52, y: 104, width: size.width - 104, height: 200)
      rawText.draw(in: textRect, withAttributes: textAttributes)

      // Tags line
      let tagAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 28, weight: .semibold),
        .foregroundColor: emerald
      ]
      let tagText = "#カフェ  #日常"
      tagText.draw(in: CGRect(x: 52, y: 318, width: size.width - 104, height: 38), withAttributes: tagAttrs)

      // Bottom hint line
      let hintAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 24, weight: .medium),
        .foregroundColor: UIColor(red: 100/255.0, green: 116/255.0, blue: 139/255.0, alpha: 0.9)
      ]
      let hintText = "✨ 下の「ここに設置する」ボタンで確定"
      hintText.draw(in: CGRect(x: 52, y: 390, width: size.width - 104, height: 40), withAttributes: hintAttrs)
    }
  }
}

