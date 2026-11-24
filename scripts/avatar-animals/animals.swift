// アイコンの動物（顔だけ・透明背景・192px）を描く。丸と三角だけの、平面的でカラフルなオリジナルの絵
// swift scripts/avatar-animals/animals.swift <出力先フォルダ>
// アプリでは、選んだ色の丸の上に重ねて出す（src/assets/animals と ios の Images.xcassets/Animal*.imageset）
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let S: CGFloat = 192
let out = CommandLine.arguments[1]

func rgb(_ hex: UInt32) -> CGColor {
  CGColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let ink = rgb(0x26323A)
let blush = rgb(0xF8A5B4)

func render(_ name: String, _ draw: (CGContext) -> Void) {
  let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.translateBy(x: 0, y: S)
  ctx.scaleBy(x: 1, y: -1)
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  draw(ctx)
  let url = URL(fileURLWithPath: "\(out)/\(name).png")
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
  CGImageDestinationFinalize(dest)
}

extension CGContext {
  func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: CGColor) {
    setFillColor(color)
    fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
  }
  func ellipse(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ color: CGColor, rotate angle: CGFloat = 0) {
    saveGState()
    translateBy(x: x, y: y)
    rotate(by: angle)
    setFillColor(color)
    fillEllipse(in: CGRect(x: -w / 2, y: -h / 2, width: w, height: h))
    restoreGState()
  }
  func poly(_ points: [CGPoint], _ color: CGColor) {
    setFillColor(color)
    let path = CGMutablePath()
    path.addLines(between: points)
    path.closeSubpath()
    addPath(path)
    fillPath()
  }
  /// 目：黒い丸に白い光
  func eyes(y: CGFloat = 104, spread: CGFloat = 24, r: CGFloat = 8.5, color: CGColor = ink) {
    for x in [96 - spread, 96 + spread] {
      circle(x, y, r, color)
      circle(x + r * 0.35, y - r * 0.35, r * 0.36, rgb(0xFFFFFF))
    }
  }
  func cheeks(y: CGFloat = 124, spread: CGFloat = 40) {
    for x in [96 - spread, 96 + spread] { ellipse(x, y, 18, 11, blush) }
  }
  /// ω の口
  func smile(y: CGFloat = 134, w: CGFloat = 9) {
    setStrokeColor(ink)
    setLineWidth(4)
    move(to: CGPoint(x: 96 - w * 2, y: y))
    addQuadCurve(to: CGPoint(x: 96, y: y), control: CGPoint(x: 96 - w, y: y + w * 1.1))
    addQuadCurve(to: CGPoint(x: 96 + w * 2, y: y), control: CGPoint(x: 96 + w, y: y + w * 1.1))
    strokePath()
  }
}

// ねこ
render("cat") { c in
  let fur = rgb(0xF6A15B), inner = rgb(0xFFD3B0)
  c.poly([CGPoint(x: 34, y: 92), CGPoint(x: 44, y: 22), CGPoint(x: 92, y: 56)], fur)
  c.poly([CGPoint(x: 158, y: 92), CGPoint(x: 148, y: 22), CGPoint(x: 100, y: 56)], fur)
  c.poly([CGPoint(x: 50, y: 76), CGPoint(x: 54, y: 40), CGPoint(x: 80, y: 60)], inner)
  c.poly([CGPoint(x: 142, y: 76), CGPoint(x: 138, y: 40), CGPoint(x: 112, y: 60)], inner)
  c.ellipse(96, 112, 136, 120, fur)
  // しま
  c.poly([CGPoint(x: 86, y: 54), CGPoint(x: 106, y: 54), CGPoint(x: 96, y: 76)], rgb(0xDB7D36))
  c.ellipse(96, 132, 64, 40, rgb(0xFFF3E6))
  c.eyes()
  c.poly([CGPoint(x: 88, y: 118), CGPoint(x: 104, y: 118), CGPoint(x: 96, y: 126)], rgb(0xEF7A8C))
  c.smile(y: 130, w: 7)
  c.setStrokeColor(ink)
  c.setLineWidth(3)
  for (y, dy) in [(120.0, -4.0), (130.0, 4.0)] as [(CGFloat, CGFloat)] {
    c.move(to: CGPoint(x: 52, y: y)); c.addLine(to: CGPoint(x: 26, y: y + dy))
    c.move(to: CGPoint(x: 140, y: y)); c.addLine(to: CGPoint(x: 166, y: y + dy))
  }
  c.strokePath()
}

// いぬ
render("dog") { c in
  let fur = rgb(0xE0B07E), ear = rgb(0x8B5A3C)
  c.ellipse(96, 112, 132, 124, fur)
  c.ellipse(38, 98, 40, 82, ear, rotate: 0.35)
  c.ellipse(154, 98, 40, 82, ear, rotate: -0.35)
  c.ellipse(118, 84, 34, 30, rgb(0xC88F5E))
  c.ellipse(96, 134, 70, 48, rgb(0xFFF1DF))
  c.eyes(y: 102)
  c.ellipse(96, 122, 26, 18, ink)
  c.circle(91, 118, 3.5, rgb(0xFFFFFF))
  c.ellipse(96, 150, 16, 14, rgb(0xEF7A8C))
  c.smile(y: 136, w: 8)
}

