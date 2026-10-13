// Draws the Glideshot app icon: a tilted Mac screen in a squircle, the cursor in focus, the rest
// softly out of focus (the app's own look, made with the same Core Image filters).
// Usage: swiftc -O scripts/make-icon.swift -o /tmp/make-icon && /tmp/make-icon <output.png> [size] [square|tight]
// "square" makes a full-bleed version. Use it for the macOS app icon (.icns): macOS 26+ applies its own
// rounded shape and glass edge to full-bleed art, but puts hand-drawn shapes in a gray frame.
// Also use it for iOS home-screen icons. The default (squircle with margins) is for the website's logo;
// "tight" is the squircle without the margins, for favicons where every pixel counts.
//
// macOS icon: for each size in 16 32 64 128 256 512 1024, run with "square", put the PNGs in an
// AppIcon.iconset (icon_16x16.png, icon_16x16@2x.png, …) and run `iconutil -c icns AppIcon.iconset`.
import AppKit
import CoreImage

let size = 1024.0
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let ci = CIContext(options: [.workingColorSpace: srgb])

func color(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    let r = CGFloat((hex >> 16) & 255) / 255
    let g = CGFloat((hex >> 8) & 255) / 255
    let b = CGFloat(hex & 255) / 255
    return CGColor(srgbRed: r, green: g, blue: b, alpha: a)
}

func bitmap(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> CGImage {
    let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: srgb,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.interpolationQuality = .high
    draw(c)
    return c.makeImage()!
}

/// Apple-style squircle (superellipse), 824 pt body on the 1024 grid.
func squircle(in rect: CGRect) -> CGPath {
    let path = CGMutablePath()
    let n = 5.0, a = rect.width / 2, b = rect.height / 2, cx = rect.midX, cy = rect.midY
    for i in 0...720 {
        let t = Double(i) / 720 * 2 * .pi
        let ct = cos(t), st = sin(t)
        let x = cx + a * copysign(pow(abs(ct), 2 / n), ct)
        let y = cy + b * copysign(pow(abs(st), 2 / n), st)
        i == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
    }
    path.closeSubpath()
    return path
}

func roundRect(_ c: CGContext, _ r: CGRect, _ radius: CGFloat, _ fill: CGColor) {
    c.addPath(CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil))
    c.setFillColor(fill)
    c.fillPath()
}

// MARK: The flat screen (y up). A Finder-like window: sidebar, toolbar, rows, one selected.

let cardW = 760.0, cardH = 475.0
let rowH = 46.0, firstRowTop = cardH - 104
let selectedRow = 2
let focus = CGPoint(x: 318, y: firstRowTop - Double(selectedRow) * rowH - rowH / 2)

let card = bitmap(Int(cardW), Int(cardH)) { c in
    let full = CGRect(x: 0, y: 0, width: cardW, height: cardH)
    c.addPath(CGPath(roundedRect: full, cornerWidth: 40, cornerHeight: 40, transform: nil))
    c.clip()
    c.setFillColor(color(0xffffff)); c.fill(full)
    c.setFillColor(color(0xf1f2f6)); c.fill(CGRect(x: 0, y: 0, width: 190, height: cardH))
    for (i, hex) in [0xff5f57, 0xfebc2e, 0x28c840].enumerated() {
        c.setFillColor(color(UInt32(hex)))
        c.fillEllipse(in: CGRect(x: 26 + Double(i) * 26 - 9, y: cardH - 34 - 9, width: 18, height: 18))
    }
    for i in 0..<6 { // sidebar items
        roundRect(c, CGRect(x: 30, y: cardH - 92 - Double(i) * 40, width: 18, height: 18), 5, color(0x7aa5f7))
        roundRect(c, CGRect(x: 58, y: cardH - 88 - Double(i) * 40, width: [96, 78, 104, 70, 88, 64][i], height: 11), 5.5, color(0xc5c9d4))
    }
    roundRect(c, CGRect(x: 214, y: cardH - 44, width: 150, height: 15), 7.5, color(0x9aa0ad)) // window title
    c.setFillColor(color(0xe6e7ec)); c.fill(CGRect(x: 190, y: cardH - 70, width: cardW - 190, height: 2))
    let names: [Double] = [150, 118, 132, 96, 160, 110, 128]
    for i in 0..<6 {
        let top = firstRowTop - Double(i) * rowH
        let row = CGRect(x: 202, y: top - rowH + 4, width: cardW - 218, height: rowH - 8)
        let selected = i == selectedRow
        if selected { roundRect(c, row, 10, color(0x0a6cf0)) } else if i % 2 == 1 { roundRect(c, row, 10, color(0xf6f7f9)) }
        let mid = row.midY
        roundRect(c, CGRect(x: 216, y: mid - 10, width: 20, height: 20), 5, selected ? color(0xffffff, 0.95) : color(0x8fb2f3))
        roundRect(c, CGRect(x: 248, y: mid - 6, width: names[i], height: 12), 6, selected ? color(0xffffff) : color(0x9ea4b1))
        roundRect(c, CGRect(x: 560, y: mid - 5, width: 70, height: 10), 5, selected ? color(0xffffff, 0.7) : color(0xd5d8e0))
        roundRect(c, CGRect(x: 650, y: mid - 5, width: 80, height: 10), 5, selected ? color(0xffffff, 0.7) : color(0xd5d8e0))
    }
}

