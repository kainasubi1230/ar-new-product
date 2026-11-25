#!/bin/sh
# アイコンの動物の色変え（ARViewWrapper.swift の AvatarRecolorCore）を Mac で試す。
#   sh scripts/avatar-animals/recolor-test.sh <出力.png> "#3B82F6,#EC4899,#8B5CF6,#10B981" <絵.png:マスク.png>...
# （CELL=400 のように 1 マスの大きさも変えられる）
# 左端が元の絵、右に指定した色に変えた絵が並ぶ
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$DIR/../.." && pwd)
WORK=$(mktemp -d)
sed -n '/AVATAR_RECOLOR_CORE_BEGIN/,/AVATAR_RECOLOR_CORE_END/p' "$ROOT/ios/SpatialInventory/ARViewWrapper.swift" > "$WORK/core.swift"
printf 'import CoreGraphics\nimport CoreImage\nimport Foundation\n' | cat - "$WORK/core.swift" > "$WORK/core2.swift"
cp "$DIR/recolor-test-main.swift" "$WORK/main.swift"
swiftc -O -o "$WORK/recolor-test" "$WORK/core2.swift" "$WORK/main.swift"
"$WORK/recolor-test" "$@"
rm -rf "$WORK"
