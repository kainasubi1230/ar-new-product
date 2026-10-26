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
3. 配置確定 → `placeTrigger` をインクリメント。ネイティブ側はこの数値の変化を「配置せよ」という命令として扱う
4. ネイティブがカードをアンカーに配置 → `onCardPlaced` が `x/y/z` を返す → `insertPostWithCurrentLocation()` で Geolocation から現在地を取得し、Supabase の `posts` テーブルに insert

### ARWorldMap による場所の再現（iOS のみ）
- 保存：カードは仮名 `pending:<uuid>` の `ARAnchor` 上に置かれ、`onCardPlaced` で `anchorId` が返る。JS が投稿を insert して ID を得ると `worldMapSaveRequest` を渡し、ネイティブはアンカーを `post:<posts.id>` に作り直してから `worldMappingStatus` が mapped になるまで待つ。その後、地図を Supabase Storage の `worldmaps/<postId>.worldmap` に直接アップロードする（`SupabaseStorage` struct）。最後に JS が `posts.worldmap_path` を更新する。
- 復元：ホーム表示中は `Geolocation.watchPosition` で現在地を追い、位置が変わるたびに `worldMapService.findNearbyWorldMapPosts` が 30m 以内の地図付き投稿を新しい順に取る。一番新しい地図と近くの投稿全件のカード内容を `relocalizeTarget` に渡す（GPS 誤差があるので距離では選ばない）。ネイティブは地図をダウンロードして `initialWorldMap` でセッションをやり直し、戻ってきた `post:<id>` アンカーのうち内容を知っている投稿をすべてカードで表示する。
- 地図を育てる：照合に成功したログインユーザー、または地図を保存した直後の投稿者本人がその場で見回すと（前回の保存から 15 秒以上経ち、1m 以上動くか 60° 以上向きを変えた、かつ mapped か extending のとき）、その地図を同じパスに上書き保存する。1 セッション最大 3 回、10MB まで（`checkMapGrowth`）。他人の地図を上書きするので、Storage の UPDATE ポリシーは認証ユーザー全員に開いている。
- 記録中・照合中の案内は、ネイティブの `ARGuideHUDView`（ARCoachingOverlayView 風）が `emitWorldMapStatus` / `emitRelocalizationStatus` の phase に連動して出す。JS 側に案内のバナーは無い。
  - 記録中は進み具合のバーを出す（`mappingProgress`：mapped で 1、extending は `mappingExtendingFallback` 秒の保険に向けて進む）。
  - カードを置いた瞬間に ARView のスナップショット（方角タグは隠し、置いたカードは写す）を撮り、投稿 ID が決まったら `worldmaps/snapshots/<postId>.jpg` に上げる。`onWorldMapStatus(snapshotSaved)` を受けた JS が `posts.snapshot_path` に記録する（このイベントは `worldMapPhase` を変えない）。
  - 照合中は `relocalizeTarget.snapshotPath` の写真を半透明で画面いっぱいに重ね、「この景色に合わせてください」と案内する（`relocalizationGuide`）。写真の無い投稿はアイコンと文字だけ。スマホを振らせるアニメーションは使わない。DB の列は `supabase/migrations/20261026000000_snapshots.sql`。
- 進捗は `onWorldMapStatus` / `onRelocalizationStatus` で JS に通知される。DB 側の設定は `supabase/migrations/` にある。

### 方角タグ（セカイカメラ風、iOS のみ）
- 位置合わせ（照合）なしで、周りの投稿を AR 画面に一斉に浮かべる。JS が `nearbyPostService.findNearbyPosts` で 300m 以内の投稿を近い順に最大 20 件取り、`src/utils/geo.ts` で距離と方角（北=0° 時計回り）を計算して `geoTags` prop に渡す。距離・方角の計算は、レーダーや通知でも使い回す前提。
- ネイティブは CoreMotion（`xTrueNorthZVertical`）のカメラの方角と ARKit カメラのヨー角の差から、AR 座標での北を求めて平滑化する（`northOffset`）。その方向の 3〜14m 先（実距離を圧縮）にタグを置き、毎フレームカメラの方を向かせる。セッションをやり直すと北を求め直す。
- 見え方は距離で 3 段階。しきい値は `src/config/distanceTiers.ts` の `DISTANCE_TIERS` だけで決める（`maxM` 300 / `messageM` 100 / `preciseM` 30。`NEARBY_RADIUS_M` と `WORLDMAP_RADIUS_M` もここから取る）。JS が `geoTagLevelFor` で各タグの `level` を決めて渡す。
  - `messageM`〜`maxM`：`summary`。タグと距離だけの小さいタグ（`createGeoTagSummaryImage`）
  - 〜`messageM`：`message`。本文も読めるタグ（`createGeoTagImage`）
  - 〜`preciseM`：ARWorldMap の照合を試し、成功したら正確な位置にカード。そのタグは消す（`preciseCardPostIds`）
