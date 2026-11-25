#!/bin/sh
# アバターのアタッチメント（avatar_attachments_png/*.png、512×512 の透明 PNG）をアプリに入れる。
#   sh scripts/avatar-attachments/build-assets.sh
# 1. 素材の背景抜きの残りだけを直した絵を作る（線・色・形・模様は変えない。元の素材 avatar_attachments_png/ は変えない）：
#    - メガネのレンズの内側に残った不透明なクリーム色を透明に（clear-lens.swift。glasses_01・03）
#    - リボンとメガネの紙の縁取りのでこぼこ・はみ出し・垂れの間の紙を、形から幅 5px にそろえる（clean-edges.swift）
#    帽子は縁取りがきれいなので、そのまま。外側の線（clean-edges の 5 つ目の引数）は引かない
# 2. 直した絵を測る（measure-items.swift → item-metrics.json。メガネはレンズの中心と直径も）。
#    黄色の部分を選ぶマスクも作る（キャラクターと同じ scripts/avatar-animals/build-masks.swift。アイテムの色変えに使う）
# 3. 装着位置の表を作る（build-layout.py → src/config/avatarAttachmentLayout.json）
# 4. 絵をコピーする（縮めない）：
#      ios/SpatialInventory/Images.xcassets/Attachment<名前>.imageset（AR のカードのアイコン）
#      ios/SpatialInventory/Images.xcassets/Attachment<名前>Mask.imageset（黄色の部分のマスク。色変えはネイティブ）
#    表は Images.xcassets/AvatarAttachmentLayout.dataset にも入れる（ネイティブも同じ表で描く）
# 5. 確認用の画像を scripts/avatar-attachments/out/<キャラクター>.png（装着位置）と out/masks/<名前>_check.png（マスク）に作る（git には入れない）
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../.." && pwd)
SRC="$ROOT/avatar_attachments_png"
ASSETS="$ROOT/ios/SpatialInventory/Images.xcassets"
WORK=$(mktemp -d)
mkdir -p "$WORK/items"

swiftc -O -o "$WORK/measure" "$DIR/measure-items.swift"
swiftc -O -o "$WORK/clear-lens" "$DIR/clear-lens.swift"
swiftc -O -o "$WORK/clean-edges" "$DIR/clean-edges.swift"
swiftc -O -o "$WORK/build-masks" "$ROOT/scripts/avatar-animals/build-masks.swift"

# 1. レンズの中心は、元の素材で測った値を使う
"$WORK/measure" "$SRC" > "$WORK/source-metrics.json"
for f in "$SRC"/*.png; do
  name=$(basename "$f" .png)
  case "$name" in
    glasses_*)
      lens=$(python3 -c "import json; l=json.load(open('$WORK/source-metrics.json'))['$name']['lens']; print(l['x'], l['y'])")
      # shellcheck disable=SC2086
      "$WORK/clear-lens" "$f" "$WORK/lens-$name.png" $lens
      # まるメガネ（glasses_01）だけは、紙の縁取りを残さない（フレームとつるだけ）
      if [ "$name" = "glasses_01" ]; then border=0; else border=5; fi
      "$WORK/clean-edges" "$WORK/lens-$name.png" "$WORK/items/$name.png" $border
      ;;
    ribbon_*) "$WORK/clean-edges" "$f" "$WORK/items/$name.png" ;;
    *) cp "$f" "$WORK/items/$name.png" ;;
  esac
done

# 2・3
"$WORK/measure" "$WORK/items" > "$DIR/item-metrics.json"
ITEM_NAMES=$(cd "$WORK/items" && ls *.png | sed 's/\.png$//' | tr '\n' ' ')
# shellcheck disable=SC2086
"$WORK/build-masks" "$WORK/items" "$WORK/masks" "$DIR/out/masks" $ITEM_NAMES
python3 "$DIR/build-layout.py"

# 4
for f in "$WORK/items"/*.png; do
  name=$(basename "$f" .png)
  # ribbon_01 → AttachmentRibbon01
  asset="Attachment$(printf '%s' "$name" | awk -F_ '{print toupper(substr($1,1,1)) substr($1,2) $2}')"
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
  mkdir -p "$ASSETS/${asset}Mask.imageset"
  cp "$WORK/masks/${name}_mask.png" "$ASSETS/${asset}Mask.imageset/${name}_mask.png"
  cat > "$ASSETS/${asset}Mask.imageset/Contents.json" <<JSON
{
  "images" : [
    {
      "filename" : "${name}_mask.png",
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  },
  "properties" : {
    "template-rendering-intent" : "original"
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
