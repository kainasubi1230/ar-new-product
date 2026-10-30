# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

React Native（0.85 / React 19、bare workflow・Expo なし）の AR アプリ「Loca」（ネイティブのプロジェクト名・モジュール名は旧仮名の `SpatialInventory` のまま）。ユーザーは AR カメラ上の現実空間にメッセージカードを置き、そのカードを現在地（緯度経度）と AR 座標付きで Supabase に保存する。UI 文言やコードコメントは日本語。

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

### 投稿フロー（JS ↔ ネイティブを行き来する）
1. AR ビューをタップ → ネイティブから `onScreenTapped` → 未ログインならマイページへ誘導、ログイン済みなら `PostModal` を開く
2. 投稿内容を送信 → `isPlacementMode=true`（ネイティブ側の `isPreviewActive`）でプレビュー表示
   - プレビューは画面中央の平面（地面・机・壁）に置く。平面がカメラから 4m より遠い、または見つからないときは、カメラの真正面 1.0m の空中に浮かべる（`isFloatingPlacement`、外の広い場所用。3.5m より近づくと平面に戻る）。
3. 配置確定 → `placeTrigger` をインクリメント。ネイティブ側はこの数値の変化を「配置せよ」という命令として扱う
4. ネイティブがカードをアンカーに配置 → `onCardPlaced` が `x/y/z` を返す → `insertPostWithCurrentLocation()` で Geolocation から現在地を取得し、Supabase の `posts` テーブルに insert

### ARWorldMap による場所の再現（iOS のみ）
- 保存：カードは仮名 `pending:<uuid>` の `ARAnchor` 上に置かれ、`onCardPlaced` で `anchorId` が返る。JS が投稿を insert して ID を得ると `worldMapSaveRequest` を渡し、ネイティブはアンカーを `post:<posts.id>` に作り直してから `worldMappingStatus` が mapped になるまで待つ。その後、地図を Supabase Storage の `worldmaps/<postId>.worldmap` に直接アップロードする（`SupabaseStorage` struct）。最後に JS が `posts.worldmap_path` と、その地図に入っている `post:` アンカーの投稿 ID 一覧 `posts.worldmap_post_ids` を更新する。extending のまま mapped にならないときの保険は `mappingExtendingFallback`（15 秒）。
- 復元：ホーム表示中は `Geolocation.watchPosition` で現在地を追う。照合には、誤差 15m 以下の平均（`currentCoords`、方角タグ用）を待たず、生の値が 65m 以内になった時点の `relocalizeCoords` を使い、`relocalizeSearchRadiusFor`（max(30m, 誤差+20m)、上限 100m）の範囲で `findNearbyWorldMapPosts` が地図付き投稿を取る。`chooseWorldMapPost` で「範囲内の投稿をいちばん多く含む地図（同数なら新しいほう）」を選び、範囲内の投稿全件のカード内容と一緒に `relocalizeTarget` に渡す。ネイティブは地図をダウンロードして `initialWorldMap` でセッションをやり直す。`didAdd` で届いた `post:` アンカーは、trackingState が normal になる（位置合わせが終わる）まで `pendingRelocalizedAnchors` に取っておき、normal になってから内容を知っている投稿をすべてカードで表示する（found と地図を育てる処理もその後に始まる）。
- 地図を育てる：照合に成功したログインユーザー、または地図を保存した直後の投稿者本人がその場で見回すと（前回の保存から 15 秒以上経ち、1m 以上動くか 60° 以上向きを変えた、かつ mapped か extending のとき）、その地図を同じパスに上書き保存する。1 セッション最大 3 回、10MB まで（`checkMapGrowth`）。他人の地図を上書きするので、Storage の UPDATE ポリシーは認証ユーザー全員に開いている。
- 記録中・照合中の案内は、ネイティブの `ARGuideHUDView`（ARCoachingOverlayView 風）が `emitWorldMapStatus` / `emitRelocalizationStatus` の phase に連動して出す。JS 側に案内のバナーは無い。
  - 記録中は進み具合のバーを出す（`mappingProgress`：mapped で 1、extending は `mappingExtendingFallback` 秒の保険に向けて進む）。
  - カードを置いた瞬間に ARView のスナップショット（方角タグは隠し、置いたカードは写す）を撮り、投稿 ID が決まったら `worldmaps/snapshots/<postId>.jpg` に上げる。`onWorldMapStatus(snapshotSaved)` を受けた JS が `posts.snapshot_path` に記録する（このイベントは `worldMapPhase` を変えない）。
  - 照合中は `relocalizeTarget.snapshots`（その地図に入っている投稿の写真を、今いる場所から近い順に）を半透明で画面いっぱいに重ね、「この景色に合わせてください」と案内する（`relocalizationGuide`）。1 つの地図に何部屋分も入っていることがあり GPS では部屋を区別できないので、複数あれば 4 秒ごとに切り替える（`cycleRelocalizationSnapshot`）。写真の無い投稿はアイコンと文字だけ。スマホを振らせるアニメーションは使わない。DB の列は `supabase/migrations/20261026000000_snapshots.sql`。
