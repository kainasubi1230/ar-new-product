// アタッチメントの絵（assets/raw/avatar-attachments/*.png）を測って JSON で出す。絵には手を加えない。
//   swift scripts/avatar-attachments/measure-items.swift <フォルダ>
// - box：絵がある範囲（透明でない部分。512px の絵の中の px）
// - lens：メガネのレンズの中心と直径（縦に長い列＝レンズの部分から求める）
import CoreGraphics
import Foundation
import ImageIO

let dir = CommandLine.arguments[1]
let names = (1...4).flatMap { i in ["ribbon", "hat", "glasses"].map { "\($0)_0\(i)" } }.sorted()
var result: [String: Any] = [:]
for name in names {
  let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: "\(dir)/\(name).png") as CFURL, nil)!
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
  let w = image.width, h = image.height
  var px = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  // CGContext の行は下から。上からの y に直す
  func alpha(_ x: Int, _ y: Int) -> UInt8 { px[((h - 1 - y) * w + x) * 4 + 3] }
  var x0 = w, y0 = h, x1 = 0, y1 = 0
  var colTop = [Int](repeating: -1, count: w), colBottom = [Int](repeating: -1, count: w)
  for y in 0..<h {
    for x in 0..<w where alpha(x, y) > 40 {
      x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y)
      if colTop[x] < 0 { colTop[x] = y }
      colBottom[x] = y
    }
  }
  var entry: [String: Any] = [
    "box": ["x": x0, "y": y0, "width": x1 - x0 + 1, "height": y1 - y0 + 1],
    "imageSize": w,
  ]
  if name.hasPrefix("glasses") {
    // レンズ：絵の左から、縦の長さが全体の 6 割以上ある列が続く範囲
    let tall = Double(y1 - y0) * 0.6
    var lx0 = -1, lx1 = -1, top = h, bottom = 0
    for x in x0...x1 where colTop[x] >= 0 && Double(colBottom[x] - colTop[x]) >= tall {
      if lx0 < 0 { lx0 = x }
      if lx1 >= 0 && x > lx1 + 3 { break }
      lx1 = x
      top = min(top, colTop[x]); bottom = max(bottom, colBottom[x])
    }
    entry["lens"] = ["x": Double(lx0 + lx1) / 2, "y": Double(top + bottom) / 2, "diameter": Double(max(lx1 - lx0, bottom - top))]
  }
  result[name] = entry
}
let data = try! JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
