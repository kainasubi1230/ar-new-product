# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

React Native（0.85 / React 19、bare workflow・Expo なし）の AR アプリ「Loca」（ネイティブのプロジェクト名・モジュール名は旧仮名の `SpatialInventory` のまま）。ユーザーは AR カメラ上の現実空間にメッセージカードを置き、そのカードを現在地（緯度経度）と AR 座標付きで Supabase に保存する。UI 文言やコードコメントは日本語。

## 開発環境の注意
- `ios/.xcode.env.local`（Node の場所）と `xcuserdata/` は Mac ごとの設定なので git に入れない（`.gitignore` 済み）。無ければ `export NODE_BINARY=<node の絶対パス>` の 1 行で作る（`command -v node` で調べた値を直接書く。nvm で入れた Node は Xcode から起動したビルドでは見つからないので `$(command -v node)` のままだと失敗する）。
- `project.pbxproj` の `DEVELOPMENT_TEAM` は main ではあんじのチーム（`QYJA237VJV`）、アプリ ID（`PRODUCT_BUNDLE_IDENTIFIER`）は `com.anji.loca`。アプリ ID は Apple のチームごとに取り合いになるので、他の人がビルドするときは手元でチームとアプリ ID（例：`com.<自分の名前>.loca`）の両方を自分のものに変え、その変更はコミットしない。
- `ios/Gemfile` と `ios/patch_cocoapods.rb` は古い CocoaPods（1.12）でも `pod install` できるようにするための補正。

## コマンド

```bash
npm start            # Metro bundler
npm run ios          # iOS ビルド＆起動（事前に cd ios && pod install）
npm run android      # Android ビルド＆起動
npm run typecheck    # tsc --noEmit（唯一の静的チェック）
```

テストフレームワークと linter はまだ導入されていない（`npm test` は echo するだけ）。AR はシミュレータ／エミュレータでは動かないため、AR 関連の確認には実機（iOS は ARKit、Android は ARCore）が必要。

## アーキテクチャ

### 状態管理は App.tsx に集約
`App.tsx` がアプリ全体の状態（タブ切り替え・ログインユーザー・投稿中カードの内容・配置モード・トースト）をすべて持っている。ナビゲーションライブラリは使っていない。`activeTab`（`home | radar | notifications | mypage`）で画面を切り替え、各画面は `src/components/` の props 駆動コンポーネント。ホームタブ＝AR カメラ。他タブ表示中は AR コンテナを `display: 'none'` にしているが、新アーキテクチャ（Fabric）ではこの間にネイティブの AR ビューが破棄され、ホームに戻ると作り直される（セッション・置いたカードはリセット）。そのため、ネイティブへの一度きりの命令を表す prop（`worldMapSaveRequest` など）は、処理されたら JS 側で `null` に戻すこと。

### 初めて開いたとき
- `App` は、初めて開いたときだけ `OnboardingScreen`（横にめくる 4 枚。空間メディアであること・景色が主役・安心して出会える・画面の外へ。最後にカメラと位置情報を使う理由）を出し、見終わるまで本体（`MainApp`）を作らない（AR を作るとカメラの許可を求められ、説明の途中でダイアログが出るため）。見終えたかは AsyncStorage の `loca:onboardingDone`。
- 説明のあとは、本物の画面の上で使い方を案内する `src/components/tour/GuidedTour.tsx`（全 10 段階：ホーム → ＋ → 探索 → 通知 → マイページ → ホーム）。暗い膜の 1 か所を丸く抜いて光らせ、光っているタブを押すと本当にそのタブへ移ってから続きを説明する。光らせる部品には `tourTargetRef('tab:radar')` などを付けておき（`tour/tourTargets.ts`）、段階ごとに `measureInWindow` で位置を測る。段階の切り替えは、吹き出しを消す → 丸を次の場所へすべらせる（位置と大きさは transform、膜の濃さは opacity。すべてネイティブで動かす）→ 吹き出しを出す。ツアーの間は AR の案内（Apple のコーチング・自前の案内・お知らせ）を `hudHidden` で隠し、JS のお知らせ（`showToast`）も出さない。最後まで見るかスキップすると `loca:tourDone`。途中で閉じたら次の起動でもう一度出る。マイページの歯車の「使い方をもう一度見る」からも出せる。
- 起動画面のロゴは JS の準備ができると一瞬で消えるので、`SplashOverlay` が同じロゴ（Images.xcassets の `LaunchLogo` を `{ uri: 'LaunchLogo' }` でそのまま読む。140pt・中央）を毎回の起動で約 1.4 秒重ねてから、ふわっと消す。ロゴを変えるときは `LaunchLogo.imageset` だけ差し替えればよい。

### ファイルの分け方
- 画面の下のタブは `src/components/BottomNav.tsx`（タブの型 `Tab` もここ）。ポケット通知の見張りは `src/hooks/usePocketNotice.ts`（App.tsx から呼ぶだけ）。
- マイページは `MyPageScreen.tsx`（プロフィール・残した言葉・拾った言葉・設定メニュー）と `src/components/mypage/` に分けてある：`AuthForm`（未ログインのとき）、`InterestSettingsTab`（「関心タグ」タブ。3 枚のカードと下に開く引き出し、ジャンルの一覧 `INITIAL_TAGS`）、`AvatarPickerModal`（「アバターをつくる」。キャラクターと色を選び、作ったアバターがそのままアイコンになる。1 段ずつ（キャラクター → 色 → アイテム → 背景 → 完成。アイテム・背景は、その段より前では付けずに＝初期の背景で見せる）。文言は漢字（「選ぶ」「次へ」「戻る」「完成」）、動物の名前はカタカナ。色は `ColorPicker`：色相・彩度・明度のスライダー、HEX、プリセット 8 色、いちばん下に「初期カラーに戻す」。HEX ⇄ HSV は `src/utils/color.ts`）、`styles.ts`（マイページ共通のスタイル）。

### 投稿フロー（JS ↔ ネイティブを行き来する）
1. AR ビューをタップ → ネイティブから `onScreenTapped` → 未ログインならマイページへ誘導、ログイン済みなら `PostModal` を開く
2. 投稿内容を送信 → `isPlacementMode=true`（ネイティブ側の `isPreviewActive`）でプレビュー表示
   - プレビューは画面中央の平面（地面・机・壁）に置く。平面がカメラから 4m より遠い、または見つからないときは、カメラの真正面 1.0m の空中に浮かべる（`isFloatingPlacement`、外の広い場所用。3.5m より近づくと平面に戻る）。
