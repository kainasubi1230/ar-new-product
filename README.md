# Loca

現実空間に言葉を残す、空間メディア（iOS / React Native + ARKit + Supabase）。

- 仕組み・決まりごと・ファイルの分け方は [CLAUDE.md](CLAUDE.md) にまとめています。
- データベースの変更は `supabase/migrations/` にあります（Supabase の SQL Editor で実行）。

## 動かし方

```sh
npm install
cd ios && pod install && cd ..
npm start          # Metro
# Xcode で ios/SpatialInventory.xcworkspace を開き、実機を選んで ▶
```
