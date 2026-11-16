# アプリ修正点2 実装・対応まとめ（堀川）

README.md に記載された4つの項目について、課題の解決策の設計および実装を完了しました。

---

## 1. マイページのアイコン：好きな画像設定 ＆ 不適切画像の禁止

### 実装した機能
- **写真ライブラリからのカスタム画像選択 (`LocaAvatarPicker`)**:
  - iOS ネイティブの `PHPickerViewController` を用いた画像ピッカーモジュールを実装（`ios/SpatialInventory/ARViewManager.swift` / `ARViewManagerBridge.m` / `src/native/AvatarPicker.ts`）。
  - 選択された画像を `256x256` の正方形に自動リサイズ・JPEG圧縮し、Base64 Data URI として保存・反映します。
- **不適切なアイコンの自動ブロック（オンデバイス安全検査）**:
  - **SensitiveContentAnalysis (iOS 17+)**: Apple純正のオンデバイス解析（`SCSensitivityAnalyzer`）により、センシティブなコンテンツをサーバー送信前に端末内で検知・拒否します。
  - **Vision フレームワーク (`VNClassifyImageRequest`)**: iOS 14+ 全端末向けに、武器・暴力・露骨な表現・タバコ・薬物等の不適切カテゴリを高精度で検出し、該当する画像が選ばれた場合はアラートを表示して設定をブロックします。
- **UI・ARカードへのシームレスな反映**:
  - `MyPageScreen.tsx` のアバター選択モーダルに「写真ライブラリから好きな画像を選ぶ」ボタンを追加。
  - `WordCard.tsx`（残した言葉・拾った言葉）および `ARViewWrapper.swift`（AR空間に浮かぶ3Dカード）でカスタム画像を円形クリップして描画するよう対応しました。

---

## 2. 安心フィルター：ユーザーが内容とは違うタグをつける問題への解決策

### 課題と解決アプローチ
悪意や勘違いにより、愚痴・トラブル・危険な内容に対して「#散歩」「#カフェ」などのポジティブなタグが偽装されたり、タグ無しで投稿された場合でもフィルターがすり抜けないよう、**「タグ判定 ＋ 本文セマンティクス解析」の二重防御**を実装しました。

### 実装した機能 (`src/services/interestTagService.ts`, `src/utils/interestTags.ts`)
- **タグ偽装を無効化する `isBlockedBySafetyFilter` の導入**:
  - **本文感情分析**: 投稿者が付けたタグに関わらず、投稿本文（`message`）を `analyzeSentiment()` で解析し、強いネガティブ表現を自動ブロック。
  - **除外トピック・シノニム辞書 (`MUTED_TOPIC_SYNONYMS`)**: ユーザーが選択した除外タグ（例: `#愚痴`, `#混雑`, `#騒音`, `#危険`, `#タバコ`, `#クレーム`, `#トラブル`）について、関連する類義語・口語表現（例: `最悪`, `むかつく`, `満員`, `行列`, `うるさい`, `危ない` など）を本文テキストから直接スキャンし、偽装タグが付いていても確実に非表示化します。
  - AR表示・地図・探索・マイページのすべてに共通適用しました。

---

## 3. 関心タグ：ユーザーが増えタグの種類が増えた時への解決策

### 課題と解決アプローチ
ユーザー増加に伴いタグが何千・何万種類と乱立し、表記揺れや細分化により関心タグがヒットしなくなる・選びにくくなる問題に対し、**「大カテゴリ階層化 ＋ 表記揺れ・同義語統合 ＋ 複合タグ吸収」**を実装しました。

### 実装した機能 (`src/services/interestTagService.ts`, `src/components/MyPageScreen.tsx`)
- **表記揺れの正規化 (`canonicalTagKey`)**:
  - 全角/半角（NFKC正規化）、大文字/小文字、カタカナ/ひらがなを統一してマッチング。
- **同義語（シノニム）統合辞書 (`TAG_SYNONYM_GROUPS`)**:
  - 例：`#カフェ` / `#cafe` / `#coffee` / `#珈琲` / `#喫茶店` や `#散歩` / `#さんぽ` / `#ウォーキング` / `#散策` を同一グループとして展開。
