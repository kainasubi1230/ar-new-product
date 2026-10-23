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
- 進捗は `onWorldMapStatus` / `onRelocalizationStatus` で JS に通知される。DB 側の設定は `supabase/migrations/` にある。

### 方角タグ（セカイカメラ風、iOS のみ）
- 位置合わせ（照合）なしで、周りの投稿を AR 画面に一斉に浮かべる。JS が `nearbyPostService.findNearbyPosts` で 300m 以内の投稿を近い順に最大 20 件取り、`src/utils/geo.ts` で距離と方角（北=0° 時計回り）を計算して `geoTags` prop に渡す。距離・方角の計算は、レーダーや通知でも使い回す前提。
- ネイティブは CoreMotion（`xTrueNorthZVertical`）のカメラの方角と ARKit カメラのヨー角の差から、AR 座標での北を求めて平滑化する（`northOffset`）。その方向の 3〜14m 先（実距離を圧縮）にタグを置き、毎フレームカメラの方を向かせる。セッションをやり直すと北を求め直す。
- 地図の照合や自分の配置で正確な位置にカードが出ている投稿（`preciseCardPostIds`）のタグは消す。配置プレビュー中はタグを隠す。
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
- `src/assets/icons/index.ts` が PNG アイコンをまとめて `Icons` としてエクスポートしている。
- 通知画面は `src/data/notifications.ts` の静的モックデータで、まだバックエンドとは接続していない。
