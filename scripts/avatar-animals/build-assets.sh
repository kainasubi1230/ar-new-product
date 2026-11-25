#!/bin/sh
# アバターの動物の絵（avatar_animals_png/*.png、512×512）を、アプリに入れる。
#   sh scripts/avatar-animals/build-assets.sh
# - 元の絵はそのまま（縮めず・描き直さず）コピーする：
#     src/assets/animals/<名前>.png（RN の画面で、元の色のときに出す）
#     ios/SpatialInventory/Images.xcassets/Animal<名前>.imageset/<名前>.png（色変え・AR のカード）
# - オレンジ・黄色の部分を選ぶマスクを作る（build-masks.swift）：
#     ios/SpatialInventory/Images.xcassets/Animal<名前>Mask.imageset/<名前>_mask.png
# - 確認用の画像を scripts/avatar-animals/out/ に作る（git には入れない）：
#     <名前>_check.png（マスクの範囲）と preview.png（青・ピンク・紫・緑に変えた見本）
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../.." && pwd)
SRC="$ROOT/avatar_animals_png"
OUT="$DIR/out"
ASSETS="$ROOT/ios/SpatialInventory/Images.xcassets"
WORK=$(mktemp -d)
mkdir -p "$OUT"

swiftc -O -o "$WORK/build-masks" "$DIR/build-masks.swift"
"$WORK/build-masks" "$SRC" "$WORK/masks" "$OUT"

pairs=""
for name in cat dog bear rabbit panda fox penguin chick; do
  asset="Animal$(printf '%s' "$name" | cut -c1 | tr '[:lower:]' '[:upper:]')$(printf '%s' "$name" | cut -c2-)"
  cp "$SRC/$name.png" "$ROOT/src/assets/animals/$name.png"
  cp "$SRC/$name.png" "$ASSETS/$asset.imageset/$name.png"
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
  pairs="$pairs $SRC/$name.png:$WORK/masks/${name}_mask.png"
done

# shellcheck disable=SC2086
CELL=250 sh "$DIR/recolor-test.sh" "$OUT/preview.png" "#3B82F6,#EC4899,#8B5CF6,#10B981" $pairs
rm -rf "$WORK"
echo "確認用の画像: $OUT"
