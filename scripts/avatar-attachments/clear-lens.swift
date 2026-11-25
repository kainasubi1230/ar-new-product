// メガネのレンズの内側に残った不透明なクリーム色（素材の背景抜きの残り）だけを透明にする。線・色・形は変えない。
//   swift scripts/avatar-attachments/clear-lens.swift <入力.png> <出力.png> <レンズの中心 x> <レンズの中心 y>
// 1. レンズの中心から、明るい画素（クリーム色）がつながっている範囲を選んで透明にする（黒いふちで止まる）
// 2. ふちとの境目の画素は、クリームと黒いふちが混ざった色なので、明るさから「ふちの割合」を求めて、
//    ふちの色をその割合の不透明度で残す（ギザギザにしない）
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let input = args[1], output = args[2]
let startX = Int(Double(args[3])!.rounded()), startY = Int(Double(args[4])!.rounded())

let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: input) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let w = image.width, h = image.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

// 上からの y で読み書きする（CGContext の行は下から）
func index(_ x: Int, _ y: Int) -> Int { ((h - 1 - y) * w + x) * 4 }
func lightness(_ i: Int) -> Double {
  let a = Double(px[i + 3]) / 255
  guard a > 0 else { return 0 }
  return (Double(px[i]) + Double(px[i + 1]) + Double(px[i + 2])) / 3 / 255 / a
}

let lightThreshold = 0.78
let startI = index(startX, startY)
guard px[startI + 3] > 200, lightness(startI) > lightThreshold else {
  // 透明なレンズ・色の付いたレンズ（サングラス）は、ファイルをそのままコピーする
  print("\((input as NSString).lastPathComponent): レンズの内側はもう透明か色付き。そのままコピーした")
  try? FileManager.default.removeItem(atPath: output)
  try! FileManager.default.copyItem(atPath: input, toPath: output)
  exit(0)
}

// 1. 明るい部分を塗りつぶしで選ぶ
var inLens = [Bool](repeating: false, count: w * h)
var stack = [(startX, startY)]
inLens[startY * w + startX] = true
var cream = (0.0, 0.0, 0.0), creamCount = 0.0
while let (x, y) = stack.popLast() {
  let i = index(x, y)
  cream.0 += Double(px[i]); cream.1 += Double(px[i + 1]); cream.2 += Double(px[i + 2]); creamCount += 1
  for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
    let nx = x + dx, ny = y + dy
    guard nx >= 0, ny >= 0, nx < w, ny < h, !inLens[ny * w + nx] else { continue }
    let j = index(nx, ny)
    if px[j + 3] > 200 && lightness(j) > lightThreshold {
      inLens[ny * w + nx] = true
      stack.append((nx, ny))
    }
  }
}
let creamL = (cream.0 + cream.1 + cream.2) / 3 / creamCount / 255

// ふちの色：選んだ範囲のすぐ外で、いちばん暗い画素たちの平均
var ink = (0.0, 0.0, 0.0), inkCount = 0.0
for y in 0..<h {
  for x in 0..<w where !inLens[y * w + x] {
    var touches = false
    for dy in -3...3 { for dx in -3...3 {
      let nx = x + dx, ny = y + dy
      if nx >= 0, ny >= 0, nx < w, ny < h, inLens[ny * w + nx] { touches = true }
    } }
    let i = index(x, y)
    if touches && px[i + 3] > 200 && lightness(i) < 0.3 {
      ink.0 += Double(px[i]); ink.1 += Double(px[i + 1]); ink.2 += Double(px[i + 2]); inkCount += 1
    }
  }
}
let inkRGB = inkCount > 0 ? (ink.0 / inkCount, ink.1 / inkCount, ink.2 / inkCount) : (38.0, 38.0, 38.0)
let inkL = (inkRGB.0 + inkRGB.1 + inkRGB.2) / 3 / 255

// 2. 選んだ範囲を透明に。すぐ隣（2px）の中間の明るさの画素は、ふちの色を「ふちの割合」の不透明度で残す
var cleared = 0, softened = 0
for y in 0..<h {
  for x in 0..<w {
    let i = index(x, y)
    if inLens[y * w + x] {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0
      cleared += 1
      continue
    }
    var nearLens = false
    for dy in -2...2 { for dx in -2...2 {
      let nx = x + dx, ny = y + dy
      if nx >= 0, ny >= 0, nx < w, ny < h, inLens[ny * w + nx] { nearLens = true }
    } }
    guard nearLens, px[i + 3] > 0 else { continue }
    let l = lightness(i)
    guard l > inkL + 0.02 else { continue }
    let coverage = min(max((creamL - l) / max(creamL - inkL, 0.01), 0), 1) * Double(px[i + 3]) / 255
    let a = coverage
    px[i] = UInt8((inkRGB.0 * a).rounded()); px[i + 1] = UInt8((inkRGB.1 * a).rounded())
    px[i + 2] = UInt8((inkRGB.2 * a).rounded()); px[i + 3] = UInt8((a * 255).rounded())
    softened += 1
  }
}

let result = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, result, nil)
CGImageDestinationFinalize(dest)
print("\((input as NSString).lastPathComponent): レンズの内側 \(cleared) 画素を透明に、ふちとの境目 \(softened) 画素をなじませた")