- 照合で出したカードは、1 つの地図で家じゅうのカードが一度に出るので、カメラとの間に壁や物があれば薄れて、その正確な位置にごく薄い光だけが残る（`RevealCard` / `updateCardReveal`）。0.25 秒ごとに `isOccluded` でカメラからカードへの間を調べる。手がかりは 3 つ：①今のフレームの特徴点（`rawFeaturePoints`）がカードへの細い円すいの中、カードより手前に 3 個以上ある（全機種。LiDAR の無い iPhone の主な手がかり、`featurePointsBetween`）、②ARKit の平面（`existingPlaneGeometry`）に当たる、③LiDAR 機では部屋のメッシュ（`sceneUnderstanding` の `.collision`）に当たる。いずれもカードの手前 0.3m より近いものだけ数える。特徴点はちらつくので `occlusionScore`（0〜4）が 3 以上で隠し 1 以下で見せる。画面外のカードは判定せず前の状態のまま。LiDAR が無いと、模様の無い白い壁の向こうは見えてしまうことがある。自分がその場で置いたカードは対象外（常に見える）。
- 進捗は `onWorldMapStatus` / `onRelocalizationStatus` で JS に通知される。DB 側の設定は `supabase/migrations/` にある。

### 方角タグ（セカイカメラ風、iOS のみ）
- 位置合わせ（照合）なしで、周りの投稿を AR 画面に一斉に浮かべる。JS が `nearbyPostService.findNearbyPosts` で 300m 以内の投稿を近い順に最大 20 件取り、`src/utils/geo.ts` で距離と方角（北=0° 時計回り）を計算して `geoTags` prop に渡す。距離・方角の計算は、レーダーや通知でも使い回す前提。
- ネイティブは CoreMotion（`xTrueNorthZVertical`）のカメラの方角と ARKit カメラのヨー角の差から、AR 座標での北を求めて平滑化する（`northOffset`）。タグは「GPS の位置が届いたときのカメラ位置」（`geoOriginCameraPosition`、`geoTags` が更新されたときに記録）から、その方向の実際の距離（上限 `geoTagMaxRenderDistance` 40m）に置いて空間に固定し、毎フレームカメラの方を向かせる。今のカメラ基準で置き直すと歩いた分だけ逃げていくので、そうしない。見かけの幅（角度）は本当の距離で決める（30m で約 0.17rad、300m で約 0.10rad）。重なりは方角と仰角で判定して上に積む。セッションをやり直すと北と基準位置を求め直す。
- 見え方は位置の確かさと距離で決める。しきい値は `src/config/distanceTiers.ts` の `DISTANCE_TIERS` だけで決める（`maxM` 300 / `messageM` 100 / `preciseM` 30。`NEARBY_RADIUS_M` と `WORLDMAP_RADIUS_M` もここから取る）。JS が `geoTagLevelFor` で各タグの `level` を決めて渡す。
  - 照合に成功：正確な位置にくっきりしたカード。その投稿のタグ・気配は消す（`preciseCardPostIds`）
  - 〜`preciseM` で照合できていない：`presence`。その方角の実際の距離に、文字のない光の「気配」（`presenceMesh` + 放射状グラデーション、4 秒周期でゆっくり明滅）。大きさは位置の不確かさ `uncertaintyM`（置いたときと今の GPS 誤差を合わせたもの、`positionUncertaintyFor`）で決める。光は近づくと画面を覆うので、見かけの大きさに上限（カメラからの距離 × `glowMaxApparentSize`）を付け、`glowFadeStart`〜`glowFadeEnd`（0.8〜2.5m）で近づくほど薄くする（`glowNearFade`。隠れたカードの光も同じ）。タップすると `onPresenceTapped` → `PresenceSheet` が「このあたりに○○さんのメッセージがあります（景色が合うとその場所に現れます）」と置いたときの景色の写真を出す（本文は見せない）
  - `preciseM`〜`messageM`：`message`。本文も読めるタグ（`createGeoTagImage`）
  - `messageM`〜`maxM`：`summary`。タグと距離だけの小さいタグ（`createGeoTagSummaryImage`）