- **大カテゴリによる派生・複合タグの自動網羅 (`matchesTagFilter`)**:
  - `#隠れ家カフェ` や `#穴場散歩コース` のような新しい複合タグが増えても、親カテゴリ（`#カフェ` や `#散歩`）のキーワードを含む場合は自動で関心タグにヒットするよう設計しました。
- **フリータグ検索＆追加UI (`MyPageScreen.tsx`)**:
  - 大カテゴリカードの下に「特定のタグを検索・追加」エリアを新設。文字入力に応じて候補タグをインクリメンタルに絞り込み、任意のカスタムタグも手軽に追加・解除できます。

---

## 4. よりARの精度向上：メッセージカードの瞬間移動NG

### 実装した機能 (`ios/SpatialInventory/ARViewWrapper.swift`)
- **位置と回転の双方向スムージング補間**:
  - プレビュー追従時（`updatePreview()`）に距離を問わず常に指数平滑化（`simd_mix`）を適用し、平面の切り替わり時にカードが遠くへ瞬間移動（ワープ）する現象を完全に抑制。
  - カードの向き（`faceGhostCardToCamera`）にも球面線形補間（`simd_slerp`）を導入し、カメラの急激な傾きによるカクつきをなくしました。
- **トラッキング不安定時の座標ロック**:
  - カメラを激しく動かした直後や特徴点不足時（`.limited(.excessiveMotion)` / `.insufficientFeatures)`）は、レイキャストの暴れによる瞬間移動を防ぐため直前の安定座標をホールドするよう制御しました。
- **プレビューリセットの整合性向上**:
  - 配置モードの開始・終了時に前回座標をクリーンにリセットすることで、次回配置開始時に遠くから飛んでくる違和感を解消しました。

---

## 5. AR再表示の不具合解消 ＆ 座標精度のさらなる向上

「表示されるはずのカードが出てこない」「再表示の座標精度をもっと細かくしたい」という課題に対して、`ios/SpatialInventory/ARViewWrapper.swift` に以下の修正を実施しました。

### ① 「カードが出てこない」原因の解消
- **照合完了フラグ（`hasRelocalizedToWorldMap`）の判定修正**:
  - `.relocalizing` を経て `.normal` に復帰した際、保留中アンカーの有無にかかわらず照合完了フラグを立てるように修正（`markRelocalized()`）。これにより、`.normal` になった後でARKitから届いたアンカーも即座に表示されるようになりました。
  - `session(_:didUpdate:)` でもトラッキング状態が `.normal` のときに限定して照合完了を確定するように厳格化しました。
- **物の陰（オクルージョン）判定の誤爆修正（`isOccluded`）**:
  - 従来は特徴点がわずか **3個** あるだけで「間に物がある」と誤判定してカードを隠してしまっていたため、机の模様や空間ノイズでもカードが消えてしまう原因になっていました。
  - LiDAR搭載端末では正確なメッシュと平面のみで判定し、非LiDAR端末でも特徴点の閾値を **3個 → 18個** へ引き上げ、手前判定の余白（`occlusionMargin`）を `0.3m → 0.45m` に拡大することで、何もない空間でカードが隠れてしまう現象を解消しました。

### ② 再表示の座標精度向上 ＆ 瞬間移動・跳ねの防止
- **ワールド座標ホルダーによる毎フレーム滑らか追従**:
  - 照合されたカードを `ARAnchor` に直接固定せず、ワールド座標のホルダー（`AnchorEntity(world:)`）に乗せ、`updateCardReveal()` 内で `ARAnchor` の最新位置・向きへ毎フレーム補間（`simd_mix` / `simd_slerp`）するようにしました。
  - これにより、照合直後にARKitがアンカー位置を細かく補正してもカードがワープ・跳ねることなく定位置へ吸い付くように整列します。
- **アンカー安定待機（`isSettled` チェック）**:
  - アンカー位置のブレが `0.015m`（1.5cm）以内に `0.5秒間` 収まって安定するまではカード本体を出さず（薄い光のみ表示）、位置がしっかり確定してからカードをフェードインさせるようにしました。

---

## 6. 遠くのカードを再取得してしまう問題の修正

「全然離れている場所のカードを再取得しようとしてしまう」問題に対して、現在地からの距離・検索範囲・GPS誤差フィルタを見直しました。