- 配置プレビュー中はタグを隠す。
- 起動を速くするため、現在地は 3 段で埋める（App.tsx）：AsyncStorage の前回位置（`loca:lastCoords`）→ iOS のキャッシュ位置（`getCurrentPosition` の低精度・`maximumAge` 10 分）→ `watchPosition` の正確な位置。前の 2 つは `isApproximate: true` で、方角タグには使うが ARWorldMap の照合には使わない。
- `watchPosition` の値は `GpsAverager`（`src/utils/gpsAverager.ts`）に通す。誤差 15m 超は捨て、直近 5 回の良い値を誤差の小ささで重み付け平均する。屋内などで 20 秒良い値が来なければ、誤差 65m 以内の最良値を使う。平均位置が 5m 以上動いたときだけ `currentCoords` を更新する。しきい値は `src/config/locationAccuracy.ts`。
- 北の向き（`northOffset`）は 1 回で決めず、直近 4 秒の測定値の平均（cos/sin の平均）で決める。最初は 1 秒集めてから決める。コンパスの精度（`CLLocationManager` の `headingAccuracy`）が 25° より悪い間の測定値は混ぜない（まだ北が無いときだけは使う）。悪い状態が 2 秒続くと `onCompassStatus` で 8 の字の補正を案内し、15° 以下に戻ったら消す。
- 位置情報が「おおよそ」でしか許可されていない（`accuracyAuthorization == .reducedAccuracy`）と `onLocationAccuracyStatus` で知らせ、App.tsx が「設定を開く」付きの案内を出す。
- ネイティブはタグごとに `GeoTagEntity`（目標の位置・大きさ・濃さと、現在値）を持ち、毎フレーム時間ベースで目標へ寄せる（パッと飛ばさない）。新しいタグは近い順に `geoTagStaggerDelay` ずつ遅れてふわっと現れ、範囲外になったタグはふわっと消える。北を求め直した直後（`needsGeoTagSnap`）だけは、その場に置き直してもう一度ふわっと出す。
- 濃さは JS の `prominence`（`geoTagProminenceFor`、近いほど 1）から決める。透明度（`OpacityComponent`）は iOS 18 以上のみで、それ未満は大きさの変化だけになる。`highlighted`（`src/utils/interestTags.ts` の `matchesInterestTags`）が true の投稿は少し大きく濃く出す。今は App.tsx の `INTEREST_TAGS` が空なので、全件同じ見た目。
- Android 側はまだ未対応（`geoTags` prop は無視される）。

### ネイティブ AR ビュー（ブリッジ）
`src/native/UniversalARView.tsx` は `requireNativeComponent` の薄いラッパー。**登録名がプラットフォームごとに違う**：iOS は `ARView`、Android は `ARViewManager`。
- iOS：`ios/SpatialInventory/ARViewManager.swift` + `ARViewWrapper.swift`（ARKit/RealityKit）、props は `ARViewManagerBridge.m` で `RCT_EXPORT_VIEW_PROPERTY` を使ってエクスポート。`ios/` 直下にも同名ファイルがあるが Xcode プロジェクトからは参照されていない。編集するのは `ios/SpatialInventory/` 配下のもの。
- Android：`android/app/src/main/java/com/spatialinventory/ar/`（SceneView/ARCore）。`ARPackage` は `MainApplication.kt`（パッケージ名は `com.spatialinventorytemplate`）で登録している。

prop やイベントを追加・変更するときは、TS の型定義・iOS の bridge `.m` + Swift・Android の `@ReactProp`／`receiveEvent` の **3 箇所すべて** を揃えること。

### Supabase
- クライアントは `src/lib/supabase.ts`。URL と publishable key はハードコードされていて、`.env` は使っていない。セッションは AsyncStorage に保存し、`react-native-url-polyfill` が必須。
- 認証（メール＋パスワード）は `src/services/authService.ts`。username はサインアップ時に `user_metadata.username` へ入る。
- `posts` テーブルのカラム（`postService.ts` から推定）：`message, lat, lng, accuracy_m, author, handle, tags[], ar_x, ar_y, ar_z, worldmap_path, user_id`。`user_id` は DB のデフォルト値 `auth.uid()` で自動的に入り、投稿者だけが自分の行を UPDATE できる。

### その他
- マイページの「自分の投稿」は `posts.user_id = auth.uid()` で取る。削除は `postService.deleteMyPost`：Storage の `<id>.worldmap` と `snapshots/<id>.jpg` を先に消してから投稿を消す（Storage の削除ポリシーは「投稿の持ち主か」で判定するため、順番が逆だと消せない）。ポリシーは `supabase/migrations/20261026010000_post_delete.sql`。
- AR カード・配置プレビュー・方角タグに描くタグは `posts.tags` を使う。配置中のカードは `cardTags` prop、照合で出すカードは `RelocalizeCard.cardTags`、方角タグは `GeoTag.cardTags` で渡す。空ならタグの行を描かない（`ARViewWrapper.tagLine`）。
- `src/assets/icons/index.ts` が PNG アイコンをまとめて `Icons` としてエクスポートしている。
- 通知画面は `src/data/notifications.ts` の静的モックデータで、まだバックエンドとは接続していない。
