// キャラクターの絵の背景（一色のクリーム #FAF7EF のキャンバス）だけを透明にする。キャラクターの形・色・模様は変えない。
//   swift scripts/avatar-animals/cut-canvas.swift <入力.png> <出力.png>
// アバターの背景色を選べるようにするため（透明にした所に、選んだ色を敷く）。
// 1. 絵の外周から、背景の色にほぼぴったり（各色 ±TOLERANCE）の画素だけをたどって、背景の範囲を決める
//    （体のクリーム #FCF5E4 などは背景の色と少し違うので、線が無く接していても入らない）。
//    そのあと、背景から LOOSE_REACH px 以内だけ、やや緩い基準で広げる（背景のすぐ近くの紙の粒＝白い点々を残さない。
//    青みが -7〜+18 のずれまで。体のクリームは青みが -11 ずれているので入らない）
// 2. 背景を透明に
// 3. 背景との境目（2px）の画素は「絵の色」と「背景の色」が混ざった色なので、すぐ内側の絵の色を使って
//    混ざり具合（不透明度）を逆算し、背景の色を抜いた色にする（縁に白っぽいにじみを残さない）
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let input = args[1], output = args[2]
let canvas: (Double, Double, Double) = (250, 247, 239)
let TOLERANCE = 3.0

let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: input) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let w = image.width, h = image.height, n = w * h
var src = [UInt8](repeating: 0, count: n * 4)
let readCtx = CGContext(data: &src, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
readCtx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

func color(_ i: Int) -> (Double, Double, Double) { (Double(src[i * 4]), Double(src[i * 4 + 1]), Double(src[i * 4 + 2])) }
func isCanvasColor(_ i: Int) -> Bool {
  let c = color(i)
  return abs(c.0 - canvas.0) <= TOLERANCE && abs(c.1 - canvas.1) <= TOLERANCE && abs(c.2 - canvas.2) <= TOLERANCE
}

// 1. 外周から背景をたどる
var isCanvas = [Bool](repeating: false, count: n)
var stack: [Int] = []
for x in 0..<w { for y in [0, h - 1] { let i = y * w + x; if isCanvasColor(i) && !isCanvas[i] { isCanvas[i] = true; stack.append(i) } } }
for y in 0..<h { for x in [0, w - 1] { let i = y * w + x; if isCanvasColor(i) && !isCanvas[i] { isCanvas[i] = true; stack.append(i) } } }
while let i = stack.popLast() {
  let x = i % w, y = i / w
  for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
    let nx = x + dx, ny = y + dy
    guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
    let j = ny * w + nx
    if !isCanvas[j] && isCanvasColor(j) { isCanvas[j] = true; stack.append(j) }
  }
}

// 背景のすぐ近くの紙の粒も背景にする（距離を限って、緩い基準で広げる）
let LOOSE_REACH = 3
func isNearCanvasColor(_ i: Int) -> Bool {
  let c = color(i)
  let dr = c.0 - canvas.0, dg = c.1 - canvas.1, db = c.2 - canvas.2
  return abs(dr) <= 7 && abs(dg) <= 10 && db >= -7 && db <= 18
}
var frontier = (0..<n).filter { isCanvas[$0] }
for _ in 0..<LOOSE_REACH {
  var next: [Int] = []
  for i in frontier {
    let x = i % w, y = i / w
    for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
      let nx = x + dx, ny = y + dy
      guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
      let j = ny * w + nx
      if !isCanvas[j] && isNearCanvasColor(j) { isCanvas[j] = true; next.append(j) }
    }
  }
  frontier = next
}

// 背景からの距離（4 近傍の段数。3 まで）
var dist = [Int](repeating: 99, count: n)
var queue: [Int] = []
for i in 0..<n where isCanvas[i] { dist[i] = 0; queue.append(i) }
var head = 0
while head < queue.count {
  let i = queue[head]; head += 1
  guard dist[i] < 3 else { continue }
  let x = i % w, y = i / w
  for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
    let nx = x + dx, ny = y + dy
    guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
    let j = ny * w + nx
    if dist[j] > dist[i] + 1 { dist[j] = dist[i] + 1; queue.append(j) }
  }
}

// 2・3. 出力（premultiplied RGBA）
var out = [UInt8](repeating: 0, count: n * 4)
var cleared = 0, softened = 0
for y in 0..<h {
  for x in 0..<w {
    let i = y * w + x
    if isCanvas[i] { cleared += 1; continue }
    var c = color(i)
    var alpha = 1.0
    if dist[i] <= 2 {
      // すぐ内側（背景から 3px 以上）の絵の色の平均を、混ざる前の色とみなす
      var f = (0.0, 0.0, 0.0), count = 0.0
      for dy in -3...3 { for dx in -3...3 {
        let nx = x + dx, ny = y + dy
        guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
        let j = ny * w + nx
        if dist[j] >= 3 { let cj = color(j); f.0 += cj.0; f.1 += cj.1; f.2 += cj.2; count += 1 }
      } }
      if count > 0 {
        f = (f.0 / count, f.1 / count, f.2 / count)
        let d = (f.0 - canvas.0, f.1 - canvas.1, f.2 - canvas.2)
        let len2 = d.0 * d.0 + d.1 * d.1 + d.2 * d.2
        // 絵の色が背景とほぼ同じ（クリーム同士）なら、混ざり具合は分からないので不透明のまま
        if len2 > 400 {
          let p = (c.0 - canvas.0, c.1 - canvas.1, c.2 - canvas.2)
          alpha = min(max((p.0 * d.0 + p.1 * d.1 + p.2 * d.2) / len2, 0), 1)
          if alpha > 0 {
            // 背景の色を抜いた色：c = alpha * F + (1 - alpha) * canvas → F = (c - (1 - alpha) * canvas) / alpha
            c = ((c.0 - (1 - alpha) * canvas.0) / alpha, (c.1 - (1 - alpha) * canvas.1) / alpha, (c.2 - (1 - alpha) * canvas.2) / alpha)
          }
          softened += 1
        }
      }
    }
    let a = alpha
    out[i * 4] = UInt8(min(max(c.0, 0), 255) * a + 0.5)
    out[i * 4 + 1] = UInt8(min(max(c.1, 0), 255) * a + 0.5)
    out[i * 4 + 2] = UInt8(min(max(c.2, 0), 255) * a + 0.5)
    out[i * 4 + 3] = UInt8(a * 255 + 0.5)
  }
}

let writeCtx = CGContext(data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                         space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, writeCtx.makeImage()!, nil)
CGImageDestinationFinalize(dest)
print("\((input as NSString).lastPathComponent): 背景 \(cleared) 画素を透明に、境目 \(softened) 画素をなじませた")
