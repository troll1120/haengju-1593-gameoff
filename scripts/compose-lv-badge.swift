import AppKit
import Foundation

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let panels = [("lv1", "레벨 1 · 기본 테두리"), ("lv7", "레벨 7 · 기본 테두리"),
              ("lv20-awakened", "레벨 20 · 각성 테두리"), ("level-up-flash", "19 → 20 · 한 번 반짝임")]
let width = 390, panelHeight = 200, height = panels.count * panelHeight
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: width * 4, bitsPerPixel: 32)!
let context = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
context.translateBy(x: 0, y: CGFloat(height))
context.scaleBy(x: 1, y: -1)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
NSColor(calibratedWhite: 0.08, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()
for (index, panel) in panels.enumerated() {
    let image = NSImage(contentsOf: root.appendingPathComponent("\(panel.0).png"))!
    let y = index * panelHeight
    (panel.1 as NSString).draw(at: NSPoint(x: 12, y: y + 10), withAttributes: [
        .font: NSFont.systemFont(ofSize: 16, weight: .semibold), .foregroundColor: NSColor.white])
    // Original pixels from the battle's bottom dock; no scale or replacement UI.
    image.draw(in: NSRect(x: 0, y: y + 32, width: 390, height: 168),
        from: NSRect(x: 0, y: 0, width: 390, height: 168),
        operation: .sourceOver, fraction: 1, respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.none.rawValue])
}
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent("comparison-390.png"))
print("COMPARISON_DONE 390x800")
