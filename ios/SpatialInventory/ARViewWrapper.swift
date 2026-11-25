import ARKit
import Combine
import CoreImage
import CoreMotion
import RealityKit
import React
import UIKit
import UserNotifications

final class ARViewWrapper: UIView, ARCoachingOverlayViewDelegate, ARSessionDelegate, CLLocationManagerDelegate {
  private static let worldMapBucket = "worldmaps"
  // 景色の照合を待つ時間。短いと、見回している途中であきらめてしまう（見つからなければ JS が次の候補の地図で探す）
  private static let relocalizationTimeout: TimeInterval = 30
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

  @objc var onScreenTapped: RCTDirectEventBlock?

  // ログイン中のアクセストークン。更新されるたびに JS が送ってくるので、Storage には常に最新のものを使う
  @objc var supabaseAccessToken: NSString? {
    didSet {
      let token = supabaseAccessToken as String?
      SupabaseStorage.latestAccessToken = (token?.isEmpty ?? true) ? nil : token
    }
  }
  // { postId, x, y } 照合で出した他の人のカードがタップされた（言葉を拾う）。x, y はタップした画面上の位置
  @objc var onCardTapped: RCTDirectEventBlock?
  // { postId } 照合で出したカードが長押しされた（JS が通報・ブロックのメニューを出す）
  @objc var onCardLongPressed: RCTDirectEventBlock?
  // 出さない投稿（通報した言葉・ブロックした人の言葉）。もう出ているカードも、光ごと消す
  @objc var hiddenPostIds: NSArray? {
    didSet {
      hiddenPosts = Set((hiddenPostIds ?? []).compactMap { Self.stringValue($0) })
    }
  }
  private var hiddenPosts: Set<String> = []
  // 使い方ツアーの間は、Apple のコーチングと自前の案内・お知らせを隠す（ツアーの吹き出しと重なって、出たり消えたりして見えるため）
  @objc var hudHidden: Bool = false {
    didSet {
      coachingOverlay.isHidden = hudHidden
      guideHUD.isHidden = hudHidden
    }
  }
  @objc var onCardPlaced: RCTDirectEventBlock?
  @objc var onWorldMapStatus: RCTDirectEventBlock?
  @objc var onRelocalizationStatus: RCTDirectEventBlock?
  // { fullAccuracy } 位置情報が「正確な位置情報」で許可されているか（オフだと置いた言葉の位置が大きくずれる）
  @objc var onLocationAccuracyStatus: RCTDirectEventBlock? {
    didSet {
      // 許可の状態は作成直後に一度だけ届くので、受け口がつながった時点でも今の状態を送る
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        self.locationManagerDidChangeAuthorization(self.locationManager)
      }
    }
  }

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

  private var lastSaveRequestId: Double?
  // 投稿IDが決まる前の仮アンカー（anchorId → アンカー）
  private var pendingCardAnchors: [String: (arAnchor: ARAnchor, entity: AnchorEntity)] = [:]
  private var placedCardEntities: [AnchorEntity] = []
  private var mappingJob: MappingJob?
  private var relocalization: RelocalizationTarget?
  // initialWorldMap 付きでセッションを走らせているか
  private var isRunningWithWorldMap = false
  // WorldMapのアンカーが現実世界の景色と照合されたか（未照合のまま今いる場所に出すのを防止）
  private var hasRelocalizedToWorldMap = false
  private var didObserveRelocalizingState = false
  // 照合完了の候補になった時刻。暗い・トラッキングが不安定な間は確定させず、
  // 明るさが足りて normal が relocalizationConfirmDuration 続いたら確定する（暗所での誤照合で床下に出るのを防ぐ）
  private var relocalizationCandidateSince: Date?
  private static let relocalizationConfirmDuration: TimeInterval = 0.6

  // MARK: 明るさの見張り
  // ARKit の環境光推定（ルーメン。1000 がふつうの室内）。暗いと特徴点が減って照合がずれやすい
  private var isEnvironmentTooDark = false
  private var latestAmbientIntensity: CGFloat = -1
  private var latestFeaturePointCount = -1
  private static let darkEnterIntensity: CGFloat = 250
  private static let darkExitIntensity: CGFloat = 400
  private static let minFeaturePointsForConfirm = 60
  private var isShowingLowLightGuide = false

  // 端末の回転速度（ジャイロ、rad/s）。座標の飛びと「端末を実際に振った」を見分ける
  private var latestGyroRate: Double = 0

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
    // 照合で届いた ARAnchor そのものに付けた RealityKit のアンカー。
    // ARKit が座標を地図の座標に切り替えても、ARAnchor ごと正しい場所に付いていく
    let base: AnchorEntity
    // カードを乗せている入れ物（base の子）。位置・向きはワールド座標で決め、
    // 「ARAnchor の変換の逆 × 決めた変換」を base からの相対の変換として入れる（placeHolder）
    let holder: Entity
    // 最後に分かった ARAnchor の変換（ワールド座標）
    var anchorTransform: simd_float4x4
    // 入れ物のワールド座標での位置・向き（ARAnchor の位置へ毎フレーム滑らかに寄せる）
    var worldPosition: SIMD3<Float>
    var worldRotation: simd_quatf
    // 追いかける ARAnchor（照合後も ARKit が位置を細かく直し続ける）
    let anchorIdentifier: UUID
    // アンカーの位置が落ち着いたか。落ち着くまではカードを出さない（出てから跳ねるのを防ぐ）
    var isSettled = false
    var lastAnchorPosition: SIMD3<Float>?
    var stableSince: Date?
    // 初めて画面の中で現れたか（見つけた演出は 1 回だけ。それまでは画面に入るのを待つ）
    var hasMaterialized = false
    // 現れる途中の大きさ・位置の変化を終えたか（終えたら毎フレーム書き換えない＝タップのふくらみを邪魔しない）
    var isTransformAtRest = false
    // カードが現れた瞬間の向き（見ている人の方）で固定する（以後は毎フレーム向きを追いかけない＝回り続けない）
    var lockedRotation: simd_quatf?
    // 床より下に出てしまうときに持ち上げる量（m）。上にだけ補正する
    var heightOffset: Float = 0
    var lastFloorCheckAt = Date.distantPast
  }
  // カードの高さの半分（m）。床に置いたカードは床 + 0.15m に出す
  private static let cardHalfHeight: Float = 0.12
  private static let floorClearance: Float = 0.15
  // 地面が見つからないとき、カメラからこれより下は床下とみなす（スマホは床から 1〜1.6m くらいで構える）
  private static let maxDropBelowCamera: Float = 1.9
  private static let fallbackDropBelowCamera: Float = 1.2
  // アンカーの位置がこの距離（m）以内の揺れに収まっていれば「落ち着いた」とみなす
  private static let anchorSettleTolerance: Float = 0.015
  // その状態がこの時間続いたらカードを出す
  private static let anchorSettleDuration: TimeInterval = 0.5
  // 見つけたカードが浮かび上がってくる距離（m）
  private static let revealRiseDistance: Float = 0.05
  private var revealCards: [RevealCard] = []
  private static let revealGlowSize: Float = 0.6
  // 隠れている間の光の濃さ（別の部屋にメッセージがあることのヒント。くっきりは見せない）
  private static let occludedGlowOpacity: Float = 0.35
  // 見えるかどうかを調べる間隔（毎フレームは重い）
  private static let occlusionCheckInterval: TimeInterval = 0.25
  // カード自身が乗っている壁・床を「間にある物」と数えないための余白（m）
  private static let occlusionMargin: Float = 0.45
  private var lastRevealFrameAt: Date?
  private var lastOcclusionCheckAt = Date.distantPast

  // MARK: 座標の飛び（照合の成功など）の打ち消し
  // 地図との照合に成功した瞬間、ARKit は AR 座標そのものを記録したときの座標へ切り替える（カメラの位置・向きの値が 1 フレームで飛ぶ）。
  // 自前でワールド座標に置いているもの（北の向きとその測定値）は、そのままだと前の座標のまま残り、
  // なめらかに寄せる処理のせいで数秒かけて回り込む（「空間が斜めにくるくる回る」）。
  // 1 フレームでの飛びを測り、同じだけ動かして、見た目は止まったままにする
  private var lastCameraTransform: simd_float4x4?
  private var lastCameraTimestamp: TimeInterval = 0
  // この量を超えて 1 フレームで動いたら、端末が動いたのではなく座標が切り替わったとみなす
  private static let worldJumpTranslation: Float = 0.25
  private static let worldJumpRotation: Float = 12 * .pi / 180
  // デバッグ表示用：最後に打ち消した飛び
  private var debugLastWorldJump: String?
  // 隠れたカードの光の見かけの大きさの上限：カメラからの距離 1m あたりの幅（0.5 ≒ 画角の 1/3 くらい）
  private static let glowMaxApparentSize: Float = 0.5
  // 光にこの距離（m）まで近づくと見えなくなり、glowFadeEnd まで離れると元の濃さに戻る
  private static let glowFadeStart: Float = 0.8
  private static let glowFadeEnd: Float = 2.5

  // 近づくほど薄くする係数（0〜1）
  private static func glowNearFade(_ distance: Float) -> Float {
    return min(max((distance - glowFadeStart) / (glowFadeEnd - glowFadeStart), 0), 1)
  }
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
  // この精度（度）より悪いと北の測定値に使わない
  private static let headingAccuracyUsable: Double = 25
  // CMAttitude.rotationMatrix の向き（基準座標→端末座標か）を、重力の向きから判定してキャッシュする
  private var motionMatrixIsReferenceToDevice: Bool?
  // 光（置いたときの粒・隠れたカードの光）は 1m 四方の板に、ふちが透明になる光の絵を貼って拡大する
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

  // 置いた・見つけたときに広がる光の輪（中が抜けた輪の絵）
  private lazy var haloMaterial: UnlitMaterial = {
    var material = UnlitMaterial()
    material.blending = .transparent(opacity: .init(scale: 1.0))
    if let cgImage = Self.haloRingImage(),
       let texture = try? TextureResource.generate(from: cgImage, options: .init(semantic: .color)) {
      material.color = .init(tint: .white, texture: .init(texture))
    }
    return material
  }()

  // 置いた・見つけたときの演出（カードの動き・光の輪・光の粒）。毎フレーム進める
  private struct Effect {
    let entity: Entity
    let start: Date
    let delay: TimeInterval
    let duration: TimeInterval
    // 終わったらエンティティを消すか（光の輪・粒は消す。カードは残す）
    let removesWhenDone: Bool
    // 進み具合（0〜1）を受け取って見た目を変える
    let update: (Entity, Float) -> Void
  }
  private var effects: [Effect] = []
  private lazy var softHaptic = UIImpactFeedbackGenerator(style: .soft)
  private var lastHapticAt = Date.distantPast

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
    arView.scene.addAnchor(previewAnchor)
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

  // AR の座標が切り替わった（照合の成功など）あとは、前の座標で作ったワールドのアンカーが同じ場所に付いていかないことがあるので、
  // 配置プレビューのアンカーを今の座標で作り直す（照合カードと同じずれを、プレビューで起こさない）
  private func resetPreviewAnchor() {
    let fresh = AnchorEntity(world: .zero)
    for child in Array(previewAnchor.children) {
      fresh.addChild(child)
    }
    arView.scene.removeAnchor(previewAnchor)
    arView.scene.addAnchor(fresh)
    fresh.isEnabled = false
    previewAnchor = fresh
    lastValidPreviewPosition = nil
    lastValidPreviewOrientation = nil
  }

  private func handlePreviewActiveChanged() {
    if isPreviewActive {
      lastValidPreviewPosition = nil
      lastValidPreviewOrientation = nil
      updateGhostCardTexture()
    } else {
      previewAnchor.isEnabled = false
      lastTapLocation = nil
      lastValidPreviewPosition = nil
      lastValidPreviewOrientation = nil
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
      self?.compensateWorldJumpIfNeeded()
      self?.updateLightCondition()
      self?.confirmRelocalizationIfReady()
      self?.updatePreview()
      self?.checkWorldMappingProgress()
      self?.checkMapGrowth()
      self?.emitDebugInfoIfNeeded()
      self?.cycleRelocalizationSnapshot()
      self?.updateCardReveal()
      self?.updateEffects()
    }
  }

  // 置く場所（平面）がこれより遠いとき、または見つからないときは、地面ではなくカメラの真正面の空中に置く。
  // 外の広い場所で、遠くの地面に小さく置かれてしまわないように
  private static let floatingPlacementThreshold: Float = 4.0
  // 行ったり来たりしないよう、空中から地面に戻すのはこの距離より近くなってから
  private static let floatingPlacementReturnDistance: Float = 3.5
  // 空中に置くときの、カメラからの距離
  private static let floatingPlacementDistance: Float = 1.0
  private var isFloatingPlacement = false

  private func updatePreview() {
    guard isPreviewActive else {
      previewAnchor.isEnabled = false
      isFloatingPlacement = false
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

    guard let frame = arView.session.currentFrame else {
      previewAnchor.isEnabled = false
      return
    }
    let cameraTransform = frame.camera.transform

    // トラッキングが不安定（激しく動かした直後や特徴点不足）な間は、直前の安定位置をホールドして瞬間移動を防ぐ
    if case .limited(let reason) = frame.camera.trackingState,
       reason == .excessiveMotion || reason == .insufficientFeatures,
       lastValidPreviewPosition != nil {
      return
    }

    let cameraPosition = SIMD3<Float>(
      cameraTransform.columns.3.x,
      cameraTransform.columns.3.y,
      cameraTransform.columns.3.z
    )

    let hitPos = hits.first.map {
      SIMD3<Float>($0.worldTransform.columns.3.x, $0.worldTransform.columns.3.y, $0.worldTransform.columns.3.z)
    }
    let hitDistance = hitPos.map { simd_distance($0, cameraPosition) } ?? .infinity
    isFloatingPlacement = isFloatingPlacement
      ? hitDistance > Self.floatingPlacementReturnDistance
      : hitDistance > Self.floatingPlacementThreshold

    previewAnchor.isEnabled = true

    let isFirstPlacement = lastValidPreviewPosition == nil || simd_length(previewAnchor.position) < 0.001

    guard !isFloatingPlacement, let hit = hits.first, let hitPos else {
      // 空中：カメラの真正面に、カメラの方を向けて浮かべる（接地リングは出さない）
      let forward = -SIMD3<Float>(cameraTransform.columns.2.x, cameraTransform.columns.2.y, cameraTransform.columns.2.z)
      let targetPos = cameraPosition + simd_normalize(forward) * Self.floatingPlacementDistance
      if isFirstPlacement {
        previewAnchor.position = targetPos
      } else {
        // 距離にかかわらず常に滑らかに補間し、瞬間移動を完全に禁止
        previewAnchor.position = simd_mix(previewAnchor.position, targetPos, SIMD3<Float>(repeating: 0.22))
      }
      reticleEntity?.isEnabled = false
      if let ghost = ghostCardEntity {
        ghost.position = simd_mix(ghost.position, .zero, SIMD3<Float>(repeating: 0.25))
      }
      faceGhostCardToCamera(cameraPosition, smooth: !isFirstPlacement)
      return
    }

    reticleEntity?.isEnabled = true
    if isFirstPlacement {
      previewAnchor.position = hitPos
    } else {
      // 平面が切り替わっても、ステップ移動（瞬間移動）せず滑らかに追従
      previewAnchor.position = simd_mix(previewAnchor.position, hitPos, SIMD3<Float>(repeating: 0.24))
    }

    let normalY = hit.worldTransform.columns.1.y
    let isHorizontal = abs(normalY) > 0.5

    if isHorizontal {
      reticleEntity?.orientation = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(1, 0, 0))
      if let ghost = ghostCardEntity {
        let targetOffset = SIMD3<Float>(0, 0.15, 0)
        ghost.position = isFirstPlacement ? targetOffset : simd_mix(ghost.position, targetOffset, SIMD3<Float>(repeating: 0.25))
      }
    } else {
      let normal = SIMD3<Float>(
        hit.worldTransform.columns.1.x,
        hit.worldTransform.columns.1.y,
        hit.worldTransform.columns.1.z
      )
      reticleEntity?.orientation = simd_quatf(angle: 0, axis: SIMD3<Float>(1, 0, 0))
      if let ghost = ghostCardEntity {
        let targetOffset = normal * 0.05
        ghost.position = isFirstPlacement ? targetOffset : simd_mix(ghost.position, targetOffset, SIMD3<Float>(repeating: 0.25))
      }
    }

    faceGhostCardToCamera(cameraPosition, smooth: !isFirstPlacement)
  }

  // プレビューのカードをカメラの方に向け、「ここに置く」で置く位置・向きとして覚えておく
  private func faceGhostCardToCamera(_ cameraPosition: SIMD3<Float>, smooth: Bool = true) {
    guard let ghost = ghostCardEntity else { return }
    let entityWorldPos = previewAnchor.position + ghost.position
    // 左右の向きだけカメラに合わせ、カードは地面に対してまっすぐ立てる（置いたあと・照合で出したときと同じ姿勢）
    let toCamera = cameraPosition - entityWorldPos
    let targetRot = simd_quatf(angle: atan2(toCamera.x, toCamera.z), axis: SIMD3<Float>(0, 1, 0))

    if smooth, let prevRot = lastValidPreviewOrientation {
      ghost.setOrientation(simd_slerp(prevRot, targetRot, 0.28), relativeTo: nil)
    } else {
      ghost.setOrientation(targetRot, relativeTo: nil)
    }

    // プレビューカードの最新ワールド位置・回転を保存
    self.lastValidPreviewPosition = entityWorldPos
    self.lastValidPreviewOrientation = ghost.orientation(relativeTo: nil)
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
    guard let notice else {
      // JS側で notice がクリアされた（タブ切り替え等）場合は、表示中のお知らせを即座に消す
      if let pending = noticeEndWorkItem {
        pending.cancel()
        noticeEndWorkItem = nil
        if let guide = persistentGuide {
          guideHUD.show(guide)
        } else {
          guideHUD.hide()
          coachingOverlay.activatesAutomatically = true
        }
      }
      return
    }
    guard let id = (notice["id"] as? NSNumber)?.doubleValue, id != lastNoticeId,
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
    // カードの長押しで、通報・ブロックのメニュー
    let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
    longPress.minimumPressDuration = 0.5
    arView.addGestureRecognizer(longPress)
  }

  @objc
  private func handleLongPress(_ recognizer: UILongPressGestureRecognizer) {
    guard recognizer.state == .began, !isPreviewActive else { return }
    let location = recognizer.location(in: arView)
    guard let card = revealedCard(at: location) else { return }
    pulse(card.card)
    onCardLongPressed?(["postId": card.postId])
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
    onScreenTapped?(["x": location.x, "y": location.y])
  }

  // 照合で出したカードのうち、隠れずに見えているもの（タップで拾える）
  private func revealedCard(at location: CGPoint) -> RevealCard? {
    guard let hit = arView.entity(at: location) else { return nil }
    return revealCards.first { $0.reveal >= 0.5 && $0.card === hit && !hiddenPosts.contains($0.postId) }
  }

  // MARK: - 置いた・見つけたときの演出（Calm：音は出さず、光と小さな振動だけ）

  private func runEffect(
    _ entity: Entity,
    delay: TimeInterval = 0,
    duration: TimeInterval,
    removesWhenDone: Bool = true,
    update: @escaping (Entity, Float) -> Void
  ) {
    effects.append(Effect(
      entity: entity, start: Date(), delay: delay, duration: duration, removesWhenDone: removesWhenDone, update: update))
  }

  private func updateEffects() {
    guard !effects.isEmpty else { return }
    let now = Date()
    effects.removeAll { effect in
      // カードごと消えた（セッションのやり直しなど）ときは、演出も終わり
      guard effect.entity.parent != nil else { return true }
      let elapsed = now.timeIntervalSince(effect.start) - effect.delay
      if elapsed < 0 {
        if effect.removesWhenDone { effect.entity.isEnabled = false }
        return false
      }
      effect.entity.isEnabled = true
      let progress = Float(min(elapsed / effect.duration, 1))
      effect.update(effect.entity, progress)
      guard progress >= 1 else { return false }
      if effect.removesWhenDone { effect.entity.removeFromParent() }
      return true
    }
  }

  private static func easeOutCubic(_ t: Float) -> Float { 1 - pow(1 - t, 3) }

  private func playHaptic(intensity: CGFloat) {
    let now = Date()
    // いくつも続けて見つかったときに震えっぱなしにならないよう、間をあける
    guard now.timeIntervalSince(lastHapticAt) > 0.6 else { return }
    lastHapticAt = now
    softHaptic.impactOccurred(intensity: intensity)
  }

  // カードの後ろから、光の輪がふわっと広がって消える
  private func spawnHalo(in holder: Entity, delay: TimeInterval, from startSize: Float, to endSize: Float, duration: TimeInterval) {
    let halo = ModelEntity(mesh: presenceMesh, materials: [haloMaterial])
    // カードの面と同じ向き（カードの少し後ろ）。カードからはみ出した輪だけが見える
    halo.position = SIMD3<Float>(0, 0, -0.004)
    halo.scale = SIMD3<Float>(repeating: startSize)
    halo.isEnabled = false
    holder.addChild(halo)
    runEffect(halo, delay: delay, duration: duration) { entity, p in
      let k = Self.easeOutCubic(p)
      entity.scale = SIMD3<Float>(repeating: startSize + (endSize - startSize) * k)
      Self.setOpacity(0.9 * (1 - k), of: entity)
    }
  }

  // カードのまわりから、小さな光の粒がゆっくり立ちのぼって消える
  private func spawnSparkles(in holder: Entity, count: Int, delay: TimeInterval) {
    for i in 0..<count {
      let sparkle = ModelEntity(mesh: presenceMesh, materials: [presenceMaterial])
      // カードのふち（幅 0.38 × 高さ 0.24）あたりに散らす
      let angle = Float(i) / Float(count) * 2 * .pi + Float.random(in: -0.3...0.3)
      let start = SIMD3<Float>(cos(angle) * 0.2, sin(angle) * 0.13, 0.01)
      let drift = SIMD3<Float>(cos(angle) * 0.03, Float.random(in: 0.08...0.14), 0.02)
      let size = Float.random(in: 0.022...0.04)
      sparkle.position = start
      sparkle.scale = .zero
      sparkle.isEnabled = false
      holder.addChild(sparkle)
      runEffect(sparkle, delay: delay + Double.random(in: 0...0.25), duration: Double.random(in: 1.0...1.5)) { entity, p in
        entity.position = start + drift * Self.easeOutCubic(p)
        // ふくらんでから、しぼんで消える（透明度を変えられない iOS でも消えるように大きさで）
        let swell = sin(p * .pi)
        entity.scale = SIMD3<Float>(repeating: size * swell)
        Self.setOpacity(swell, of: entity)
      }
    }
  }

  // 置いたとき：半透明のプレビューのまま少し上から、紙をそっと置くように降りて実体になる。着いた瞬間に光の輪と粒
  private func playPlacementEffect(card: ModelEntity, holder: Entity) {
    let lift: Float = 0.03
    let landing: TimeInterval = 0.45
    card.position = SIMD3<Float>(0, lift, 0)
    card.scale = SIMD3<Float>(repeating: 0.97)
    Self.setOpacity(0.6, of: card)
    runEffect(card, duration: landing, removesWhenDone: false) { entity, p in
      let k = Self.easeOutCubic(p)
      entity.position = SIMD3<Float>(0, lift * (1 - k), 0)
      entity.scale = SIMD3<Float>(repeating: 0.97 + 0.03 * k)
      Self.setOpacity(0.6 + 0.4 * k, of: entity)
    }
    spawnHalo(in: holder, delay: landing * 0.85, from: 0.3, to: 0.75, duration: 0.9)
    spawnSparkles(in: holder, count: 5, delay: landing * 0.85)
    DispatchQueue.main.asyncAfter(deadline: .now() + landing * 0.85) { [weak self] in
      self?.playHaptic(intensity: 0.8)
    }
  }

  // 見つけたとき：光が集まってカードになる（カードの動きは updateCardReveal）。ゆっくり広がる輪と、立ちのぼる粒
  private func playDiscoveryEffect(holder: Entity) {
    spawnHalo(in: holder, delay: 0.1, from: 0.2, to: 0.9, duration: 1.4)
    spawnSparkles(in: holder, count: 8, delay: 0.15)
    playHaptic(intensity: 0.5)
  }

  private static func haloRingImage() -> CGImage? {
    let size = CGSize(width: 256, height: 256)
    let image = UIGraphicsImageRenderer(size: size).image { context in
      let ring = UIColor(red: 0.62, green: 0.95, blue: 0.8, alpha: 0.95)
      let colors = [
        ring.withAlphaComponent(0).cgColor,
        ring.withAlphaComponent(0).cgColor,
        ring.cgColor,
        UIColor(red: 0.94, green: 1, blue: 0.97, alpha: 1).cgColor,
        ring.withAlphaComponent(0).cgColor,
      ] as CFArray
      guard let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.6, 0.8, 0.86, 1]
      ) else { return }
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      context.cgContext.drawRadialGradient(
        gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: size.width / 2, options: []
      )
    }
    return image.cgImage
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
      // カメラの方を向かせる。ただし左右の向きだけ（スマホを上下に向けて置いても、カードは傾けずまっすぐ立てる）
      let toCamera = cameraPosition - position
      orientation = simd_quatf(angle: atan2(toCamera.x, toCamera.z), axis: SIMD3<Float>(0, 1, 0))
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
    let cardEntity = makeCardEntity(
      title: currentCardTitle,
      description: currentCardDescription,
      handle: currentCardIcon,
      color: currentCardColor,
      tags: currentCardTags
    )
    anchorEntity.addChild(cardEntity)
    arView.scene.addAnchor(anchorEntity)
    playPlacementEffect(card: cardEntity, holder: anchorEntity)

    pendingCardAnchors[anchorId] = (arAnchor, anchorEntity)
    placedCardEntities.append(anchorEntity)

    var eventData: [String: Any] = [
      "cardTitle": currentCardTitle,
      "cardDescription": currentCardDescription,
      "cardColor": currentCardColor,
      "cardIcon": currentCardIcon,
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
      let authorDisplay = name.isEmpty ? "ゲスト" : name
      let avatarRect = CGRect(x: 52, y: 372, width: 50, height: 50)
      let avatarPath = UIBezierPath(ovalIn: avatarRect)
      // アイコンは、選んだ動物の絵の「オレンジ・黄色」を、投稿者が選んだ色に変えたもの（handle が `animal:cat:#RRGGBB`。
      // 絵は Images.xcassets の AnimalCat など、色変えは AvatarRecolor）。絵はクリーム色のキャンバスごと丸に収め、
      // 丸の色もキャンバスと同じにする（src/config/avatarColors.ts の AVATAR_CANVAS_COLOR）。
      // 前の投稿（`color:#RRGGBB`）は色の丸に名前の頭文字、もっと古い投稿（絵のアイコンのキーなど）は淡い緑の丸
      var animalImage: UIImage?
      var animalKey = ""
      // アタッチメントと、その色（色を変えていなければ nil）
      var attachmentItems: [(key: String, hex: String?)] = []
      var chosenAvatarColor: UIColor?
      var avatarBackground: UIColor?
      if handle.hasPrefix("animal:") {
        // animal:cat:#RRGGBB[:アイテム[:背景色]]。アイテムは ribbon_01#3B82F6+hat_02（色を変えたものは後ろに色）。
        // アイテムが無くて背景色だけのときは animal:cat:#RRGGBB::#FDE2E4（空の区切りも残して読む）
        let parts = handle.split(separator: ":", omittingEmptySubsequences: false)
        if parts.count >= 3, AvatarRecolorCore.parseHex(String(parts[2])) != nil {
          let hex = String(parts[2])
          animalKey = String(parts[1])
          if parts.count >= 4 {
            attachmentItems = parts[3].split(separator: "+").map { part in
              let pieces = part.split(separator: "#", maxSplits: 1)
              return (String(pieces[0]), pieces.count > 1 ? "#" + pieces[1] : nil)
            }
          }
          animalImage = AvatarRecolor.image(animal: animalKey, hex: hex)
          chosenAvatarColor = parseHexColor(hex)
          // 背景色（キャラクターの絵は背景を抜いてあるので、丸に敷く）。無ければ初期のクリーム（AVATAR_CANVAS_COLOR）
          if parts.count >= 5, AvatarRecolorCore.parseHex(String(parts[4])) != nil {
            avatarBackground = parseHexColor(String(parts[4]))
          } else {
            avatarBackground = UIColor(red: 0xFA / 255.0, green: 0xF7 / 255.0, blue: 0xEF / 255.0, alpha: 1)
          }
        }
      } else if handle.hasPrefix("color:#") {
        chosenAvatarColor = parseHexColor(String(handle.dropFirst("color:".count)))
      }
      (avatarBackground ?? chosenAvatarColor ?? UIColor(red: 52/255.0, green: 211/255.0, blue: 153/255.0, alpha: 0.35)).setFill()
      avatarPath.fill()

      let iconColor = chosenAvatarColor != nil
        ? UIColor.white
        : UIColor(red: 5/255.0, green: 150/255.0, blue: 105/255.0, alpha: 1.0)
      // 動物のアイコンなら動物を、色の丸のときは頭文字を描く
      var drewIcon = false
      if let animalImage {
        // 縦横比を保って丸いっぱいに収める（キャンバスの四隅は丸の外なので切れる）
        let box = avatarRect
        let fit = min(box.width / animalImage.size.width, box.height / animalImage.size.height)
        let drawSize = CGSize(width: animalImage.size.width * fit, height: animalImage.size.height * fit)
        cgContext.saveGState()
        avatarPath.addClip()
        let animalRect = CGRect(x: box.midX - drawSize.width / 2, y: box.midY - drawSize.height / 2,
                                width: drawSize.width, height: drawSize.height)
        animalImage.draw(in: animalRect)
        AvatarAttachments.draw(attachmentItems, animal: animalKey, in: animalRect, context: cgContext)
        cgContext.restoreGState()
        drewIcon = true
      } else if chosenAvatarColor == nil {
        let cleanIconName = handle.replacingOccurrences(of: "@", with: "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sfMap: [String: String] = [
          "walking": "figure.walk",
          "cafe": "cup.and.saucer.fill",
          "book": "book.closed.fill",
          "art": "paintpalette.fill",
          "gourmet": "fork.knife",
          "herb": "leaf.fill",
          "history": "clock.arrow.circlepath",
          "view": "binoculars.fill",
          "footprints": "shoe.2.fill",
          "mypage": "person.fill",
          "person": "person.fill"
        ]

        if cleanIconName == "footprints", let footImg = UIImage(named: "Footprints")?.withTintColor(iconColor, renderingMode: .alwaysOriginal) {
          let pad: CGFloat = 8
          footImg.draw(in: avatarRect.insetBy(dx: pad, dy: pad))
          drewIcon = true
        } else if let sfName = sfMap[cleanIconName] ?? (UIImage(systemName: cleanIconName) != nil ? cleanIconName : nil),
                  let sfImg = UIImage(systemName: sfName)?.withTintColor(iconColor, renderingMode: .alwaysOriginal) {
          let pad: CGFloat = 8
          sfImg.draw(in: avatarRect.insetBy(dx: pad, dy: pad))
          drewIcon = true
        }
      }

      if !drewIcon {
        let avatarInitial = String(authorDisplay.prefix(1))
        let initialAttrs: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 26, weight: .bold),
          .foregroundColor: iconColor
        ]
        let initialSize = (avatarInitial as NSString).size(withAttributes: initialAttrs)
        let initialRect = CGRect(x: avatarRect.midX - initialSize.width / 2, y: avatarRect.midY - initialSize.height / 2, width: initialSize.width, height: initialSize.height)
        avatarInitial.draw(in: initialRect, withAttributes: initialAttrs)
      }

      // 8. Footer: Author Name
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

      // Top badge: "配置プレビュー"（文字の幅に合わせた丸いバッジ）
      let badgeAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 22, weight: .bold),
        .foregroundColor: emerald
      ]
      let badgeText = "配置プレビュー"
      let badgeTextSize = (badgeText as NSString).size(withAttributes: badgeAttrs)
      let badgeRect = CGRect(x: 52, y: 44, width: badgeTextSize.width + 32, height: 42)
      let badgePath = UIBezierPath(roundedRect: badgeRect, cornerRadius: 21)
      emerald.withAlphaComponent(0.18).setFill()
      badgePath.fill()
      badgeText.draw(
        at: CGPoint(x: badgeRect.minX + 16, y: badgeRect.midY - badgeTextSize.height / 2),
        withAttributes: badgeAttrs
      )

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
      let hintText = "下の「ここに置く」で決定"
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
  private static let mappingExtendingFallback: TimeInterval = 25

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
    // 置いたカードが描かれたフレームを撮るため、少しだけ待つ
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
      guard let self else { return }
      self.arView.snapshot(saveToHDR: false) { [weak self] image in
        DispatchQueue.main.async {
          guard let self else { return }
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
          if hadNone, self.isRunningWithWorldMap, self.relocalization?.didFindAnchor == false, !self.isShowingLowLightGuide {
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
    revealCards.forEach { arView.scene.removeAnchor($0.base) }
    revealCards.removeAll()
    mapGrowth = nil
    northOffset = nil
    pendingCardAnchors.removeAll()
    mappingJob = nil

    let config = makeTrackingConfiguration()
    config.initialWorldMap = worldMap
    arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    isRunningWithWorldMap = true
    hasRelocalizedToWorldMap = false
    didObserveRelocalizingState = false
    relocalizationCandidateSince = nil

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
      self.relocalization = nil
      self.isRunningWithWorldMap = false
      self.hasRelocalizedToWorldMap = false
      self.didObserveRelocalizingState = false
      self.relocalizationCandidateSince = nil
      self.setLowLightGuide(false)
      self.mapGrowth = nil
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
      hasRelocalizedToWorldMap = false
      didObserveRelocalizingState = false
      relocalizationCandidateSince = nil
      mapGrowth = nil
      northOffset = nil
      pendingRelocalizedAnchors.removeAll()
      arView.session.run(makeTrackingConfiguration(), options: [.resetTracking, .removeExistingAnchors])
    }
    setLowLightGuide(false)
    emitRelocalizationStatus("cancelled", postId: target.postId)
  }

  // 地図に入っていた名前付きアンカーがここに届く。
  // 注意: initialWorldMap 付きセッション開始時に届くアンカーは、過去のセッションの原点からの相対座標のままであり、
  // 現実世界の景色と照合（リロカリゼーション）が完了するまで今いる空間の位置とは一致しない。
  // 照合前にカードを画面に出すと「以前の投稿が今いる場所に突然現れる」バグの原因になるため、
  // 照合完了（didUpdate通知または.relocalizing経由の正常復帰）までは絶対に実体化せず保留する。
  func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
    let postAnchors = anchors.filter { $0.name?.hasPrefix("post:") == true }
    if isRunningWithWorldMap {
      for anchor in postAnchors {
        debugAnchorArrivals.append((String(anchor.name!.dropFirst("post:".count)), Date()))
      }
    }
    guard relocalization != nil, !postAnchors.isEmpty else { return }

    if isRunningWithWorldMap {
      // 照合が未完了の場合は保留リストに入れ、この時点では一切実体化しない
      if !hasRelocalizedToWorldMap {
        pendingRelocalizedAnchors.append(contentsOf: postAnchors)
        return
      }
    }
    presentRelocalizedAnchors(postAnchors)
  }

  // ARKitがWorldMapとの照合（リロカリゼーション）に成功すると、アンカーの座標が現実世界に合わせて更新される。
  // ただし照合前の細かい補正でも届くことがあるので、トラッキングが normal のときだけ照合完了の手がかりにする
  func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
    guard isRunningWithWorldMap, relocalization != nil, !hasRelocalizedToWorldMap else { return }
    guard anchors.contains(where: { $0.name?.hasPrefix("post:") == true }),
          Self.isNormal(session.currentFrame?.camera.trackingState) else { return }
    if relocalizationCandidateSince == nil { relocalizationCandidateSince = Date() }
  }

  // 照合完了の候補を、明るさとトラッキングが安定してから確定する
  private func confirmRelocalizationIfReady() {
    guard isRunningWithWorldMap, !hasRelocalizedToWorldMap, let since = relocalizationCandidateSince else { return }
    guard Self.isNormal(arView.session.currentFrame?.camera.trackingState) else {
      relocalizationCandidateSince = nil
      return
    }
    // 暗い・特徴点が少ない間は、ARKit が normal と言っても確定しない（誤照合で床下・空中に出るため）
    // 特徴点の少なさは、薄暗いときだけ見る（明るい無地の壁の前で永遠に確定しないのを避ける）
    let isDim = latestAmbientIntensity >= 0 && latestAmbientIntensity < Self.darkExitIntensity * 1.5
    let tooFewFeatures = latestFeaturePointCount >= 0 && latestFeaturePointCount < Self.minFeaturePointsForConfirm
    guard !isEnvironmentTooDark, !(isDim && tooFewFeatures) else {
      relocalizationCandidateSince = Date()
      return
    }
    guard Date().timeIntervalSince(since) >= Self.relocalizationConfirmDuration else { return }
    markRelocalized()
  }

  // 照合完了として、保留していたアンカーを最新の位置でカードにする
  private func markRelocalized() {
    hasRelocalizedToWorldMap = true
    resetPreviewAnchor()
    guard !pendingRelocalizedAnchors.isEmpty else { return }
    let pending = pendingRelocalizedAnchors
    pendingRelocalizedAnchors.removeAll()
    presentRelocalizedAnchors(pending)
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
    // 照合成功前にはカードを絶対に出さない（未照合アンカーが今いる場所に出現するバグを徹底防止）
    guard hasRelocalizedToWorldMap else { return }
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
      // カードは照合で届いた ARAnchor に付ける（AnchorEntity(anchor:)）。ARKit は座標を地図の座標に切り替えるとき
      // ARAnchor も一緒に直すので、カードも正しい場所に付いていく。
      // （以前は起動時に作った原点のアンカーの子にしていたが、照合の瞬間の座標の切り替えに付いていかず、
      //   見つけた判定の場所とは全然違う所に描かれていた）
      // 向きはアンカーの向きを使わず、地面に対してまっすぐ立てて見ている人の方へ向ける（現れた瞬間に固定する）。
      // アンカーの向きを使うと、置いた人とは別の方向から来たとき横を向いて見え、古い投稿では横倒しになることがある。
      // 位置・向きはワールド座標で決め、アンカーの変換を打ち消して入れる（setOrientation(relativeTo: nil) は使わない。
      // アンカーの変換と二重にかかって 90° や 45° 斜めに見えていた）
      let position = Self.translation(of: anchor.transform)
      let cameraPosition = arView.session.currentFrame.map { Self.translation(of: $0.camera.transform) } ?? position
      let base = AnchorEntity(anchor: anchor)
      arView.scene.addAnchor(base)
      let holder = Entity()
      base.addChild(holder)
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
      holder.addChild(cardEntity)
      holder.addChild(glowEntity)
      revealCards.append(RevealCard(
        postId: postId,
        card: cardEntity,
        glow: glowEntity,
        base: base,
        holder: holder,
        anchorTransform: anchor.transform,
        worldPosition: position,
        worldRotation: Self.yawFacing(from: position, toward: cameraPosition),
        anchorIdentifier: anchor.identifier
      ))
      Self.placeHolder(&revealCards[revealCards.count - 1])
      emitRelocalizationStatus("found", postId: postId)
    }
    relocalization = target
  }

  // 位置合わせ自体はできたのにカードのアンカーが来ない場合を知らせる（原因の切り分け用）
  func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    if isRunningWithWorldMap {
      if case .limited(let reason) = camera.trackingState, reason == .relocalizing {
        didObserveRelocalizingState = true
      }
      if case .normal = camera.trackingState, debugTrackingNormalAt == nil {
        debugTrackingNormalAt = Date()
      }

      // .relocalizing を経て .normal に戻ったら照合完了。
      // 保留中のアンカーが無くてもフラグは立てる（ARKit が normal の後でアンカーを渡してくる場合に、didAdd ですぐ出せるように）
      if case .normal = camera.trackingState, didObserveRelocalizingState, !hasRelocalizedToWorldMap {
        if relocalizationCandidateSince == nil { relocalizationCandidateSince = Date() }
      } else if !Self.isNormal(camera.trackingState) {
        relocalizationCandidateSince = nil
      }
    }
    guard isRunningWithWorldMap, case .normal = camera.trackingState,
          let target = relocalization, !target.didReportRelocalized else { return }
    relocalization?.didReportRelocalized = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      // 暗くて照合をまだ確定していない間は「アンカーが無い」とは言わない（暗い案内を出している）
      guard let self, let current = self.relocalization, current.postId == target.postId,
            !current.didFindAnchor, self.hasRelocalizedToWorldMap else { return }
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

  // MARK: - 北の向き
  // コンパスで AR 座標の「北」を求める。置いた言葉の緯度・経度（カメラからのずれを東・北に直す）に使う

  private func startHeadingUpdates() {
    guard motionManager.isDeviceMotionAvailable else { return }
    let frames = CMMotionManager.availableAttitudeReferenceFrames()
    let reference: CMAttitudeReferenceFrame =
      frames.contains(.xTrueNorthZVertical) ? .xTrueNorthZVertical : .xMagneticNorthZVertical
    guard frames.contains(reference) else { return }
    motionManager.deviceMotionUpdateInterval = 1.0 / 30
    motionManager.startDeviceMotionUpdates(using: reference, to: .main) { [weak self] motion, _ in
      guard let self, let motion else { return }
      let r = motion.rotationRate
      self.latestGyroRate = (r.x * r.x + r.y * r.y + r.z * r.z).squareRoot()
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
  }

  // iOS 標準の補正画面は出さない
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

  private func compensateWorldJumpIfNeeded() {
    guard let frame = arView.session.currentFrame else { return }
    let current = frame.camera.transform
    defer {
      lastCameraTransform = current
      lastCameraTimestamp = frame.timestamp
    }
    // 同じフレームを 2 回見たとき・間が空いたとき（別のタブから戻った等）は比べない
    guard let previous = lastCameraTransform, frame.timestamp > lastCameraTimestamp,
          frame.timestamp - lastCameraTimestamp < 0.1 else { return }

    let moved = simd_distance(Self.translation(of: current), Self.translation(of: previous))
    let turned = Self.angleBetween(simd_quatf(current), simd_quatf(previous))
    // 端末を実際に振った分（ジャイロ × 経過時間）は座標の飛びではない。
    // これを除かないと、フレームが落ちたときに素早く見回すだけで「飛び」と誤判定され、
    // 空間のもの全部が端末の回転と一緒に回される（タグが回り込み、カードが横回転し続ける原因）
    let gap = Float(frame.timestamp - lastCameraTimestamp)
    let deviceTurn = Float(latestGyroRate) * gap * 1.5
    let isRotationJump = turned > Self.worldJumpRotation + deviceTurn
    guard moved > Self.worldJumpTranslation || isRotationJump else { return }

    // 前の座標 → 今の座標への変換（端末はこの 1 フレームでほぼ動いていない前提）
    let delta = current * previous.inverse
    applyWorldCorrection(delta)
    resetPreviewAnchor()
    debugLastWorldJump = String(format: "%.2fm %.0f° (%.1fs)", moved, turned * 180 / .pi, frame.timestamp)
  }

  private func applyWorldCorrection(_ delta: simd_float4x4) {
    let transformPoint = { (p: SIMD3<Float>) -> SIMD3<Float> in
      let v = delta * SIMD4<Float>(p.x, p.y, p.z, 1)
      return SIMD3<Float>(v.x, v.y, v.z)
    }

    // 北の向き：AR 座標のヨーが回った分だけ回す（測定値の平均も同じだけ回す）
    let deltaYaw = Self.yawChange(of: delta)
    let rotateNorth = { (v: SIMD2<Float>) -> SIMD2<Float> in
      SIMD2<Float>(v.x * cos(deltaYaw) - v.y * sin(deltaYaw), v.x * sin(deltaYaw) + v.y * cos(deltaYaw))
    }
    if let northOffset {
      let samples = northSamples
      self.northOffset = rotateNorth(northOffset)
      northSamples = samples.map { ($0.time, rotateNorth($0.value)) }
    }

    // 照合で出したカードは ARAnchor（ARKit が座標の切り替えに合わせて直す）を追いかけているので、ここでは動かさない。
    // 動かすと、アンカーへ戻ろうとする追従と打ち消し合って、カードが横に回り続ける
  }

  private static func translation(of m: simd_float4x4) -> SIMD3<Float> {
    SIMD3<Float>(m.columns.3.x, m.columns.3.y, m.columns.3.z)
  }

  private static func angleBetween(_ a: simd_quatf, _ b: simd_quatf) -> Float {
    let dot = min(abs(simd_dot(a.vector, b.vector)), 1)
    return 2 * acos(dot)
  }

  // 変換のうち、上から見た回転（ヨー）。arYaw と同じ向き（-Z から +X へ）
  private static func yawChange(of m: simd_float4x4) -> Float {
    let forward = -SIMD3<Float>(0, 0, 1)
    let rotated = simd_quatf(m).act(forward)
    return atan2(rotated.x, -rotated.z) - atan2(forward.x, -forward.z)
  }

  /// アンカー位置のカードが床にめり込む・床下に出るとき、持ち上げる量（m）。問題なければ 0
  private func floorLift(forAnchorAt position: SIMD3<Float>, cameraPosition: SIMD3<Float>, frame: ARFrame) -> Float {
    let cardBottom = position.y - Self.cardHalfHeight
    if let floorY = floorHeight(below: position, cameraPosition: cameraPosition, frame: frame) {
      guard cardBottom < floorY - 0.02 else { return 0 }
      return floorY + Self.floorClearance - position.y
    }
    // 床が見つからない（暗い・平面検出前）：スマホを構える高さから考えてあり得ないほど低ければ、床の上あたりに上げる
    guard position.y < cameraPosition.y - Self.maxDropBelowCamera else { return 0 }
    return (cameraPosition.y - Self.fallbackDropBelowCamera) - position.y
  }

  /// カードの真下あたりの床の高さ。床と分類された平面 → 真下への raycast で見つかる一番低い水平面、の順に探す
  private func floorHeight(below position: SIMD3<Float>, cameraPosition: SIMD3<Float>, frame: ARFrame) -> Float? {
    let horizontalPlanes = frame.anchors.compactMap { $0 as? ARPlaneAnchor }.filter { $0.alignment == .horizontal }
    // カメラより 0.5m 以上下にある平面だけ（机の上を床と取り違えにくくする）
    let candidates = horizontalPlanes
      .map { $0.transform.columns.3.y }
      .filter { $0 < cameraPosition.y - 0.5 }
    if ARPlaneAnchor.isClassificationSupported {
      let floors = horizontalPlanes
        .filter { if case .floor = $0.classification { return true } else { return false } }
        .map { $0.transform.columns.3.y }
      if let floor = floors.min() { return floor }
    }
    let origin = SIMD3<Float>(position.x, max(position.y, cameraPosition.y) + 0.1, position.z)
    let query = ARRaycastQuery(
      origin: origin,
      direction: SIMD3<Float>(0, -1, 0),
      allowing: .existingPlaneInfinite,
      alignment: .horizontal
    )
    let hits = arView.session.raycast(query)
      .map { $0.worldTransform.columns.3.y }
      .filter { $0 < cameraPosition.y - 0.5 }
    if let lowest = hits.min() { return lowest }
    return candidates.min()
  }

  /// 環境光と特徴点の数から、暗すぎて照合が信用できないかを判定し、案内を出す（行ったり来たりしないよう幅を持たせる）
  private func updateLightCondition() {
    guard let frame = arView.session.currentFrame else { return }
    if let intensity = frame.lightEstimate?.ambientIntensity {
      latestAmbientIntensity = intensity
      if isEnvironmentTooDark {
        if intensity >= Self.darkExitIntensity { isEnvironmentTooDark = false }
      } else if intensity < Self.darkEnterIntensity {
        isEnvironmentTooDark = true
      }
    }
    latestFeaturePointCount = frame.rawFeaturePoints?.points.count ?? -1

    // 照合中、または照合したカードがまだ出ていない間だけ案内する
    let isWaitingForCards = isRunningWithWorldMap && relocalization != nil
      && (!hasRelocalizedToWorldMap || revealCards.contains { !$0.isSettled })
    setLowLightGuide(isEnvironmentTooDark && isWaitingForCards)
  }

  private static let lowLightGuide = ARGuideHUDView.Guide(
    symbol: "lightbulb",
    title: "少し暗いようです",
    subtitle: "暗いと位置がずれて、言葉が床にうもれることがあります。照明をつけるか、明るい所を映してください",
    sways: false
  )

  private func setLowLightGuide(_ show: Bool) {
    guard show != isShowingLowLightGuide else { return }
    isShowingLowLightGuide = show
    if show {
      showGuide(Self.lowLightGuide)
    } else if let target = relocalization, isRunningWithWorldMap, !target.didFindAnchor {
      showGuide(relocalizationGuide(postId: target.postId))
    } else {
      hideGuide()
    }
  }

  /// 照合カードの入れ物を、ワールド座標の worldPosition・worldRotation に置く。
  /// 入れ物は ARAnchor に付いた base の子なので、アンカーの変換の逆をかけた相対の変換を入れる
  private static func placeHolder(_ item: inout RevealCard) {
    let desired = Transform(scale: .one, rotation: item.worldRotation, translation: item.worldPosition).matrix
    item.holder.transform = Transform(matrix: item.anchorTransform.inverse * desired)
  }

  /// position に立てたカードの表（+Z）を target の方へ向けた向き（左右の向きだけ。地面に対してまっすぐ）
  private static func yawFacing(from position: SIMD3<Float>, toward target: SIMD3<Float>) -> simd_quatf {
    let d = target - position
    guard d.x * d.x + d.z * d.z > 0.0001 else { return simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0)) }
    return simd_quatf(angle: atan2(d.x, d.z), axis: SIMD3<Float>(0, 1, 0))
  }

  private static func setOpacity(_ opacity: Float, of entity: Entity) {
    if #available(iOS 18.0, *) {
      entity.components.set(OpacityComponent(opacity: opacity))
    }
    // iOS 17 以前は透明度を変えられないので、大きさの変化だけで現れる
  }

  // 光の絵：真ん中がほんのり白く、ふちに向かって透明になる
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

  // 照合中、地図に入っている投稿の写真が複数あれば、近い順に 4 秒ごとに切り替えて見せる
  private func cycleRelocalizationSnapshot() {
    guard isRunningWithWorldMap, debugRelocalizationPhase == "relocalizing", !isShowingLowLightGuide,
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
    guard !revealCards.isEmpty, let frame = arView.session.currentFrame else { return }
    let cameraTransform = frame.camera.transform
    let cameraPosition = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)
    let follow = 1 - exp(-3 * dt)
    let anchorFollow = 1 - exp(-6 * dt)
    let breathing = 0.85 + 0.15 * Float(sin(now.timeIntervalSince1970 * 2 * .pi / 4))

    let shouldCheckOcclusion = now.timeIntervalSince(lastOcclusionCheckAt) >= Self.occlusionCheckInterval
    if shouldCheckOcclusion {
      lastOcclusionCheckAt = now
    }

    for index in revealCards.indices {
      var item = revealCards[index]

      // 通報した言葉・ブロックした人の言葉は、カードも光も出さない
      if hiddenPosts.contains(item.postId) {
        item.card.isEnabled = false
        item.glow.isEnabled = false
        revealCards[index] = item
        continue
      }

      // ARAnchor の最新座標へ滑らかに追従させ、照合直後の位置補正による瞬間移動・跳ねを抑止
      if let liveAnchor = frame.anchors.first(where: { $0.identifier == item.anchorIdentifier }) {
        let targetPos = SIMD3<Float>(
          liveAnchor.transform.columns.3.x,
          liveAnchor.transform.columns.3.y,
          liveAnchor.transform.columns.3.z
        )
        // 床より下に出ていないか（地面は暗いと遅れて見つかるので、しばらく調べ直す）
        if now.timeIntervalSince(item.lastFloorCheckAt) >= 1 {
          item.lastFloorCheckAt = now
          item.heightOffset = max(item.heightOffset, floorLift(forAnchorAt: targetPos, cameraPosition: cameraPosition, frame: frame))
        }
        var displayPos = targetPos
        displayPos.y += item.heightOffset
        item.anchorTransform = liveAnchor.transform

        if simd_distance(item.worldPosition, displayPos) > 0.02 {
          item.worldPosition = simd_mix(item.worldPosition, displayPos, SIMD3<Float>(repeating: anchorFollow))
        }
        // 向きは地面に対してまっすぐ（左右の向きだけ）。カードが現れるまでは見ている人の方を向け、
        // 現れた瞬間の向きで固定する（以後は追いかけない＝回り続けない）
        item.worldRotation = item.lockedRotation ?? Self.yawFacing(from: item.worldPosition, toward: cameraPosition)
        Self.placeHolder(&item)

        if !item.isSettled {
          if let prevPos = item.lastAnchorPosition,
             simd_distance(prevPos, targetPos) <= Self.anchorSettleTolerance {
            if let since = item.stableSince {
              // 暗い間は位置が信用できないので、明るくなるまでカードを出さない
              if now.timeIntervalSince(since) >= Self.anchorSettleDuration, !isEnvironmentTooDark {
                item.isSettled = true
              }
            } else {
              item.stableSince = now
            }
          } else {
            item.stableSince = now
          }
          item.lastAnchorPosition = targetPos
        }
      } else if !item.isSettled {
        // セッションからアンカーがまだ取得できない場合は経過時間でフォールバック
        if let since = item.stableSince {
          if now.timeIntervalSince(since) >= 1.5, !isEnvironmentTooDark {
            item.isSettled = true
          }
        } else {
          item.stableSince = now
        }
      }

      if shouldCheckOcclusion {
        let position = item.worldPosition
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

      // アンカー位置が安定（isSettled）するまでは光のみ表示し、安定後にカードを滑らかにフェードインさせる。
      // 初めて現れるときは、画面に映るまで待つ（見ていない所で出てしまうと「見つけた」瞬間が無くなる）
      var canShow = item.isSettled && !item.isOccluded
      if canShow && !item.hasMaterialized {
        if isInView(item.worldPosition, frame: frame) {
          item.hasMaterialized = true
          // 現れた瞬間の向き（見ている人の方）で固定する
          item.lockedRotation = item.worldRotation
          playDiscoveryEffect(holder: item.holder)
        } else {
          canShow = false
        }
      }
      let target: Float = canShow ? 1 : 0
      item.reveal += (target - item.reveal) * follow

      // 光が集まって言葉になるように：カードは少し下・少し小さい所から浮かび上がり、光は縮んでいく
      let eased = 1 - pow(1 - item.reveal, 3)
      if item.reveal < 0.99 {
        item.card.position = SIMD3<Float>(0, -Self.revealRiseDistance * (1 - eased), 0)
        item.card.scale = SIMD3<Float>(repeating: 0.86 + 0.14 * eased)
        item.isTransformAtRest = false
      } else if !item.isTransformAtRest {
        item.card.transform = .identity
        item.isTransformAtRest = true
      }

      // 隠れているカードの光も、すぐそばを通ると画面を覆うので、近づくほど薄くする
      let glowDistance = simd_distance(item.worldPosition, cameraPosition)
      let glowFade = Self.glowNearFade(glowDistance)
      item.glow.scale = SIMD3<Float>(
        repeating: min(Self.revealGlowSize, glowDistance * Self.glowMaxApparentSize) * (1 - 0.6 * eased))

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
         isInView(item.worldPosition, frame: frame) {
        item.hasBeenSeen = true
        emitRelocalizationStatus("seen", postId: item.postId)
      }

      // 光はどこから見ても丸く見えるよう、カメラの方を向かせる
      // （入れ物の向きを打ち消した、入れ物からの相対の向きで入れる）
      let toCamera = cameraPosition - item.worldPosition
      let glowYaw = simd_quatf(angle: atan2(toCamera.x, toCamera.z), axis: SIMD3<Float>(0, 1, 0))
      item.glow.orientation = item.worldRotation.inverse * glowYaw
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
      return (false, "平面\(planeHits.count)件・メッシュとも手前に無し")
    }

    // LiDAR が無い端末でのみ特徴点を補助的に使う（誤検出を防ぐため高い閾値 18個 を要求）
    let featureHits = Self.featurePointsBetween(camera: camera, direction: direction, reach: reach, distance: distance, frame: frame)
    if featureHits >= Self.occlusionFeaturePointThreshold {
      return (true, "特徴点\(featureHits)個")
    }
    return (false, "平面\(planeHits.count)件が手前に無し, 特徴点\(featureHits)個")
  }

  // この数以上の特徴点が、カメラとカードの間の円すいにあれば「間に何かある」（ノイズ誤爆防止のため18個）
  private static let occlusionFeaturePointThreshold = 18

  private static func featurePointsBetween(
    camera: SIMD3<Float>,
    direction: SIMD3<Float>,
    reach: Float,
    distance: Float,
    frame: ARFrame
  ) -> Int {
    guard let points = frame.rawFeaturePoints?.points, !points.isEmpty else { return 0 }
    // 円すいの広がり：カード中心付近の細い範囲（約 0.18m）のみを判定。最低 2°
    let halfAngle = max(atan(0.18 / distance), 2 * .pi / 180)
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
      "lastWorldJump": debugLastWorldJump ?? NSNull(),
      "headingAccuracy": latestHeadingAccuracy,
      "ambientIntensity": latestAmbientIntensity,
      "featurePoints": latestFeaturePointCount,
      "tooDark": isEnvironmentTooDark,
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
          "heightOffset": item.heightOffset,
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
      // 見つかった後もカードが暗さで出せていない間は、暗い案内を残す
      if isShowingLowLightGuide && phase == "found" {
        showGuide(Self.lowLightGuide)
      } else {
        hideGuide()
      }
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
  // 最後に届いた位置。対象の一覧が新しくなったとき、動いていなくてもすぐ判定するのに使う
  private var lastLocation: CLLocation?
  private var isRunning = false
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
      self.isRunning = true
    }
  }

  @objc(updateTargets:)
  func updateTargets(_ targets: NSArray) {
    DispatchQueue.main.async {
      self.setTargets(targets)
      // 同じ場所にいるまま新しいメッセージが置かれたときも気づけるよう、最後の位置ですぐ判定する
      if let location = self.lastLocation {
        self.notifyIfNear(location)
      }
    }
  }

  @objc
  func stop() {
    DispatchQueue.main.async {
      self.manager?.stopUpdatingLocation()
      self.manager?.allowsBackgroundLocationUpdates = false
      self.isRunning = false
    }
  }

  @objc(getHistory:rejecter:)
  func getHistory(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(UserDefaults.standard.array(forKey: Self.historyKey) ?? [])
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
    lastLocation = location

    // JS に位置を伝える（ポケットの中で歩いても、対象の投稿を取り直せるように）。50m 動くごと
    if hasListeners, lastEmittedLocation.map({ location.distance(from: $0) > 50 }) ?? true {
      lastEmittedLocation = location
      sendEvent(withName: "pocketLocation", body: [
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "accuracy": location.horizontalAccuracy,
      ])
    }

    notifyIfNear(location)
  }

  // 範囲内に、最近通知していないメッセージがあれば通知する
  private func notifyIfNear(_ location: CLLocation) {
    guard location.horizontalAccuracy <= maxAccuracyM else {
      return
    }
    if let last = lastNotifiedAt, Date().timeIntervalSince(last) < cooldown {
      return
    }
    guard !targets.isEmpty else {
      return
    }

    let now = Date().timeIntervalSince1970
    var notified = UserDefaults.standard.dictionary(forKey: Self.notifiedKey) as? [String: Double] ?? [:]
    let inRange = targets
      .map { ($0, location.distance(from: $0.location)) }
      .filter { $0.1 <= radiusM }
    guard !inRange.isEmpty else {
      return
    }
    // 範囲内で、最近通知していない、いちばん近いメッセージ
    let nearest = inRange
      .filter { target, _ in notified[target.postId].map { now - $0 >= perPostInterval } ?? true }
      .min { $0.1 < $1.1 }
    guard let (target, _) = nearest else {
      return
    }

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

// MARK: - アイコンの動物の色変え

// AVATAR_RECOLOR_CORE_BEGIN（UIKit を使わない部分。scripts/avatar-animals/recolor-test.sh で Mac でも試せる）
/**
 * アバターの動物の絵の「オレンジ・黄色」の部分だけを、選んだ色に変える。
 * - どこを変えるかは、キャラクターごとのマスク画像（Images.xcassets の AnimalCatMask など。
 *   scripts/avatar-animals/build-masks.swift で元の絵から作る）で決める。白＝変える、黒＝変えない、間＝境目でなめらかに混ぜる
 * - 色の変え方は、画素の色だけで決まる変換（Core Image の 3D LUT、CIColorCubeWithColorSpace）。
 *   絵のいちばん多いオレンジ（基準）からのずれを、選んだ色でも同じだけ保つ → 質感が残る
 *   （基準より淡い＝リングなどは、選んだ色を同じ割合だけ白に近づける。基準より暗い＝陰は、同じ割合だけ暗くする）
 * - 変えた絵と元の絵を、マスクで重ねる（CIBlendWithMask）。画素の位置は一切動かさないので、形・輪郭・模様はそのまま
 */
enum AvatarRecolorCore {
  /// 元の絵のオレンジ（src/config/avatarColors.ts の ORIGINAL_ACCENT_HEX と同じ）。この色を選んだときは元の絵をそのまま使う
  static let originalAccentHex = "#F9B837"
  static let cubeSize = 32

  struct HSV { var h: Double; var s: Double; var v: Double }  // h は 0〜1

  static func parseHex(_ hex: String) -> (Double, Double, Double)? {
    var text = hex.trimmingCharacters(in: .whitespaces)
    if text.hasPrefix("#") { text.removeFirst() }
    guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
    return (Double((value >> 16) & 0xFF) / 255, Double((value >> 8) & 0xFF) / 255, Double(value & 0xFF) / 255)
  }

  static func isOriginal(_ hex: String) -> Bool {
    hex.trimmingCharacters(in: .whitespaces).lowercased() == originalAccentHex.lowercased()
  }

  static func hsv(_ r: Double, _ g: Double, _ b: Double) -> HSV {
    let maxC = max(r, g, b), minC = min(r, g, b), d = maxC - minC
    var h = 0.0
    if d > 0 {
      if maxC == r { h = (g - b) / d } else if maxC == g { h = (b - r) / d + 2 } else { h = (r - g) / d + 4 }
      h /= 6
      if h < 0 { h += 1 }
    }
    return HSV(h: h, s: maxC > 0 ? d / maxC : 0, v: maxC)
  }

  static func rgb(_ c: HSV) -> (Double, Double, Double) {
    let h = (c.h - floor(c.h)) * 6, i = Int(h) % 6, f = h - floor(h)
    let p = c.v * (1 - c.s), q = c.v * (1 - c.s * f), t = c.v * (1 - c.s * (1 - f))
    switch i {
    case 0: return (c.v, t, p)
    case 1: return (q, c.v, p)
    case 2: return (p, c.v, t)
    case 3: return (p, q, c.v)
    case 4: return (t, p, c.v)
    default: return (c.v, p, q)
    }
  }

  private static func pixels(_ image: CGImage, width w: Int, height h: Int, gray: Bool) -> [UInt8]? {
    var data = [UInt8](repeating: 0, count: w * h * (gray ? 1 : 4))
    let ok: Bool = data.withUnsafeMutableBytes { buffer in
      guard let ctx = CGContext(data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8,
                                bytesPerRow: w * (gray ? 1 : 4),
                                space: gray ? CGColorSpaceCreateDeviceGray() : CGColorSpace(name: CGColorSpace.sRGB)!,
                                bitmapInfo: gray ? CGImageAlphaInfo.none.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue)
      else { return false }
      ctx.interpolationQuality = .medium
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    return ok ? data : nil
  }

  /// 絵のいちばん多いオレンジ：マスクの中の、濃いオレンジの画素の平均。無ければ元のオレンジ
  static func referenceAccent(_ image: CGImage, mask: CGImage) -> HSV {
    let fallback: HSV = { let c = parseHex(originalAccentHex)!; return hsv(c.0, c.1, c.2) }()
    let w = 128, h = max(1, Int(Double(image.height) * 128 / Double(max(image.width, 1))))
    guard let color = pixels(image, width: w, height: h, gray: false),
          let weight = pixels(mask, width: w, height: h, gray: true) else { return fallback }
    var total = 0.0, sumS = 0.0, sumV = 0.0, sumX = 0.0, sumY = 0.0
    for i in 0..<(w * h) where weight[i] > 240 {
      let c = hsv(Double(color[i * 4]) / 255, Double(color[i * 4 + 1]) / 255, Double(color[i * 4 + 2]) / 255)
      guard c.s > 0.5, c.v > 0.5 else { continue }
      total += 1
      sumS += c.s
      sumV += c.v
      sumX += cos(c.h * 2 * .pi)
      sumY += sin(c.h * 2 * .pi)
    }
    guard total > 4 else { return fallback }
    var hue = atan2(sumY, sumX) / (2 * .pi)
    if hue < 0 { hue += 1 }
    return HSV(h: hue, s: sumS / total, v: sumV / total)
  }

  /// 元の色 → 変えた後の色の表（RGBA の float、r が一番速く回る）。マスクの中だけに使うので、全部の色を変換する
  static func cubeData(reference ref: HSV, target: (Double, Double, Double)) -> Data {
    let n = cubeSize
    let goal = hsv(target.0, target.1, target.2)
    var values = [Float](repeating: 0, count: n * n * n * 4)
    for b in 0..<n {
      for g in 0..<n {
        for r in 0..<n {
          let c = hsv(Double(r) / Double(n - 1), Double(g) / Double(n - 1), Double(b) / Double(n - 1))
          // 基準のオレンジからの色相のずれ（-0.5〜0.5）は半分だけ残す（黄色とオレンジの描き分けが、選んだ色の濃淡として残る）
          var dh = c.h - ref.h
          dh -= dh.rounded()
          let hue = rgb(HSV(h: goal.h + dh * 0.5, s: goal.s, v: goal.v))
          // 淡さ：基準より彩度の低い画素（淡い黄色のリング・クリームとの境目）は、選んだ色を同じ割合だけ白に近づける
          let tint = min(c.s / max(ref.s, 0.01), 1)
          // 陰：基準より暗い画素（陰・黒い輪郭との境目）は、同じ割合だけ暗くする
          let shade = c.v / max(ref.v, 0.01)
          let out = (min((1 - tint + hue.0 * tint) * shade, 1), min((1 - tint + hue.1 * tint) * shade, 1),
                     min((1 - tint + hue.2 * tint) * shade, 1))
          let i = ((b * n + g) * n + r) * 4
          values[i] = Float(out.0)
          values[i + 1] = Float(out.1)
          values[i + 2] = Float(out.2)
          values[i + 3] = 1
        }
      }
    }
    return values.withUnsafeBufferPointer { Data(buffer: $0) }
  }

  private static let context = CIContext(options: [.cacheIntermediates: false])

  /// 絵のマスクの部分（オレンジ・黄色）を hex の色に変えた絵（hex が元のオレンジ・読めない値なら元の絵のまま）
  static func recolor(_ image: CGImage, mask: CGImage, hex: String) -> CGImage {
    guard !isOriginal(hex), let target = parseHex(hex),
          let cube = CIFilter(name: "CIColorCubeWithColorSpace"),
          let blend = CIFilter(name: "CIBlendWithMask") else { return image }
    let input = CIImage(cgImage: image)
    // マスクは色の値そのもの（0〜255）を使う。色空間の変換をさせない（させると境目の混ぜ方がずれる）
    var maskImage = CIImage(cgImage: mask, options: [.colorSpace: NSNull()])
    if maskImage.extent.size != input.extent.size {
      maskImage = maskImage.transformed(by: CGAffineTransform(scaleX: input.extent.width / maskImage.extent.width,
                                                              y: input.extent.height / maskImage.extent.height))
    }
    cube.setValue(cubeSize, forKey: "inputCubeDimension")
    cube.setValue(cubeData(reference: referenceAccent(image, mask: mask), target: target), forKey: "inputCubeData")
    cube.setValue(CGColorSpace(name: CGColorSpace.sRGB)!, forKey: "inputColorSpace")
    cube.setValue(input, forKey: kCIInputImageKey)
    blend.setValue(cube.outputImage, forKey: kCIInputImageKey)
    blend.setValue(input, forKey: kCIInputBackgroundImageKey)
    blend.setValue(maskImage, forKey: kCIInputMaskImageKey)
    guard let output = blend.outputImage,
          let result = context.createCGImage(output.cropped(to: input.extent), from: input.extent, format: .RGBA8,
                                             colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    else { return image }
    return result
  }
}
// AVATAR_RECOLOR_CORE_END

/// 動物の絵（Images.xcassets の AnimalCat など）を色を変えて出す。同じ組み合わせは覚えておく
enum AvatarRecolor {
  private static let memory = NSCache<NSString, UIImage>()
  private static let lock = NSLock()
  private static var didResetDiskCache = false

  static func assetName(for animal: String) -> String {
    "Animal" + animal.prefix(1).uppercased() + animal.dropFirst()
  }

  /// AR のカードなどで使う動物の絵
  static func image(animal: String, hex: String) -> UIImage? {
    image(asset: assetName(for: animal), hex: hex)
  }

  /// Images.xcassets の絵 asset のオレンジ・黄色を hex に変えた絵（マスクは asset + "Mask"）。
  /// キャラクターの絵（AnimalCat）にもアタッチメントの絵（AttachmentRibbon01）にも使う
  static func image(asset: String, hex: String) -> UIImage? {
    let key = "\(asset):\(hex.lowercased())" as NSString
    if let cached = memory.object(forKey: key) { return cached }
    guard let original = UIImage(named: asset), let cg = original.cgImage else { return nil }
    // マスクが無い絵・元のオレンジのときは、色を変えずに元の絵のまま
    guard !AvatarRecolorCore.isOriginal(hex), let mask = UIImage(named: asset + "Mask")?.cgImage else {
      memory.setObject(original, forKey: key)
      return original
    }
    let result = UIImage(cgImage: AvatarRecolorCore.recolor(cg, mask: mask, hex: hex), scale: original.scale,
                         orientation: original.imageOrientation)
    memory.setObject(result, forKey: key)
    return result
  }

  /// RN の画面で使う、色を変えた絵の PNG ファイル（アプリのキャッシュに置く）
  static func fileURL(asset: String, hex: String) -> URL? {
    let fm = FileManager.default
    guard let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
    let dir = caches.appendingPathComponent("avatar-recolor", isDirectory: true)
    lock.lock()
    // 絵を差し替えたときに古い色の絵が残らないよう、起動ごとに作り直す（1 枚 数 ms なので）
    if !didResetDiskCache {
      try? fm.removeItem(at: dir)
      didResetDiskCache = true
    }
    lock.unlock()
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    let name = "\(asset)-\(hex.lowercased().replacingOccurrences(of: "#", with: "")).png"
    let url = dir.appendingPathComponent(name)
    if fm.fileExists(atPath: url.path) { return url }
    guard let data = image(asset: asset, hex: hex)?.pngData() else { return nil }
    do {
      try data.write(to: url, options: .atomic)
      return url
    } catch {
      return nil
    }
  }
}

@objc(LocaAvatar)
final class LocaAvatar: NSObject {
  private let queue = DispatchQueue(label: "loca.avatar.recolor", qos: .userInitiated)

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// 動物 animal（cat など）のオレンジ・黄色を hex（#RRGGBB）に変えた絵の file:// URL
  @objc(render:hex:resolver:rejecter:)
  func render(
    _ animal: String,
    hex: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard AvatarRecolorCore.parseHex(hex) != nil,
            let url = AvatarRecolor.fileURL(asset: AvatarRecolor.assetName(for: animal), hex: hex) else {
        reject("avatar_render_failed", "アイコンの絵を作れませんでした", nil)
        return
      }
      resolve(url.absoluteString)
    }
  }

  /// アタッチメント key（ribbon_01 など）の黄色を hex（#RRGGBB）に変えた絵の file:// URL
  @objc(renderAttachment:hex:resolver:rejecter:)
  func renderAttachment(
    _ key: String,
    hex: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard AvatarRecolorCore.parseHex(hex) != nil,
            let url = AvatarRecolor.fileURL(asset: AvatarAttachments.assetName(for: key), hex: hex) else {
        reject("attachment_render_failed", "アイテムの絵を作れませんでした", nil)
        return
      }
      resolve(url.absoluteString)
    }
  }
}

/**
 * アバターのアタッチメント（リボン・帽子・メガネ）を、キャラクターの絵の上に重ねて描く。
 * 装着位置の表は Images.xcassets の AvatarAttachmentLayout（src/config/avatarAttachmentLayout.json と同じもの）、
 * 絵は Attachment<名前>（Ribbon01 など）。計算は RN の attachmentFrame と同じ：
 * 絵がある範囲の中心を表の (x, y) に置き、範囲の幅を表の幅にして、その中心で回す（単位はキャラクターの絵 512px）
 */
enum AvatarAttachments {
  private struct Layout: Decodable {
    struct Box: Decodable { let x: Double; let y: Double; let width: Double; let height: Double }
    struct Item: Decodable { let box: Box; let imageSize: Double }
    struct Placement: Decodable {
      let x: Double; let y: Double; let width: Double; let height: Double; let rotation: Double; let zIndex: Double
    }
    let canvasSize: Double
    let items: [String: Item]
    let layout: [String: [String: Placement]]
  }

  private static let layout: Layout? = {
    guard let data = NSDataAsset(name: "AvatarAttachmentLayout")?.data else { return nil }
    return try? JSONDecoder().decode(Layout.self, from: data)
  }()

  static func assetName(for key: String) -> String {
    // ribbon_01 → AttachmentRibbon01
    let parts = key.split(separator: "_")
    guard parts.count == 2 else { return "" }
    return "Attachment" + parts[0].prefix(1).uppercased() + parts[0].dropFirst() + parts[1]
  }

  /// rect：キャラクターの絵を描いた範囲（左上原点の UIKit の座標）。アイテムごとに hex があれば、黄色をその色に変えて描く
  static func draw(_ items: [(key: String, hex: String?)], animal: String, in rect: CGRect, context: CGContext) {
    guard !items.isEmpty, let layout, let placements = layout.layout[animal] else { return }
    let unit = rect.width / layout.canvasSize
    let sorted = items.compactMap { item in placements[item.key].map { (item.key, item.hex, $0) } }
      .sorted { $0.2.zIndex < $1.2.zIndex }
    for (key, hex, place) in sorted {
      let asset = assetName(for: key)
      let image = hex.flatMap { AvatarRecolorCore.parseHex($0) != nil ? AvatarRecolor.image(asset: asset, hex: $0) : nil }
        ?? UIImage(named: asset)
      guard let meta = layout.items[key], let image else { continue }
      let scale = place.width / meta.box.width
      let boxCx = meta.box.x + meta.box.width / 2
      let boxCy = meta.box.y + meta.box.height / 2
      context.saveGState()
      context.translateBy(x: rect.minX + place.x * unit, y: rect.minY + place.y * unit)
      context.rotate(by: place.rotation * .pi / 180)
      context.scaleBy(x: scale * unit, y: scale * unit)
      image.draw(in: CGRect(x: -boxCx, y: -boxCy, width: meta.imageSize, height: meta.imageSize))
      context.restoreGState()
    }
  }
}