3. 配置確定 → `placeTrigger` をインクリメント。ネイティブ側はこの数値の変化を「配置せよ」という命令として扱う
4. ネイティブがカードをアンカーに配置 → `onCardPlaced` が `x/y/z` を返す → `insertPostWithCurrentLocation()` で Geolocation から現在地を取得し、Supabase の `posts` テーブルに insert

### ARWorldMap による場所の再現（iOS のみ）
- 保存：カードは仮名 `pending:<uuid>` の `ARAnchor` 上に置かれ、`onCardPlaced` で `anchorId` が返る。JS が投稿を insert して ID を得ると `worldMapSaveRequest` を渡し、ネイティブはアンカーを `post:<posts.id>` に作り直してから `worldMappingStatus` が mapped になるまで待つ。その後、地図を Supabase Storage の `worldmaps/<postId>.worldmap` に直接アップロードする（`SupabaseStorage` struct）。最後に JS が `posts.worldmap_path` と、その地図に入っている `post:` アンカーの投稿 ID 一覧 `posts.worldmap_post_ids` を更新する。extending のまま mapped にならないときの保険は `mappingExtendingFallback`（25 秒）。
- 復元：ホーム表示中は `Geolocation.watchPosition` で現在地を追う。照合には、誤差 15m 以下の平均（`currentCoords`、方角タグ用）を待たず、生の値が 65m 以内になった時点の `relocalizeCoords` を使い、`relocalizeSearchRadiusFor`（max(30m, 誤差+20m)、上限 100m）の範囲で `findNearbyWorldMapPosts` が地図付き投稿を取る。`chooseWorldMapPost` で「範囲内の投稿をいちばん多く含む地図（同数なら新しいほう）」を選び、範囲内の投稿全件のカード内容と一緒に `relocalizeTarget` に渡す。ネイティブは地図をダウンロードして `initialWorldMap` でセッションをやり直す。`didAdd` で届いた `post:` アンカーは、trackingState が normal になる（位置合わせが終わる）まで `pendingRelocalizedAnchors` に取っておき、normal になってから内容を知っている投稿をすべてカードで表示する（found と地図を育てる処理もその後に始まる）。
- 照合の待ち時間は `relocalizationTimeout`（30 秒）。見つからなければ（`timeout`）、JS がその地図を `FAILED_MAP_RETRY_MS`（3 分）の間は候補から外し、近くにほかの地図があればそちらで探し直す（`failedMapsRef` と `relocalizeRetryKey`）。
- 座標の飛びの打ち消し：照合に成功した瞬間、ARKit は AR 座標を記録したときの座標に切り替える（カメラの値が 1 フレームで飛ぶ）。自前でワールド座標に置いているもの（方角タグ・気配の光・照合カードの入れ物・北の向きとその測定値）は、`compensateWorldJumpIfNeeded` が 1 フレームで 0.25m か 12° を超える飛びを見つけたら、同じ変換をかけて見た目を止める（打ち消さないと、北の平均がゆっくり回って空間ごと回り込む）。最後の飛びはデバッグ表示の `lastWorldJump`。
- カードは地面に対してまっすぐ立てる（左右の向きだけ使う `uprightRotation`）。置くとき・プレビュー・照合で出すときのどれも同じ。傾いて保存された古い投稿も、出すときにまっすぐにする。
- 地図を育てる：照合に成功したログインユーザー、または地図を保存した直後の投稿者本人がその場で見回すと（前回の保存から 15 秒以上経ち、1m 以上動くか 60° 以上向きを変えた、かつ mapped か extending のとき）、その地図を同じパスに上書き保存する。1 セッション最大 3 回、10MB まで（`checkMapGrowth`）。他人の地図を上書きするので、Storage の UPDATE ポリシーは認証ユーザー全員に開いている。
- 記録中・照合中の案内は、ネイティブの `ARGuideHUDView`（ARCoachingOverlayView 風）が `emitWorldMapStatus` / `emitRelocalizationStatus` の phase に連動して出す。JS 側に案内のバナーは無い。
  - 記録中は進み具合のバーを出す（`mappingProgress`：mapped で 1、extending は `mappingExtendingFallback` 秒の保険に向けて進む）。
  - カードを置いた瞬間に ARView のスナップショット（方角タグは隠し、置いたカードは写す）を撮り、投稿 ID が決まったら `worldmaps/snapshots/<postId>.jpg` に上げる。`onWorldMapStatus(snapshotSaved)` を受けた JS が `posts.snapshot_path` に記録する（このイベントは `worldMapPhase` を変えない）。
  - 照合中は `relocalizeTarget.snapshots`（その地図に入っている投稿の写真を、今いる場所から近い順に）を半透明で画面いっぱいに重ね、「この景色に合わせてください」と案内する（`relocalizationGuide`）。1 つの地図に何部屋分も入っていることがあり GPS では部屋を区別できないので、複数あれば 4 秒ごとに切り替える（`cycleRelocalizationSnapshot`）。写真の無い投稿はアイコンと文字だけ。スマホを振らせるアニメーションは使わない。DB の列は `supabase/migrations/20261026000000_snapshots.sql`。
- 照合で出したカードは、1 つの地図で家じゅうのカードが一度に出るので、カメラとの間に壁や物があれば薄れて、その正確な位置にごく薄い光だけが残る（`RevealCard` / `updateCardReveal`）。0.25 秒ごとに `isOccluded` でカメラからカードへの間を調べる。手がかりは 3 つ：①今のフレームの特徴点（`rawFeaturePoints`）がカードへの細い円すいの中、カードより手前に 3 個以上ある（全機種。LiDAR の無い iPhone の主な手がかり、`featurePointsBetween`）、②ARKit の平面（`existingPlaneGeometry`）に当たる、③LiDAR 機では部屋のメッシュ（`sceneUnderstanding` の `.collision`）に当たる。いずれもカードの手前 0.3m より近いものだけ数える。特徴点はちらつくので `occlusionScore`（0〜4）が 3 以上で隠し 1 以下で見せる。画面外のカードは判定せず前の状態のまま。LiDAR が無いと、模様の無い白い壁の向こうは見えてしまうことがある。自分がその場で置いたカードは対象外（常に見える）。
- 置いた・見つけたときの演出（`playPlacementEffect` / `playDiscoveryEffect`、Calm なので音は無し）：置いたカードは半透明のプレビューのまま 3cm 上から 0.45 秒でそっと降りて実体になり、着いた瞬間にカードの後ろから光の輪（`spawnHalo`）が広がり、光の粒（`spawnSparkles`）が立ちのぼり、軽く振動する。照合で見つけたカードは、初めて画面に映るまで出さずに待ち（`hasMaterialized`）、映ったら光が縮みながらカードが 5cm 下・少し小さい所から浮かび上がる（`revealRiseDistance`）。輪と粒は `updateEffects` が毎フレーム進め、終わったら消す。振動は続けて鳴らないよう 0.6 秒あける。
- 進捗は `onWorldMapStatus` / `onRelocalizationStatus` で JS に通知される。DB 側の設定は `supabase/migrations/` にある。

