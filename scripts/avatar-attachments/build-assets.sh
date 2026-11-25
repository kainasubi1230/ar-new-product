#!/bin/sh
# アバターのアタッチメント（avatar_attachments_png/*.png、512×512 の透明 PNG）をアプリに入れる。
#   sh scripts/avatar-attachments/build-assets.sh
# 1. アイテムの絵を測る（measure-items.swift → item-metrics.json）
# 2. 装着位置の表を作る（build-layout.py → src/config/avatarAttachmentLayout.json）
# 3. 絵はそのまま（描き直さず・縮めず）コピーする：
#      src/assets/attachments/<名前>.png（RN の画面）
#      ios/SpatialInventory/Images.xcassets/Attachment<名前>.imageset（AR のカードのアイコン）
#    表は Images.xcassets/AvatarAttachmentLayout.dataset にも入れる（ネイティブも同じ表で描く）
# 4. 確認用の画像を scripts/avatar-attachments/out/<キャラクター>.png に作る（git には入れない）
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../.." && pwd)
SRC="$ROOT/avatar_attachments_png"
ASSETS="$ROOT/ios/SpatialInventory/Images.xcassets"
WORK=$(mktemp -d)

swiftc -O -o "$WORK/measure" "$DIR/measure-items.swift"
"$WORK/measure" "$SRC" > "$DIR/item-metrics.json"
python3 "$DIR/build-layout.py"

mkdir -p "$ROOT/src/assets/attachments"
for f in "$SRC"/*.png; do
  name=$(basename "$f" .png)
  # ribbon_01 → AttachmentRibbon01
  asset="Attachment$(printf '%s' "$name" | awk -F_ '{print toupper(substr($1,1,1)) substr($1,2) $2}')"
  cp "$f" "$ROOT/src/assets/attachments/$name.png"
  mkdir -p "$ASSETS/$asset.imageset"
  cp "$f" "$ASSETS/$asset.imageset/$name.png"
  cat > "$ASSETS/$asset.imageset/Contents.json" <<JSON
{
  "images" : [
    {
      "filename" : "$name.png",
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON
done

mkdir -p "$ASSETS/AvatarAttachmentLayout.dataset"
cp "$ROOT/src/config/avatarAttachmentLayout.json" "$ASSETS/AvatarAttachmentLayout.dataset/avatarAttachmentLayout.json"
cat > "$ASSETS/AvatarAttachmentLayout.dataset/Contents.json" <<JSON
{
  "data" : [
    {
      "filename" : "avatarAttachmentLayout.json",
      "idiom" : "universal",
      "universal-type-identifier" : "public.json"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON

swiftc -O -o "$WORK/preview" "$DIR/preview.swift"
"$WORK/preview" "$DIR/out"
rm -rf "$WORK"
