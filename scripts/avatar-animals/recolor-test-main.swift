// recolor-test.sh から使う。動物の絵を、マスクを使っていくつかの色に変えて 1 枚に並べる（左端が元の絵）
// 引数: <出力.png> <色,色,…> <絵.png:マスク.png>...
import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = Array(CommandLine.arguments.dropFirst())
let output = args[0]
let colors = args[1].split(separator: ",").map(String.init)
let inputs = Array(args.dropFirst(2))

func load(_ path: String) -> CGImage {
  let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(source, 0, nil)!
}

let cell = Int(ProcessInfo.processInfo.environment["CELL"] ?? "220") ?? 220
let columns = colors.count + 1
let sheet = CGContext(data: nil, width: cell * columns, height: cell * inputs.count, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
sheet.setFillColor(CGColor(red: 0.93, green: 0.94, blue: 0.96, alpha: 1))
sheet.fill(CGRect(x: 0, y: 0, width: cell * columns, height: cell * inputs.count))
sheet.interpolationQuality = .high
for (row, path) in inputs.enumerated() {
  let parts = path.split(separator: ":").map(String.init)
  let image = load(parts[0])
  let mask = load(parts[1])
  let ref = AvatarRecolorCore.referenceAccent(image, mask: mask)
  let refRGB = AvatarRecolorCore.rgb(ref)
  let refHex = String(format: "#%02X%02X%02X", Int(refRGB.0 * 255 + 0.5), Int(refRGB.1 * 255 + 0.5), Int(refRGB.2 * 255 + 0.5))
  print(String(format: "%@  絵のいちばん多いオレンジ %@（h=%.0f° s=%.2f v=%.2f）", (parts[0] as NSString).lastPathComponent, refHex, ref.h * 360, ref.s, ref.v))
  let started = Date()
  let variants = [image] + colors.map { AvatarRecolorCore.recolor(image, mask: mask, hex: $0) }
  print(String(format: "  %d 色ぶん %.0f ms", colors.count, Date().timeIntervalSince(started) * 1000))
  for (col, variant) in variants.enumerated() {
    let scale = min(Double(cell - 10) / Double(variant.width), Double(cell - 10) / Double(variant.height))
    let w = Double(variant.width) * scale, h = Double(variant.height) * scale
    let y = Double((inputs.count - 1 - row) * cell)
    sheet.draw(variant, in: CGRect(x: Double(col * cell) + (Double(cell) - w) / 2, y: y + (Double(cell) - h) / 2, width: w, height: h))
  }
}
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, sheet.makeImage()!, nil)
CGImageDestinationFinalize(dest)
print("→ \(output)")