- **距離優先の地図選択 (`src/services/worldMapService.ts`)**:
  - 従来 `chooseWorldMapPost` は現在地からの距離を見ず「含まれる投稿数が多い・新しい地図」を優先していたため、目の前に地図があっても遠くの地図を読みに行ってしまう問題がありました。
  - 現在地からの距離バンド（`15m` 刻み）が小さい（近い）地図を最優先し、同じ距離圏内の候補同士でのみ投稿数・新しさで選ぶように変更しました。
- **地図検索範囲の適正化 (`src/config/distanceTiers.ts`)**:
  - 照合候補を探す半径の上限を `100m → 40m`（最小 `15m`、GPS誤差マージン `20m → 10m`）に絞り込み、遠くの別の建物や通りの地図を候補に入れないようにしました。
- **粗いGPSでの検索抑止 (`src/config/locationAccuracy.ts`, `App.tsx`)**:
  - 起動直後の誤差が大きいGPS（従来は最大 `65m` まで即時採用）で遠くの地図を誤検索するのを防ぐため、照合候補の検索には通常 `30m` 以内のGPSのみを使用するように制限しました（8秒待っても取れない屋内等の場合のみ `45m` まで緩和）。

---

## 7. タブ移動後に「見つかりませんでした」が消え残る不具合の修正

ホームで「景色が見つかりませんでした」と表示された直後に探索画面など別タブへ移動してすぐ戻ると、通知が消え残ってしまう（または再表示される）問題を修正しました。

- **原因**: `notice`（および `toast`）が 3秒タイマーが切れるまで `null` に戻らないため、タブ切り替えで `ARViewWrapper` が作り直された際に古い `notice` prop を受け取って最初から 2.5秒間再表示してしまっていたこと、またネイティブ側で `notice = nil` になった際の即時非表示処理がなかったことが原因でした。
- **タブ離脱時の通知クリア (`App.tsx`)**:
  - `activeTab !== 'home'` になったタイミングで実行中の `noticeTimerRef` / `toastTimerRef` を即座に `clearTimeout` し、`setNotice(null)` / `setToast(null)` でクリーンにするようにしました。
- **ネイティブ側の即時非表示 (`ios/SpatialInventory/ARViewWrapper.swift`)**:
  - `handleNotice()` で `notice == nil` を受け取った際、待機中の `noticeEndWorkItem` をキャンセルして即座に `guideHUD` を非表示に戻す処理を追加しました。

---

## 8. 再取得中にカードの位置を示すモヤ（気配の光）が移動するバグの修正

照合（再取得）中に、カードのおおよその位置を示すモヤ（`presence` の光 / `glow`）が空間内を移動してしまう問題を修正しました。

- **原因**: 再取得中（`isRunningWithWorldMap && relocalization != nil`）に GPS の微細な更新やコンパス再計算が発生するたび、`geoOriginCameraPosition` や `geoTagEntities` の目標座標（`target`）が書き換わっていたこと、また `ARAnchor` の微細な揺れがそのまま `holder` を動かしていたことが原因でした。
- **再取得中の基準座標ロック (`ios/SpatialInventory/ARViewWrapper.swift`)**:
  - `geoTags` の更新時、再取得中かつ既に基準位置（`geoOriginCameraPosition`）がある場合は上書きしないようにしました。
  - `layoutGeoTags()` で、再取得中は既に配置済みのモヤ（`existing.isPresence`）の `target` 更新と `snap` 再配置をスキップし、その場に静止させ続けるようにしました。
- **アンカー追従のデッドバンド追加 (`updateCardReveal`)**:
  - `ARAnchor` と `holder` の位置差が `0.02m`（2cm）以下の微細なジッターである場合は位置を更新しないデッドバンドを設け、モヤが細かく震えて移動して見える現象を抑止しました。

---

## 変更ファイル一覧
- `App.tsx`
- `ios/SpatialInventory/ARViewManager.swift`
- `ios/SpatialInventory/ARViewManagerBridge.m`
- `ios/SpatialInventory/ARViewWrapper.swift`
- `src/native/AvatarPicker.ts` (新規)
- `src/components/WordCard.tsx`
- `src/components/MyPageScreen.tsx`
- `src/services/interestTagService.ts`
- `src/services/worldMapService.ts`
- `src/utils/interestTags.ts`
- `src/config/distanceTiers.ts`
- `src/config/locationAccuracy.ts`
- `WORK_SUMMARY.md` (本まとめファイル)