- 配置プレビュー中はタグを隠す。
- 起動を速くするため、現在地は 3 段で埋める（App.tsx）：AsyncStorage の前回位置（`loca:lastCoords`）→ iOS のキャッシュ位置（`getCurrentPosition` の低精度・`maximumAge` 10 分）→ `watchPosition` の正確な位置。前の 2 つは `isApproximate: true` で、方角タグには使うが ARWorldMap の照合には使わない。
- `watchPosition` の値は `GpsAverager`（`src/utils/gpsAverager.ts`）に通す。誤差 15m 超は捨て、直近 5 回の良い値を誤差の小ささで重み付け平均する。屋内などで 20 秒良い値が来なければ、誤差 65m 以内の最良値を使う。平均位置が 5m 以上動いたときだけ `currentCoords` を更新する。しきい値は `src/config/locationAccuracy.ts`。
- 北の向き（`northOffset`）は 1 回で決めず、直近 4 秒の測定値の平均（cos/sin の平均）で決める。最初は 1 秒集めてから決める。コンパスの精度（`CLLocationManager` の `headingAccuracy`）が 25° より悪い間の測定値は混ぜない（まだ北が無いときだけは使う）。悪い状態が 2 秒続くと `onCompassStatus` を送るが、今はホームに 8 の字の案内は出していない（出すのは「正確な位置情報がオフ」の案内だけ）。
- 位置情報が「おおよそ」でしか許可されていない（`accuracyAuthorization == .reducedAccuracy`）と `onLocationAccuracyStatus` で知らせ、App.tsx が「設定を開く」付きの案内を出す。
- ネイティブはタグごとに `GeoTagEntity`（目標の位置・大きさ・濃さと、現在値）を持ち、毎フレーム時間ベースで目標へ寄せる（パッと飛ばさない）。新しいタグは近い順に `geoTagStaggerDelay` ずつ遅れてふわっと現れ、範囲外になったタグはふわっと消える。北を求め直した直後（`needsGeoTagSnap`）だけは、その場に置き直してもう一度ふわっと出す。
- 濃さは JS の `prominence`（`geoTagProminenceFor`、近いほど 1）から決める。透明度（`OpacityComponent`）は iOS 18 以上のみで、それ未満は大きさの変化だけになる。`highlighted`（`src/utils/interestTags.ts` の `matchesInterestTags`）が true の投稿は少し大きく濃く出す。関心タグは下の「関心タグとポケット通知」を参照。
- Android 側はまだ未対応（`geoTags` prop は無視される）。