// MARK: Tilt it (same projection model as the app), blur away from the cursor, add a soft shadow.

let pitch = 38.0, yaw = 14.0, roll = -10.0, perspective = 0.9
let anchor = CGPoint(x: 492, y: 548) // where the focus point lands in the icon
let rad = Double.pi / 180
func rotate(_ v: SIMD3<Double>) -> SIMD3<Double> {
    let y = yaw * rad, p = -pitch * rad, r = roll * rad
    var a = SIMD3(v.x * cos(y) + v.z * sin(y), v.y, -v.x * sin(y) + v.z * cos(y))
    a = SIMD3(a.x, a.y * cos(p) - a.z * sin(p), a.y * sin(p) + a.z * cos(p))
    return SIMD3(a.x * cos(r) - a.y * sin(r), a.x * sin(r) + a.y * cos(r), a.z)
}
let distance = cardW * (1.3 + (1 - perspective) * 5)
let scale = 0.8
func project(_ x: Double, _ y: Double) -> CGPoint {
    let q = rotate(SIMD3(x - focus.x, y - focus.y, 0))
    let k = distance / (distance - q.z) * scale
    return CGPoint(x: anchor.x + q.x * k, y: anchor.y + q.y * k)
}
func vec(_ p: CGPoint) -> CIVector { CIVector(x: p.x, y: p.y) }

let flat = CIImage(cgImage: card)
let warped = flat.applyingFilter("CIPerspectiveTransform", parameters: [
    "inputTopLeft": vec(project(0, cardH)), "inputTopRight": vec(project(cardW, cardH)),
    "inputBottomRight": vec(project(cardW, 0)), "inputBottomLeft": vec(project(0, 0)),
])
let canvas = CGRect(x: 0, y: 0, width: size, height: size)
let mask = CIFilter(name: "CIRadialGradient", parameters: [
    "inputCenter": vec(anchor), "inputRadius0": 70, "inputRadius1": 440,
    "inputColor0": CIColor.black, "inputColor1": CIColor.white,
])!.outputImage!.cropped(to: canvas)
let dof = warped.clampedToExtent()
    .applyingFilter("CIMaskedVariableBlur", parameters: ["inputMask": mask, kCIInputRadiusKey: 14])
    .cropped(to: warped.extent)
    .applyingFilter("CISourceInCompositing", parameters: [kCIInputBackgroundImageKey: warped]) // keep crisp edges
let shadow = warped
    .applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.45),
    ])
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 34])
    .transformed(by: CGAffineTransform(translationX: 10, y: -34))
let screenLayer = ci.createCGImage(dof.composited(over: shadow).cropped(to: canvas), from: canvas)!

// MARK: Compose the icon.

