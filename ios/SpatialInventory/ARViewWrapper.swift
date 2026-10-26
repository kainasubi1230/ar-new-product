import ARKit
import Combine
import CoreMotion
import RealityKit
import React
import UIKit
import UserNotifications

final class ARViewWrapper: UIView, ARCoachingOverlayViewDelegate, ARSessionDelegate, CLLocationManagerDelegate {
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

  // これから置くカードのタグ（投稿画面で選んだもの）
  @objc var cardTags: NSArray? {
    didSet {
      currentCardTags = Self.stringArray(cardTags)
      updateGhostCardTexture()
    }
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

  // { postId, worldMapPath, snapshotPath?, cards: [{ postId, cardTitle, cardDescription, cardIcon, cardColor, cardTags }], supabase }
  // この投稿の地図で再位置合わせする。snapshotPath があれば、その写真を重ねて案内する
  // null にすると、まだカードが見つかっていない再位置合わせを中止する
  @objc var relocalizeTarget: NSDictionary? {
    didSet {
      DispatchQueue.main.async { [weak self] in
        self?.handleRelocalizeTargetChanged()
      }
    }
  }

  // [{ postId, cardTitle, cardDescription, cardIcon, cardColor, cardTags, level, prominence, highlighted, uncertaintyM, distanceM, bearingDeg }]
  // 照合できていない投稿を、その方角に浮かべる。level: "presence"（すぐ近く：文字のない光の気配）/
  // "message"（本文も出すタグ）/ "summary"（タグと距離だけ）。prominence: 0〜1（近いほど濃く）、highlighted: 少し強調する、
  // uncertaintyM: 位置の不確かさ（m、気配のぼかしの大きさ）
  @objc var geoTags: NSArray? {
    didSet {
      let tags: [GeoTagData] = (geoTags ?? []).compactMap { item in
        guard let dict = item as? NSDictionary,
              let postId = Self.stringValue(dict["postId"]),
              let distance = (dict["distanceM"] as? NSNumber)?.doubleValue,
              let bearing = (dict["bearingDeg"] as? NSNumber)?.doubleValue else { return nil }
        return GeoTagData(
          postId: postId,
          title: dict["cardTitle"] as? String ?? "",
          description: dict["cardDescription"] as? String ?? "",
          color: dict["cardColor"] as? String ?? "",
          tags: Self.stringArray(dict["cardTags"]),
          // どの段階で見せるかは JS が距離から決める（src/config/distanceTiers.ts）
          level: GeoTagLevel(rawValue: dict["level"] as? String ?? "") ?? .message,
          prominence: (dict["prominence"] as? NSNumber)?.floatValue ?? 1,
          highlighted: (dict["highlighted"] as? NSNumber)?.boolValue ?? false,
          uncertaintyM: (dict["uncertaintyM"] as? NSNumber)?.floatValue ?? 10,
          distance: distance,
          bearing: bearing
        )
      }
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.geoTagData = tags
        // 距離・方角は「今の GPS の位置」から測ったもの。その位置に当たる AR 上の点として、今のカメラ位置を覚えておき、
        // 次に GPS の位置が更新されるまでは、そこを基準にタグを空間に固定する（今のカメラ基準にすると、歩いた分だけ逃げていく）
        if let transform = self.arView.session.currentFrame?.camera.transform {
          self.geoOriginCameraPosition = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        }
        self.lastGeoLayoutAt = .distantPast
      }
    }
  }

  @objc var onScreenTapped: RCTDirectEventBlock?
  // { postId } 気配（照合できていない近くの投稿の光）がタップされた
  @objc var onPresenceTapped: RCTDirectEventBlock?

