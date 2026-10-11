import ARKit
import Combine
import RealityKit
import React
import UIKit

final class ARViewWrapper: UIView {
  @objc var cardTitle: NSString = "" {
    didSet { currentCardTitle = cardTitle as String }
  }

  @objc var cardDescription: NSString = "" {
    didSet { currentCardDescription = cardDescription as String }
  }

  @objc var cardColor: NSString = "" {
    didSet { currentCardColor = cardColor as String }
  }

  @objc var cardIcon: NSString = "" {
    didSet { currentCardIcon = cardIcon as String }
  }

  @objc var placeTrigger: NSNumber? {
    didSet {
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
  private var lastTapLocation: CGPoint?
  private var currentCardTitle: String = "Ken"
  private var currentCardDescription: String = "テスト2"
  private var currentCardColor: String = "#29B6F6"
  private var currentCardIcon: String = "@ken_loca"
  private var currentModelUrl: String = ""
  private var rootAnchor = AnchorEntity(world: .zero)
  private var updateCancellable: Cancellable?

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupARView()
    setupTapGesture()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupARView()
    setupTapGesture()
  }

  deinit {
    updateCancellable?.cancel()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    arView.frame = bounds
  }

  private func setupARView() {
    addSubview(arView)
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arView.scene.addAnchor(rootAnchor)

    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal, .vertical]
    config.environmentTexturing = .automatic

    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      config.sceneReconstruction = .mesh
    }

    arView.environment.sceneUnderstanding.options.insert(.occlusion)
    arView.environment.lighting.intensityExponent = 1.0

    arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
  }

  private func setupTapGesture() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    arView.addGestureRecognizer(tap)
  }

  func placeCardAtTarget() {
    let targetPoint: CGPoint
    if let tap = lastTapLocation {
      targetPoint = tap
      lastTapLocation = nil
    } else {
      targetPoint = CGPoint(
        x: arView.bounds.midX > 0 ? arView.bounds.midX : UIScreen.main.bounds.midX,
        y: arView.bounds.midY > 0 ? arView.bounds.midY : UIScreen.main.bounds.midY
      )
    }
    placeCard(atScreenPoint: targetPoint)
  }

  func placeCardAtCenter() {
    lastTapLocation = nil
    placeCardAtTarget()
  }

  @objc
  private func handleTap(_ recognizer: UITapGestureRecognizer) {
    let location = recognizer.location(in: arView)
    lastTapLocation = location
    // Do NOT place card immediately; notify React Native to open message composing sheet
    onScreenTapped?(["x": location.x, "y": location.y])
  }

  private func placeCard(atScreenPoint location: CGPoint) {
    let hits = arView.raycast(
      from: location,
      allowing: .estimatedPlane,
      alignment: .any
    )

    let position: SIMD3<Float>
    if let hit = hits.first {
      position = SIMD3<Float>(
        hit.worldTransform.columns.3.x,
        hit.worldTransform.columns.3.y,
        hit.worldTransform.columns.3.z
      )
    } else if let cameraTransform = arView.session.currentFrame?.camera.transform {
      // Fallback: place 0.7m directly in front of camera
      let forward = -SIMD3<Float>(cameraTransform.columns.2.x, cameraTransform.columns.2.y, cameraTransform.columns.2.z)
      let camPos = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)
      position = camPos + forward * 0.7
    } else {
      position = SIMD3<Float>(0, 0, -0.7)
    }

    spawnCardEntity(at: position)
  }

  private func spawnCardEntity(at position: SIMD3<Float>) {
    let anchor = AnchorEntity(world: position)

    let cardEntity = makeCardEntity()

    // Orient toward camera once at the moment of placement, then stay fixed in world space
    if let cameraTransform = arView.session.currentFrame?.camera.transform {
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
}

