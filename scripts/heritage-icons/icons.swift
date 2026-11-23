// 文化遺産の種類アイコン（黒一色・透明背景、192px）を描く
// swift scripts/heritage-icons/icons.swift src/assets/icons
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let S: CGFloat = 192

func render(_ name: String, _ draw: (CGContext) -> Void) {
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.translateBy(x: 0, y: S)
    ctx.scaleBy(x: 1, y: -1)
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.setLineJoin(.round)
    ctx.setLineCap(.round)
    draw(ctx)
    let url = URL(fileURLWithPath: CommandLine.arguments[1] + "/" + name + ".png")
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
}

// 寺社の建物（国宝・重要文化財）
render("heritage_temple") { c in
    // 屋根（両端が反り上がる）
    let roof = CGMutablePath()
    roof.move(to: CGPoint(x: 6, y: 86))
    roof.addQuadCurve(to: CGPoint(x: 58, y: 60), control: CGPoint(x: 36, y: 84))
    roof.addLine(to: CGPoint(x: 78, y: 38))
    roof.addLine(to: CGPoint(x: 114, y: 38))
    roof.addLine(to: CGPoint(x: 134, y: 60))
    roof.addQuadCurve(to: CGPoint(x: 186, y: 86), control: CGPoint(x: 156, y: 84))
    roof.addQuadCurve(to: CGPoint(x: 6, y: 86), control: CGPoint(x: 96, y: 76))
    c.addPath(roof)
    c.fillPath()
    c.fill(CGRect(x: 70, y: 26, width: 52, height: 14).insetBy(dx: 0, dy: 0))
    // 梁と柱
    c.fill(CGRect(x: 34, y: 90, width: 124, height: 12))
    for x in [44, 74, 106, 136] as [CGFloat] {
        c.fill(CGRect(x: x, y: 100, width: 12, height: 52))
    }
    // 基壇
    c.fill(CGRect(x: 22, y: 152, width: 148, height: 16))
}

// 地球（世界遺産）
render("heritage_world") { c in
    let center = CGPoint(x: 96, y: 96)
    c.fillEllipse(in: CGRect(x: 14, y: 14, width: 164, height: 164))
    c.setBlendMode(.clear)
    c.setLineWidth(8)
    c.strokeEllipse(in: CGRect(x: center.x - 36, y: 18, width: 72, height: 156))
    c.move(to: CGPoint(x: 96, y: 16)); c.addLine(to: CGPoint(x: 96, y: 176))
    c.move(to: CGPoint(x: 16, y: 96)); c.addLine(to: CGPoint(x: 176, y: 96))
    c.strokePath()
    for y in [54, 138] as [CGFloat] {
        let dy = abs(y - 96)
        let half = (82 * 82 - dy * dy).squareRoot()
        c.move(to: CGPoint(x: 96 - half, y: y)); c.addLine(to: CGPoint(x: 96 + half, y: y))
    }
    c.strokePath()
}

// 古墳（史跡）：上から見た前方後円墳と、まわりの堀（斜めに置いて鍵穴に見えないように）
func kofun(_ grow: CGFloat) -> CGPath {
    // 原点を中心に、後円部が上・前方部が下
    let p = CGMutablePath()
    let r: CGFloat = 34 + grow
    let cy: CGFloat = -26
    let neckHalf: CGFloat = 20 + grow
    let neckY = cy + (r * r - neckHalf * neckHalf).squareRoot()
    let a = asin(neckHalf / r)
    p.addArc(center: CGPoint(x: 0, y: cy), radius: r, startAngle: .pi / 2 - a, endAngle: .pi / 2 + a, clockwise: true)
    p.addLine(to: CGPoint(x: -(50 + grow), y: 46 + grow))
    p.addLine(to: CGPoint(x: 50 + grow, y: 46 + grow))
    p.addLine(to: CGPoint(x: neckHalf, y: neckY))
    p.closeSubpath()
    return p
}
render("heritage_kofun") { c in
    // 斜めに回してから、全体（堀の線の太さも込み）が真ん中に収まるように置く
    let rot = CGAffineTransform(rotationAngle: .pi / 4)
    let outer = kofun(20).copy(using: [rot])!
    let inner = kofun(0).copy(using: [rot])!
    let box = outer.boundingBox.insetBy(dx: -4, dy: -4)
    let scale = 176 / max(box.width, box.height)
    c.translateBy(x: 96, y: 96)
    c.scaleBy(x: scale, y: scale)
    c.translateBy(x: -box.midX, y: -box.midY)
    c.setLineWidth(8 / scale * 0.9)
    c.addPath(outer); c.strokePath()
    c.addPath(inner); c.fillPath()
}

// 山と日（名勝）
render("heritage_scenic") { c in
    c.fillEllipse(in: CGRect(x: 30, y: 26, width: 38, height: 38))
    let back = CGMutablePath()
    back.addLines(between: [CGPoint(x: 4, y: 166), CGPoint(x: 62, y: 82), CGPoint(x: 120, y: 166)])
    back.closeSubpath()
    c.addPath(back); c.fillPath()
    // 手前の山（後ろの山との境目を白く抜く）
    let front = CGMutablePath()
    front.addLines(between: [CGPoint(x: 50, y: 166), CGPoint(x: 116, y: 56), CGPoint(x: 188, y: 166)])
    front.closeSubpath()
    c.setBlendMode(.clear)
    c.setLineWidth(12)
    c.addPath(front); c.strokePath()
    c.setBlendMode(.normal)
    c.addPath(front); c.fillPath()
    // 雪
    c.setBlendMode(.clear)
    let snow = CGMutablePath()
    snow.addLines(between: [CGPoint(x: 116, y: 56), CGPoint(x: 97, y: 88), CGPoint(x: 108, y: 82), CGPoint(x: 116, y: 92),
                            CGPoint(x: 125, y: 82), CGPoint(x: 135, y: 88)])
    snow.closeSubpath()
    c.addPath(snow); c.fillPath()
    c.setBlendMode(.normal)
    c.fill(CGRect(x: 0, y: 164, width: 192, height: 8))
}