// くま
render("bear") { c in
  let fur = rgb(0x9C6B4E), inner = rgb(0xE3BE9C)
  c.circle(46, 54, 26, fur)
  c.circle(146, 54, 26, fur)
  c.circle(46, 54, 13, inner)
  c.circle(146, 54, 13, inner)
  c.ellipse(96, 112, 140, 128, fur)
  c.ellipse(96, 132, 64, 46, inner)
  c.eyes(y: 102)
  c.ellipse(96, 122, 24, 16, ink)
  c.smile(y: 136, w: 7)
  c.cheeks(y: 124, spread: 46)
}

// うさぎ
render("rabbit") { c in
  let fur = rgb(0xFBF7F4), inner = rgb(0xF6B3C2)
  c.ellipse(68, 46, 32, 86, fur, rotate: -0.12)
  c.ellipse(124, 46, 32, 86, fur, rotate: 0.12)
  c.ellipse(68, 50, 14, 60, inner, rotate: -0.12)
  c.ellipse(124, 50, 14, 60, inner, rotate: 0.12)
  c.ellipse(96, 122, 132, 112, fur)
  c.eyes(y: 114, spread: 26)
  c.cheeks(y: 134, spread: 42)
  c.poly([CGPoint(x: 89, y: 128), CGPoint(x: 103, y: 128), CGPoint(x: 96, y: 135)], rgb(0xEF7A8C))
  c.smile(y: 140, w: 6)
}

// パンダ
render("panda") { c in
  let white = rgb(0xFFFFFF)
  c.circle(48, 52, 24, ink)
  c.circle(144, 52, 24, ink)
  c.ellipse(96, 112, 142, 128, white)
  c.ellipse(68, 106, 34, 44, ink, rotate: 0.5)
  c.ellipse(124, 106, 34, 44, ink, rotate: -0.5)
  for x in [70.0, 122.0] as [CGFloat] {
    c.circle(x, 104, 8, white)
    c.circle(x, 104, 4.5, ink)
  }
  c.ellipse(96, 128, 22, 14, ink)
  c.smile(y: 140, w: 7)
  c.cheeks(y: 132, spread: 46)
}

// きつね
render("fox") { c in
  let fur = rgb(0xF08A3C), white = rgb(0xFFF6EC), dark = rgb(0x5B3A29)
  c.poly([CGPoint(x: 28, y: 88), CGPoint(x: 38, y: 16), CGPoint(x: 92, y: 56)], fur)
  c.poly([CGPoint(x: 164, y: 88), CGPoint(x: 154, y: 16), CGPoint(x: 100, y: 56)], fur)
  c.poly([CGPoint(x: 40, y: 50), CGPoint(x: 38, y: 16), CGPoint(x: 62, y: 34)], dark)
  c.poly([CGPoint(x: 152, y: 50), CGPoint(x: 154, y: 16), CGPoint(x: 130, y: 34)], dark)
  // とがった顔
  let face = CGMutablePath()
  face.move(to: CGPoint(x: 24, y: 86))
  face.addQuadCurve(to: CGPoint(x: 168, y: 86), control: CGPoint(x: 96, y: 30))
  face.addQuadCurve(to: CGPoint(x: 96, y: 168), control: CGPoint(x: 160, y: 150))
  face.addQuadCurve(to: CGPoint(x: 24, y: 86), control: CGPoint(x: 32, y: 150))
  c.setFillColor(fur)
  c.addPath(face)
  c.fillPath()
  // 白いほお
  let cheeks = CGMutablePath()
  cheeks.move(to: CGPoint(x: 30, y: 104))
  cheeks.addQuadCurve(to: CGPoint(x: 96, y: 118), control: CGPoint(x: 66, y: 94))
  cheeks.addQuadCurve(to: CGPoint(x: 162, y: 104), control: CGPoint(x: 126, y: 94))
  cheeks.addQuadCurve(to: CGPoint(x: 96, y: 168), control: CGPoint(x: 154, y: 150))
  cheeks.addQuadCurve(to: CGPoint(x: 30, y: 104), control: CGPoint(x: 38, y: 150))
  c.setFillColor(white)
  c.addPath(cheeks)
  c.fillPath()
  c.eyes(y: 100, spread: 30, r: 8)
  c.ellipse(96, 148, 20, 14, ink)
}

// ペンギン
render("penguin") { c in
  let body = rgb(0x334155), white = rgb(0xFFFFFF)
  c.ellipse(96, 104, 152, 148, body)
  c.circle(72, 106, 32, white)
  c.circle(120, 106, 32, white)
  c.ellipse(96, 132, 96, 56, white)
  c.eyes(y: 104, spread: 22, r: 8)
  c.poly([CGPoint(x: 80, y: 124), CGPoint(x: 112, y: 124), CGPoint(x: 96, y: 142)], rgb(0xF59E0B))
  c.cheeks(y: 132, spread: 44)
}

// ひよこ
render("chick") { c in
  let fur = rgb(0xFFD23F)
  c.ellipse(86, 36, 14, 30, fur, rotate: -0.4)
  c.ellipse(102, 34, 14, 32, fur, rotate: 0.3)
  c.circle(96, 108, 70, fur)
  c.eyes(y: 102, spread: 26)
  c.poly([CGPoint(x: 80, y: 118), CGPoint(x: 112, y: 118), CGPoint(x: 96, y: 136)], rgb(0xF97316))
  c.cheeks(y: 128, spread: 44)
}