### 方角タグ（セカイカメラ風、iOS のみ）
- 位置合わせ（照合）なしで、周りの投稿を AR 画面に一斉に浮かべる。JS が `nearbyPostService.findNearbyPosts` で 300m 以内の投稿を近い順に最大 20 件取り、`src/utils/geo.ts` で距離と方角（北=0° 時計回り）を計算して `geoTags` prop に渡す。距離・方角の計算は、レーダーや通知でも使い回す前提。
- ネイティブは CoreMotion（`xTrueNorthZVertical`）のカメラの方角と ARKit カメラのヨー角の差から、AR 座標での北を求めて平滑化する（`northOffset`）。タグは「GPS の位置が届いたときのカメラ位置」（`geoOriginCameraPosition`、`geoTags` が更新されたときに記録）から、その方向の実際の距離（上限 `geoTagMaxRenderDistance` 40m）に置いて空間に固定し、毎フレームカメラの方を向かせる。今のカメラ基準で置き直すと歩いた分だけ逃げていくので、そうしない。見かけの幅（角度）は本当の距離で決める（30m で約 0.17rad、300m で約 0.10rad）。重なりは方角と仰角で判定して上に積む。セッションをやり直すと北と基準位置を求め直す。
- 見え方は位置の確かさと距離で決める。しきい値は `src/config/distanceTiers.ts` の `DISTANCE_TIERS` だけで決める（`maxM` 300 / `messageM` 100 / `preciseM` 30。`NEARBY_RADIUS_M` と `WORLDMAP_RADIUS_M` もここから取る）。JS が `geoTagLevelFor` で各タグの `level` を決めて渡す。
  - 照合に成功：正確な位置にくっきりしたカード。その投稿のタグ・気配は消す（`preciseCardPostIds`）
  - 〜`preciseM` で照合できていない：`presence`。その方角の実際の距離に、文字のない光の「気配」（`presenceMesh` + 放射状グラデーション、4 秒周期でゆっくり明滅）。大きさは位置の不確かさ `uncertaintyM`（置いたときと今の GPS 誤差を合わせたもの）で決める。光は近づくと画面を覆うので、見かけの大きさに上限（カメラからの距離 × `glowMaxApparentSize`）を付け、`glowFadeStart`〜`glowFadeEnd`（0.8〜2.5m）で近づくほど薄くする（`glowNearFade`。隠れたカードの光も同じ）。タップすると `onPresenceTapped` → `PresenceSheet` が「このあたりに○○さんのメッセージがあります（景色が合うとその場所に現れます）」と置いたときの景色の写真を出す（本文は見せない）
  - `preciseM`〜`messageM`：`message`。本文も読めるタグ（`createGeoTagImage`）
  - `messageM`〜`maxM`：`summary`。タグと距離だけの小さいタグ（`createGeoTagSummaryImage`）
- 配置プレビュー中はタグを隠す。
- 起動を速くするため、現在地は 3 段で埋める（App.tsx）：AsyncStorage の前回位置（`loca:lastCoords`）→ iOS のキャッシュ位置（`getCurrentPosition` の低精度・`maximumAge` 10 分）→ `watchPosition` の正確な位置。前の 2 つは `isApproximate: true` で、方角タグには使うが ARWorldMap の照合には使わない。
- `watchPosition` の値は `GpsAverager`（`src/utils/gpsAverager.ts`）に通す。誤差 15m 超は捨て、直近 5 回の良い値を誤差の小ささで重み付け平均する。屋内などで 20 秒良い値が来なければ、誤差 65m 以内の最良値を使う。平均位置が 5m 以上動いたときだけ `currentCoords` を更新する。しきい値は `src/config/locationAccuracy.ts`。
- 北の向き（`northOffset`）は 1 回で決めず、直近 4 秒の測定値の平均（cos/sin の平均）で決める。最初は 1 秒集めてから決める。コンパスの精度（`CLLocationManager` の `headingAccuracy`）が 25° より悪い間の測定値は混ぜない（まだ北が無いときだけは使う）。悪い状態が 2 秒続くと `onCompassStatus` を送るが、今はホームに 8 の字の案内は出していない（出すのは「正確な位置情報がオフ」の案内だけ）。
- 位置情報が「おおよそ」でしか許可されていない（`accuracyAuthorization == .reducedAccuracy`）と `onLocationAccuracyStatus` で知らせ、App.tsx が「設定を開く」付きの案内を出す。
- ネイティブはタグごとに `GeoTagEntity`（目標の位置・大きさ・濃さと、現在値）を持ち、毎フレーム時間ベースで目標へ寄せる（パッと飛ばさない）。新しいタグは近い順に `geoTagStaggerDelay` ずつ遅れてふわっと現れ、範囲外になったタグはふわっと消える。北を求め直した直後（`needsGeoTagSnap`）だけは、その場に置き直してもう一度ふわっと出す。
- 濃さは JS の `prominence`（近いほど 1）から決める。透明度（`OpacityComponent`）は iOS 18 以上のみで、それ未満は大きさの変化だけになる。`highlighted`（`src/utils/interestTags.ts` の `matchesInterestTags`）が true の投稿は少し大きく濃く出す。関心タグは下の「関心タグとポケット通知」を参照。
- Android 側はまだ未対応（`geoTags` prop は無視される）。

