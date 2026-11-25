// アタッチメントの絵の「紙の縁取り」（素材の背景抜きの残り）を、アイテムの形から一定の幅にそろえる。
//   swift scripts/avatar-attachments/clean-edges.swift <入力.png> <出力.png> [縁取りの幅 px = 5] [すき間を埋める半径 px = 12] [外側の線の幅 px = 0]
// 縁取りの外側のでこぼこ・はみ出したかたまり・リボンの垂れの間に残った紙だけを透明にする。絵の具の部分（黒・黄・グレー）と、
// それに挟まれた模様のクリームの面は変えない。もとから透明だった所に色を足すことはしない
// 1. 紙の色（明るく彩度の低いクリーム）でない、不透明な画素＝絵の具
// 2. 絵の具を「すき間を埋める半径」で膨らませてから同じだけ縮め（狭いすき間を埋める）、囲まれた中を埋める → アイテムの形
// 3. 形からの距離が縁取りの幅を超える所は透明に（幅の境目は 1px かけてなめらかに薄くする）
// 4. 外側の線の幅が 0 より大きければ、縁取りのすぐ外に濃い色（絵の黒）の線を引く（キャラクターのクリームの地の上でも輪郭が際立つように）
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let input = args[1], output = args[2]
let border = args.count > 3 ? Double(args[3])! : 5
let closeRadius = args.count > 4 ? Int(args[4])! : 12
let outline = args.count > 5 ? Double(args[5])! : 0
// 外側の線の色（絵の黒と同じくらいの、少し温かい黒）
let outlineColor: (Double, Double, Double) = (43, 42, 40)

let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: input) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let w = image.width, h = image.height, n = w * h
var px = [UInt8](repeating: 0, count: n * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

// 1. 絵の具
var ink = [Bool](repeating: false, count: n)
for i in 0..<n {
  let a = Double(px[i * 4 + 3])
  guard a > 128 else { continue }
  let r = Double(px[i * 4]) * 255 / a, g = Double(px[i * 4 + 1]) * 255 / a, b = Double(px[i * 4 + 2]) * 255 / a
  let mx = max(r, g, b), mn = min(r, g, b)
  let isPaper = mn >= 205 && (mx - mn) / mx < 0.14
  ink[i] = !isPaper
}

/// set の画素からの距離（ユークリッド）が radius 以下の画素。近くだけを調べる
func dilate(_ set: [Bool], _ radius: Int) -> [Bool] {
  var offsets: [(Int, Int)] = []
  for dy in -radius...radius { for dx in -radius...radius where dx * dx + dy * dy <= radius * radius { offsets.append((dx, dy)) } }
  var out = [Bool](repeating: false, count: n)
  for y in 0..<h {
    for x in 0..<w where set[y * w + x] {
      // 内側の画素（上下左右がすべて set）は、ふちの画素が膨らませれば届くので飛ばす
      if x > 0, y > 0, x < w - 1, y < h - 1, set[y * w + x - 1], set[y * w + x + 1], set[(y - 1) * w + x], set[(y + 1) * w + x] {
        out[y * w + x] = true
        continue
      }
      for (dx, dy) in offsets {
        let nx = x + dx, ny = y + dy
        if nx >= 0, ny >= 0, nx < w, ny < h { out[ny * w + nx] = true }
      }
    }
  }
  return out
}

// 2. すき間を埋める（膨らませて縮める＝縮めるのは「外側を膨らませる」）
let grown = dilate(ink, closeRadius)
let outsideGrown = dilate(grown.map { !$0 }, closeRadius)
var shape = (0..<n).map { !outsideGrown[$0] && px[$0 * 4 + 3] > 0 }
// 囲まれた中を埋める：絵の端から、形でない画素をたどれない所は中
var reachable = [Bool](repeating: false, count: n)
var stack: [Int] = []
for x in 0..<w { for y in [0, h - 1] where !shape[y * w + x] { reachable[y * w + x] = true; stack.append(y * w + x) } }
for y in 0..<h { for x in [0, w - 1] where !shape[y * w + x] { reachable[y * w + x] = true; stack.append(y * w + x) } }
while let i = stack.popLast() {
  let x = i % w, y = i / w
  for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
    let nx = x + dx, ny = y + dy
    guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
    let j = ny * w + nx
    if !shape[j] && !reachable[j] { reachable[j] = true; stack.append(j) }
  }
}
for i in 0..<n where !reachable[i] && px[i * 4 + 3] > 0 { shape[i] = true }

// 3. 形からの距離で、縁取りの幅を超える所を透明に
let reach = Int((border + outline).rounded(.up)) + 1
var offsets: [(Int, Int, Double)] = []
for dy in -reach...reach { for dx in -reach...reach { offsets.append((dx, dy, (Double(dx * dx + dy * dy)).squareRoot())) } }
var cleared = 0
for y in 0..<h {
  for x in 0..<w {
    let i = y * w + x
    guard !shape[i] else { continue }
    guard px[i * 4 + 3] > 0 || outline > 0 else { continue }
    var d = Double.infinity
    for (dx, dy, dist) in offsets where dist < d {
      let nx = x + dx, ny = y + dy
      if nx >= 0, ny >= 0, nx < w, ny < h, shape[ny * w + nx] { d = dist }
    }
    // 縁取り（紙の色）をどれだけ残すか。もとから透明な所は、縁取りの幅の内でも足さない
    let keep = min(max(border + 0.5 - d, 0), 1)
    var r = Double(px[i * 4]) * keep, g = Double(px[i * 4 + 1]) * keep, b = Double(px[i * 4 + 2]) * keep
    var a = Double(px[i * 4 + 3]) * keep
    // 囲まれた穴（メガネのレンズの中など）には線を引かない
    if outline > 0 && reachable[i] {
      // 縁取りの外側の線：縁取りの端から outline の幅だけ。内側・外側の境目は 1px かけてなめらかに
      let line = min(max(d - (border - 0.5), 0), 1) * min(max(border + outline + 0.5 - d, 0), 1)
      if line > 0 {
        // 線を下に敷いて、残した縁取りを上に重ねる（premultiplied）
        let under = line * 255 * (1 - a / 255)
        r += outlineColor.0 * under / 255; g += outlineColor.1 * under / 255; b += outlineColor.2 * under / 255
        a += under
      }
    }
    if keep == 0 && a == 0 && px[i * 4 + 3] > 0 { cleared += 1 }
    px[i * 4] = UInt8(min(r, 255).rounded()); px[i * 4 + 1] = UInt8(min(g, 255).rounded())
    px[i * 4 + 2] = UInt8(min(b, 255).rounded()); px[i * 4 + 3] = UInt8(min(a, 255).rounded())
  }
}

let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)
print("\((input as NSString).lastPathComponent): 縁取りを幅 \(Int(border))px にそろえた（はみ出した紙 \(cleared) 画素を透明に）")