  // ログイン中のアクセストークン。更新されるたびに JS が送ってくるので、Storage には常に最新のものを使う
  @objc var supabaseAccessToken: NSString? {
    didSet {
      let token = supabaseAccessToken as String?
      SupabaseStorage.latestAccessToken = (token?.isEmpty ?? true) ? nil : token
    }
  }
  // { postId, x, y } 照合で出した他の人のカードがタップされた（言葉を拾う）。x, y はタップした画面上の位置
  @objc var onCardTapped: RCTDirectEventBlock?
  @objc var onCardPlaced: RCTDirectEventBlock?
  @objc var onModelPlaced: RCTDirectEventBlock?
  @objc var onWorldMapStatus: RCTDirectEventBlock?
  @objc var onRelocalizationStatus: RCTDirectEventBlock?
  // { fullAccuracy } 位置情報が「正確な位置情報」で許可されているか（オフだと方角タグが大きくずれる）
  @objc var onLocationAccuracyStatus: RCTDirectEventBlock? {
    didSet {
      // 許可の状態は作成直後に一度だけ届くので、受け口がつながった時点でも今の状態を送る
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.locationManagerDidChangeAuthorization(self.locationManager)
      }
    }
  }
  // { needsCalibration, headingAccuracy } コンパスの精度が悪く、8 の字の補正が必要か
  @objc var onCompassStatus: RCTDirectEventBlock?

  // デバッグ表示（原因の切り分け用）。true の間だけ、0.5 秒ごとに AR の状態を onDebugInfo で送る
  @objc var debugEnabled: Bool = false
  @objc var onDebugInfo: RCTDirectEventBlock?
  private var lastDebugEmitAt = Date.distantPast
  private var debugRelocalizationPhase = "idle"
  private var debugRelocalizationStartedAt: Date?
  private var debugLoadedMapPostId: String?
  // 読み込んだ地図に入っている post: アンカーの投稿 ID
  private var debugMapAnchorPostIds: [String] = []
  // post: アンカーが didAdd で届いた時刻（照合を始めてからの秒数で出す）
  private var debugAnchorArrivals: [(postId: String, at: Date)] = []
  // 地図付きセッションで trackingState が normal になった時刻
  private var debugTrackingNormalAt: Date?
  // 地図付きセッションで、位置合わせが終わる前に届いた post: アンカー（normal になってからカードにする）
  private var pendingRelocalizedAnchors: [ARAnchor] = []

  private let arView = ARView(frame: .zero)
  private let coachingOverlay = ARCoachingOverlayView()
  private var lastTapLocation: CGPoint?
  private var currentCardTitle: String = "Ken"
  private var currentCardDescription: String = "テスト2"
  private var currentCardColor: String = "#29B6F6"
  private var currentCardIcon: String = "@ken_loca"
  private var currentCardTags: [String] = []
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
    let tags: [String]
    // 拾われた人数（posts.read_count）。0 なら描かない
    let readCount: Int
  }

  private struct RelocalizationTarget {
    // 読み込む地図の投稿ID
    let postId: String
    let worldMapPath: String
    let storage: SupabaseStorage
    // その投稿を置いたときの景色の写真（ダウンロードできたら入る）
    // その地図に入っている投稿の、置いたときの景色の写真（今いる場所から近い順）。読み込めたものから image が入る。
    // 1 つの地図に何部屋分も入っていることがあり、GPS では部屋を区別できないので、近い順に切り替えて見せる
    var snapshotSlots: [(postId: String, image: UIImage?)] = []
    var snapshotIndex = 0
    var snapshotShownAt = Date.distantPast
    var loadedSnapshots: [(postId: String, image: UIImage)] {
      snapshotSlots.compactMap { slot in slot.image.map { (slot.postId, $0) } }
    }
    // この地図に入っているかもしれない投稿（postId → カード内容）
    let cards: [String: RelocalizationCard]
    var foundPostIds: Set<String> = []
    var didReportRelocalized = false
    var didFindAnchor: Bool { !foundPostIds.isEmpty }
  }

  // 置いたときの景色の写真（照合のとき「この景色に合わせて」と半透明で重ねる）。anchorId → JPEG。
  // 投稿 ID が決まったら snapshots/<postId>.jpg に上げる
  private var pendingSnapshots: [String: Data] = [:]
  private var pendingSnapshotPostInfo: [String: (postId: String, storage: SupabaseStorage)] = [:]
  // 写真を撮る一瞬だけ方角タグを隠す（照合の手がかりにならないので写さない）
  private var isCapturingSnapshot = false

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

  // MARK: 方角タグ（セカイカメラ風）
  private enum GeoTagLevel: String {
    // すぐ近く（照合できていない）：位置が分からないので、文字のない光の「気配」だけ
    case presence
    // 本文も読めるタグ
    case message
    // タグと距離だけの小さいタグ
    case summary
  }
  private struct GeoTagData {
    let postId: String
    let title: String
    let description: String
    let color: String
    let tags: [String]
    let level: GeoTagLevel
    // 0〜1。近いほど 1 で、濃く出す
    let prominence: Float
    // 関心タグに合う投稿など、少し強調して出すか
    let highlighted: Bool
    // 位置の不確かさ（m）。気配のぼかしの大きさに使う
    let uncertaintyM: Float
    let distance: Double
    let bearing: Double
    var showsMessage: Bool { level == .message }
  }
  // 照合で出したカード。カメラとの間に壁や物があれば薄れて、正確な位置にごく薄い光だけが残る
  private struct RevealCard {
    let postId: String
    let card: ModelEntity
    let glow: ModelEntity
    // 0（光だけ）〜 1（カード）
    var reveal: Float = 0
    var isOccluded = false
    // デバッグ表示用
    var occlusionReason = "-"
    // 隠れている判定が続いた回数（0〜4）。3 以上で隠し、1 以下で見せる
    var occlusionScore = 0
    // 画面に現れたことを JS に知らせたか（拾った言葉の記録は 1 回だけ）
    var hasBeenSeen = false
    var distance: Float = 0
  }
  private var revealCards: [RevealCard] = []
  private static let revealGlowSize: Float = 0.6
  // 隠れている間の光の濃さ（別の部屋にメッセージがあることのヒント。くっきりは見せない）
  private static let occludedGlowOpacity: Float = 0.35
  // 見えるかどうかを調べる間隔（毎フレームは重い）
  private static let occlusionCheckInterval: TimeInterval = 0.25
  // カード自身が乗っている壁・床を「間にある物」と数えないための余白（m）
  private static let occlusionMargin: Float = 0.3
  private var lastRevealFrameAt: Date?
  private var lastOcclusionCheckAt = Date.distantPast

  // タグを空間に固定するときの基準（GPS の位置が届いたときのカメラ位置）
  private var geoOriginCameraPosition: SIMD3<Float>?
  // これより遠いタグは、この距離に置く（遠すぎると描画されないおそれがある）。見かけの大きさは本当の距離で決める
  private static let geoTagMaxRenderDistance: Float = 40
  // 気配（光）の濃さ。くっきり見せない
  private static let presenceOpacity: Float = 0.85
  // 光（気配・隠れたカードの光）の見かけの大きさの上限：カメラからの距離 1m あたりの幅（0.5 ≒ 画角の 1/3 くらい）
  private static let glowMaxApparentSize: Float = 0.5
  // 光にこの距離（m）まで近づくと見えなくなり、glowFadeEnd まで離れると元の濃さに戻る
  private static let glowFadeStart: Float = 0.8
  private static let glowFadeEnd: Float = 2.5

  // 近づくほど薄くする係数（0〜1）
  private static func glowNearFade(_ distance: Float) -> Float {
    return min(max((distance - glowFadeStart) / (glowFadeEnd - glowFadeStart), 0), 1)
  }
  private let geoTagRoot = AnchorEntity(world: .zero)
  private var geoTagData: [GeoTagData] = []
  // postId → (エンティティ, テクスチャの内容キー, 目標位置)
  // 方角タグ 1 つ分の表示状態。位置・大きさ・濃さは、目標値へ毎フレームなめらかに寄せる（パッと飛ばさない）
  private struct GeoTagEntity {
    let entity: ModelEntity
    var textureKey: String
    var target: SIMD3<Float>
    var targetScale: Float
    var targetOpacity: Float
    var scale: Float
    var opacity: Float
    // 0→1 でふわっと現れる。appearAt までは 0 のまま。消すときは 1→0 にしてから取り除く
    var appearance: Float = 0
    var appearAt: Date
    var isRemoving = false
    // 気配（光）なら、ゆっくり呼吸するように明るさを揺らす
    var isPresence = false
  }
  private static let geoTagFadeDuration: Float = 0.6
  // 近い順に、この間隔ずつ遅らせて現れる
  private static let geoTagStaggerDelay: TimeInterval = 0.07
  // 目標値へ寄せる速さ（1 秒あたり。大きいほど速い）
  private static let geoTagFollowRate: Float = 4
  private var geoTagEntities: [String: GeoTagEntity] = [:]
  private var lastGeoLayoutAt = Date.distantPast
  private var lastGeoFrameAt: Date?
  // 北が分からなくなった（セッションのやり直しなど）後は座標がずれるので、次の配置では飛ばさず置き直す
  private var needsGeoTagSnap = true
  // 地図の照合などで正確な位置に出ている投稿。方角タグは出さない
  private var preciseCardPostIds: Set<String> = []
  private let motionManager = CMMotionManager()
  // AR 座標での「北」の向き（ヨー角の cos, sin を、直近数秒の平均で求めたもの）
  private var northOffset: SIMD2<Float>? {
    didSet {
      // セッションのやり直しで AR 座標の向きが変わったら、それまでの測定値は使えない
      if northOffset == nil {
        northSamples.removeAll()
      }
    }
  }
  // 北の向きの測定値（時刻と、ヨー角の差の cos, sin）。1 回で決めず、直近 northAveragingWindow 秒分を平均する
  private var northSamples: [(time: TimeInterval, value: SIMD2<Float>)] = []
  private static let northAveragingWindow: TimeInterval = 4
  // 最初に北を決めるまでに集める時間（短すぎると 1 回の測定に引っ張られる、長すぎるとタグが出るのが遅れる）
  private static let northMinimumCollection: TimeInterval = 1

  // コンパスの精度（headingAccuracy、度）。CoreMotion では取れないので CLLocationManager の方位から読む
  private let locationManager = CLLocationManager()
  private var latestHeadingAccuracy: Double = -1
  private var poorHeadingSince: Date?
  private var compassNeedsCalibration = false
  // この精度（度）より悪いと北の測定値に使わない。悪い状態が続いたら 8 の字の補正を案内する
  private static let headingAccuracyUsable: Double = 25
  private static let headingAccuracyGood: Double = 15
  private static let poorHeadingDurationBeforeGuide: TimeInterval = 2
  // CMAttitude.rotationMatrix の向き（基準座標→端末座標か）を、重力の向きから判定してキャッシュする
  private var motionMatrixIsReferenceToDevice: Bool?
  private static let geoTagMessageSize = SIMD2<Float>(0.64, 0.24)
  private static let geoTagSummarySize = SIMD2<Float>(0.5, 0.11)
  private lazy var geoTagMessageMesh = MeshResource.generateBox(
    size: SIMD3<Float>(Self.geoTagMessageSize.x, Self.geoTagMessageSize.y, 0.001), cornerRadius: 0.02)
  private lazy var geoTagSummaryMesh = MeshResource.generateBox(
    size: SIMD3<Float>(Self.geoTagSummarySize.x, Self.geoTagSummarySize.y, 0.001), cornerRadius: 0.02)
  // 気配は 1m 四方の板に、ふちが透明になる光の絵を貼り、不確かさに合わせて拡大する
  private lazy var presenceMesh = MeshResource.generatePlane(width: 1, height: 1)
  private lazy var presenceMaterial: UnlitMaterial = {
    var material = UnlitMaterial()
    material.blending = .transparent(opacity: .init(scale: 1.0))
    if let cgImage = Self.presenceGlowImage(),
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      material.color = .init(tint: .white, texture: .init(texture))
    }
    return material
  }()

  // 地図の記録・照合中の案内（ARCoachingOverlayView と同じ雰囲気の自前 UI）
  private let guideHUD = ARGuideHUDView()

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
    motionManager.stopDeviceMotionUpdates()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    arView.frame = bounds
    coachingOverlay.frame = bounds
    guideHUD.frame = bounds
  }

  private func setupARView() {
    addSubview(arView)
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // セッションは自前で設定する（RealityKit に設定し直されると initialWorldMap が外れる）
    arView.automaticallyConfigureSession = false
    arView.scene.addAnchor(rootAnchor)
    arView.scene.addAnchor(previewAnchor)
    arView.scene.addAnchor(geoTagRoot)
    startHeadingUpdates()

    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      arView.environment.sceneUnderstanding.options.insert(.occlusion)
      // 部屋の形のメッシュに当たり判定を持たせ、カードとの間に物があるかを調べられるようにする
      arView.environment.sceneUnderstanding.options.insert(.collision)
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
      self?.updateGeoTags()
      self?.emitDebugInfoIfNeeded()
      self?.cycleRelocalizationSnapshot()
      self?.updateCardReveal()
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

    guideHUD.frame = bounds
    guideHUD.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(guideHUD)
  }

  // 記録中・照合中などの案内（出しっぱなし）。お知らせ（notice）を出している間は覚えておき、終わったら戻す
  private var persistentGuide: ARGuideHUDView.Guide?
  private var noticeEndWorkItem: DispatchWorkItem?
  private var lastNoticeId: Double?
  private static let noticeDuration: TimeInterval = 2.5

  private func showGuide(_ guide: ARGuideHUDView.Guide) {
    persistentGuide = guide
    // お知らせを出している間は上書きしない（お知らせが終わったらこの案内に戻る）
    guard noticeEndWorkItem == nil else { return }
    // Apple のコーチングと重ならないよう、自前の案内を出している間は止める
    coachingOverlay.activatesAutomatically = false
    coachingOverlay.setActive(false, animated: true)
    guideHUD.show(guide)
  }

  private func hideGuide() {
    persistentGuide = nil
    guard noticeEndWorkItem == nil else { return }
    guideHUD.hide()
    coachingOverlay.activatesAutomatically = true
  }

  // { id, symbol, title, subtitle? } 「保存しました」などの短いお知らせ。案内と同じ見た目で noticeDuration 秒だけ出す
  @objc var notice: NSDictionary? {
    didSet {
      DispatchQueue.main.async { [weak self] in
        self?.handleNotice()
      }
    }
  }

  private func handleNotice() {
    guard let notice,
          let id = (notice["id"] as? NSNumber)?.doubleValue, id != lastNoticeId,
          let title = notice["title"] as? String else { return }
    lastNoticeId = id

    coachingOverlay.activatesAutomatically = false
    coachingOverlay.setActive(false, animated: true)
    guideHUD.show(.init(
      symbol: notice["symbol"] as? String,
      title: title,
      subtitle: notice["subtitle"] as? String,
      sways: false
    ))

    // 時間が来たら、出していた案内に戻す（無ければ消す）
    noticeEndWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.noticeEndWorkItem = nil
      if let guide = self.persistentGuide {
        self.guideHUD.show(guide)
      } else {
        self.guideHUD.hide()
        self.coachingOverlay.activatesAutomatically = true
      }
    }
    noticeEndWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.noticeDuration, execute: workItem)
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
    // 照合で出した他の人のカードをタップしたら、投稿を始めずに「言葉を拾う」
    if let card = revealedCard(at: location) {
      pulse(card.card)
      // タップした画面上の位置も送る（JS がそこからキラキラを弾けさせる）
      onCardTapped?(["postId": card.postId, "x": location.x, "y": location.y])
      return
    }
    // 気配（光）をタップしたら、投稿を始めずに「このあたりにメッセージがあります」の案内を出す
    if let postId = presencePostId(at: location) {
      onPresenceTapped?(["postId": postId])
      return
    }
    onScreenTapped?(["x": location.x, "y": location.y])
  }

  // 照合で出したカードのうち、隠れずに見えているもの（タップで拾える）
  private func revealedCard(at location: CGPoint) -> RevealCard? {
    guard let hit = arView.entity(at: location) else { return nil }
    return revealCards.first { $0.reveal >= 0.5 && $0.card === hit }
  }

  // タップしたカードを、軽くふくらませて戻す（拾った手応え）。
  // 照合で出したカードはアンカーの原点に変形なしで置いているので、戻す先は常に変形なし（連続タップで大きくならない）
  private func pulse(_ entity: Entity) {
    let original = Transform.identity
    var enlarged = original
    enlarged.scale = SIMD3<Float>(repeating: 1.08)
    entity.move(to: enlarged, relativeTo: entity.parent, duration: 0.12, timingFunction: .easeOut)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
      entity.move(to: original, relativeTo: entity.parent, duration: 0.2, timingFunction: .easeInOut)
    }
  }

  private func presencePostId(at location: CGPoint) -> String? {
    guard geoTagRoot.isEnabled, let hit = arView.entity(at: location) else { return nil }
    return geoTagEntities.first { _, tag in
      tag.isPresence && !tag.isRemoving && tag.appearance > 0 && tag.entity === hit
    }?.key
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
    captureSnapshot(anchorId: anchorId)

    let anchorEntity = AnchorEntity(anchor: arAnchor)
    anchorEntity.addChild(makeCardEntity(
      title: currentCardTitle,
      description: currentCardDescription,
      handle: currentCardIcon,
      color: currentCardColor,
      tags: currentCardTags
    ))
    arView.scene.addAnchor(anchorEntity)
    pendingCardAnchors[anchorId] = (arAnchor, anchorEntity)
    placedCardEntities.append(anchorEntity)

    var eventData: [String: Any] = [
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
    // メッセージの本体は「その場所の座標」。カメラ（＝GPS の位置）からカードまでのずれを東・北・上の m に直して送り、
    // JS が GPS の位置に足してカードの緯度・経度・高さにする。北がまだ分からないときは送らない（JS はスマホの位置を使う）
    if let placement = geoPlacement(cardPosition: position, cardTransform: transform) {
      eventData["offsetEastM"] = placement.east
      eventData["offsetNorthM"] = placement.north
      eventData["offsetUpM"] = placement.up
      eventData["headingDeg"] = placement.headingDeg
    }

    onCardPlaced?(eventData)
    onModelPlaced?(eventData)
  }

  // カメラからカードまでのずれ（東・北・上の m）と、カードの面が向いている方位（北=0°、時計回り）
  private func geoPlacement(
    cardPosition: SIMD3<Float>,
    cardTransform: simd_float4x4
  ) -> (east: Float, north: Float, up: Float, headingDeg: Float)? {
    guard let northOffset, let cameraTransform = arView.session.currentFrame?.camera.transform else { return nil }
    let cameraPosition = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)
    let d = cardPosition - cameraPosition

    // AR 座標で、方位 b の向きはヨー角 northYaw + b（-Z から +X へ回る角）。北は b=0、東は b=90°
    let northYaw = atan2(northOffset.y, northOffset.x)
    let northDir = SIMD3<Float>(sin(northYaw), 0, -cos(northYaw))
    let eastDir = SIMD3<Float>(cos(northYaw), 0, sin(northYaw))

    // カードの面（+Z、置いた人の方を向いている側）の方位
    let face = SIMD3<Float>(cardTransform.columns.2.x, cardTransform.columns.2.y, cardTransform.columns.2.z)
    let faceYaw = atan2(face.x, -face.z)
    var heading = (faceYaw - northYaw) * 180 / .pi
    heading = heading.truncatingRemainder(dividingBy: 360)
    if heading < 0 { heading += 360 }

    return (simd_dot(d, eastDir), simd_dot(d, northDir), d.y, heading)
  }

  private func makeCardEntity(
    title: String,
    description: String,
    handle: String,
    color: String,
    tags: [String],
    readCount: Int = 0
  ) -> ModelEntity {
    let authorName = title.isEmpty ? "Ken" : title
    let messageText = description.isEmpty ? "テスト2" : description
    let handle = handle.isEmpty ? "@ken_loca" : handle
    let accentColor = color.isEmpty ? "#29B6F6" : color

    let cardImage = createCardImage(
      name: authorName,
      handle: handle,
      text: messageText,
      hexColor: accentColor,
      tags: tags,
      readCount: readCount
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

  private func createCardImage(
    name: String,
    handle: String,
    text: String,
    hexColor: String,
    tags: [String],
    readCount: Int
  ) -> UIImage {
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
      // 5. Tags Row（投稿のタグ。無ければ行ごと出さず、本文の領域を広げる）
      let tagLine = Self.tagLine(tags)
      let textRect = CGRect(x: 52, y: 52, width: size.width - 104, height: tagLine == nil ? 270 : 210)
      displayText.draw(in: textRect, withAttributes: textAttributes)

      if let tagLine {
        let tagAttributes: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 32, weight: .semibold),
          .foregroundColor: UIColor(red: 16/255.0, green: 185/255.0, blue: 129/255.0, alpha: 1.0), // Emerald Green
          .paragraphStyle: Self.truncatingParagraphStyle,
        ]
        let tagRect = CGRect(x: 52, y: 284, width: size.width - 104, height: 44)
        tagLine.draw(with: tagRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: tagAttributes, context: nil)
      }

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

      // 9. Footer: 拾われた人数（足あとのイラスト＋数）。まだ誰にも拾われていなければ描かない
      if readCount > 0 {
        let countColor = UIColor(red: 100/255.0, green: 116/255.0, blue: 139/255.0, alpha: 1.0)
        let countString = "\(readCount)"
        let countAttributes: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 30, weight: .semibold),
          .foregroundColor: countColor,
        ]
        let countSize = (countString as NSString).size(withAttributes: countAttributes)
        let countOrigin = CGPoint(x: size.width - 52 - countSize.width, y: 397 - countSize.height / 2)
        countString.draw(at: countOrigin, withAttributes: countAttributes)

        // アプリのアイコンと同じ足あとのイラスト（Images.xcassets の Footprints）を、文字と同じ色で数の左に
        if let footprints = UIImage(named: "Footprints")?.withTintColor(countColor, renderingMode: .alwaysOriginal) {
          let iconHeight: CGFloat = 30
          let iconWidth = iconHeight * footprints.size.width / footprints.size.height
          footprints.draw(in: CGRect(
            x: countOrigin.x - 10 - iconWidth,
            y: 397 - iconHeight / 2,
            width: iconWidth,
            height: iconHeight
          ))
        }
      }
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
      // Tags line（投稿画面で選んだタグ。無ければ行ごと出さず、本文の領域を広げる）
      let tagLine = Self.tagLine(self.currentCardTags)
      let textRect = CGRect(x: 52, y: 104, width: size.width - 104, height: tagLine == nil ? 270 : 200)
      rawText.draw(in: textRect, withAttributes: textAttributes)

      if let tagLine {
        let tagAttrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 28, weight: .semibold),
          .foregroundColor: emerald,
          .paragraphStyle: Self.truncatingParagraphStyle,
        ]
        tagLine.draw(
          with: CGRect(x: 52, y: 318, width: size.width - 104, height: 38),
          options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
          attributes: tagAttrs,
          context: nil
        )
      }

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

  private static func stringArray(_ value: Any?) -> [String] {
    return ((value as? NSArray) ?? []).compactMap { $0 as? String }
  }

  // カードに描くタグの行。「#」を補い、空白と重複を除いて並べる。タグが無ければ nil（行ごと描かない）
  private static func tagLine(_ tags: [String]) -> String? {
    var seen = Set<String>()
    let normalized = tags.compactMap { raw -> String? in
      let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, trimmed != "#" else { return nil }
      let tag = trimmed.hasPrefix("#") ? trimmed : "#\(trimmed)"
      return seen.insert(tag).inserted ? tag : nil
    }
    return normalized.isEmpty ? nil : normalized.joined(separator: "  ")
  }

  private static let truncatingParagraphStyle: NSParagraphStyle = {
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byTruncatingTail
    return style
  }()

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
    // 置いたときの景色の写真も、投稿 ID が決まったので上げられる（撮り終わっていれば）
    if let anchorId = request["anchorId"] as? String,
       let storage = SupabaseStorage(request["supabase"] as? NSDictionary) {
      pendingSnapshotPostInfo[anchorId] = (postId, storage)
      uploadSnapshotIfReady(anchorId: anchorId)
    }
    guard let anchorId = request["anchorId"] as? String,
          let pending = pendingCardAnchors.removeValue(forKey: anchorId) else {
      emitWorldMapStatus("failed", postId: postId, extra: ["message": "配置したカードのアンカーが見つかりません"])
      return
    }
    guard let storage = SupabaseStorage(request["supabase"] as? NSDictionary) else {
      emitWorldMapStatus("failed", postId: postId, extra: ["message": "Supabaseの接続情報がありません"])
      return
    }

    preciseCardPostIds.insert(postId)

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
    guideHUD.setProgress(Self.mappingProgress(status: status, elapsed: elapsed))
    // mapped が理想。カード周りは配置操作の間に覚えているので、extending なら少し待って妥協する（保険）
    if isAnchorRenamed && (status == .mapped || (status == .extending && elapsed > Self.mappingExtendingFallback)) {
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
              self.startMapGrowth(mapPostId: job.postId, objectPath: job.objectPath, storage: job.storage)
              self.emitWorldMapStatus("saved", postId: job.postId, extra: [
                "path": job.objectPath,
                "bytes": data.count,
                // この地図で出せる投稿（照合する地図を選ぶときに使う）
                "anchorPostIds": Self.postIds(in: worldMap),
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

  // extending のままこの秒数たったら、mapped を待たずに書き出す
  // 短いと机の周りしか記録されず、物が動くと照合できなくなるので、部屋の形まで映してもらえるよう長めに待つ
  private static let mappingExtendingFallback: TimeInterval = 15

  // 記録の進み具合（0〜1）。mapped で 1。extending は書き出しの保険の時間に向けて少しずつ進める
  private static func mappingProgress(status: ARFrame.WorldMappingStatus, elapsed: TimeInterval) -> Float {
    let t = Float(min(elapsed / mappingExtendingFallback, 1))
    switch status {
    case .mapped: return 1
    case .extending: return 0.5 + 0.4 * t
    case .limited: return 0.2 + 0.15 * t
    default: return 0.08
    }
  }

  private func captureSnapshot(anchorId: String) {
    // 置いたカードが描かれ、方角タグが消えたフレームを撮るため、少しだけ待つ
    isCapturingSnapshot = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
      guard let self else { return }
      self.arView.snapshot(saveToHDR: false) { [weak self] image in
        DispatchQueue.main.async {
          guard let self else { return }
          self.isCapturingSnapshot = false
          guard let image, let data = Self.downscaled(image, maxWidth: 720).jpegData(compressionQuality: 0.7) else { return }
          self.pendingSnapshots[anchorId] = data
          self.uploadSnapshotIfReady(anchorId: anchorId)
        }
      }
    }
  }

  private static func downscaled(_ image: UIImage, maxWidth: CGFloat) -> UIImage {
    let width = image.size.width
    guard width > maxWidth else { return image }
    let size = CGSize(width: maxWidth, height: image.size.height * maxWidth / width)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
  }

  private func uploadSnapshotIfReady(anchorId: String) {
    guard let data = pendingSnapshots[anchorId], let info = pendingSnapshotPostInfo[anchorId] else { return }
    pendingSnapshots[anchorId] = nil
    pendingSnapshotPostInfo[anchorId] = nil
    let path = "snapshots/\(info.postId).jpg"
    info.storage.upload(data, bucket: Self.worldMapBucket, path: path, contentType: "image/jpeg") { [weak self] result in
      DispatchQueue.main.async {
        guard let self else { return }
        if case .success = result {
          self.emitWorldMapStatus("snapshotSaved", postId: info.postId, extra: ["path": path])
        }
        // 写真が上がらなくても地図の保存は続ける（照合のときに写真なしの案内になるだけ）
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
    switch phase {
    case "mapping":
      showGuide(.init(
        symbol: "iphone",
        title: "ゆっくり周りを見回してください",
        subtitle: "机だけでなく、壁や床など、変わりにくいものも映すように周りを見回してください",
        sways: true,
        showsProgress: true
      ))
    case "uploading":
      showGuide(.init(symbol: "icloud.and.arrow.up", title: "この場所を保存中", subtitle: nil, sways: false))
    case "snapshotSaved":
      // 地図の記録とは別に進むので、案内は変えない
      break
    default:
      hideGuide()
    }

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
        color: card["cardColor"] as? String ?? "",
        tags: Self.stringArray(card["cardTags"]),
        readCount: (card["cardReadCount"] as? NSNumber)?.intValue ?? 0
      )
    }
    relocalization = RelocalizationTarget(postId: postId, worldMapPath: worldMapPath, storage: storage, cards: cards)
    emitRelocalizationStatus("downloading", postId: postId)

    // 置いたときの景色の写真（近い順）を、地図と並行して読み込む（照合中に半透明で重ねる）
    let snapshotItems: [(postId: String, path: String)] = (target["snapshots"] as? NSArray ?? []).compactMap { item in
      guard let dict = item as? NSDictionary,
            let snapshotPostId = Self.stringValue(dict["postId"]),
            let path = dict["path"] as? String, !path.isEmpty else { return nil }
      return (snapshotPostId, path)
    }
    relocalization?.snapshotSlots = snapshotItems.map { ($0.postId, nil) }
    for (index, item) in snapshotItems.enumerated() {
      storage.download(bucket: Self.worldMapBucket, path: item.path) { [weak self] result in
        DispatchQueue.main.async {
          guard let self, self.relocalization?.postId == postId,
                case .success(let data) = result, let image = UIImage(data: data),
                index < (self.relocalization?.snapshotSlots.count ?? 0) else { return }
          let hadNone = self.relocalization?.loadedSnapshots.isEmpty ?? true
          self.relocalization?.snapshotSlots[index].image = image
          // もう照合が始まっていて、まだ写真を出していなければ、写真付きの案内に差し替える
          if hadNone, self.isRunningWithWorldMap, self.relocalization?.didFindAnchor == false {
            self.relocalization?.snapshotIndex = 0
            self.relocalization?.snapshotShownAt = Date()
            self.showGuide(self.relocalizationGuide(postId: postId))
          }
        }
      }
    }

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
    revealCards.removeAll()
    preciseCardPostIds.removeAll()
    mapGrowth = nil
    northOffset = nil
    pendingCardAnchors.removeAll()
    mappingJob = nil

    let config = makeTrackingConfiguration()
    config.initialWorldMap = worldMap
    arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    isRunningWithWorldMap = true

    debugRelocalizationStartedAt = Date()
    debugLoadedMapPostId = postId
    debugMapAnchorPostIds = Self.postIds(in: worldMap)
    debugAnchorArrivals = []
    debugTrackingNormalAt = nil
    pendingRelocalizedAnchors.removeAll()
    emitRelocalizationStatus("relocalizing", postId: postId)

    // 照合中は位置が定まらず平面検出も止まるので、見つからなければあきらめて通常のセッションに戻す
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.relocalizationTimeout) { [weak self] in
      guard let self, self.isRunningWithWorldMap,
            let target = self.relocalization, target.postId == postId, !target.didFindAnchor else { return }
      if case .normal = self.arView.session.currentFrame?.camera.trackingState { return }
      self.relocalization = nil
      self.isRunningWithWorldMap = false
      self.mapGrowth = nil
      self.preciseCardPostIds.removeAll()
      self.northOffset = nil
      self.pendingRelocalizedAnchors.removeAll()
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
      mapGrowth = nil
      preciseCardPostIds.removeAll()
      northOffset = nil
      pendingRelocalizedAnchors.removeAll()
      arView.session.run(makeTrackingConfiguration(), options: [.resetTracking, .removeExistingAnchors])
    }
    emitRelocalizationStatus("cancelled", postId: target.postId)
  }

  // 地図に入っていた名前付きアンカーがここに届く。
  // ただし地図付きセッションでは、位置合わせが終わる（trackingState が normal になる）までアンカーの位置は当てにならない。
  // その前に届いたアンカーは取っておき、normal になってからカードにする（正確なふりをして出さない）
  func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
    let postAnchors = anchors.filter { $0.name?.hasPrefix("post:") == true }
    if isRunningWithWorldMap {
      for anchor in postAnchors {
        debugAnchorArrivals.append((String(anchor.name!.dropFirst("post:".count)), Date()))
      }
    }
    guard relocalization != nil, !postAnchors.isEmpty else { return }

    if isRunningWithWorldMap, !Self.isNormal(session.currentFrame?.camera.trackingState) {
      pendingRelocalizedAnchors.append(contentsOf: postAnchors)
      return
    }
    presentRelocalizedAnchors(postAnchors)
  }

  // 地図に入っている post: アンカーの投稿 ID
  private static func postIds(in worldMap: ARWorldMap) -> [String] {
    return worldMap.anchors.compactMap { anchor in
      guard let name = anchor.name, name.hasPrefix("post:") else { return nil }
      return String(name.dropFirst("post:".count))
    }
  }

  private static func isNormal(_ state: ARCamera.TrackingState?) -> Bool {
    if case .normal = state { return true }
    return false
  }

  // 同じ起動中に置いた投稿は後の地図にもまとめて入っているので、知っている投稿のアンカーはすべてカードにする
  private func presentRelocalizedAnchors(_ anchors: [ARAnchor]) {
    guard var target = relocalization else { return }
    let sessionAnchors = arView.session.currentFrame?.anchors ?? []
    for stored in anchors {
      // 取っておいた間に位置合わせで位置が直っているので、セッションの最新のアンカーを使う
      let anchor = sessionAnchors.first { $0.identifier == stored.identifier } ?? stored
      guard let name = anchor.name, name.hasPrefix("post:") else { continue }
      let postId = String(name.dropFirst("post:".count))
      guard let card = target.cards[postId], !target.foundPostIds.contains(postId) else { continue }

      if !target.didFindAnchor {
        startMapGrowth(for: target)
      }
      target.foundPostIds.insert(postId)
      preciseCardPostIds.insert(postId)
      let anchorEntity = AnchorEntity(anchor: anchor)
      let cardEntity = makeCardEntity(
        title: card.title,
        description: card.description,
        handle: card.icon,
        color: card.color,
        tags: card.tags,
        readCount: card.readCount
      )
      // 1 つの地図で家じゅうのカードが一度に出るので、近くに来たカードだけを見せる。
      // 離れている間は、その正確な位置に小さな光だけを出す（壁の向こうのカードをくっきり見せない）
      let glowEntity = ModelEntity(mesh: presenceMesh, materials: [presenceMaterial])
      glowEntity.scale = SIMD3<Float>(repeating: Self.revealGlowSize)
      cardEntity.isEnabled = false
      Self.setOpacity(0, of: cardEntity)
      anchorEntity.addChild(cardEntity)
      anchorEntity.addChild(glowEntity)
      arView.scene.addAnchor(anchorEntity)
      placedCardEntities.append(anchorEntity)
      revealCards.append(RevealCard(postId: postId, card: cardEntity, glow: glowEntity))
      emitRelocalizationStatus("found", postId: postId)
    }
    relocalization = target
  }

  // 位置合わせ自体はできたのにカードのアンカーが来ない場合を知らせる（原因の切り分け用）
  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    if isRunningWithWorldMap, case .normal = camera.trackingState, debugTrackingNormalAt == nil {
      debugTrackingNormalAt = Date()
    }
    // 位置合わせが終わったので、取っておいたアンカーをカードにする（found と地図を育てる処理もここから始まる）
    if isRunningWithWorldMap, case .normal = camera.trackingState, !pendingRelocalizedAnchors.isEmpty {
      let pending = pendingRelocalizedAnchors
      pendingRelocalizedAnchors.removeAll()
      presentRelocalizedAnchors(pending)
    }
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
    startMapGrowth(mapPostId: target.postId, objectPath: target.worldMapPath, storage: target.storage)
  }

  // 照合に成功した人だけでなく、カードを置いた本人も、保存後に見回した分で地図を育てる
  private func startMapGrowth(mapPostId: String, objectPath: String, storage: SupabaseStorage) {
    // 地図の上書きにはログインが必要（Storage のポリシー）
    guard storage.accessToken != nil,
          let frame = arView.session.currentFrame else { return }
    let pose = Self.cameraPose(frame)
    mapGrowth = MapGrowth(
      mapPostId: mapPostId,
      objectPath: objectPath,
      storage: storage,
      lastSavedAt: Date(),
      lastCameraPosition: pose.position,
      lastCameraForward: pose.forward
    )
  }

  private func checkMapGrowth() {
    guard var growth = mapGrowth, !growth.isSaving, growth.saveCount < Self.mapGrowthMaxSaves,
          // 自分の投稿の保存中は触らない（保存待ちの仮アンカーが地図に混ざる）
          mappingJob == nil, pendingCardAnchors.isEmpty,
          let frame = arView.session.currentFrame,
          case .normal = frame.camera.trackingState,
          // 新しい方向を向いている間は extending になるので、それも対象にする
          frame.worldMappingStatus == .mapped || frame.worldMappingStatus == .extending,
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
          self.emitRelocalizationStatus("mapExtended", postId: growth.mapPostId, extra: [
            "bytes": data.count,
            "anchorPostIds": Self.postIds(in: worldMap),
          ])
        }
      }
    }
  }

  // MARK: - 方角タグ（セカイカメラ風）
  // GPS の距離・方角（JS で計算）と、コンパスで求めた AR 座標の「北」から、タグをその方向に浮かべる。
  // 位置はざっくり（GPS 数m〜・コンパス 10°前後の誤差）なので、正確な位置に出せた投稿のタグは消す

  private func startHeadingUpdates() {
    guard motionManager.isDeviceMotionAvailable else { return }
    let frames = CMMotionManager.availableAttitudeReferenceFrames()
    let reference: CMAttitudeReferenceFrame =
      frames.contains(.xTrueNorthZVertical) ? .xTrueNorthZVertical : .xMagneticNorthZVertical
    guard frames.contains(reference) else { return }
    motionManager.deviceMotionUpdateInterval = 1.0 / 30
    motionManager.startDeviceMotionUpdates(using: reference, to: .main) { [weak self] motion, _ in
      guard let self, let motion else { return }
      self.updateNorthOffset(with: motion)
    }

    // コンパスの精度と、位置情報の許可（正確／おおよそ）を見張る。許可のダイアログ自体は JS 側の位置取得が出す
    locationManager.delegate = self
    locationManager.headingFilter = 1
    if CLLocationManager.headingAvailable() {
      locationManager.startUpdatingHeading()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }
    onLocationAccuracyStatus?(["fullAccuracy": manager.accuracyAuthorization == .fullAccuracy])
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    // 負の値は「方位が無効」（未補正）
    latestHeadingAccuracy = newHeading.headingAccuracy
    let isPoor = latestHeadingAccuracy < 0 || latestHeadingAccuracy > Self.headingAccuracyUsable
    let isGood = latestHeadingAccuracy >= 0 && latestHeadingAccuracy <= Self.headingAccuracyGood

    // 一瞬悪くなっただけでは案内しない。良くなったら（少し余裕を持って）すぐ消す
    if isPoor {
      poorHeadingSince = poorHeadingSince ?? Date()
    } else {
      poorHeadingSince = nil
    }
    let shouldGuide: Bool
    if let since = poorHeadingSince, Date().timeIntervalSince(since) >= Self.poorHeadingDurationBeforeGuide {
      shouldGuide = true
    } else if isGood {
      shouldGuide = false
    } else {
      shouldGuide = compassNeedsCalibration
    }
    guard shouldGuide != compassNeedsCalibration else { return }
    compassNeedsCalibration = shouldGuide
    onCompassStatus?(["needsCalibration": shouldGuide, "headingAccuracy": latestHeadingAccuracy])
  }

  // iOS 標準の補正画面は出さない（アプリ側で穏やかに案内する）
  func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
    return false
  }

  private func updateNorthOffset(with motion: CMDeviceMotion) {
    let m = motion.attitude.rotationMatrix
    if motionMatrixIsReferenceToDevice == nil {
      // 基準座標（Z 上向き）の重力 (0,0,-1) を端末座標に写したものが motion.gravity と一致する方が正しい向き
      let gravity = SIMD3<Double>(motion.gravity.x, motion.gravity.y, motion.gravity.z)
      let ifReferenceToDevice = -SIMD3<Double>(m.m13, m.m23, m.m33)
      let ifDeviceToReference = -SIMD3<Double>(m.m31, m.m32, m.m33)
      let a = simd_distance(ifReferenceToDevice, gravity)
      let b = simd_distance(ifDeviceToReference, gravity)
      guard abs(a - b) > 0.2 else { return } // 端末が水平だと区別がつかない
      motionMatrixIsReferenceToDevice = a < b
    }

    // カメラの向き（端末の -Z）を基準座標（X=北, Y=西, Z=上）で表す
    let camera = motionMatrixIsReferenceToDevice == true
      ? -SIMD3<Double>(m.m31, m.m32, m.m33)
      : -SIMD3<Double>(m.m13, m.m23, m.m33)
    guard hypot(camera.x, camera.y) > 0.3 else { return } // 真上・真下を向いているときは方角が不安定
    let cameraBearing = atan2(-camera.y, camera.x) // 北=0、時計回り

    // 同じカメラの向きを AR 座標で表す（-Z から +X 方向に回るヨー角。上から見て時計回り）
    guard let transform = arView.session.currentFrame?.camera.transform else { return }
    let forward = -SIMD3<Float>(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z)
    guard hypot(forward.x, forward.z) > 0.3 else { return }
    let arYaw = atan2(Double(forward.x), Double(-forward.z))

    // コンパスの精度が悪い間の測定値は混ぜない（まだ北が決まっていないときだけは、何も出ないよりましなので使う）
    let headingIsUsable = latestHeadingAccuracy >= 0 && latestHeadingAccuracy <= Self.headingAccuracyUsable
    guard headingIsUsable || northOffset == nil else { return }

    let offset = arYaw - cameraBearing
    let now = motion.timestamp
    northSamples.append((now, SIMD2<Float>(Float(cos(offset)), Float(sin(offset)))))
    northSamples.removeAll { now - $0.time > Self.northAveragingWindow }

    // 1 回で決めず、集め始めてから northMinimumCollection 秒たってから、直近の平均で北を決める（角度なので cos, sin で平均）
    guard let first = northSamples.first, now - first.time >= Self.northMinimumCollection else { return }
    let sum = northSamples.reduce(SIMD2<Float>(0, 0)) { $0 + $1.value }
    guard simd_length(sum) > 0.0001 else { return }
    northOffset = simd_normalize(sum)
  }

  private func updateGeoTags() {
    let now = Date()
    // フレームの間隔（時間ベースで動かし、フレームレートに左右されないようにする）
    let dt = Float(min(now.timeIntervalSince(lastGeoFrameAt ?? now), 0.1))
    lastGeoFrameAt = now

    guard let northOffset, !isPreviewActive, !isCapturingSnapshot,
          let cameraTransform = arView.session.currentFrame?.camera.transform else {
      geoTagRoot.isEnabled = false
      if northOffset == nil {
        needsGeoTagSnap = true
      }
      return
    }
    geoTagRoot.isEnabled = true
    let cameraPosition = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)

    if now.timeIntervalSince(lastGeoLayoutAt) > 0.5 {
      lastGeoLayoutAt = now
      layoutGeoTags(northYaw: atan2(northOffset.y, northOffset.x), cameraPosition: cameraPosition, now: now)
    }

    let follow = 1 - exp(-Self.geoTagFollowRate * dt)
    let fadeStep = dt / Self.geoTagFadeDuration
    for (postId, var tag) in geoTagEntities {
      if tag.isRemoving {
        tag.appearance = max(0, tag.appearance - fadeStep)
        if tag.appearance <= 0 {
          tag.entity.removeFromParent()
          geoTagEntities[postId] = nil
          continue
        }
      } else if now >= tag.appearAt {
        tag.appearance = min(1, tag.appearance + fadeStep)
      }

      // 目標の位置・大きさ・濃さへなめらかに寄せる
      tag.entity.position = simd_mix(tag.entity.position, tag.target, SIMD3<Float>(repeating: follow))
      tag.scale += (tag.targetScale - tag.scale) * follow
      tag.opacity += (tag.targetOpacity - tag.opacity) * follow

      // ふわっと：少し小さい状態から、透明度と一緒に元の大きさへ
      let eased = 1 - pow(1 - tag.appearance, 3)
      var displayScale = tag.scale * (0.85 + 0.15 * eased)
      var nearFade: Float = 1
      if tag.isPresence {
        // 気配の光は大きいので、近づくと画面いっぱいを覆ってしまう。
        // 見かけの大きさに上限を付け、近づくほど薄く、すぐそばでは見えなくする
        let distanceToCamera = simd_distance(tag.entity.position, cameraPosition)
        displayScale = min(displayScale, distanceToCamera * Self.glowMaxApparentSize)
        nearFade = Self.glowNearFade(distanceToCamera)
      }
      tag.entity.scale = SIMD3<Float>(repeating: displayScale)
      // 気配は 4 秒周期でゆっくり明るさを揺らす（投稿ごとに揺れのタイミングをずらす）
      let breathing: Float = tag.isPresence
        ? 0.85 + 0.15 * Float(sin(now.timeIntervalSince1970 * 2 * .pi / 4 + Double(abs(postId.hashValue % 628)) / 100))
        : 1
      Self.setOpacity(tag.opacity * eased * breathing * nearFade, of: tag.entity)
      // 透明度を変えられない iOS（17 以下）では、近すぎるときは消す
      let hiddenByNearness: Bool
      if #available(iOS 18.0, *) {
        hiddenByNearness = nearFade <= 0.01
      } else {
        hiddenByNearness = nearFade < 0.5
      }
      tag.entity.isEnabled = tag.appearance > 0 && !hiddenByNearness

      // カメラの方を向かせる（ヨーだけ）
      let toCamera = cameraPosition - tag.entity.position
      tag.entity.orientation = simd_quatf(angle: atan2(toCamera.x, toCamera.z), axis: SIMD3<Float>(0, 1, 0))
      geoTagEntities[postId] = tag
    }
  }

  private static func setOpacity(_ opacity: Float, of entity: Entity) {
    if #available(iOS 18.0, *) {
      entity.components.set(OpacityComponent(opacity: opacity))
    }
    // iOS 17 以前は透明度を変えられないので、大きさの変化だけで現れる
  }

  private func layoutGeoTags(northYaw: Float, cameraPosition: SIMD3<Float>, now: Date) {
    // 近い順に並べる（現れる順番・重なったときに下に来る順番）
    let visible = geoTagData
      .filter { !preciseCardPostIds.contains($0.postId) }
      .sorted { $0.distance < $1.distance }
    let visibleIds = Set(visible.map(\.postId))
    for (postId, tag) in geoTagEntities where !visibleIds.contains(postId) && !tag.isRemoving {
      // 範囲外になった・正確な位置にカードが出た投稿は、ふわっと消す
      geoTagEntities[postId]?.isRemoving = true
    }

    let snap = needsGeoTagSnap
    needsGeoTagSnap = false
    // 位置の基準は「GPS の位置が届いたときのカメラ位置」。北を求め直した直後は AR の座標が変わっているので、今のカメラで置き直す
    if snap || geoOriginCameraPosition == nil {
      geoOriginCameraPosition = cameraPosition
    }
    let origin = geoOriginCameraPosition ?? cameraPosition

    var newcomerCount = 0
    // 重なりの判定は角度で行う（距離がばらばらなので m では比べられない）。bottom / top は仰角（ラジアン）
    var placed: [(bearing: Double, top: Float, bottom: Float)] = []
    for (rank, tag) in visible.enumerated() {
      let distance = Float(tag.distance)
      // 実際の距離に置く（近づけば本当に近づき、通り過ぎれば後ろに回る）。遠すぎるものだけ geoTagMaxRenderDistance に置く
      let renderDistance = min(max(distance, 1), Self.geoTagMaxRenderDistance)
      let yaw = northYaw + Float(tag.bearing * .pi / 180)
      let direction = SIMD3<Float>(sin(yaw), 0, -cos(yaw))

      let scale: Float
      let opacity: Float
      let target: SIMD3<Float>
      if tag.level == .presence {
        // 位置がはっきりしないので、GPS の不確かさの分だけ大きくぼかした光にする（文字は出さない）
        scale = min(max(tag.uncertaintyM * 0.5, 1.0), 4)
        opacity = Self.presenceOpacity * (0.6 + 0.4 * tag.prominence)
        target = origin + direction * renderDistance + SIMD3<Float>(0, -0.1, 0)
      } else {
        // 見かけの幅（角度）は本当の距離で決める。近い（30m）ほど大きく、遠い（300m）ほど小さい。強調する投稿は少し大きく
        let t = min(max((distance - 30) / 270, 0), 1)
        let angularWidth: Float = 0.17 - 0.07 * t
        scale = angularWidth * renderDistance / Self.geoTagMessageSize.x * (tag.highlighted ? 1.15 : 1)
        // 近いほど濃く、遠いほど薄く
        opacity = min(1, 0.4 + 0.6 * tag.prominence + (tag.highlighted ? 0.15 : 0))
        let angularHeight = (tag.showsMessage ? Self.geoTagMessageSize.y : Self.geoTagSummarySize.y) * scale / renderDistance
        // 遠いものほど少し上に。方角が近いタグ同士は重ならないよう上に積む
        var bottom = (3 + 3 * t) * .pi / 180
        while placed.contains(where: {
          abs(Self.angleDifference($0.bearing, tag.bearing)) < 12 && bottom < $0.top && bottom + angularHeight > $0.bottom
        }) {
          bottom += angularHeight * 1.15
        }
        placed.append((tag.bearing, bottom + angularHeight, bottom))
        target = origin + direction * renderDistance + SIMD3<Float>(0, renderDistance * tan(bottom), 0)
      }

      let distanceText = Self.distanceText(tag.distance)
      let mesh: MeshResource
      switch tag.level {
      case .presence: mesh = presenceMesh
      case .message: mesh = geoTagMessageMesh
      case .summary: mesh = geoTagSummaryMesh
      }
      let textureKey = "\(tag.level.rawValue)|\(tag.title)|\(tag.description)|\(tag.tags.joined(separator: ","))|\(distanceText)"
      if var existing = geoTagEntities[tag.postId] {
        if existing.textureKey != textureKey {
          // 近づいて段階が変わったら、形も描く内容も切り替える
          existing.entity.model?.mesh = mesh
          existing.entity.model?.materials = [makeGeoTagMaterial(tag, distanceText: distanceText)]
          existing.entity.generateCollisionShapes(recursive: false)
          existing.textureKey = textureKey
          existing.isPresence = tag.level == .presence
        }
        existing.target = target
        existing.targetScale = scale
        existing.targetOpacity = opacity
        if existing.isRemoving {
          // 消えかけていた投稿が範囲に戻ってきた
          existing.isRemoving = false
          existing.appearAt = now
        }
        if snap {
          // 北を求め直した直後は前の座標が当てにならないので、飛ばさずに置き直して、もう一度ふわっと出す
          existing.entity.position = target
          existing.scale = scale
          existing.opacity = opacity
          existing.appearance = 0
          existing.appearAt = now + Double(rank) * Self.geoTagStaggerDelay
        }
        geoTagEntities[tag.postId] = existing
      } else {
        let entity = ModelEntity(mesh: mesh, materials: [makeGeoTagMaterial(tag, distanceText: distanceText)])
        entity.position = target
        entity.isEnabled = false
        // タップを受け取れるように（気配をタップすると案内を出す）
        entity.generateCollisionShapes(recursive: false)
        Self.setOpacity(0, of: entity)
        geoTagRoot.addChild(entity)
        // 新しく出るタグは、近い順に少しずつ時間差で現れる
        geoTagEntities[tag.postId] = GeoTagEntity(
          entity: entity,
          textureKey: textureKey,
          target: target,
          targetScale: scale,
          targetOpacity: opacity,
          scale: scale,
          opacity: opacity,
          appearAt: now + Double(newcomerCount) * Self.geoTagStaggerDelay,
          isPresence: tag.level == .presence
        )
        newcomerCount += 1
      }
    }
  }

  private static func angleDifference(_ a: Double, _ b: Double) -> Double {
    var d = (a - b).truncatingRemainder(dividingBy: 360)
    if d > 180 { d -= 360 }
    if d < -180 { d += 360 }
    return d
  }

  private static func distanceText(_ meters: Double) -> String {
    if meters >= 1000 { return String(format: "%.1fkm", meters / 1000) }
    let step: Double = meters < 100 ? 5 : 10
    return "\(Int(max(step, (meters / step).rounded() * step)))m"
  }

  // 気配の光の絵：真ん中がほんのり白く、ふちに向かって透明になる
  private static func presenceGlowImage() -> CGImage? {
    let size = CGSize(width: 256, height: 256)
    let image = UIGraphicsImageRenderer(size: size).image { context in
      let colors = [
        UIColor(red: 0.94, green: 1, blue: 0.97, alpha: 1).cgColor,
        UIColor(red: 0.45, green: 0.92, blue: 0.72, alpha: 0.6).cgColor,
        UIColor(red: 0.45, green: 0.92, blue: 0.72, alpha: 0).cgColor,
      ] as CFArray
      guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.35, 1]) else { return }
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      context.cgContext.drawRadialGradient(
        gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: size.width / 2, options: []
      )
    }
    return image.cgImage
  }

  private func makeGeoTagMaterial(_ tag: GeoTagData, distanceText: String) -> UnlitMaterial {
    if tag.level == .presence {
      return presenceMaterial
    }
    var material = UnlitMaterial()
    if #available(iOS 15.0, *) {
      material.blending = .transparent(opacity: .init(scale: 1.0))
    }
    let image = tag.showsMessage
      ? createGeoTagImage(tag, distanceText: distanceText)
      : createGeoTagSummaryImage(tag, distanceText: distanceText)
    if let cgImage = image.cgImage,
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      material.color = .init(tint: .white, texture: .init(texture))
    }
    return material
  }

  // 遠い投稿用：本文は出さず、タグと距離だけの小さいタグ（例「#カフェ  📍180m」）
  private func createGeoTagSummaryImage(_ tag: GeoTagData, distanceText: String) -> UIImage {
    // メッシュと同じ縦横比にする
    let size = CGSize(width: 640, height: CGFloat(640 * Self.geoTagSummarySize.y / Self.geoTagSummarySize.x))
    return UIGraphicsImageRenderer(size: size).image { _ in
      let accent = parseHexColor(tag.color.isEmpty ? "#10B981" : tag.color)
      let rect = CGRect(origin: .zero, size: size).insetBy(dx: 6, dy: 6)
      let path = UIBezierPath(roundedRect: rect, cornerRadius: rect.height / 2)
      UIColor(white: 1.0, alpha: 0.88).setFill()
      path.fill()
      accent.withAlphaComponent(0.9).setStroke()
      path.lineWidth = 4
      path.stroke()

      let distanceAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 34, weight: .bold),
        .foregroundColor: UIColor(red: 71/255.0, green: 85/255.0, blue: 105/255.0, alpha: 1.0),
      ]
      let pin = "📍\(distanceText)"
      let pinSize = (pin as NSString).size(withAttributes: distanceAttrs)
      let padding: CGFloat = 36

      guard let tagLine = Self.tagLine(tag.tags) else {
        // タグが無ければ距離だけを真ん中に
        pin.draw(at: CGPoint(x: (size.width - pinSize.width) / 2, y: (size.height - pinSize.height) / 2), withAttributes: distanceAttrs)
        return
      }

      pin.draw(at: CGPoint(x: size.width - padding - pinSize.width, y: (size.height - pinSize.height) / 2), withAttributes: distanceAttrs)
      let tagAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 34, weight: .bold),
        .foregroundColor: accent,
        .paragraphStyle: Self.truncatingParagraphStyle,
      ]
      let tagHeight = (tagLine as NSString).size(withAttributes: tagAttrs).height
      tagLine.draw(
        with: CGRect(x: padding, y: (size.height - tagHeight) / 2, width: size.width - padding * 2 - pinSize.width - 16, height: tagHeight),
        options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
        attributes: tagAttrs,
        context: nil
      )
    }
  }

  // 近い投稿用：本文・タグ・投稿者・距離
  private func createGeoTagImage(_ tag: GeoTagData, distanceText: String) -> UIImage {
    let size = CGSize(width: 640, height: 240)
    return UIGraphicsImageRenderer(size: size).image { _ in
      let accent = parseHexColor(tag.color.isEmpty ? "#10B981" : tag.color)
      let rect = CGRect(origin: .zero, size: size).insetBy(dx: 8, dy: 8)
      let path = UIBezierPath(roundedRect: rect, cornerRadius: 28)
      UIColor(white: 1.0, alpha: 0.88).setFill()
      path.fill()
      accent.withAlphaComponent(0.9).setStroke()
      path.lineWidth = 5
      path.stroke()

      // 本文（タグがあれば 2 行まで、無ければその分も本文に使う）
      let message = tag.description.isEmpty ? "（メッセージ）" : tag.description
      let tagLine = Self.tagLine(tag.tags)
      message.draw(
        with: CGRect(x: 36, y: 28, width: size.width - 72, height: tagLine == nil ? 130 : 96),
        options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
        attributes: [
          .font: UIFont.systemFont(ofSize: tagLine == nil ? 40 : 38, weight: .bold),
          .foregroundColor: UIColor(red: 30/255.0, green: 41/255.0, blue: 59/255.0, alpha: 1.0),
          .paragraphStyle: Self.truncatingParagraphStyle,
        ],
        context: nil
      )

      if let tagLine {
        tagLine.draw(
          with: CGRect(x: 36, y: 128, width: size.width - 72, height: 34),
          options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
          attributes: [
            .font: UIFont.systemFont(ofSize: 26, weight: .semibold),
            .foregroundColor: accent,
            .paragraphStyle: Self.truncatingParagraphStyle,
          ],
          context: nil
        )
      }

      let footerAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 28, weight: .semibold),
        .foregroundColor: UIColor(red: 100/255.0, green: 116/255.0, blue: 139/255.0, alpha: 1.0),
      ]
      (tag.title.isEmpty ? "guest" : tag.title).draw(
        in: CGRect(x: 36, y: 170, width: 360, height: 40), withAttributes: footerAttrs)

      let distanceAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 30, weight: .bold),
        .foregroundColor: accent,
      ]
      let pin = "📍 \(distanceText)"
      let pinSize = (pin as NSString).size(withAttributes: distanceAttrs)
      pin.draw(at: CGPoint(x: size.width - 36 - pinSize.width, y: 168), withAttributes: distanceAttrs)
    }
  }

  // 照合中、地図に入っている投稿の写真が複数あれば、近い順に 4 秒ごとに切り替えて見せる
  private func cycleRelocalizationSnapshot() {
    guard isRunningWithWorldMap, debugRelocalizationPhase == "relocalizing",
          let target = relocalization, !target.didFindAnchor,
          target.loadedSnapshots.count > 1,
          Date().timeIntervalSince(target.snapshotShownAt) >= 4 else { return }
    relocalization?.snapshotIndex = (target.snapshotIndex + 1) % target.loadedSnapshots.count
    relocalization?.snapshotShownAt = Date()
    showGuide(relocalizationGuide(postId: target.postId))
  }

  // 照合で出したカードを、カメラとの間に壁や物があるかで見せたり隠したりする（間に何もなければ現れ、隠れると光だけ残る）
  private func updateCardReveal() {
    let now = Date()
    let dt = Float(min(now.timeIntervalSince(lastRevealFrameAt ?? now), 0.1))
    lastRevealFrameAt = now
    guard !revealCards.isEmpty, let cameraTransform = arView.session.currentFrame?.camera.transform else { return }
    let cameraPosition = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)
    let follow = 1 - exp(-3 * dt)
    let breathing = 0.85 + 0.15 * Float(sin(now.timeIntervalSince1970 * 2 * .pi / 4))

    let shouldCheckOcclusion = now.timeIntervalSince(lastOcclusionCheckAt) >= Self.occlusionCheckInterval
    if shouldCheckOcclusion {
      lastOcclusionCheckAt = now
    }

    for index in revealCards.indices {
      var item = revealCards[index]
      if shouldCheckOcclusion, let frame = arView.session.currentFrame {
        let position = item.card.position(relativeTo: nil)
        item.distance = simd_distance(position, cameraPosition)
        if isInView(position, frame: frame) {
          let result = isOccluded(position, from: cameraPosition, frame: frame)
          // 特徴点は毎フレームちらつくので、何回か続けて同じ結果が出てから切り替える（0.25 秒ごとに ±1）
          item.occlusionScore = min(max(item.occlusionScore + (result.occluded ? 1 : -1), 0), 4)
          if item.occlusionScore >= 3 {
            item.isOccluded = true
          } else if item.occlusionScore <= 1 {
            item.isOccluded = false
          }
          item.occlusionReason = result.reason
        } else {
          // 画面の外のカードは、間に何があるか見えないので、前の状態のまま
          item.occlusionReason = "画面外(前の状態のまま)"
        }
      }
      let target: Float = item.isOccluded ? 0 : 1
      item.reveal += (target - item.reveal) * follow

      // 隠れているカードの光も、すぐそばを通ると画面を覆うので、近づくほど薄くする
      let glowDistance = simd_distance(item.glow.position(relativeTo: nil), cameraPosition)
      let glowFade = Self.glowNearFade(glowDistance)
      item.glow.scale = SIMD3<Float>(repeating: min(Self.revealGlowSize, glowDistance * Self.glowMaxApparentSize))

      if #available(iOS 18.0, *) {
        Self.setOpacity(item.reveal, of: item.card)
        Self.setOpacity((1 - item.reveal) * Self.occludedGlowOpacity * breathing * glowFade, of: item.glow)
        item.card.isEnabled = item.reveal > 0.02
        item.glow.isEnabled = item.reveal < 0.98 && glowFade > 0.01
      } else {
        // 透明度を変えられない iOS では、半分を境に切り替える
        item.card.isEnabled = item.reveal >= 0.5
        item.glow.isEnabled = item.reveal < 0.5 && glowFade >= 0.5
      }

      // 隠れずに、画面に映る所でしっかり現れたら「目にした（拾った）」と知らせる（1 回だけ）
      if !item.hasBeenSeen, item.reveal >= 0.9, let frame = arView.session.currentFrame,
         isInView(item.card.position(relativeTo: nil), frame: frame) {
        item.hasBeenSeen = true
        emitRelocalizationStatus("seen", postId: item.postId)
      }

      // 光はどこから見ても丸く見えるよう、カメラの方を向かせる
      let toCamera = cameraPosition - item.glow.position(relativeTo: nil)
      item.glow.setOrientation(simd_quatf(angle: atan2(toCamera.x, toCamera.z), axis: SIMD3<Float>(0, 1, 0)), relativeTo: nil)
      revealCards[index] = item
    }
  }

  // カメラから target までの間に、壁・床・机などがあるか。
  // ARKit が見つけた平面（どの iPhone でも）と、LiDAR があれば部屋の形のメッシュに、見えない線を飛ばして調べる。
  // まだ一度も映していない壁は見つかっていないので、その向こうは「見える」扱いになる
  // カードが今のカメラの画面に映る範囲にあるか
  private func isInView(_ point: SIMD3<Float>, frame: ARFrame) -> Bool {
    let inCamera = frame.camera.transform.inverse * SIMD4<Float>(point, 1)
    guard inCamera.z < 0 else { return false } // カメラの後ろ
    let viewport = arView.bounds.size
    guard viewport.width > 0, viewport.height > 0 else { return false }
    let projected = frame.camera.projectPoint(point, orientation: .portrait, viewportSize: viewport)
    return projected.x >= 0 && projected.x <= viewport.width && projected.y >= 0 && projected.y <= viewport.height
  }

  // 戻り値の reason はデバッグ表示用（何に当たったか）
  private func isOccluded(_ target: SIMD3<Float>, from camera: SIMD3<Float>, frame: ARFrame) -> (occluded: Bool, reason: String) {
    let toTarget = target - camera
    let distance = simd_length(toTarget)
    let reach = distance - Self.occlusionMargin
    guard reach > 0.2 else { return (false, "近すぎ") }
    let direction = toTarget / distance

    // LiDAR が無くても使える手がかり：ARKit が今のフレームで拾っている特徴点（景色の模様や角）。
    // カメラからカードへの細い円すいの中で、カードより手前に特徴点がまとまってあれば、間に何か（椅子・家具・模様のある壁）がある
    let featureHits = Self.featurePointsBetween(camera: camera, direction: direction, reach: reach, distance: distance, frame: frame)
    if featureHits >= Self.occlusionFeaturePointThreshold {
      return (true, "特徴点\(featureHits)個")
    }

    let query = ARRaycastQuery(origin: camera, direction: direction, allowing: .existingPlaneGeometry, alignment: .any)
    let planeHits = arView.session.raycast(query)
    for result in planeHits {
      let hit = SIMD3<Float>(result.worldTransform.columns.3.x, result.worldTransform.columns.3.y, result.worldTransform.columns.3.z)
      let hitDistance = simd_distance(hit, camera)
      if hitDistance < reach {
        return (true, String(format: "平面 %.1fm", hitDistance))
      }
    }

    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      let meshHits = arView.scene.raycast(
        origin: camera, direction: direction, length: reach, query: .nearest, mask: .sceneUnderstanding
      )
      if let hit = meshHits.first {
        return (true, String(format: "メッシュ %.1fm", hit.distance))
      }
      return (false, "平面\(planeHits.count)件・メッシュとも手前に無し, 特徴点\(featureHits)個")
    }
    return (false, "平面\(planeHits.count)件が手前に無し, 特徴点\(featureHits)個")
  }

  // この数以上の特徴点が、カメラとカードの間の円すいにあれば「間に何かある」
  private static let occlusionFeaturePointThreshold = 3

  private static func featurePointsBetween(
    camera: SIMD3<Float>,
    direction: SIMD3<Float>,
    reach: Float,
    distance: Float,
    frame: ARFrame
  ) -> Int {
    guard let points = frame.rawFeaturePoints?.points, !points.isEmpty else { return 0 }
    // 円すいの広がり：カードの大きさ（約 0.25m）が見える角度。ただし最低 3°
    let halfAngle = max(atan(0.25 / distance), 3 * .pi / 180)
    let cosLimit = cos(halfAngle)
    var count = 0
    for point in points {
      let v = point - camera
      let along = simd_dot(v, direction)
      // カメラのすぐ前（0.3m 以内）はノイズが多いので数えない。カードの手前 occlusionMargin より奥も数えない
      guard along > 0.3, along < reach else { continue }
      let length = simd_length(v)
      if length > 0, along / length >= cosLimit {
        count += 1
      }
    }
    return count
  }

  // 照合中の案内。スマホを振らせず、置いたときの写真を重ねて「この景色に合わせて」と伝える
  private func relocalizationGuide(postId: String) -> ARGuideHUDView.Guide {
    if let snapshots = relocalization?.loadedSnapshots, !snapshots.isEmpty {
      let current = snapshots[(relocalization?.snapshotIndex ?? 0) % snapshots.count]
      let message = relocalization?.cards[current.postId]?.description ?? ""
      return .init(
        symbol: nil,
        title: snapshots.count > 1 ? "どれかの景色に合わせてください" : "この景色に合わせてください",
        subtitle: message.isEmpty ? "置いたときの景色です。ゆっくり重ねるように向けてみてください" : "「\(message)」を置いたときの景色です",
        sways: false,
        image: current.image
      )
    }
    let message = relocalization?.cards[postId]?.description ?? ""
    // 写真の無い投稿（写真を撮る前に置かれたもの）
    return .init(
      symbol: "viewfinder",
      title: "置いたときの景色を映してください",
      subtitle: message.isEmpty ? nil : "「\(message)」を置いた場所の周りです",
      sways: false
    )
  }

  // MARK: - デバッグ表示

  private func emitDebugInfoIfNeeded() {
    guard debugEnabled, let onDebugInfo else { return }
    let now = Date()
    guard now.timeIntervalSince(lastDebugEmitAt) >= 0.5 else { return }
    lastDebugEmitAt = now

    // 照合を始めてからの秒数（まだ始めていなければ null）
    func sinceStart(_ date: Date?) -> Any {
      guard let date, let start = debugRelocalizationStartedAt else { return NSNull() }
      return date.timeIntervalSince(start)
    }
    let frame = arView.session.currentFrame
    onDebugInfo([
      "trackingState": Self.trackingStateName(frame?.camera.trackingState),
      "worldMappingStatus": Self.mappingStatusName(frame?.worldMappingStatus),
      "relocalizationPhase": debugRelocalizationPhase,
      "isRunningWithWorldMap": isRunningWithWorldMap,
      "loadedMapPostId": debugLoadedMapPostId ?? NSNull(),
      "mapAnchorPostIds": debugMapAnchorPostIds,
      "anchorArrivals": debugAnchorArrivals.map { ["postId": $0.postId, "t": sinceStart($0.at)] },
      "trackingNormalAt": sinceStart(debugTrackingNormalAt),
      "elapsed": sinceStart(now),
      "foundPostIds": Array(relocalization?.foundPostIds ?? []),
      "northReady": northOffset != nil,
      "headingAccuracy": latestHeadingAccuracy,
      // 障害物で隠す判定（照合で出したカードごと）
      "lidar": ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh),
      "planes": (frame?.anchors ?? []).compactMap { $0 as? ARPlaneAnchor }.map { $0.alignment == .vertical ? "縦" : "横" },
      "revealCards": revealCards.map { item in
        [
          "postId": item.postId,
          "distance": item.distance,
          "occluded": item.isOccluded,
          "reason": item.occlusionReason,
          "reveal": item.reveal,
        ] as [String: Any]
      },
    ])
  }

  private static func trackingStateName(_ state: ARCamera.TrackingState?) -> String {
    guard let state else { return "-" }
    switch state {
    case .normal:
      return "normal"
    case .notAvailable:
      return "notAvailable"
    case .limited(let reason):
      switch reason {
      case .initializing: return "limited(initializing)"
      case .relocalizing: return "limited(relocalizing)"
      case .excessiveMotion: return "limited(excessiveMotion)"
      case .insufficientFeatures: return "limited(insufficientFeatures)"
      @unknown default: return "limited"
      }
    }
  }

  private func emitRelocalizationStatus(_ phase: String, postId: String, extra: [String: Any] = [:]) {
    // mapExtended / seen は照合の進み具合とは別に届くので、フェーズも案内も変えない
    if phase != "mapExtended" && phase != "seen" {
      debugRelocalizationPhase = phase
    }
    switch phase {
    case "downloading":
      showGuide(.init(symbol: "arrow.down.circle", title: "近くのメッセージを読み込み中", subtitle: nil, sways: false))
    case "relocalizing":
      showGuide(relocalizationGuide(postId: postId))
    case "mapExtended", "seen":
      break
    default:
      hideGuide()
    }

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

  // JS から届く最新のアクセストークン（期限が切れたら JS が更新して送り直す）。
  // 照合の依頼などは使い回されるので、依頼に入っていた古いトークンより、こちらを優先する
  static var latestAccessToken: String?

  init?(_ dict: NSDictionary?) {
    guard let dict,
          let url = dict["url"] as? String,
          let apiKey = dict["apiKey"] as? String else { return nil }
    self.baseURL = url.hasSuffix("/") ? String(url.dropLast()) : url
    self.apiKey = apiKey
    self.accessToken = dict["accessToken"] as? String
  }

  func upload(
    _ data: Data,
    bucket: String,
    path: String,
    contentType: String = "application/octet-stream",
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    guard var request = makeRequest("\(baseURL)/storage/v1/object/\(bucket)/\(path)") else {
      completion(.failure(StorageError(message: "URLが不正です")))
      return
    }
    request.httpMethod = "POST"
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    request.setValue("true", forHTTPHeaderField: "x-upsert")
    URLSession.shared.uploadTask(with: request, from: data) { body, response, error in
      completion(Self.check(body, response, error).map { _ in () })
    }.resume()
  }

  func download(bucket: String, path: String, completion: @escaping (Result<Data, Error>) -> Void) {
    download(bucket: bucket, path: path, withToken: true, completion: completion)
  }

  private func download(
    bucket: String,
    path: String,
    withToken: Bool,
    completion: @escaping (Result<Data, Error>) -> Void
  ) {
    guard let request = makeRequest("\(baseURL)/storage/v1/object/authenticated/\(bucket)/\(path)", withToken: withToken) else {
      completion(.failure(StorageError(message: "URLが不正です")))
      return
    }
    URLSession.shared.dataTask(with: request) { body, response, error in
      let result = Self.check(body, response, error)
      // トークンの期限切れなどで拒否されたら、ログインなしで読み込み直す（地図と写真は誰でも読める）
      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
      if case .failure = result, withToken, [400, 401, 403].contains(statusCode) {
        self.download(bucket: bucket, path: path, withToken: false, completion: completion)
        return
      }
      completion(result)
    }.resume()
  }

  private func makeRequest(_ urlString: String, withToken: Bool = true) -> URLRequest? {
    guard let url = URL(string: urlString) else { return nil }
    var request = URLRequest(url: url)
    request.setValue(apiKey, forHTTPHeaderField: "apikey")
    if withToken, let token = Self.latestAccessToken ?? accessToken {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
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

// ARCoachingOverlayView 風の案内。画面を少し暗くし、中央に揺れるアイコンと短い一言を出す。
// タップは下の AR ビューに通す
private final class ARGuideHUDView: UIView {
  struct Guide: Equatable {
    // nil ならアイコンを出さない
    let symbol: String?
    let title: String
    let subtitle: String?
    let sways: Bool
    // 画面いっぱいに半透明で重ねる写真（照合のとき「この景色に合わせて」）
    var image: UIImage? = nil
    // 進み具合のバーを出すか（値は setProgress で更新する）
    var showsProgress = false
  }

  private let photoView = UIImageView()
  private let iconView = UIImageView()
  private let titleLabel = UILabel()
  private let subtitleLabel = UILabel()
  private let progressView = UIProgressView(progressViewStyle: .default)
  private var currentGuide: Guide?
  // 写真を重ねるときは、写真の真ん中を隠さないよう文字を下に寄せる
  private var stackCenterConstraint: NSLayoutConstraint!
  private var stackBottomConstraint: NSLayoutConstraint!

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = UIColor.black.withAlphaComponent(0.28)
    alpha = 0

    photoView.contentMode = .scaleAspectFill
    photoView.clipsToBounds = true
    photoView.alpha = 0.45
    photoView.frame = bounds
    photoView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(photoView)

    progressView.progressTintColor = .white
    progressView.trackTintColor = UIColor.white.withAlphaComponent(0.25)
    progressView.isHidden = true

    iconView.tintColor = .white
    iconView.contentMode = .scaleAspectFit
    iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 64, weight: .light)

    titleLabel.font = .systemFont(ofSize: 22, weight: .semibold)
    titleLabel.textColor = .white
    titleLabel.textAlignment = .center
    titleLabel.numberOfLines = 0

    subtitleLabel.font = .systemFont(ofSize: 15, weight: .regular)
    subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.85)
    subtitleLabel.textAlignment = .center
    subtitleLabel.numberOfLines = 0

    for label in [titleLabel, subtitleLabel] {
      label.layer.shadowColor = UIColor.black.cgColor
      label.layer.shadowOpacity = 0.35
      label.layer.shadowRadius = 6
      label.layer.shadowOffset = .zero
    }

    let stack = UIStackView(arrangedSubviews: [iconView, titleLabel, subtitleLabel, progressView])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 14
    stack.setCustomSpacing(8, after: titleLabel)
    stack.setCustomSpacing(18, after: subtitleLabel)
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    stackCenterConstraint = stack.centerYAnchor.constraint(equalTo: centerYAnchor)
    stackBottomConstraint = stack.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -120)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stackCenterConstraint,
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -32),
      iconView.heightAnchor.constraint(equalToConstant: 84),
      progressView.widthAnchor.constraint(equalToConstant: 200),
    ])
  }

  func setProgress(_ progress: Float) {
    guard currentGuide?.showsProgress == true else { return }
    progressView.setProgress(max(progressView.progress, progress), animated: true)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func show(_ guide: Guide) {
    guard guide != currentGuide else { return }
    let previous = currentGuide
    let isFirst = previous == nil
    currentGuide = guide

    let apply = {
      self.iconView.image = guide.symbol.flatMap { UIImage(systemName: $0) }
      self.iconView.isHidden = guide.symbol == nil
      self.titleLabel.text = guide.title
      self.subtitleLabel.text = guide.subtitle
      self.subtitleLabel.isHidden = guide.subtitle == nil

      // 写真を重ねるときは暗くしすぎない（写真と景色を見比べられるように）
      self.photoView.image = guide.image
      self.photoView.isHidden = guide.image == nil
      self.backgroundColor = UIColor.black.withAlphaComponent(guide.image == nil ? 0.28 : 0.12)
      self.stackCenterConstraint.isActive = guide.image == nil
      self.stackBottomConstraint.isActive = guide.image != nil

      self.progressView.isHidden = !guide.showsProgress
      if guide.showsProgress && previous?.showsProgress != true {
        self.progressView.setProgress(0, animated: false)
      }
    }
    if isFirst {
      apply()
      UIView.animate(withDuration: 0.3) { self.alpha = 1 }
    } else {
      UIView.transition(with: self, duration: 0.25, options: .transitionCrossDissolve, animations: apply)
    }

    iconView.layer.removeAnimation(forKey: "sway")
    if guide.sways {
      // Apple のコーチングのように、iPhone を左右に振る動き
      let sway = CAKeyframeAnimation(keyPath: "transform")
      let left = CATransform3DRotate(CATransform3DMakeTranslation(-26, 0, 0), -.pi / 14, 0, 0, 1)
      let right = CATransform3DRotate(CATransform3DMakeTranslation(26, 0, 0), .pi / 14, 0, 0, 1)
      sway.values = [CATransform3DIdentity, left, CATransform3DIdentity, right, CATransform3DIdentity].map { NSValue(caTransform3D: $0) }
      sway.keyTimes = [0, 0.25, 0.5, 0.75, 1]
      sway.timingFunctions = Array(repeating: CAMediaTimingFunction(name: .easeInEaseOut), count: 4)
      sway.duration = 2.4
      sway.repeatCount = .infinity
      iconView.layer.add(sway, forKey: "sway")
    }
  }

  func hide() {
    guard currentGuide != nil else { return }
    currentGuide = nil
    UIView.animate(withDuration: 0.3, animations: { self.alpha = 0 }) { _ in
      if self.currentGuide == nil {
        self.iconView.layer.removeAnimation(forKey: "sway")
      }
    }
  }
}