### ネイティブ AR ビュー（ブリッジ）
`src/native/UniversalARView.tsx` は `requireNativeComponent` の薄いラッパー。**登録名がプラットフォームごとに違う**：iOS は `ARView`、Android は `ARViewManager`。
- iOS：`ios/SpatialInventory/ARViewManager.swift` + `ARViewWrapper.swift`（ARKit/RealityKit）、props は `ARViewManagerBridge.m` で `RCT_EXPORT_VIEW_PROPERTY` を使ってエクスポート。（以前 `ios/` 直下にあった同名の古いファイルは消した）
- Android：`android/app/src/main/java/com/spatialinventory/ar/`（SceneView/ARCore）。`ARPackage` は `MainApplication.kt`（パッケージ名は `com.spatialinventorytemplate`）で登録している。

prop やイベントを追加・変更するときは、TS の型定義・iOS の bridge `.m` + Swift・Android の `@ReactProp`／`receiveEvent` の **3 箇所すべて** を揃えること。

### Supabase
- クライアントは `src/lib/supabase.ts`。URL と publishable key はハードコードされていて、`.env` は使っていない。セッションは AsyncStorage に保存し、`react-native-url-polyfill` が必須。
- アクセストークンは約 1 時間で切れる。`src/lib/supabase.ts` でアプリが前に出ている間だけ自動更新し（`AppState` で `startAutoRefresh` / `stopAutoRefresh`）、App.tsx が `onAuthStateChange`（TOKEN_REFRESHED を含む）で受けた最新のトークンを `supabaseAccessToken` prop でネイティブに渡す。ネイティブの `SupabaseStorage` は依頼に入っていた古いトークンより `latestAccessToken` を優先し、ダウンロードが 400/401/403 で拒否されたらトークンなし（anon）で読み直す（worldmaps バケットは誰でも読める）。
- 認証（メール＋パスワード）は `src/services/authService.ts`。username はサインアップ時に `user_metadata.username` へ入る。
- `posts` テーブルのカラム（`postService.ts` から推定）：`message, lat, lng, alt_m, heading_deg, camera_lat, camera_lng, accuracy_m, author, handle, tags[], ar_x, ar_y, ar_z, worldmap_path, worldmap_post_ids[], snapshot_path, read_count, place_name, user_id`。`place_name` は置いた場所の名前で、投稿を保存したあとに `fillPostPlaceName`（カードの lat / lng から `reverseGeocode`）で書き足す。名前の無い古い投稿は、マイページを開いたときに 10 件ずつ埋める（列は `20261026080000_posts_place_name.sql`）。
  - メッセージの本体は「その場所の座標」。`lat / lng / alt_m` はスマホではなくカード自体の位置（`postService.insertPostWithCurrentLocation`：スマホの GPS（平均済みの `currentCoords` があれば優先）＋ ネイティブが `onCardPlaced` で送るカメラからのずれ `offsetEastM / offsetNorthM / offsetUpM`（`northOffset` で東・北に直したもの））。`heading_deg` はカードの面の方位、`camera_lat / camera_lng` は元にしたスマホの位置、`accuracy_m` はそのときの GPS の誤差。北が分からないときはずれを送らず、スマホの位置をそのまま使う。方角タグなどの照合できないときの表示は `lat / lng` を使うので、自動的にカードの座標になる。2026-10-26 より前の投稿の `lat / lng` はスマホの位置。`user_id` は DB のデフォルト値 `auth.uid()` で自動的に入り、投稿者だけが自分の行を UPDATE できる。

### 探索画面（地図）
- `DiscoveryMapScreen` は `react-native-maps`（iOS は Apple のマップ＝MapKit。API キー・料金なし）で、App.tsx の `nearbyPosts`（方角タグと同じ `findNearbyPosts` の結果、近い順。メッセージ＝カードの `latitude / longitude` つき）をピンで出す。現在地の追跡と近くの投稿の取得は、ホームと探索を開いている間（`isLocationActive`）動く。
- ピンは近くの投稿だけでなく、地図に映っている範囲の投稿も出す（`onRegionChangeComplete` から 0.4 秒待って `nearbyPostService.findPostsInRegion`。新しい順に最大 `MAP_REGION_LIMIT` 150 件、距離の制限なし）。緯度の幅 0.6° より広く映しているときは取らず「近づけると、メッセージが表示されます」。範囲で取った投稿にも表示の設定（App.tsx の `isPostVisibleForMap`）をかけ、近くの投稿（`nearbyPosts`）と合わせて近い順に並べる。
- ピンの見た目と、下のカードで本文を見せるかは `geoTagLevelFor` の段階で AR とそろえる（presence：淡いピン＋位置の誤差 `accuracy_m` の輪で「このあたり」・本文なし、message：本文あり、summary：小さく薄いピン・本文なし）。
- 下のカードの「この言葉をARで探す」は、その投稿を「探している言葉」（App.tsx の `focusRef`）にしてホームを開く（`handleOpenARFromMap`）。ホームの照合では、その投稿が入った地図（自分の地図か `worldmap_post_ids` に入っている地図）だけから選び、案内の写真もその投稿の 1 枚にする。現れたら（`seen`）「○○さんの言葉が見つかりました」と出して忘れる。景色が見つからなかった（`timeout`）・30 分たった（`FOCUS_EXPIRE_MS`）・別のピンを選んだときも忘れる。照合の範囲（`relocalizeSearchMaxM`）より遠いピンは「近づくと、この言葉を探します」と出し、近づくまではふだん通りに照合する。すぐ近くなのにその言葉の入った地図が無い（景色を記録していない投稿）ときは「この言葉は景色の記録がありません」と出して忘れる。
- 文化遺産のピン（`src/services/heritageService.ts`）：世界遺産の構成資産・国宝/重要文化財の建造物・特別史跡/史跡・特別名勝/名勝、約 2000 件を `src/data/heritageSites.json` としてアプリに同梱（通信・料金なし）。作り直すときは `python3 -I scripts/build-heritage-sites.py`（位置と種類は Wikidata＝CC0、説明は日本語版 Wikipedia の冒頭＝CC BY-SA 4.0。Wikipedia に記事がないもの・美術品など動かせるものは入れない）。地図の範囲（緯度の幅 2° まで）を、緯度経度に固定した格子（縦に約 8 区画、大きさは 2 のべき乗の度）に分け、1 区画に 1 つだけ出す（大事な種類 → 区画の真ん中に近い順。選んでいるものは必ず残す）。世界遺産・国宝・特別史跡・特別名勝（`isMajorHeritage`）は濃く大きいピン、ほかは小さく淡いピン。地図の右下（現在地ボタンの上）のボタンで出す・隠すを切り替え、設定 `showHeritagePins` に保存する。ピンの絵は種類ごと（建物・地球・古墳・山。`scripts/heritage-icons/icons.swift` で描いた `Icons.heritage*`）。ピンは View で描く（この版の react-native-maps の Marker の `image` は古いブリッジで画像を読むので、新しいアーキテクチャでは出ない）。止めた絵（`tracksViewChanges=false`）にするのは、絵が読み込めてから・選んだ/外して 0.3 秒たってから。ピンを押すと下のカードが名前・種類・説明・出典になる。**説明は CC BY-SA なので、出典「Wikipedia「記事名」（CC BY-SA 4.0）」の表示を消さないこと。**
- メッセージのピンは文字を出さず、色で分ける（`pinLookOf`）：自分の言葉は白い丸に緑のふち、拾った言葉はくすんだ緑（`post_reads` を `fetchCollectedPostIds` で取る）、関心タグに関係する言葉はどのタグでも同じセルリアンブルー（`PIN_INTEREST`）で少し大きく（マイページの「関心タグ」＝`onlyInterestTags` がオンのときだけ。オフなら関心タグを選んであっても色を付けない）、ほかは緑。距離の段階は大きさと濃さ。地図の左下に色の見方を縦に出す（言葉・関心タグの言葉（オンのときだけ）・拾った言葉・自分の言葉）。下のカード（メッセージ・文化遺産・何も選んでいない）は同じ高さ `CARD_HEIGHT` に固定し、押すたびに地図の大きさが変わらないようにする（ボタン・出典はいちばん下）。
- 下のカードの「右前方 80m」と矢印は、スマホの向き `useHeading`（`src/hooks/useHeading.ts`）を使う。AR ビューは他のタブで破棄されるので、方位だけを送るネイティブの `LocaHeading`（`RCTEventEmitter`、`CLLocationManager` の heading）を ARViewWrapper.swift の末尾に置き、`ARViewManagerBridge.m` で公開している（新しい Swift ファイルを足すと Xcode のプロジェクト設定の編集が要るため）。

