// アバターの動物の絵（assets/raw/avatar-animals/*.png）から、オレンジ・黄色の部分だけを選ぶマスクを作る。
//   swift scripts/avatar-animals/build-masks.swift <元の絵のフォルダ> <マスクの出力先> [確認用画像の出力先] [名前...]
// 出力: <名前>_mask.png（8bit グレー。白＝色を変える、黒＝変えない、間の値＝境目でなめらかに混ぜる）
// 確認用: <名前>_check.png（左：元の絵、右：マスクの部分を赤紫で重ねたもの）
//
// 選び方（絵は描き直さず、画素の色だけで決める。輪郭の抽出・トレースはしない）
// 1. 色で選ぶ（どれも境目は smoothstep でなめらか）
//    - 濃いオレンジ・黄色：色相 15〜65°、彩度 0.30〜、明るさ 0.10〜（輪郭とのなじみの暗いオレンジも含める＝縁にオレンジが残らない）
//    - 淡い黄色の候補：色相 25〜60°、彩度 0.11〜、明るさ 0.60〜（クリームのしみや紙の粒も入るので 2 で分ける）
//    白・グレー・黒・ふつうのクリーム（彩度 0.10 以下）は、彩度か明るさで外れる
// 2. 淡い黄色の候補を、つながったかたまりごとに判定する（画素ごとだと、リングの中の明るい粒が抜けて斑になる）
//    - 平均の彩度が PALE_REGION_MIN_SAT 以上の、ある程度大きいかたまり → 淡い黄色の部品（リングなど）としてまるごと選ぶ
//    - 濃いオレンジに接した小さなかたまり → オレンジの中の紙の粒なので選ぶ
//    - それ以外 → クリームのしみ・紙の粒なので選ばない
// 3. 選んだ部分の中の、明るい紙の粒の穴を埋める：マスクに囲まれた小さな穴（HOLE_MAX_AREA 画素未満）の明るい画素は選ぶ
//    （埋めないと、色を変えたリングに元の黄色い点が残る。暗い画素＝模様の黒い点や輪郭は埋めない）
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = Array(CommandLine.arguments.dropFirst())
let srcDir = args[0]
let outDir = args[1]
let checkDir = args.count > 2 ? args[2] : nil
let names = args.count > 3 ? Array(args[3...]) : ["cat", "dog", "bear", "rabbit", "panda", "fox", "penguin", "chick"]

let PALE_SPECK_MAX_AREA = 60
/// 淡い黄色の部品とみなす、かたまりの平均の彩度（ねこのリングは 0.245、クリームのしみは 0.14、顔のクリームは 0.095）
let PALE_REGION_MIN_SAT = 0.18
let HOLE_MAX_AREA = 80

func smoothstep(_ e0: Double, _ e1: Double, _ x: Double) -> Double {
  let t = min(max((x - e0) / (e1 - e0), 0), 1)
  return t * t * (3 - 2 * t)
}

func hsv(_ r: Double, _ g: Double, _ b: Double) -> (h: Double, s: Double, v: Double) {
  let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
  var h = 0.0
  if d > 0 {
    if mx == r { h = (g - b) / d } else if mx == g { h = (b - r) / d + 2 } else { h = (r - g) / d + 4 }
    h *= 60
    if h < 0 { h += 360 }
  }
  return (h, mx > 0 ? d / mx : 0, mx)
}

func strongWeight(_ c: (h: Double, s: Double, v: Double)) -> Double {
  smoothstep(10, 18, c.h) * (1 - smoothstep(62, 70, c.h)) * smoothstep(0.28, 0.40, c.s) * smoothstep(0.08, 0.22, c.v)
}

/// 淡い黄色の候補（クリームのしみも入る。かたまりごとの平均の彩度で、あとで分ける）
func paleCandidate(_ c: (h: Double, s: Double, v: Double)) -> Double {
  smoothstep(22, 28, c.h) * (1 - smoothstep(58, 64, c.h)) * smoothstep(0.10, 0.13, c.s) * smoothstep(0.55, 0.70, c.v)
}

func load(_ path: String) -> (w: Int, h: Int, px: [UInt8]) {
  let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
  let w = image.width, h = image.height
  var px = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  return (w, h, px)
}

func savePNG(_ image: CGImage, _ path: String) {
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  CGImageDestinationFinalize(dest)
}

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
if let checkDir { try? FileManager.default.createDirectory(atPath: checkDir, withIntermediateDirectories: true) }

