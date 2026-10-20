import ARKit
import Combine
import RealityKit
import React
import UIKit

final class ARViewWrapper: UIView, ARCoachingOverlayViewDelegate, ARSessionDelegate {
  private static let worldMapBucket = "worldmaps"
  private static let relocalizationTimeout: TimeInterval = 15
  // 地図を育てる（照合した人が見回した分を足して保存し直す）条件
  private static let mapGrowthInterval: TimeInterval = 15
  private static let mapGrowthMinMove: Float = 1.0
  private static let mapGrowthMinTurnCos: Float = 0.5 // 60°
  private static let mapGrowthMaxSaves = 3
  private static let mapGrowthMaxBytes = 10 * 1024 * 1024
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

  // { requestId, postId, anchorId, supabase } 配置済みカードのアンカーを投稿IDで確定し、地図を保存する
  @objc var worldMapSaveRequest: NSDictionary? {
    didSet {
      DispatchQueue.main.async { [weak self] in
        self?.handleWorldMapSaveRequest()
      }
    }
  }

  // { postId, worldMapPath, cardTitle, cardDescription, cardIcon, cardColor, supabase } この投稿の地図で再位置合わせする
  // null にすると、まだカードが見つかっていない再位置合わせを中止する
  @objc var relocalizeTarget: NSDictionary? {
    didSet {
      DispatchQueue.main.async { [weak self] in
        self?.handleRelocalizeTargetChanged()
      }
    }
  }

  @objc var onScreenTapped: RCTDirectEventBlock?
  @objc var onCardPlaced: RCTDirectEventBlock?
  @objc var onModelPlaced: RCTDirectEventBlock?
  @objc var onWorldMapStatus: RCTDirectEventBlock?
  @objc var onRelocalizationStatus: RCTDirectEventBlock?

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

  // ARWorldMap 関連
  private struct MappingJob {
    let postId: String
    // 投稿IDの名前に付け替えたアンカー。セッションに反映されてから地図を書き出す
    let anchorIdentifier: UUID
    let pendingAnchorIdentifier: UUID
    let objectPath: String
    let storage: SupabaseStorage
    let startedAt: Date
    var lastStatus: ARFrame.WorldMappingStatus?
    var isCapturing = false
  }

  private struct RelocalizationCard {
    let title: String
    let description: String
    let icon: String
    let color: String
  }

  private struct RelocalizationTarget {
    // 読み込む地図の投稿ID
    let postId: String
    let worldMapPath: String
    let storage: SupabaseStorage
    // この地図に入っているかもしれない投稿（postId → カード内容）
    let cards: [String: RelocalizationCard]
    var foundPostIds: Set<String> = []
    var didReportRelocalized = false
    var didFindAnchor: Bool { !foundPostIds.isEmpty }
  }

  private var lastSaveRequestId: Double?
  // 投稿IDが決まる前の仮アンカー（anchorId → アンカー）
  private var pendingCardAnchors: [String: (arAnchor: ARAnchor, entity: AnchorEntity)] = [:]
  private var placedCardEntities: [AnchorEntity] = []
  private var mappingJob: MappingJob?
  private var relocalization: RelocalizationTarget?
  // initialWorldMap 付きでセッションを走らせているか
  private var isRunningWithWorldMap = false

