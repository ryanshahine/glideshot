import CoreImage
import Metal
import simd

/// The animated (smoothed) camera. `focus` is in source pixels, Core Image coords (origin bottom-left).
struct CameraState {
    var focus = CGPoint.zero
    var zoom = 1.0
    var pitch = 0.0
    var yaw = 0.0
    var roll = 0.0
    var blurScale = 1.0
}

/// Places the captured screen on a plane in 3D, rotates it around the focus point and
/// projects it through a pinhole camera so the focus lands at `anchor` in the output.
struct Projection {
    let focus: SIMD2<Double>
    let anchor: SIMD2<Double>
    let scale: Double
    let distance: Double
    let rotation: simd_double3x3

    init(sourceSize: CGSize, outputSize: CGSize, camera: CameraState, perspective: Double, framing: CGPoint) {
        let w = Double(sourceSize.width), h = Double(sourceSize.height)
        let f = SIMD2<Double>(Double(camera.focus.x), Double(camera.focus.y))
        let rad = Double.pi / 180

        let yaw = camera.yaw * rad, pitch = -camera.pitch * rad, roll = camera.roll * rad
        let ry = simd_double3x3(rows: [
            SIMD3(cos(yaw), 0, sin(yaw)),
            SIMD3(0, 1, 0),
            SIMD3(-sin(yaw), 0, cos(yaw)),
        ])
        let rx = simd_double3x3(rows: [
            SIMD3(1, 0, 0),
            SIMD3(0, cos(pitch), -sin(pitch)),
            SIMD3(0, sin(pitch), cos(pitch)),
        ])
        let rz = simd_double3x3(rows: [
            SIMD3(cos(roll), -sin(roll), 0),
            SIMD3(sin(roll), cos(roll), 0),
            SIMD3(0, 0, 1),
        ])
        let r = rz * rx * ry

        // Camera distance from the plane; closer = stronger perspective. Keep every corner in front of the lens.
        var d = w * (1.3 + (1 - min(max(perspective, 0), 1)) * 5)
        for c in [SIMD2(0, 0), SIMD2(w, 0), SIMD2(0, h), SIMD2(w, h)] {
            let z = (r * SIMD3(c.x - f.x, c.y - f.y, 0)).z
            d = max(d, z * 1.3)
        }

        focus = f
        anchor = SIMD2(Double(framing.x * outputSize.width), Double((1 - framing.y) * outputSize.height))
        scale = min(Double(outputSize.width) / w, Double(outputSize.height) / h) * camera.zoom
        distance = d
        rotation = r
    }

    func project(_ x: Double, _ y: Double) -> CGPoint {
        let p = rotation * SIMD3(x - focus.x, y - focus.y, 0)
        let k = distance / (distance - p.z)
        return CGPoint(x: anchor.x + scale * k * p.x, y: anchor.y + scale * k * p.y)
    }

    /// How depth (towards the camera) changes per source pixel in x and y.
    var depthGradient: SIMD2<Double> {
        SIMD2((rotation * SIMD3(1, 0, 0)).z, (rotation * SIMD3(0, 1, 0)).z)
    }
}

final class EffectRenderer {
    let context: CIContext
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private let ripple = EffectRenderer.makeRippleSprite()

    init() {
        if let device = MTLCreateSystemDefaultDevice() {
            context = CIContext(mtlDevice: device, options: [.cacheIntermediates: false, .name: "Glideshot"])
        } else {
            context = CIContext(options: [.cacheIntermediates: false])
        }
    }