for name in names {
  let (w, h, px) = load("\(srcDir)/\(name).png")
  let n = w * h
  var strong = [Double](repeating: 0, count: n)
  var pale = [Double](repeating: 0, count: n)
  var sat = [Double](repeating: 0, count: n)
  for i in 0..<n {
    let c = hsv(Double(px[i * 4]) / 255, Double(px[i * 4 + 1]) / 255, Double(px[i * 4 + 2]) / 255)
    strong[i] = strongWeight(c)
    pale[i] = paleCandidate(c)
    sat[i] = c.s
  }
  var cleaned = strong

  // 2. 淡い黄色の候補を、つながったかたまりごとに判定する（8 近傍。濃いオレンジの画素は含めない）
  var seenPale = [Bool](repeating: false, count: n)
  var keptPaleRegions = 0
  var removedSpecks = 0
  var stack: [Int] = []
  let isPale = { (i: Int) in pale[i] > 0.5 && strong[i] <= 0.5 }
  for start in 0..<n where isPale(start) && !seenPale[start] {
    var members: [Int] = []
    var touchesStrong = false
    var sumSat = 0.0
    seenPale[start] = true
    stack.append(start)
    while let i = stack.popLast() {
      members.append(i)
      sumSat += sat[i]
      let x = i % w, y = i / w
      for dy in -1...1 {
        for dx in -1...1 where dx != 0 || dy != 0 {
          let nx = x + dx, ny = y + dy
          guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
          let j = ny * w + nx
          if strong[j] > 0.5 { touchesStrong = true }
          if isPale(j) && !seenPale[j] {
            seenPale[j] = true
            stack.append(j)
          }
        }
      }
    }
    let meanSat = sumSat / Double(members.count)
    // 淡い黄色の部品（リングなど）か、濃いオレンジの中の小さな紙の粒なら選ぶ。それ以外はクリームのしみ・紙の粒
    let isPaleYellowPart = meanSat >= PALE_REGION_MIN_SAT && members.count >= PALE_SPECK_MAX_AREA
    let isGrainInOrange = touchesStrong && members.count < PALE_SPECK_MAX_AREA
    if isPaleYellowPart || isGrainInOrange {
      for i in members { cleaned[i] = max(cleaned[i], pale[i]) }
      keptPaleRegions += 1
    } else {
      removedSpecks += 1
    }
  }
  // 選んだ淡い黄色の縁（候補の値が 0.5 以下のなじみの画素）も、すぐ隣が選ばれていれば入れる
  let beforeEdges = cleaned
  for i in 0..<n where pale[i] > 0 && pale[i] <= 0.5 && beforeEdges[i] < pale[i] {
    let x = i % w, y = i / w
    var nearKept = false
    for dy in -1...1 {
      for dx in -1...1 {
        let nx = x + dx, ny = y + dy
        guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
        if beforeEdges[ny * w + nx] > 0.5 { nearKept = true }
      }
    }
    if nearKept { cleaned[i] = pale[i] }
  }

  // 3. 選んだ部分に囲まれた小さな穴の、明るい画素を埋める（4 近傍でつながった「選ばれていない」かたまり）
  var seen = [Bool](repeating: false, count: n)
  var filledHoles = 0
  for start in 0..<n where cleaned[start] < 0.5 && !seen[start] {
    var members: [Int] = []
    var touchesEdge = false
    var isEnclosed = true
    seen[start] = true
    stack.append(start)
    while let i = stack.popLast() {
      members.append(i)
      let x = i % w, y = i / w
      if x == 0 || y == 0 || x == w - 1 || y == h - 1 { touchesEdge = true }
      for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
        let nx = x + dx, ny = y + dy
        guard nx >= 0, ny >= 0, nx < w, ny < h else { continue }
        let j = ny * w + nx
        if cleaned[j] < 0.5 {
          if !seen[j] {
            seen[j] = true
            stack.append(j)
          }
        }
      }
      // 大きすぎるかたまり（背景など）は途中でやめる
      if members.count >= HOLE_MAX_AREA { isEnclosed = false }
    }
    guard isEnclosed, !touchesEdge else { continue }
    var didFill = false
    for i in members {
      let v = Double(max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])) / 255
      if v > 0.6 {
        cleaned[i] = max(cleaned[i], smoothstep(0.6, 0.75, v))
        didFill = true
      }
    }
    if didFill { filledHoles += 1 }
  }

  // マスクを書き出す
  var gray = cleaned.map { UInt8(min(255, max(0, ($0 * 255).rounded()))) }
  let maskCtx = CGContext(data: &gray, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                          space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  savePNG(maskCtx.makeImage()!, "\(outDir)/\(name)_mask.png")
  let covered = cleaned.filter { $0 > 0.5 }.count
  print(String(format: "%@: マスク %.1f%%（%d 画素）、淡い黄色のかたまり 選んだ %d / 外した %d、埋めた穴 %d 個", name, Double(covered) / Double(n) * 100, covered, keptPaleRegions, removedSpecks, filledHoles))

  // 確認用：左に元の絵、右にマスクの部分を赤紫で重ねた絵（マスク外は少し薄くする）
  if let checkDir {
    var sheet = [UInt8](repeating: 255, count: w * 2 * h * 4)
    for y in 0..<h {
      for x in 0..<w {
        let i = y * w + x
        let a = cleaned[i]
        for c in 0..<3 {
          let v = Double(px[i * 4 + c])
          sheet[(y * w * 2 + x) * 4 + c] = px[i * 4 + c]
          let faded = 255 - (255 - v) * 0.45
          let magenta: Double = c == 1 ? 0 : 255
          sheet[(y * w * 2 + w + x) * 4 + c] = UInt8(faded * (1 - a) + magenta * a)
        }
        sheet[(y * w * 2 + x) * 4 + 3] = 255
        sheet[(y * w * 2 + w + x) * 4 + 3] = 255
      }
    }
    let ctx = CGContext(data: &sheet, width: w * 2, height: h, bitsPerComponent: 8, bytesPerRow: w * 2 * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    savePNG(ctx.makeImage()!, "\(checkDir)/\(name)_check.png")
  }
}