  private struct MapGrowth {
    let mapPostId: String
    let objectPath: String
    let storage: SupabaseStorage
    var lastSavedAt: Date
    var lastCameraPosition: SIMD3<Float>
    var lastCameraForward: SIMD3<Float>
    var saveCount = 0
    var isSaving = false
  }
  private var mapGrowth: MapGrowth?

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
    // セッションは自前で設定する（RealityKit に設定し直されると initialWorldMap が外れる）
    arView.automaticallyConfigureSession = false
    arView.scene.addAnchor(rootAnchor)
    arView.scene.addAnchor(previewAnchor)

    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      arView.environment.sceneUnderstanding.options.insert(.occlusion)
    }

    arView.environment.lighting.intensityExponent = 1.0

    arView.session.delegate = self
    arView.session.run(makeTrackingConfiguration(), options: [.resetTracking, .removeExistingAnchors])

    setupPreviewEntities()
    setupPreviewSubscription()
  }

  private func makeTrackingConfiguration() -> ARWorldTrackingConfiguration {
    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal, .vertical]
    config.environmentTexturing = .automatic
    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      config.sceneReconstruction = .mesh
    }
    return config
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
      self?.checkWorldMappingProgress()
      self?.checkMapGrowth()
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
    let orientation: simd_quatf
    if let exactOrientation {
      orientation = exactOrientation
    } else if let cameraTransform = arView.session.currentFrame?.camera.transform {
      let cameraPosition = SIMD3<Float>(
        cameraTransform.columns.3.x,
        cameraTransform.columns.3.y,
        cameraTransform.columns.3.z
      )
      // Look at camera position, then rotate 180 degrees around Y so textured front faces the user
      let probe = Entity()
      probe.look(at: cameraPosition, from: position, relativeTo: nil)
      orientation = probe.orientation * simd_quatf(angle: .pi, axis: SIMD3<Float>(0, 1, 0))
    } else {
      orientation = simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0))
    }

    // ARWorldMap に保存されるよう、座標直指定ではなく ARAnchor の上にカードを乗せる。
    // 投稿IDはまだ無いので仮の名前で置き、worldMapSaveRequest で投稿IDの名前に付け替える。
    let anchorId = UUID().uuidString
    let transform = Transform(scale: .one, rotation: orientation, translation: position).matrix
    let arAnchor = ARAnchor(name: "pending:\(anchorId)", transform: transform)
    arView.session.add(anchor: arAnchor)

    let anchorEntity = AnchorEntity(anchor: arAnchor)
    anchorEntity.addChild(makeCardEntity(
      title: currentCardTitle,
      description: currentCardDescription,
      handle: currentCardIcon,
      color: currentCardColor
    ))
    arView.scene.addAnchor(anchorEntity)
    pendingCardAnchors[anchorId] = (arAnchor, anchorEntity)
    placedCardEntities.append(anchorEntity)

    let eventData: [String: Any] = [
      "cardTitle": currentCardTitle,
      "cardDescription": currentCardDescription,
      "cardColor": currentCardColor,
      "cardIcon": currentCardIcon,
      "modelUrl": currentCardTitle,
      "anchorId": anchorId,
      "x": position.x,
      "y": position.y,
      "z": position.z,
    ]

    onCardPlaced?(eventData)
    onModelPlaced?(eventData)
  }

  private func makeCardEntity(title: String, description: String, handle: String, color: String) -> ModelEntity {
    let authorName = title.isEmpty ? "Ken" : title
    let messageText = description.isEmpty ? "テスト2" : description
    let handle = handle.isEmpty ? "@ken_loca" : handle
    let accentColor = color.isEmpty ? "#29B6F6" : color

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

  // MARK: - ARWorldMap: 保存

  private static func postAnchorName(_ postId: String) -> String {
    return "post:\(postId)"
  }

  private static func stringValue(_ value: Any?) -> String? {
    if let string = value as? String, !string.isEmpty { return string }
    if let number = value as? NSNumber { return number.stringValue }
    return nil
  }

  private func handleWorldMapSaveRequest() {
    guard let request = worldMapSaveRequest,
          let requestId = (request["requestId"] as? NSNumber)?.doubleValue,
          requestId != lastSaveRequestId else { return }
    lastSaveRequestId = requestId

    guard let postId = Self.stringValue(request["postId"]) else { return }
    guard let anchorId = request["anchorId"] as? String,
          let pending = pendingCardAnchors.removeValue(forKey: anchorId) else {
      emitWorldMapStatus("failed", postId: postId, extra: ["message": "配置したカードのアンカーが見つかりません"])
      return
    }
    guard let storage = SupabaseStorage(request["supabase"] as? NSDictionary) else {
      emitWorldMapStatus("failed", postId: postId, extra: ["message": "Supabaseの接続情報がありません"])
      return
    }

    // ARAnchor の名前は変更できないので、同じ位置に投稿IDの名前で作り直してカードを付け替える
    let namedAnchor = ARAnchor(name: Self.postAnchorName(postId), transform: pending.arAnchor.transform)
    arView.session.remove(anchor: pending.arAnchor)
    arView.session.add(anchor: namedAnchor)

    let namedEntity = AnchorEntity(anchor: namedAnchor)
    for child in Array(pending.entity.children) {
      namedEntity.addChild(child)
    }
    arView.scene.removeAnchor(pending.entity)
    arView.scene.addAnchor(namedEntity)
    placedCardEntities.removeAll { $0 === pending.entity }
    placedCardEntities.append(namedEntity)

    mappingJob = MappingJob(
      postId: postId,
      anchorIdentifier: namedAnchor.identifier,
      pendingAnchorIdentifier: pending.arAnchor.identifier,
      objectPath: "\(postId).worldmap",
      storage: storage,
      startedAt: Date()
    )
    emitWorldMapStatus("mapping", postId: postId, extra: [
      "mappingStatus": Self.mappingStatusName(arView.session.currentFrame?.worldMappingStatus),
    ])
  }

  // 毎フレーム呼ばれ、まわりを十分に覚えた（mapped）ら地図を書き出す
  private func checkWorldMappingProgress() {
    guard var job = mappingJob, !job.isCapturing,
          let frame = arView.session.currentFrame else { return }
    let status = frame.worldMappingStatus
    // session.add / remove はすぐには反映されない。付け替え前の地図を書き出さないよう、反映を待つ
    let isAnchorRenamed = frame.anchors.contains { $0.identifier == job.anchorIdentifier }
      && !frame.anchors.contains { $0.identifier == job.pendingAnchorIdentifier }

    if status != job.lastStatus {
      job.lastStatus = status
      mappingJob = job
      emitWorldMapStatus("mapping", postId: job.postId, extra: [
        "mappingStatus": Self.mappingStatusName(status),
      ])
    }

    let elapsed = Date().timeIntervalSince(job.startedAt)
    // mapped が理想。カード周りは配置操作の間に覚えているので、extending なら少し待って妥協する
    if isAnchorRenamed && (status == .mapped || (status == .extending && elapsed > 5)) {
      job.isCapturing = true
      mappingJob = job
      captureAndUploadWorldMap(job)
    } else if elapsed > 60 {
      mappingJob = nil
      emitWorldMapStatus("failed", postId: job.postId, extra: [
        "message": "まわりの景色を十分に記録できませんでした",
      ])
    }
  }

  private func captureAndUploadWorldMap(_ job: MappingJob) {
    arView.session.getCurrentWorldMap { [weak self] worldMap, error in
      DispatchQueue.main.async {
        guard let self else { return }
        guard let worldMap else {
          self.mappingJob = nil
          self.emitWorldMapStatus("failed", postId: job.postId, extra: [
            "message": "地図の取得に失敗しました: \(error?.localizedDescription ?? "不明なエラー")",
          ])
          return
        }

        // 念のため、投稿IDのアンカーが地図に入っているか確かめる。入っていなければ次のフレームで取り直す
        let anchorName = Self.postAnchorName(job.postId)
        guard worldMap.anchors.contains(where: { $0.name == anchorName }) else {
          if self.mappingJob?.postId == job.postId {
            self.mappingJob?.isCapturing = false
          }
          return
        }

        let data: Data
        do {
          data = try NSKeyedArchiver.archivedData(withRootObject: worldMap, requiringSecureCoding: true)
        } catch {
          self.mappingJob = nil
          self.emitWorldMapStatus("failed", postId: job.postId, extra: [
            "message": "地図の書き出しに失敗しました: \(error.localizedDescription)",
          ])
          return
        }

        self.emitWorldMapStatus("uploading", postId: job.postId, extra: ["bytes": data.count])
        job.storage.upload(data, bucket: Self.worldMapBucket, path: job.objectPath) { result in
          DispatchQueue.main.async {
            if self.mappingJob?.postId == job.postId {
              self.mappingJob = nil
            }
            switch result {
            case .success:
              self.emitWorldMapStatus("saved", postId: job.postId, extra: [
                "path": job.objectPath,
                "bytes": data.count,
              ])
            case .failure(let error):
              self.emitWorldMapStatus("failed", postId: job.postId, extra: [
                "message": "地図のアップロードに失敗しました: \(error.localizedDescription)",
              ])
            }
          }
        }
      }
    }
  }

  private static func mappingStatusName(_ status: ARFrame.WorldMappingStatus?) -> String {
    switch status {
    case .mapped: return "mapped"
    case .extending: return "extending"
    case .limited: return "limited"
    default: return "notAvailable"
    }
  }

  private func emitWorldMapStatus(_ phase: String, postId: String, extra: [String: Any] = [:]) {
    var payload: [String: Any] = ["phase": phase, "postId": postId]
    payload.merge(extra) { _, new in new }
    onWorldMapStatus?(payload)
  }

  // MARK: - ARWorldMap: 読み込みと再位置合わせ

  private func handleRelocalizeTargetChanged() {
    guard relocalizeTarget != nil else {
      cancelRelocalization()
      return
    }
    guard let target = relocalizeTarget,
          let postId = Self.stringValue(target["postId"]),
          let worldMapPath = target["worldMapPath"] as? String else { return }
    if relocalization?.postId == postId { return }

    guard let storage = SupabaseStorage(target["supabase"] as? NSDictionary) else {
      emitRelocalizationStatus("failed", postId: postId, extra: ["message": "Supabaseの接続情報がありません"])
      return
    }

    var cards: [String: RelocalizationCard] = [:]
    for case let card as NSDictionary in (target["cards"] as? NSArray ?? []) {
      guard let cardPostId = Self.stringValue(card["postId"]) else { continue }
      cards[cardPostId] = RelocalizationCard(
        title: card["cardTitle"] as? String ?? "",
        description: card["cardDescription"] as? String ?? "",
        icon: card["cardIcon"] as? String ?? "",
        color: card["cardColor"] as? String ?? ""
      )
    }
    relocalization = RelocalizationTarget(postId: postId, worldMapPath: worldMapPath, storage: storage, cards: cards)
    emitRelocalizationStatus("downloading", postId: postId)

    storage.download(bucket: Self.worldMapBucket, path: worldMapPath) { [weak self] result in
      DispatchQueue.main.async {
        guard let self, self.relocalization?.postId == postId else { return }
        do {
          let data = try result.get()
          guard let worldMap = try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data) else {
            throw SupabaseStorage.StorageError(message: "地図ファイルを読み込めません")
          }
          self.startRelocalization(with: worldMap, postId: postId)
        } catch {
          self.relocalization = nil
          self.emitRelocalizationStatus("failed", postId: postId, extra: [
            "message": "地図の読み込みに失敗しました: \(error.localizedDescription)",
          ])
        }
      }
    }
  }

  private func startRelocalization(with worldMap: ARWorldMap, postId: String) {
    // 投稿したカードの保存中にセッションをやり直すと、保存待ちのアンカーが消えてしまう
    if mappingJob != nil || !pendingCardAnchors.isEmpty {
      relocalization = nil
      emitRelocalizationStatus("cancelled", postId: postId)
      return
    }

    // セッションをやり直すので、このセッションで置いたカードは片付ける
    placedCardEntities.forEach { arView.scene.removeAnchor($0) }
    placedCardEntities.removeAll()
    mapGrowth = nil
    pendingCardAnchors.removeAll()
    mappingJob = nil

    let config = makeTrackingConfiguration()
    config.initialWorldMap = worldMap
    arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    isRunningWithWorldMap = true
    emitRelocalizationStatus("relocalizing", postId: postId)

    // 照合中は位置が定まらず平面検出も止まるので、見つからなければあきらめて通常のセッションに戻す
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.relocalizationTimeout) { [weak self] in
      guard let self, self.isRunningWithWorldMap,
            let target = self.relocalization, target.postId == postId, !target.didFindAnchor else { return }
      if case .normal = self.arView.session.currentFrame?.camera.trackingState { return }
      self.relocalization = nil
      self.isRunningWithWorldMap = false
      self.arView.session.run(self.makeTrackingConfiguration(), options: [.resetTracking, .removeExistingAnchors])
      self.emitRelocalizationStatus("timeout", postId: postId)
    }
  }

  private func cancelRelocalization() {
    guard let target = relocalization, !target.didFindAnchor else { return }
    relocalization = nil
    // 再位置合わせ待ちのままだと座標系が後でずれるので、地図なしのセッションに戻す
    if isRunningWithWorldMap {
      isRunningWithWorldMap = false
      arView.session.run(makeTrackingConfiguration(), options: [.resetTracking, .removeExistingAnchors])
    }
    emitRelocalizationStatus("cancelled", postId: target.postId)
  }

  // 再位置合わせに成功すると、地図に入っていた名前付きアンカーがここに戻ってくる。
  // 同じ起動中に置いた投稿は後の地図にもまとめて入っているので、知っている投稿のアンカーはすべてカードにする
  func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
    guard var target = relocalization else { return }
    for anchor in anchors {
      guard let name = anchor.name, name.hasPrefix("post:") else { continue }
      let postId = String(name.dropFirst("post:".count))
      guard let card = target.cards[postId], !target.foundPostIds.contains(postId) else { continue }

      if !target.didFindAnchor {
        startMapGrowth(for: target)
      }
      target.foundPostIds.insert(postId)
      let anchorEntity = AnchorEntity(anchor: anchor)
      anchorEntity.addChild(makeCardEntity(
        title: card.title,
        description: card.description,
        handle: card.icon,
        color: card.color
      ))
      arView.scene.addAnchor(anchorEntity)
      placedCardEntities.append(anchorEntity)
      emitRelocalizationStatus("found", postId: postId)
    }
    relocalization = target
  }

  // 位置合わせ自体はできたのにカードのアンカーが来ない場合を知らせる（原因の切り分け用）
  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    guard isRunningWithWorldMap, case .normal = camera.trackingState,
          let target = relocalization, !target.didReportRelocalized else { return }
    relocalization?.didReportRelocalized = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      guard let self, let current = self.relocalization, current.postId == target.postId,
            !current.didFindAnchor else { return }
      let anchorNames = self.arView.session.currentFrame?.anchors.compactMap(\.name) ?? []
      self.emitRelocalizationStatus("relocalizedWithoutCard", postId: target.postId, extra: [
        "message": "位置合わせはできましたが、カードのアンカーが見つかりません（\(anchorNames.joined(separator: ", "))）",
      ])
    }
  }

  // MARK: - ARWorldMap: 地図を育てる
  // 照合に成功した人がその場で見回すと、別の角度の景色が地図に足される。それを同じファイルに保存し直し、
  // 次に来た人がいろんな角度から照合できるようにする（posts.worldmap_path は変わらない）

  private static func cameraPose(_ frame: ARFrame) -> (position: SIMD3<Float>, forward: SIMD3<Float>) {
    let t = frame.camera.transform
    return (
      SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z),
      -SIMD3<Float>(t.columns.2.x, t.columns.2.y, t.columns.2.z)
    )
  }

  private func startMapGrowth(for target: RelocalizationTarget) {
    // 地図の上書きにはログインが必要（Storage のポリシー）
    guard target.storage.accessToken != nil,
          let frame = arView.session.currentFrame else { return }
    let pose = Self.cameraPose(frame)
    mapGrowth = MapGrowth(
      mapPostId: target.postId,
      objectPath: target.worldMapPath,
      storage: target.storage,
      lastSavedAt: Date(),
      lastCameraPosition: pose.position,
      lastCameraForward: pose.forward
    )
  }

  private func checkMapGrowth() {
    guard var growth = mapGrowth, !growth.isSaving, growth.saveCount < Self.mapGrowthMaxSaves,
          isRunningWithWorldMap,
          // 自分の投稿の保存中は触らない（保存待ちの仮アンカーが地図に混ざる）
          mappingJob == nil, pendingCardAnchors.isEmpty,
          let frame = arView.session.currentFrame,
          case .normal = frame.camera.trackingState,
          frame.worldMappingStatus == .mapped,
          Date().timeIntervalSince(growth.lastSavedAt) >= Self.mapGrowthInterval else { return }

    // 前回保存したときから、歩いたか向きを大きく変えたときだけ（同じ景色なら足すものが無い）
    let pose = Self.cameraPose(frame)
    let moved = simd_distance(pose.position, growth.lastCameraPosition) >= Self.mapGrowthMinMove
    let turned = simd_dot(simd_normalize(pose.forward), simd_normalize(growth.lastCameraForward)) <= Self.mapGrowthMinTurnCos
    guard moved || turned else { return }

    growth.isSaving = true
    mapGrowth = growth
    arView.session.getCurrentWorldMap { [weak self] worldMap, _ in
      DispatchQueue.main.async {
        self?.uploadGrownMap(worldMap, capturedAt: pose)
      }
    }
  }

  private func uploadGrownMap(_ worldMap: ARWorldMap?, capturedAt pose: (position: SIMD3<Float>, forward: SIMD3<Float>)) {
    guard var growth = mapGrowth else { return }
    // うまくいかなくても、次は間隔をあけて試す
    growth.isSaving = false
    growth.lastSavedAt = Date()
    mapGrowth = growth

    // 読み込んだ地図の続きであることを確かめる（元の投稿のアンカーが入っているか）
    let anchorName = Self.postAnchorName(growth.mapPostId)
    guard let worldMap, worldMap.anchors.contains(where: { $0.name == anchorName }),
          let data = try? NSKeyedArchiver.archivedData(withRootObject: worldMap, requiringSecureCoding: true) else { return }
    guard data.count <= Self.mapGrowthMaxBytes else {
      // 大きくなりすぎたら、このセッションではもう育てない
      mapGrowth?.saveCount = Self.mapGrowthMaxSaves
      return
    }

    mapGrowth?.isSaving = true
    growth.storage.upload(data, bucket: Self.worldMapBucket, path: growth.objectPath) { [weak self] result in
      DispatchQueue.main.async {
        guard let self, self.mapGrowth?.mapPostId == growth.mapPostId else { return }
        self.mapGrowth?.isSaving = false
        self.mapGrowth?.lastSavedAt = Date()
        if case .success = result {
          self.mapGrowth?.saveCount += 1
          self.mapGrowth?.lastCameraPosition = pose.position
          self.mapGrowth?.lastCameraForward = pose.forward
          self.emitRelocalizationStatus("mapExtended", postId: growth.mapPostId, extra: ["bytes": data.count])
        }
      }
    }
  }

  private func emitRelocalizationStatus(_ phase: String, postId: String, extra: [String: Any] = [:]) {
    var payload: [String: Any] = ["phase": phase, "postId": postId]
    payload.merge(extra) { _, new in new }
    onRelocalizationStatus?(payload)
  }
}

