// アタッチメントの装着位置を確かめる画像を作る（src/config/avatarAttachmentLayout.json をそのまま使う。アプリと同じ計算）
//   swift scripts/avatar-attachments/preview.swift <出力フォルダ> [キャラクター...]
// <キャラクター>.png：上の段がリボン 4 つ、中が帽子 4 つ、下がメガネ 4 つ。最後の列に 3 つ全部を付けたもの
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().path
let args = Array(CommandLine.arguments.dropFirst())
let outDir = args[0]
let json = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: "\(root)/src/config/avatarAttachmentLayout.json"))) as! [String: Any]
let items = json["items"] as! [String: [String: Any]]
let layout = json["layout"] as! [String: [String: [String: Double]]]
let animals = args.count > 1 ? Array(args[1...]) : layout.keys.sorted()

func load(_ path: String) -> CGImage {
  let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(source, 0, nil)!
}

/// キャラクターの絵（512）に、アイテムを表の値どおりに重ねる。ctx は左上原点・512 の大きさにそろえてある前提
func drawItem(_ ctx: CGContext, item: String, place p: [String: Double]) {
  let meta = items[item]!
  let box = meta["box"] as! [String: Double]
  let size = meta["imageSize"] as! Double
  let scale = p["width"]! / box["width"]!
  // 絵がある範囲の中心を (x, y) に置き、そこを中心に回す
  let boxCx = box["x"]! + box["width"]! / 2, boxCy = box["y"]! + box["height"]! / 2
  ctx.saveGState()
  ctx.translateBy(x: p["x"]!, y: p["y"]!)
  ctx.rotate(by: p["rotation"]! * .pi / 180)
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -boxCx, y: -boxCy)
  // 左上原点なので、絵は上下を反転して描く
  ctx.translateBy(x: 0, y: size)
  ctx.scaleBy(x: 1, y: -1)
  ctx.draw(load("\(root)/avatar_attachments_png/\(item).png"), in: CGRect(x: 0, y: 0, width: size, height: size))
  ctx.restoreGState()
}

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let cell = Double(ProcessInfo.processInfo.environment["CELL"] ?? "256") ?? 256
for animal in animals {
  let base = load("\(root)/avatar_animals_png/\(animal).png")
  let rows = ["ribbon", "hat", "glasses"]
  let cols = 5
  let ctx = CGContext(data: nil, width: Int(cell) * cols, height: Int(cell) * rows.count, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  // 左上原点にする
  ctx.translateBy(x: 0, y: CGFloat(cell) * CGFloat(rows.count))
  ctx.scaleBy(x: 1, y: -1)
  for (r, category) in rows.enumerated() {
    for c in 0..<cols {
      ctx.saveGState()
      ctx.translateBy(x: Double(c) * cell, y: Double(r) * cell)
      ctx.scaleBy(x: cell / 512, y: cell / 512)
      ctx.saveGState()
      ctx.translateBy(x: 0, y: 512); ctx.scaleBy(x: 1, y: -1)
      ctx.draw(base, in: CGRect(x: 0, y: 0, width: 512, height: 512))
      ctx.restoreGState()
      let chosen: [String] = c < 4
        ? ["\(category)_0\(c + 1)"]
        : ["hat_0\(r + 1)", "ribbon_0\(r + 1)", "glasses_0\(r + 1)"]
      for item in chosen.sorted(by: { layout[animal]![$0]!["zIndex"]! < layout[animal]![$1]!["zIndex"]! }) {
        drawItem(ctx, item: item, place: layout[animal]![item]!)
      }
      ctx.restoreGState()
    }
  }
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "\(outDir)/\(animal).png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
  CGImageDestinationFinalize(dest)
  print("→ \(outDir)/\(animal).png")
}
