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

  @objc var selectedModelUrl: NSString = "" {
    didSet { currentModelUrl = selectedModelUrl as String }
  }

  @objc var onCardPlaced: RCTDirectEventBlock?
  @objc var onModelPlaced: RCTDirectEventBlock?

  private let arView = ARView(frame: .zero)
  private var currentCardTitle: String = "AR Info Card"
  private var currentCardDescription: String = "Spatial info card"
  private var currentCardColor: String = "#00E5FF"
  private var currentCardIcon: String = "📌"
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

    // Subscribe to frame update to enforce billboard orientation facing camera
    updateCancellable = arView.scene.subscribe(to: SceneEvents.Update.self) { [weak self] _ in
      self?.updateBillboardOrientations()
    }
  }

  private func setupTapGesture() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    arView.addGestureRecognizer(tap)
  }

  @objc
  private func handleTap(_ recognizer: UITapGestureRecognizer) {
    let location = recognizer.location(in: arView)
    let hits = arView.raycast(
      from: location,
      allowing: .estimatedPlane,
      alignment: .any
    )

    guard let hit = hits.first else {
      return
    }

    let position = SIMD3<Float>(
      hit.worldTransform.columns.3.x,
      hit.worldTransform.columns.3.y,
      hit.worldTransform.columns.3.z
    )

    let anchor = AnchorEntity(world: position)
    let entity = makeCardEntity()
    anchor.addChild(entity)
    arView.scene.addAnchor(anchor)

    arView.installGestures([.translation, .rotation], for: entity)

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
    let title = currentCardTitle.isEmpty ? "AR Info Card" : currentCardTitle
    let desc = currentCardDescription
    let icon = currentCardIcon.isEmpty ? "📌" : currentCardIcon
    let color = currentCardColor.isEmpty ? "#00E5FF" : currentCardColor

    let cardImage = createCardImage(
      title: title,
      description: desc,
      icon: icon,
      hexColor: color
    )

    let planeWidth: Float = 0.36
    let planeDepth: Float = 0.22
    let mesh = MeshResource.generatePlane(width: planeWidth, depth: planeDepth, cornerRadius: 0.015)

    var material = UnlitMaterial()
    if let cgImage = cardImage.cgImage,
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      material.color = .init(tint: .white, texture: .init(texture))
    }

    let entity = ModelEntity(mesh: mesh, materials: [material])
    // Orient plane vertically
    entity.orientation = simd_quatf(angle: .pi / 2, axis: SIMD3<Float>(1, 0, 0))

    if #available(iOS 15.0, *) {
      entity.components.set(BillboardComponent())
    }

    return entity
  }

  private func updateBillboardOrientations() {
    guard let cameraTransform = arView.session.currentFrame?.camera.transform else { return }
    let cameraPosition = SIMD3<Float>(
      cameraTransform.columns.3.x,
      cameraTransform.columns.3.y,
      cameraTransform.columns.3.z
    )

    for anchor in arView.scene.anchors {
      for entity in anchor.children {
        let worldPos = entity.position(relativeTo: nil)
        entity.look(at: cameraPosition, from: worldPos, relativeTo: nil)
      }
    }
  }

  private func createCardImage(title: String, description: String, icon: String, hexColor: String) -> UIImage {
    let size = CGSize(width: 720, height: 440)
    let renderer = UIGraphicsImageRenderer(size: size)

    return renderer.image { context in
      let cgContext = context.cgContext
      let accentColor = parseHexColor(hexColor)

      // Background Card
      let cardRect = CGRect(origin: .zero, size: size).insetBy(dx: 12, dy: 12)
      let path = UIBezierPath(roundedRect: cardRect, cornerRadius: 28)

      UIColor(red: 13 / 255.0, green: 19 / 255.0, blue: 34 / 255.0, alpha: 0.95).setFill()
      path.fill()

      accentColor.withAlphaComponent(0.85).setStroke()
      path.lineWidth = 4
      path.stroke()

      // Left Accent Pill
      let barRect = CGRect(x: 32, y: 34, width: 8, height: 52)
      let barPath = UIBezierPath(roundedRect: barRect, cornerRadius: 4)
      accentColor.setFill()
      barPath.fill()

      // Icon and Title
      let titleX: CGFloat = 54
      let titleString = "\(icon)  \(title)"
      let titleAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 34, weight: .bold),
        .foregroundColor: UIColor.white
      ]
      let titleRect = CGRect(x: titleX, y: 32, width: size.width - titleX - 40, height: 60)
      titleString.draw(in: titleRect, withAttributes: titleAttributes)

      // Divider Line
      cgContext.setStrokeColor(UIColor.white.withAlphaComponent(0.18).cgColor)
      cgContext.setLineWidth(2)
      cgContext.move(to: CGPoint(x: 32, y: 104))
      cgContext.addLine(to: CGPoint(x: size.width - 32, y: 104))
      cgContext.strokePath()

      // Description text
      let descAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 24, weight: .medium),
        .foregroundColor: UIColor(red: 200 / 255.0, green: 215 / 255.0, blue: 240 / 255.0, alpha: 1.0)
      ]
      let descRect = CGRect(x: 32, y: 122, width: size.width - 64, height: 280)
      description.draw(in: descRect, withAttributes: descAttributes)
    }
  }

  private func parseHexColor(_ hex: String) -> UIColor {
    var cString = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if cString.hasPrefix("#") { cString.remove(at: cString.startIndex) }
    if cString.count != 6 { return UIColor.systemBlue }
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