// 探索（レーダー）画面用の方位。AR ビューはホーム以外では破棄されるので、方位だけを JS に送る小さなモジュール。
// "heading" イベントで { heading（北=0°、時計回り）, accuracy（度。負なら無効） } を送る。
// 新しい Swift ファイルを足すと Xcode のプロジェクト設定の編集が要るので、ここに置いている
@objc(LocaHeading)
final class LocaHeading: RCTEventEmitter, CLLocationManagerDelegate {
  private var locationManager: CLLocationManager?
  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["heading"]
  }

  override func startObserving() {
    hasListeners = true
    DispatchQueue.main.async { [weak self] in
      guard let self, CLLocationManager.headingAvailable() else { return }
      let manager = self.locationManager ?? CLLocationManager()
      manager.delegate = self
      manager.headingFilter = 1
      // レーダーは画面を上に向けて持つので、画面の上端が向いている方位を使う
      manager.headingOrientation = .portrait
      manager.startUpdatingHeading()
      self.locationManager = manager
    }
  }

  override func stopObserving() {
    hasListeners = false
    DispatchQueue.main.async { [weak self] in
      self?.locationManager?.stopUpdatingHeading()
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard hasListeners else { return }
    // 真北が分かればそれを、分からなければ磁北を使う
    let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
    sendEvent(withName: "heading", body: ["heading": heading, "accuracy": newHeading.headingAccuracy])
  }

  func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
    return false
  }
}