### ネイティブ AR ビュー（ブリッジ）
`src/native/UniversalARView.tsx` は `requireNativeComponent` の薄いラッパー。**登録名がプラットフォームごとに違う**：iOS は `ARView`、Android は `ARViewManager`。
- iOS：`ios/SpatialInventory/ARViewManager.swift` + `ARViewWrapper.swift`（ARKit/RealityKit）、props は `ARViewManagerBridge.m` で `RCT_EXPORT_VIEW_PROPERTY` を使ってエクスポート。`ios/` 直下にも同名ファイルがあるが Xcode プロジェクトからは参照されていない。編集するのは `ios/SpatialInventory/` 配下のもの。
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
- ピンの見た目と、下のカードで本文を見せるかは `geoTagLevelFor` の段階で AR とそろえる（presence：淡いピン＋位置の誤差 `accuracy_m` の輪で「このあたり」・本文なし、message：本文あり、summary：小さく薄いピン・本文なし）。
- 下のカードの「右前方 80m」と矢印は、スマホの向き `useHeading`（`src/hooks/useHeading.ts`）を使う。AR ビューは他のタブで破棄されるので、方位だけを送るネイティブの `LocaHeading`（`RCTEventEmitter`、`CLLocationManager` の heading）を ARViewWrapper.swift の末尾に置き、`ARViewManagerBridge.m` で公開している（新しい Swift ファイルを足すと Xcode のプロジェクト設定の編集が要るため）。

### 関心タグとポケット通知
- 関心タグとポケット通知のオン・オフは `src/services/preferencesStore.ts`（AsyncStorage の `loca:preferences`）に保存し、`usePreferences` で共有する。設定する場所はマイページの「関心タグ」タブ（とタグ管理モーダル。どちらも同じ値を読み書き）。関心タグに合う投稿は、AR の方角タグ（`highlighted`）と地図のピン（`pinHeadInterest`）で少し目立たせる。
- ポケット通知は、関心タグに合うメッセージ（自分の投稿以外）から `POCKET_NOTICE.radiusM`（20m）以内に入ったらローカル通知を出す（本文は出さない）。位置の見張り・判定・通知・履歴はネイティブの `LocaPocket`（ARViewWrapper.swift の末尾、`ARViewManagerBridge.m` で公開）が行い、アプリを開いてからポケットに入れた状態（画面ロック・別アプリ）でも届く（`allowsBackgroundLocationUpdates`。Info.plist の `UIBackgroundModes: location`。位置の許可は「使用中のみ」のまま）。アプリを完全に閉じた状態は対象外。
- JS（App.tsx）は、ネイティブから届く位置（`pocketLocation`、50m ごと）で `refetchDistanceM` 動くたびに `findNearbyPosts`（`targetRadiusM` 500m）を取り直し、対象を `updatePocketTargets` で渡す。動いていなくても `refreshIntervalMs`（30 秒）ごとに取り直す（同じ場所にいるまま、あとから置かれたメッセージに気づくため）。ネイティブは対象を受け取るたびに、最後の位置ですぐ判定する（`notifyIfNear`）。通知は同じメッセージで 1 日 1 回、通知どうし 3 分あける、GPS 誤差 40m 超では判定しない（`src/config/pocketNotice.ts`）。通知のタップでホームを開く。通知画面は `LocaPocket.getHistory`（UserDefaults、最大 50 件）の履歴を出す。開発ビルドでマイページの設定から「開発用の情報を表示」をオンにすると（`preferencesStore` の `showDevInfo`、初期値オフ）、通知画面に `PocketDebugPanel`（`LocaPocket.getStatus`：通知の許可・見張りの有無・対象の件数・いちばん近い対象までの距離・GPS の誤差・直近の判定結果）と、通知した記録を消す「リセット」（`resetNotified`）が出る。