let variant = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : ""
let square = variant == "square"
let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = square ? CGPath(rect: canvas, transform: nil) : squircle(in: body)
let icon = bitmap(Int(size), Int(size)) { c in
    // Drop shadow under the whole icon (part of the macOS icon grid).
    if !square {
        c.saveGState()
        c.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: color(0x000000, 0.28))
        c.addPath(shape); c.setFillColor(color(0x5a55e0)); c.fillPath()
        c.restoreGState()
    }

    c.saveGState()
    c.addPath(shape); c.clip()
    // Background: the demo's wallpaper colors.
    let bg = CGGradient(colorsSpace: srgb, colors: [color(0x5e8dff), color(0x5a4fd6), color(0x8b5fe0)] as CFArray, locations: [0, 0.6, 1])!
    c.drawLinearGradient(bg, start: CGPoint(x: body.minX, y: body.maxY), end: CGPoint(x: body.maxX, y: body.minY), options: [])
    let glow = CGGradient(colorsSpace: srgb, colors: [color(0xff9fd6, 0.55), color(0xff9fd6, 0)] as CFArray, locations: [0, 1])!
    c.drawRadialGradient(glow, startCenter: CGPoint(x: 830, y: 180), startRadius: 0, endCenter: CGPoint(x: 830, y: 180), endRadius: 420, options: [])
    let sky = CGGradient(colorsSpace: srgb, colors: [color(0x9cc6ff, 0.6), color(0x9cc6ff, 0)] as CFArray, locations: [0, 1])!
    c.drawRadialGradient(sky, startCenter: CGPoint(x: 190, y: 880), startRadius: 0, endCenter: CGPoint(x: 190, y: 880), endRadius: 460, options: [])

    c.draw(screenLayer, in: canvas)

    // Cursor, tilted with the screen, tip on the focus point.
    let arrow = CGMutablePath()
    let pts: [(Double, Double)] = [(4, 3), (4, 27.5), (10.3, 21.4), (14.3, 30.8), (18.5, 29), (14.5, 19.8), (23.2, 19.8)]
    let s = 5.0
    for (i, p) in pts.enumerated() {
        let q = CGPoint(x: (p.0 - 4) * s, y: -(p.1 - 3) * s)
        i == 0 ? arrow.move(to: q) : arrow.addLine(to: q)
    }
    arrow.closeSubpath()
    c.saveGState()
    c.translateBy(x: anchor.x, y: anchor.y)
    c.rotate(by: roll * rad)
    c.setShadow(offset: CGSize(width: 0, height: -10), blur: 18, color: color(0x000000, 0.4))
    c.addPath(arrow); c.setFillColor(color(0x111114)); c.fillPath()
    c.restoreGState()
    c.saveGState()
    c.translateBy(x: anchor.x, y: anchor.y)
    c.rotate(by: roll * rad)
    c.addPath(arrow); c.setStrokeColor(color(0xffffff)); c.setLineWidth(2 * s); c.setLineJoin(.round); c.strokePath()
    c.addPath(arrow); c.setFillColor(color(0x111114)); c.fillPath()
    c.restoreGState()

    // Glass: a soft top highlight and a hairline edge.
    let gloss = CGGradient(colorsSpace: srgb, colors: [color(0xffffff, 0.22), color(0xffffff, 0)] as CFArray, locations: [0, 1])!
    c.drawLinearGradient(gloss, start: CGPoint(x: 0, y: body.maxY), end: CGPoint(x: 0, y: body.midY + 60), options: [])
    c.restoreGState()
    if !square { c.addPath(shape); c.setStrokeColor(color(0xffffff, 0.22)); c.setLineWidth(3); c.strokePath() }
}

// MARK: Write the requested size.

let args = CommandLine.arguments
let out = URL(fileURLWithPath: args.count > 1 ? args[1] : "icon.png")
let px = args.count > 2 ? Int(args[2]) ?? 1024 : 1024
// Full-bleed and tight: keep just the icon body (filled edge to edge, or the squircle without margins).
let source = square || variant == "tight" ? icon.cropping(to: body)! : icon
let final = px == source.width ? source : bitmap(px, px) { c in c.draw(source, in: CGRect(x: 0, y: 0, width: px, height: px)) }
let rep = NSBitmapImageRep(cgImage: final)
try! rep.representation(using: .png, properties: [:])!.write(to: out)