// ポケット通知：関心タグに合うメッセージの近く（radiusM 以内）に来たら、ローカル通知を出す。
// アプリを一度開いてからポケットに入れた（画面ロック・別アプリ）状態でも届くよう、位置の見張りと通知はネイティブで行う
// （JS はバックグラウンドで止まりがちなので、対象の投稿の一覧だけを JS から受け取る）。
// Info.plist の UIBackgroundModes に location が必要。位置情報の許可は「使用中のみ」のままでよい（画面上部に使用中の表示が出る）
@objc(LocaPocket)
final class LocaPocket: RCTEventEmitter, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
  private struct Target {
    let postId: String
    let location: CLLocation
    let title: String
    let body: String
  }

  private var manager: CLLocationManager?
  private var targets: [Target] = []
  private var radiusM: Double = 20
  // 通知どうしの間隔（Calm：立て続けに鳴らさない）
  private var cooldown: TimeInterval = 180
  // 同じメッセージで通知する間隔
  private var perPostInterval: TimeInterval = 24 * 3600
  // GPS の誤差がこれより大きいときは判定しない（誤って通知しないため）
  private var maxAccuracyM: Double = 30
  private var lastNotifiedAt: Date?
  private var lastEmittedLocation: CLLocation?
  private var hasListeners = false
  private static let notifiedKey = "loca.pocket.notified" // [postId: 通知した時刻]
  private static let historyKey = "loca.pocket.history" // 通知画面に出す履歴（新しい順、最大 50 件）

  override init() {
    super.init()
    // アプリを開いているときも通知を出し、タップされたら JS に伝える
    DispatchQueue.main.async {
      UNUserNotificationCenter.current().delegate = self
    }
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["pocketNotified", "pocketLocation", "notificationOpened"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
      resolve(granted)
    }
  }

  // targets: [{ postId, latitude, longitude, title, body }]
  // options: { radiusM, cooldownSec, perPostIntervalSec, maxAccuracyM }
  @objc(start:options:)
  func start(_ targets: NSArray, options: NSDictionary) {
    DispatchQueue.main.async {
      if let value = (options["radiusM"] as? NSNumber)?.doubleValue { self.radiusM = value }
      if let value = (options["cooldownSec"] as? NSNumber)?.doubleValue { self.cooldown = value }
      if let value = (options["perPostIntervalSec"] as? NSNumber)?.doubleValue { self.perPostInterval = value }
      if let value = (options["maxAccuracyM"] as? NSNumber)?.doubleValue { self.maxAccuracyM = value }
      self.setTargets(targets)

      let manager = self.manager ?? CLLocationManager()
      manager.delegate = self
      manager.desiredAccuracy = kCLLocationAccuracyBest
      manager.distanceFilter = 5
      manager.activityType = .fitness
      manager.pausesLocationUpdatesAutomatically = false
      // ポケットの中でも位置を受け取る（Info.plist の UIBackgroundModes: location が必要）
      manager.allowsBackgroundLocationUpdates = true
      manager.showsBackgroundLocationIndicator = true
      manager.startUpdatingLocation()
      self.manager = manager
    }
  }

  @objc(updateTargets:)
  func updateTargets(_ targets: NSArray) {
    DispatchQueue.main.async {
      self.setTargets(targets)
    }
  }

  @objc
  func stop() {
    DispatchQueue.main.async {
      self.manager?.stopUpdatingLocation()
      self.manager?.allowsBackgroundLocationUpdates = false
    }
  }

  @objc(getHistory:rejecter:)
  func getHistory(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(UserDefaults.standard.array(forKey: Self.historyKey) ?? [])
  }

  @objc
  func clearHistory() {
    UserDefaults.standard.removeObject(forKey: Self.historyKey)
  }

  private func setTargets(_ items: NSArray) {
    targets = items.compactMap { item in
      guard let dict = item as? NSDictionary,
            let postId = dict["postId"] as? String,
            let latitude = (dict["latitude"] as? NSNumber)?.doubleValue,
            let longitude = (dict["longitude"] as? NSNumber)?.doubleValue else { return nil }
      return Target(
        postId: postId,
        location: CLLocation(latitude: latitude, longitude: longitude),
        title: dict["title"] as? String ?? "近くに言葉があります",
        body: dict["body"] as? String ?? ""
      )
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last, location.horizontalAccuracy >= 0 else { return }

    // JS に位置を伝える（ポケットの中で歩いても、対象の投稿を取り直せるように）。50m 動くごと
    if hasListeners, lastEmittedLocation.map({ location.distance(from: $0) > 50 }) ?? true {
      lastEmittedLocation = location
      sendEvent(withName: "pocketLocation", body: [
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "accuracy": location.horizontalAccuracy,
      ])
    }

    guard location.horizontalAccuracy <= maxAccuracyM else { return }
    if let last = lastNotifiedAt, Date().timeIntervalSince(last) < cooldown { return }

    let now = Date().timeIntervalSince1970
    var notified = UserDefaults.standard.dictionary(forKey: Self.notifiedKey) as? [String: Double] ?? [:]
    // 範囲内で、最近通知していない、いちばん近いメッセージ
    let nearest = targets
      .filter { target in notified[target.postId].map { now - $0 >= perPostInterval } ?? true }
      .map { ($0, location.distance(from: $0.location)) }
      .filter { $0.1 <= radiusM }
      .min { $0.1 < $1.1 }
    guard let (target, _) = nearest else { return }

    notified[target.postId] = now
    UserDefaults.standard.set(notified, forKey: Self.notifiedKey)
    lastNotifiedAt = Date()

    let content = UNMutableNotificationContent()
    content.title = target.title
    content.body = target.body
    content.sound = .default
    content.userInfo = ["postId": target.postId]
    UNUserNotificationCenter.current().add(
      UNNotificationRequest(identifier: "pocket-\(target.postId)-\(Int(now))", content: content, trigger: nil)
    )

    let entry: [String: Any] = ["postId": target.postId, "title": target.title, "body": target.body, "at": now]
    var history = UserDefaults.standard.array(forKey: Self.historyKey) as? [[String: Any]] ?? []
    history.insert(entry, at: 0)
    UserDefaults.standard.set(Array(history.prefix(50)), forKey: Self.historyKey)
    if hasListeners {
      sendEvent(withName: "pocketNotified", body: entry)
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    if hasListeners {
      sendEvent(withName: "notificationOpened", body: [
        "postId": response.notification.request.content.userInfo["postId"] as? String ?? "",
      ])
    }
    completionHandler()
  }
}

// 緯度経度から場所の名前（「福岡市中央区天神」など）を求める。iOS 標準の CLGeocoder（料金なし）。
// 拾った言葉の「拾った場所」に使う
@objc(LocaGeocoder)
final class LocaGeocoder: NSObject {
  private let geocoder = CLGeocoder()

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(reverseGeocode:longitude:resolver:rejecter:)
  func reverseGeocode(
    _ latitude: Double,
    longitude: Double,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let location = CLLocation(latitude: latitude, longitude: longitude)
    geocoder.reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "ja_JP")) { placemarks, _ in
      guard let placemark = placemarks?.first else {
        resolve(nil)
        return
      }
      // 公園や駅などの名前があればそれを、無ければ「市区町村＋町名」
      if let area = placemark.areasOfInterest?.first {
        resolve(area)
        return
      }
      let parts = [placemark.locality, placemark.subLocality].compactMap { $0 }
      resolve(parts.isEmpty ? nil : parts.joined())
    }
  }
}