### 拾った言葉
- 照合で出した他の人のカード（隠れずに見えているもの、`revealedCard`）をタップすると、ネイティブが `onCardTapped` を送り、JS（`handleCardTapped`）が `readService.collectPost` で `post_reads`（post_id, user_id, read_at）に記録して「📖 ○○さんの言葉を拾いました」と出す（カードは軽くふくらむ）。もう拾っていれば「この言葉はもう拾っています」（主キー重複 23505）。ログイン中だけ、自分の言葉はタップしても何もしない。
- 他の人のカードが初めて画面に現れたとき（`onRelocalizationStatus(seen)`）に、「カードをタップすると、言葉を拾えます」を 1 回の起動で 1 回だけ出す。
- マイページの「拾った言葉」は `fetchCollectedPosts`、「残した言葉」の「◯人が読んだよ」と、AR のカードの右下の「👣 3」は `posts.read_count`（拾われた人数。`post_reads` の追加・削除で DB のトリガーが増減する。`20261026060000_post_read_count.sql`。拾った記録そのものは本人と投稿者しか読めないが、人数は誰でも読める）。テーブルと RLS は `supabase/migrations/20261026040000_post_reads.sql`。拾うときは、そのときの自分の位置（`post_reads.lat / lng`）と場所の名前（`place_name`。ネイティブの `LocaGeocoder`＝iOS 標準の `CLGeocoder` で求める。3 秒で取れなければ null。`src/services/geocoder.ts`）も残し、マイページに「📍 天神で 10/26 に拾った」と出す（列は `20261026070000_post_reads_place.sql`）。拾った言葉はマイページから外せる（`uncollectPost`、自分の記録だけ消せる DELETE ポリシーは `20261026050000_post_reads_delete.sql`）。外しても相手の言葉は消えず、その言葉の「誰かが読んだよ」が 1 減る。

### その他
- 画面のお知らせは `showToast(message, kind, { symbol, subtitle })`。ホーム（AR）では `notice` prop でネイティブの案内画面（`ARGuideHUDView`、「近くのメッセージを読み込み中」と同じ見た目：少し暗くして中央に SF Symbols のアイコンと一言）に 2.5 秒出す。記録中・照合中の案内（`persistentGuide`）を出している最中なら、お知らせのあとにその案内へ戻る。ホーム以外（AR ビューが無い）では画面下の小さな帯 `CalmToast`。文言は短く穏やかにし、絵文字や失敗の詳しい理由は出さない（理由は console に出す）。`notice` は一度きりの命令なので 3 秒後に JS で `null` に戻す。
- デバッグ表示：`src/config/debug.ts` の `SHOW_AR_DEBUG`（`__DEV__`）が true のビルドで、ホームの見出し「ホーム」を長押しすると AR 画面の左下に `ARDebugOverlay` が出る（もう一度長押しで消える。ふだんは出さない）。ネイティブは `debugEnabled` のときだけ 0.5 秒ごとに `onDebugInfo`（trackingState・worldMappingStatus・照合フェーズ・読み込んだ地図と中の post: アンカー・didAdd と normal 到達の時刻）を送る。照合を止めている理由は App.tsx の `relocalizeBlockReasons` で、照合を始めるかの判定にも同じ一覧を使う（表示と判定がずれないように）。
- マイページの「自分の投稿」は `posts.user_id = auth.uid()` で取る。削除は `postService.deleteMyPost`：Storage の `<id>.worldmap` と `snapshots/<id>.jpg` を先に消してから投稿を消す（Storage の削除ポリシーは「投稿の持ち主か」で判定するため、順番が逆だと消せない）。ポリシーは `supabase/migrations/20261026010000_post_delete.sql`。
- 投稿画面のタグは本文から提案された先頭 2 個を自動で選ぶ。ユーザーがタグを触るまでは本文が変わるたびに選び直す（初期の本文の ☀️ から #いい天気 が残らないように）。
- AR カード・配置プレビュー・方角タグに描くタグは `posts.tags` を使う。配置中のカードは `cardTags` prop、照合で出すカードは `RelocalizeCard.cardTags`、方角タグは `GeoTag.cardTags` で渡す。空ならタグの行を描かない（`ARViewWrapper.tagLine`）。
- `src/assets/icons/index.ts` が PNG アイコンをまとめて `Icons` としてエクスポートしている。