    func render(_ image: CIImage, to buffer: CVPixelBuffer) {
        let rect = CGRect(x: 0, y: 0, width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer))
        context.render(image, to: buffer, bounds: rect, colorSpace: colorSpace)
    }

    /// Averages several frame states (motion blur). One state = a plain render.
    func compose(source: CIImage, frames: [FrameState], settings s: EffectSettings, outputSize: CGSize,
                 sprite: (Int) -> CursorSprite?, pointScale: Double) -> CIImage {
        guard frames.count > 1 else {
            return compose(source: source, frame: frames.first ?? FrameState(), settings: s, outputSize: outputSize,
                           sprite: sprite, pointScale: pointScale)
        }
        let w = 1 / Double(frames.count)
        var sum: CIImage?
        for f in frames {
            let img = compose(source: source, frame: f, settings: s, outputSize: outputSize, sprite: sprite, pointScale: pointScale)
                // Frames are opaque: scale color only (CIColorMatrix works unpremultiplied, so leave alpha at 1).
                .applyingFilter("CIColorMatrix", parameters: [
                    "inputRVector": CIVector(x: w, y: 0, z: 0, w: 0),
                    "inputGVector": CIVector(x: 0, y: w, z: 0, w: 0),
                    "inputBVector": CIVector(x: 0, y: 0, z: w, w: 0),
                ])
            sum = sum.map { img.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: $0]) } ?? img
        }
        let rect = CGRect(origin: .zero, size: outputSize)
        return sum!.settingAlphaOne(in: rect).cropped(to: rect)
    }

    func compose(source: CIImage, frame: FrameState, settings s: EffectSettings, outputSize: CGSize,
                 sprite: (Int) -> CursorSprite?, pointScale: Double) -> CIImage {
        let camera = frame.camera
        let src = source.extent
        let outRect = CGRect(origin: .zero, size: outputSize)
        let proj = Projection(
            sourceSize: src.size, outputSize: outputSize, camera: camera,
            perspective: s.perspective, framing: CGPoint(x: s.framingX, y: s.framingY))

        let corners: [String: Any] = [
            "inputExtent": CIVector(cgRect: src),
            "inputTopLeft": CIVector(cgPoint: proj.project(src.minX, src.maxY)),
            "inputTopRight": CIVector(cgPoint: proj.project(src.maxX, src.maxY)),
            "inputBottomRight": CIVector(cgPoint: proj.project(src.maxX, src.minY)),
            "inputBottomLeft": CIVector(cgPoint: proj.project(src.minX, src.minY)),
        ]
        func warp(_ image: CIImage) -> CIImage {
            image.applyingFilter("CIPerspectiveTransformWithExtent", parameters: corners)
        }

        var screen = overlayCursor(on: source, frame: frame, settings: s, sprite: sprite, pointScale: pointScale)
            .cropped(to: src)
        if s.cornerRadius > 0.5 {
            let rounded = CIFilter(name: "CIRoundedRectangleGenerator", parameters: [
                "inputExtent": CIVector(cgRect: src),
                "inputRadius": s.cornerRadius,
                "inputColor": CIColor.white,
            ])!.outputImage!
            screen = screen.applyingFilter("CISourceInCompositing", parameters: [kCIInputBackgroundImageKey: rounded])
        }

        let resScale = min(outputSize.width, outputSize.height) / 1080
        let radius = s.depthOfFieldEnabled ? s.blurRadius * resScale * camera.blurScale : 0
        let pad = radius * 3 + 4
        let workRect = outRect.insetBy(dx: -pad, dy: -pad)

        let background = CIImage(color: CIColor(red: s.background.r, green: s.background.g, blue: s.background.b))
            .cropped(to: workRect)
        var result = warp(screen).cropped(to: workRect).composited(over: background)

        if radius > 0.5 {
            let mask = warp(focusMask(proj: proj, center: frame.focusPoint, settings: s, source: src, outputSize: outputSize))
                .cropped(to: workRect)
            result = result.applyingFilter("CIMaskedVariableBlur", parameters: [
                "inputMask": mask,
                kCIInputRadiusKey: radius,
            ])
        }
        result = result.cropped(to: outRect)

        if s.vignetteEnabled && s.vignette > 0.01 {
            result = result.applyingFilter("CIVignetteEffect", parameters: [
                kCIInputCenterKey: CIVector(x: outRect.midX, y: outRect.midY),
                kCIInputRadiusKey: hypot(outRect.width, outRect.height) * 0.5,
                kCIInputIntensityKey: s.vignette,
                "inputFalloff": 0.6,
            ]).cropped(to: outRect)
        }
        return result
    }

    /// Draws the cursor and click ripples onto the flat screen, so they tilt and blur with it.
    private func overlayCursor(on screen: CIImage, frame: FrameState, settings s: EffectSettings,
                               sprite: (Int) -> CursorSprite?, pointScale: Double) -> CIImage {
        var image = screen
        let size = pointScale * s.cursorScale  // source pixels per cursor point

        for r in frame.ripples where r.age >= 0 && r.age < Ripple.lifetime {
            let p = r.age / Ripple.lifetime
            let eased = 1 - pow(1 - p, 3)
            let radius = (6 + 24 * eased) * size
            let k = radius / 100  // the sprite's ring radius is 100 px
            let alpha = (1 - p) * 0.9
            let ring = ripple
                .transformed(by: CGAffineTransform(translationX: -128, y: -128)
                    .concatenating(CGAffineTransform(scaleX: k, y: k))
                    .concatenating(CGAffineTransform(translationX: r.point.x, y: r.point.y)))
                .applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: alpha)])
            image = ring.composited(over: image)
        }

        guard frame.cursorAlpha > 0.01, let cursor = sprite(frame.cursorID) else { return image }
        let k = size / cursor.pixelsPerPoint
        let hot = CGPoint(x: cursor.hotSpot.x * size, y: (cursor.size.height - cursor.hotSpot.y) * size)
        var c = cursor.image
            .transformed(by: CGAffineTransform(translationX: -cursor.image.extent.minX, y: -cursor.image.extent.minY))
            .transformed(by: CGAffineTransform(scaleX: k, y: k))
            .transformed(by: CGAffineTransform(translationX: frame.cursor.x - hot.x, y: frame.cursor.y - hot.y))
        if frame.cursorAlpha < 0.99 {
            c = c.applyingFilter("CIColorMatrix", parameters: [
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: frame.cursorAlpha),
            ])
        }
        return c.composited(over: image)
    }

    /// A translucent dark disc with a dark ring and a thin white inner ring (reads on light and dark UIs).
    /// 256 px, ring radius 100.
    private static func makeRippleSprite() -> CIImage {
        let size = 256
        guard let ctx = CGContext(
            data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return CIImage.empty() }
        let rect = CGRect(x: 28, y: 28, width: 200, height: 200)
        ctx.setFillColor(CGColor(gray: 0, alpha: 0.16))
        ctx.fillEllipse(in: rect)
        ctx.setStrokeColor(CGColor(gray: 0.1, alpha: 0.6))
        ctx.setLineWidth(12)
        ctx.strokeEllipse(in: rect)
        ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.8))
        ctx.setLineWidth(4)
        ctx.strokeEllipse(in: rect.insetBy(dx: 8, dy: 8))
        return ctx.makeImage().map { CIImage(cgImage: $0) } ?? CIImage.empty()
    }

    /// Blur amount in source space: black = sharp, white = full blur.
    /// A soft circle around the focus point, combined with a band that follows the tilt
    /// so parts of the screen further from (or closer to) the lens go out of focus.
    private func focusMask(proj: Projection, center: CGPoint, settings s: EffectSettings, source: CGRect, outputSize: CGSize) -> CIImage {
        let visible = min(outputSize.width, outputSize.height) / proj.scale  // source px across the frame's short side
        let f = SIMD2(Double(center.x), Double(center.y))
        let r0 = s.focusSize * visible * 0.5
        let soft = max(2, s.focusSoftness * visible)
        let a = s.radialAmount

        var mask = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: f.x, y: f.y),
            "inputRadius0": r0,
            "inputRadius1": r0 + soft,
            "inputColor0": CIColor.black,
            "inputColor1": CIColor(red: a, green: a, blue: a),
        ])!.outputImage!

        let g = proj.depthGradient
        let gl = simd_length(g)
        if s.depthBlur > 0.01 && gl > 0.01 {
            let dir = g / gl
            let start = r0 * 0.5
            let length = visible * 0.12 / (s.depthBlur * gl)
            for sign in [1.0, -1.0] {
                let p0 = f + dir * start * sign
                let p1 = f + dir * (start + length) * sign
                let band = CIFilter(name: "CISmoothLinearGradient", parameters: [
                    "inputPoint0": CIVector(x: p0.x, y: p0.y),
                    "inputPoint1": CIVector(x: p1.x, y: p1.y),
                    "inputColor0": CIColor.black,
                    "inputColor1": CIColor.white,
                ])!.outputImage!
                mask = band.applyingFilter("CIMaximumCompositing", parameters: [kCIInputBackgroundImageKey: mask])
            }
        }
        return mask.cropped(to: source)
    }
}
