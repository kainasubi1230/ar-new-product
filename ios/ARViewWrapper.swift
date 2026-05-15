import ARKit
import RealityKit
import React
import UIKit

final class ARViewWrapper: UIView {
  @objc var selectedModelUrl: NSString = "" {
    didSet {
      currentModelUrl = selectedModelUrl as String
    }
  }

  @objc var onModelPlaced: RCTDirectEventBlock?

  private let arView = ARView(frame: .zero)
  private var currentModelUrl: String = ""
  private var rootAnchor = AnchorEntity(world: .zero)

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
    let entity = makeEntity(from: currentModelUrl)
    anchor.addChild(entity)
    arView.scene.addAnchor(anchor)

    arView.installGestures([.translation, .rotation], for: entity)

    onModelPlaced?(
      [
        "modelUrl": currentModelUrl,
        "x": position.x,
        "y": position.y,
        "z": position.z,
      ]
    )
  }

  private func makeEntity(from modelUrl: String) -> ModelEntity {
    guard !modelUrl.isEmpty else {
      return primitiveFallback()
    }

    let modelName = ((modelUrl as NSString).lastPathComponent as NSString).deletingPathExtension
    do {
      let model = try ModelEntity.loadModel(named: modelName)
      return model
    } catch {
      return primitiveFallback()
    }
  }

  private func primitiveFallback() -> ModelEntity {
    let mesh = MeshResource.generateBox(size: 0.2)
    let material = SimpleMaterial(color: .systemBlue, roughness: 0.3, isMetallic: false)
    return ModelEntity(mesh: mesh, materials: [material])
  }
}
