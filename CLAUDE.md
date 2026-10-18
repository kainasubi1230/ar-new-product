# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

React Native（0.85 / React 19、bare workflow・Expo なし）の AR アプリ「Spatial Inventory」。ユーザーは AR カメラ上の現実空間にメッセージカードを置き、そのカードを現在地（緯度経度）と AR 座標付きで Supabase に保存する。UI 文言やコードコメントは日本語。

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
`App.tsx` がアプリ全体の状態（タブ切り替え・ログインユーザー・投稿中カードの内容・配置モード・トースト）をすべて持っている。ナビゲーションライブラリは使っていない。`activeTab`（`home | radar | notifications | mypage`）で画面を切り替え、各画面は `src/components/` の props 駆動コンポーネント。ホームタブ＝AR カメラで、AR ビューはアンマウントせず、他タブ表示中は非表示にしているだけ。

### 投稿フロー（JS ↔ ネイティブを行き来する）
1. AR ビューをタップ → ネイティブから `onScreenTapped` → 未ログインならマイページへ誘導、ログイン済みなら `PostModal` を開く
2. 投稿内容を送信 → `isPlacementMode=true`（ネイティブ側の `isPreviewActive`）でプレビュー表示
3. 配置確定 → `placeTrigger` をインクリメント。ネイティブ側はこの数値の変化を「配置せよ」という命令として扱う
4. ネイティブがカードをアンカーに配置 → `onCardPlaced` が `x/y/z` を返す → `insertPostWithCurrentLocation()` で Geolocation から現在地を取得し、Supabase の `posts` テーブルに insert

### ARWorldMap による場所の再現（iOS のみ）
- 保存：カードは仮名 `pending:<uuid>` の `ARAnchor` 上に置かれ、`onCardPlaced` で `anchorId` が返る。JS が投稿を insert して ID を得ると `worldMapSaveRequest` を渡し、ネイティブはアンカーを `post:<posts.id>` に作り直してから `worldMappingStatus` が mapped になるまで待つ。その後、地図を Supabase Storage の `worldmaps/<postId>.worldmap` に直接アップロードする（`SupabaseStorage` struct）。最後に JS が `posts.worldmap_path` を更新する。
- 復元：ホームを開くと `worldMapService.findNearestPostWithWorldMap` が 30m 以内の投稿を探し、`relocalizeTarget` に渡す。ネイティブは地図をダウンロードして `initialWorldMap` でセッションをやり直し、`post:<id>` アンカーが戻ったらカードを表示する。
- 進捗は `onWorldMapStatus` / `onRelocalizationStatus` で JS に通知される。DB 側の設定は `supabase/migrations/` にある。

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