### 関心タグとポケット通知
- 投稿のタグは 1 つ 15 文字（`TAG_MAX_LENGTH`）・1 投稿 5 個（`POST_TAG_LIMIT`）まで。手動で足すタグは `cleanTag`（#・空白・絵文字を取る）で整え、表記揺れが同じ候補があればそれを使う。保存の直前にも `postService` で `cleanPostTags`（整える・表記揺れの重複を消す・5 個まで）をかける（どちらも `interestTagService.ts`）。DB 側の制限はまだ無い。
- 関心タグとポケット通知のオン・オフは `src/services/preferencesStore.ts`（AsyncStorage の `loca:preferences`）に保存し、`usePreferences` で共有する。設定する場所はマイページの「関心タグ」タブ。端末に保存するので、`ownerUserId` で持ち主のアカウントを覚え、別のアカウントでログイン（新規作成も）したら `adoptPreferencesForUser` で初期値（関心タグは #散歩 と #日常、除外タグは #愚痴 #混雑 #騒音 #危険）に戻す。関心タグに合う投稿は、AR の方角タグ（`highlighted`）と地図のピン（`pinHeadInterest`）で少し目立たせる。
- 関心タグに合うかは `src/utils/interestTags.ts` の `matchesInterestTags` で判定し、関連タグ（`src/services/interestTagService.ts` の `INTEREST_TAG_PRESETS`。#散歩 なら #街歩き・#おでかけ など）にも合えば合うとみなす。
- 表示の設定（`preferencesStore` の `onlyInterestTags`：関心タグの言葉だけ表示、初期値オフ／`hideNegativePosts`：安心フィルター、強いネガティブ表現（`analyzeSentiment` の `isNegative`）を隠す、初期値オン）は、App.tsx の `isPostVisible`（`isVisibleUnderFilters`）で、方角タグ・地図のピン・照合で出すカードにかける。自分の投稿はいつも出す。設定する場所はマイページの「関心タグ」タブだけ（カードをオンにすると下に開く引き出しで、ジャンル・自分で作ったタグ・見たくないジャンルを選ぶ）。タグの提案（`tagSuggestionService`）は端末の中のルールだけで行う（Edge Function は使っていない）。
- 投稿画面（`PostModal`）は関心タグを `preferredTags` で受け取り、タグの提案で優先し、候補に出ていない関心タグを「あなたの関心タグから追加」に出す。本文が強いネガティブ表現なら、安心フィルターの人には表示されないと穏やかに伝える。
- ポケット通知は、関心タグに合うメッセージ（自分の投稿以外）から `POCKET_NOTICE.radiusM`（20m）以内に入ったらローカル通知を出す（本文は出さない）。位置の見張り・判定・通知・履歴はネイティブの `LocaPocket`（ARViewWrapper.swift の末尾、`ARViewManagerBridge.m` で公開）が行い、アプリを開いてからポケットに入れた状態（画面ロック・別アプリ）でも届く（`allowsBackgroundLocationUpdates`。Info.plist の `UIBackgroundModes: location`。位置の許可は「使用中のみ」のまま）。アプリを完全に閉じた状態は対象外。
- JS（App.tsx）は、ネイティブから届く位置（`pocketLocation`、50m ごと）で `refetchDistanceM` 動くたびに `findNearbyPosts`（`targetRadiusM` 500m）を取り直し、対象を `updatePocketTargets` で渡す。動いていなくても `refreshIntervalMs`（30 秒）ごとに取り直す（同じ場所にいるまま、あとから置かれたメッセージに気づくため）。ネイティブは対象を受け取るたびに、最後の位置ですぐ判定する（`notifyIfNear`）。通知は同じメッセージで 1 日 1 回、通知どうし 3 分あける、GPS 誤差 40m 超では判定しない（`src/config/pocketNotice.ts`）。通知のタップでホームを開く。通知画面は `LocaPocket.getHistory`（UserDefaults、最大 50 件）の履歴のうち、まだ見ていないものだけを出す（`getUnseenPocketHistory`）。画面を離れる・アプリを閉じると、出していた通知までを「見た」ことにして AsyncStorage の `loca:pocketSeenUntil`（UNIX 秒）に記録し、次からは出さない（ネイティブの履歴は消さない）。通知の文言は合った関心タグ（関連タグで合ったときもその関心タグ、`findMatchedInterestTag`）で「近くに #散歩 の言葉があります」とし、通知画面のカードの丸にはそのタグの絵（`src/utils/tagIcon.ts` の `interestTagIcon`、自分で作ったタグはベル）を出す。（開発用の診断表示 `PocketDebugPanel` と、ネイティブの `getStatus`・`resetNotified` は、使っていなかったので消した。必要なら git の履歴から戻す）