// 地図は数MBあるので、RNを経由せずネイティブから直接 Supabase Storage とやり取りする
private struct SupabaseStorage {
  struct StorageError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  let baseURL: String
  let apiKey: String
  let accessToken: String?

  init?(_ dict: NSDictionary?) {
    guard let dict,
          let url = dict["url"] as? String,
          let apiKey = dict["apiKey"] as? String else { return nil }
    self.baseURL = url.hasSuffix("/") ? String(url.dropLast()) : url
    self.apiKey = apiKey
    self.accessToken = dict["accessToken"] as? String
  }

  func upload(_ data: Data, bucket: String, path: String, completion: @escaping (Result<Void, Error>) -> Void) {
    guard var request = makeRequest("\(baseURL)/storage/v1/object/\(bucket)/\(path)") else {
      completion(.failure(StorageError(message: "URLが不正です")))
      return
    }
    request.httpMethod = "POST"
    request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    request.setValue("true", forHTTPHeaderField: "x-upsert")
    URLSession.shared.uploadTask(with: request, from: data) { body, response, error in
      completion(Self.check(body, response, error).map { _ in () })
    }.resume()
  }

  func download(bucket: String, path: String, completion: @escaping (Result<Data, Error>) -> Void) {
    guard let request = makeRequest("\(baseURL)/storage/v1/object/authenticated/\(bucket)/\(path)") else {
      completion(.failure(StorageError(message: "URLが不正です")))
      return
    }
    URLSession.shared.dataTask(with: request) { body, response, error in
      completion(Self.check(body, response, error))
    }.resume()
  }

  private func makeRequest(_ urlString: String) -> URLRequest? {
    guard let url = URL(string: urlString) else { return nil }
    var request = URLRequest(url: url)
    request.setValue(apiKey, forHTTPHeaderField: "apikey")
    if let accessToken {
      request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    }
    return request
  }

  private static func check(_ body: Data?, _ response: URLResponse?, _ error: Error?) -> Result<Data, Error> {
    if let error { return .failure(error) }
    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(statusCode) else {
      let text = body.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      return .failure(StorageError(message: "HTTP \(statusCode) \(text)"))
    }
    return .success(body ?? Data())
  }
}