### 拾った言葉
- 照合で出した他の人のカード（隠れずに見えているもの、`revealedCard`）をタップすると、ネイティブが `onCardTapped` を送り、JS（`handleCardTapped`）が `readService.collectPost` で `post_reads`（post_id, user_id, read_at）に記録して「📖 ○○さんの言葉を拾いました」と出す（カードは軽くふくらむ）。もう拾っていれば「この言葉はもう拾っています」（主キー重複 23505）。ログイン中だけ、自分の言葉はタップしても何もしない。
- 他の人のカードが初めて画面に現れたとき（`onRelocalizationStatus(seen)`）に、「カードをタップすると、言葉を拾えます」を 1 回の起動で 1 回だけ出す。
- マイページの「拾った言葉」は `fetchCollectedPosts`、「残した言葉」の「◯人が読んだよ」と、AR のカードの右下の「👣 3」は `posts.read_count`（拾われた人数。`post_reads` の追加・削除で DB のトリガーが増減する。`20261026060000_post_read_count.sql`。拾った記録そのものは本人と投稿者しか読めないが、人数は誰でも読める）。テーブルと RLS は `supabase/migrations/20261026040000_post_reads.sql`。拾うときは、そのときの自分の位置（`post_reads.lat / lng`）と場所の名前（`place_name`。ネイティブの `LocaGeocoder`＝iOS 標準の `CLGeocoder` で求める。3 秒で取れなければ null。`src/services/geocoder.ts`）も残し、マイページに「📍 天神で 10/26 に拾った」と出す（列は `20261026070000_post_reads_place.sql`）。拾った言葉はマイページから外せる（`uncollectPost`、自分の記録だけ消せる DELETE ポリシーは `20261026050000_post_reads_delete.sql`）。外しても相手の言葉は消えず、その言葉の「誰かが読んだよ」が 1 減る。

### 通報・ブロック・利用規約への同意（App Store のガイドライン 1.2）
- 新規登録のニックネームは必須。`checkNickname`（safetyFilter.ts）で、投稿と同じ安心フィルター・20 文字以内・「運営/公式/admin/Loca」などを名乗る名前を防ぐ。以前はニックネームが空だとメールアドレスの @ の前を名前にしていたが、人に見えてしまうのでやめた。
- テーブルと権限は `supabase/migrations/20261120010000_reports_blocks.sql`：`reports`（post_id, reporter_id, reason。本人だけが読める・足せる）、`blocks`（blocker_id, blocked_id。本人だけが読める・足せる・外せる）。運営はダッシュボードで `reports` を見て、規約に反する投稿を消す。
- 他の人の言葉のメニュー（`src/utils/postMenu.ts` の `openPostMenu`：「この言葉を通報する」→ 理由（`REPORT_REASONS`）／「○○さんをブロック」→ 確認）は、AR の照合で出したカードの長押し（ネイティブの `onCardLongPressed`）と、探索画面の下のカードの「…」から出す。ログインが必要。自分の言葉には出さない。
- App.tsx はログインすると `fetchMyModeration` で自分がブロックした人（`blockedUserIds`）と通報した言葉（`reportedPostIds`）を読み、`isPostVisible` で方角タグ・地図のピン・照合で出すカード・ポケット通知（`usePocketNotice` の `hiddenUserIds` / `hiddenPostIds`）から外す。もう AR に出ているカードは `hiddenPostIds` prop でネイティブが光ごと消す（照合で出したカードの投稿者は `cardOwnersRef` に覚えておく）。
- ブロックした人は、マイページの歯車の「ブロック中の人」（`mypage/BlockedUsersModal`）で見て外せる（`unblockUser`）。名前はプロフィールの表が無いので、その人の最新の投稿の名前（`fetchUserNames`）。投稿が残っていない人は「名前のわからない人」。
- 言葉を置く前に、利用規約への同意（`TermsConsentModal`）を求める。同意はログイン情報の `user_metadata.terms_accepted` に `TERMS_VERSION`（`src/config/legal.ts`）を入れて記録し、版を上げるともう一度求める。`TERMS_URL` / `PRIVACY_URL` が空のあいだは「すべて読む」のリンクを出さない。

### その他
- 画面のお知らせは `showToast(message, kind, { symbol, subtitle })`。ホーム（AR）では `notice` prop でネイティブの案内画面（`ARGuideHUDView`、「近くのメッセージを読み込み中」と同じ見た目：少し暗くして中央に SF Symbols のアイコンと一言）に 2.5 秒出す。記録中・照合中の案内（`persistentGuide`）を出している最中なら、お知らせのあとにその案内へ戻る。ホーム以外（AR ビューが無い）では画面下の小さな帯 `CalmToast`。文言は短く穏やかにし、絵文字や失敗の詳しい理由は出さない（理由は console に出す）。`notice` は一度きりの命令なので 3 秒後に JS で `null` に戻す。
- デバッグ表示：`src/config/debug.ts` の `SHOW_AR_DEBUG`（`__DEV__`）が true のビルドで、ホームの見出し「ホーム」を長押しすると AR 画面の左下に `ARDebugOverlay` が出る（もう一度長押しで消える。ふだんは出さない）。ネイティブは `debugEnabled` のときだけ 0.5 秒ごとに `onDebugInfo`（trackingState・worldMappingStatus・照合フェーズ・読み込んだ地図と中の post: アンカー・didAdd と normal 到達の時刻）を送る。照合を止めている理由は App.tsx の `relocalizeBlockReasons` で、照合を始めるかの判定にも同じ一覧を使う（表示と判定がずれないように）。
- マイページの右上の設定は「ログアウト」と「アカウントを削除」。削除は確認のうえ `authService.deleteMyAccount`：自分の投稿を `deleteMyPost` でひとつずつ消し（ファイルも）、サーバーの `delete_my_account()`（`supabase/migrations/20261120000000_delete_account.sql`、security definer。残った投稿と `auth.users` を消す。拾った記録は cascade で消える）を呼び、端末のログイン情報を消す。
- マイページの「自分の投稿」は `posts.user_id = auth.uid()` で取る。削除は `postService.deleteMyPost`：Storage の `<id>.worldmap` と `snapshots/<id>.jpg` を先に消してから投稿を消す（Storage の削除ポリシーは「投稿の持ち主か」で判定するため、順番が逆だと消せない）。ポリシーは `supabase/migrations/20261026010000_post_delete.sql`。
- 投稿画面のタグは本文から提案された先頭 2 個を自動で選ぶ。ユーザーがタグを触るまでは本文が変わるたびに選び直す（初期の本文の ☀️ から #いい天気 が残らないように）。
- AR カード・配置プレビュー・方角タグに描くタグは `posts.tags` を使う。配置中のカードは `cardTags` prop、照合で出すカードは `RelocalizeCard.cardTags`、方角タグは `GeoTag.cardTags` で渡す。空ならタグの行を描かない（`ARViewWrapper.tagLine`）。
- アイコン（＝「アバターをつくる」で作ったアバター）は、8 種類の動物の絵（`avatar_animals_png/*.png`、512×512・クリーム色のキャンバス付き。描き直し・SVG 化・トレースはしない）の「オレンジ・黄色」の部分だけを選んだ色に変えたもの。`sh scripts/avatar-animals/build-assets.sh` が、元の絵の背景（一色のクリーム #FAF7EF のキャンバス）だけを `cut-canvas.swift` で透明にして `Images.xcassets` の `Animal*` に入れ（JS には同梱しない。外周から背景の色にぴったりの画素をたどり、背景から 3px 以内だけやや緩い基準で広げて紙の粒を消し、境目は混ざり具合を逆算してなじませる。体のクリームは青みがずれているので入らない。マスクは元の絵から作る）、キャラクターごとのマスク `Animal*Mask`（8bit グレー、白＝変える）を `build-masks.swift` で作る。マスクは色で選び（濃いオレンジは彩度 0.3〜、淡い黄色のリングなどは彩度 0.11〜の候補をかたまりごとに見て平均 0.18 以上だけ。クリームは 0.10 前後、クリームのしみは 0.14）、紙の粒の小さな点を除き、囲まれた明るい粒の穴を埋める。確認用の画像は `scripts/avatar-animals/out/`（`*_check.png` と `preview.png`）。色変えはネイティブの `AvatarRecolorCore`（`ARViewWrapper.swift` の末尾）：Core Image の 3D LUT で、マスク内の絵のいちばん多いオレンジを基準に「淡さ（彩度の比で白に寄せる）」と「陰（明るさの比）」を保ったまま選んだ色にし、`CIBlendWithMask` で元の絵と重ねる。画素の位置は動かさないので形・模様・質感は残る。**CSS フィルターのように絵全体にかけたり、SVG にトレースしたりしない**。背景色は `AvatarConfig.background`（初期はキャンバスのクリーム `AVATAR_CANVAS_COLOR` #FAF7EF、プリセットは `AVATAR_BACKGROUND_PRESETS`）で、`AnimalAvatarImage` が絵の後ろに敷く（AR のカードは丸に塗る）。`preferencesStore` の `avatarBackground`、ログイン情報の `avatar_background` に入れる。RN の画面は `AnimalAvatarImage`（`LocaAvatar.render` がキャッシュに作った PNG。ピッカーを動かしている間は最後に頼まれた色だけ作り、前の絵を下に残してちらつかせない）、AR のカードは `AvatarRecolor.image`。元のオレンジ（`ORIGINAL_ACCENT_HEX` = `originalAccentHex` = #F9B837）のときは元の絵のまま。データは `AvatarConfig`（キャラクター ID と色。背景・アタッチメントはここにフィールドを足す）で、`preferencesStore` の `avatarAnimal`・`avatarColor`、ログイン情報の `avatar_animal`・`avatar_color` に入れる。作る画面 `AvatarPickerModal` は 1 段ずつ進む（キャラクター → 色 → アイテム → 確認。段は `AVATAR_STEPS` の表）。動物と色は `src/config/avatarColors.ts` の `AVATAR_ANIMALS`・`AVATAR_COLOR_PRESETS`（とピッカー・HEX）からマイページで選び、`preferencesStore` の `avatarAnimal`・`avatarColor` に置く（ログイン情報にも `avatar_animal`・`avatar_color` として短い値だけ入れ、ログインしたときに読み戻す）。まだ選んでいない人は、アカウントの ID から決まった動物（`defaultAnimalFor`）。投稿の `handle` には `animal:cat:#RRGGBB`（`avatarHandleFor`）を入れ、言葉カード（`WordCardAvatar`）と AR のカード（`ARViewWrapper.createCardImage`）が描く。変えたら自分の過去の投稿の `handle` もまとめて更新する（`updateMyPostsAuthor`）。前の投稿の `color:#RRGGBB` は色の丸に頭文字、もっと古い絵のキーはそのまま絵で出す。置き主の名前はニックネーム（`displayNameOf`、無ければ「ゲスト」。メールアドレスの一部は使わない）。写真を選ぶ機能は消した。**画像のデータ（data: URI）をログイン情報（`user_metadata`）や `posts.handle` に入れてはいけない**：ログイン情報はトークンに入って通信のたびに送られるので、巨大になると投稿が `user_id` 空（未ログイン扱い）で保存され、地図・写真のアップロードと `worldmap_path` の書き込みが弾かれる（「この場所を覚えられませんでした」）。前のバージョンで入ってしまった巨大な `avatar_icon` は、App.tsx の `onAuthStateChange` で `'custom'` に置き換える。
- `src/assets/icons/index.ts` が PNG アイコンをまとめて `Icons` としてエクスポートしている。新しく入れる画像は、表示する大きさの 3 倍まで縮めてから入れる（アイコンは長い辺 192px。`sips -Z 192 file.png`）。
- 照合で出したカードの向きは、アンカーの向きを使わず、地面に対してまっすぐ立てて見ている人の方へ向け（`yawFacing`）、カードが画面に現れた瞬間の向きで固定する（`RevealCard.lockedRotation`）。カードの入れ物（`RevealCard.holder`）は、変換なしの `rootAnchor`（原点に固定）の子のふつうの Entity にする。`AnchorEntity(world: 向き付きの変換)` を `setOrientation(relativeTo: nil)` で動かすと、アンカーの固定の変換と二重にかかって、作った瞬間のカメラの向きのぶんだけ余分に回る（90°・45° など斜めに見えた）。アンカーの向きだと、置いた人と別の方向から来たとき横を向いて見え、古い投稿では横倒しになることがあった。
- AR には GPS の位置の「気配」（緑のぼかしの光）も方角タグも出さない（App.tsx は `geoTags` を渡さない）。言葉は照合で正確な位置にカードとしてだけ出す。ネイティブの方角タグの仕組み（`updateGeoTags`）は残っている。
- 車・電車などで移動中は言葉を置けない：`MovingSpeedMonitor`（`src/utils/movingSpeed.ts`）が GPS の速さ（iOS のドップラーの speed、無ければ位置の変化）を見て、`LOCATION_ACCURACY.fastMovingSpeedMps`（6m/s ≒ 時速 22km）以上が続けて 2 回あれば移動中。「＋」で投稿を始めるとき（お知らせ）と、書き終えて置く場面に進むとき（アラート。投稿画面は閉じず、書いた言葉は残す）に止める。
- アバターのアタッチメント（リボン・帽子・メガネ 各 4 種、`src/config/avatarAttachments.ts`）：絵は `avatar_attachments_png/*.png`（512×512 の透明 PNG）をそのまま使い、キャラクターの絵には手を加えず上に重ねる。`sh scripts/avatar-attachments/build-assets.sh` が、絵を測り（`measure-items.swift` → `item-metrics.json`。メガネはレンズの中心と直径も）、装着位置の表 `src/config/avatarAttachmentLayout.json` を作り（`build-layout.py`）、絵を `Images.xcassets/Attachment*` に（JS には同梱しない）、表を `Images.xcassets/AvatarAttachmentLayout.dataset` にコピーし、確認用の画像を `scripts/avatar-attachments/out/<キャラクター>.png` に作る。表はキャラクター × アイテムごとの x・y（絵がある範囲の中心）・幅・高さ・回転・重なり順（単位はキャラクターの絵 512px）。位置は `build-layout.py` の `FACES`（キャラクターごとの目・耳の付け根。みんな左向きの横顔）と `ITEM_ANCHORS`（アイテムの合わせる点）から計算し、1 つだけ直すときは `OVERRIDES`。帽子はどのキャラクターも同じ決め方（`HEADS`：目から頭の幅の 16% 後ろの頭のてっぺんに、頭の幅の 52% のかぶり口で、頭のてっぺんの傾きに合わせる。くま・パンダの手前の耳は帽子の下になる）。描き方は RN（`AnimalAvatarImage` の `AttachmentLayer`、% で置いて `transformOrigin` で回す）とネイティブ（`AvatarAttachments.draw`）で同じ。キャラクターの絵は不透明（クリームのキャンバス）なので、アイテムを耳の後ろには回せない。リボン・帽子・メガネから、それぞれ 1 つまで重ねて付けられる（同じカテゴリの別のものを押すと入れ替わり、もう一度押すと外れる）。装着はキャラクターごと（`AvatarConfig.attachments`、`preferencesStore` の `avatarAttachments`、ログイン情報の `avatar_attachments`）。アイテムの色：アイテムの段で、キャラクターと同じカラーピッカー・HEX・プリセット・初期カラーで、アイテムの黄色の部分だけを変えられる（付けているときだけ出す）。マスクは `build-assets.sh` がキャラクターと同じ `build-masks.swift` でアイテムごとに作り（`Images.xcassets/Attachment*Mask`、確認用は `out/masks/`）、色変えはキャラクターと同じネイティブの `AvatarRecolor.image(asset:hex:)`（RN からは `LocaAvatar.renderAttachment`）。RN はキャラクターもアイテムも `RecoloredImage`（`kind` が animal か attachment）で出す。色はカテゴリごと（アイテムの段で開いているタブのアイテムの色を変える。`AttachmentSelection.colors`、付け替えても外しても覚えておく）。投稿の handle は `animal:cat:#RRGGBB[:アイテム[:背景色]]`：アイテムは `ribbon_01#3B82F6+hat_02`（色を変えたものだけ後ろに色）、背景色は初期でなければ 5 つ目（アイテムが無ければ `animal:cat:#…::#FDE2E4`。ネイティブは空の区切りを残して読む）。`avatarHandleOf` で作り、`avatarAttachmentsOf`・`avatarAttachmentColorsOf`・`avatarBackgroundOf` で読む。素材は背景抜きが不完全なので、アプリに入れるときに直す（元の素材 `avatar_attachments_png/` は変えない。線・色・形・模様は変えない）：メガネ 01・03 のレンズの内側の不透明なクリーム色を `clear-lens.swift` で透明に（中心からつながる明るい部分を消し、ふちとの境目はふちの色を半透明で残す）、リボンとメガネの紙の縁取りのでこぼこ・はみ出し・垂れの間の紙を `clean-edges.swift` で形から幅 5px にそろえる（まるメガネ glasses_01 だけは縁取りを残さない＝幅 0）（絵の具＝紙の色でない画素を集め、半径 12px のすき間と囲まれた中を埋めた形の外を透明に。帽子は縁取りがきれいなのでそのまま。外側に濃い線を引くこともできるが、使っていない）。直したあとの絵で測って表を作る。大きさはカテゴリごとの倍率 `CATEGORY_SCALE`（リボン 1.8・帽子 1.35）で強調している。リボンは少し後ろへ傾け（-10°）、垂れが目にかからないようにしている。
- アプリを軽くするため：キャラクター・アイテムの絵は JS に同梱しない（画面にはネイティブが色を変えた絵を出し、色を変えられないとき＝iOS 以外の代わりも Images.xcassets の名前 `{ uri: 'AnimalCat' }` で読む）。カラーピッカーのグラデーションは React Native の標準機能（`experimental_backgroundImage` の `linear-gradient`）で描き、react-native-svg は使わない（依存から外した）。方角タグ・気配の JS 側の関数（`positionUncertaintyFor`・`geoTagProminenceFor`）と `PresenceSheet` は消した（ネイティブの方角タグの描画は残っている）。
