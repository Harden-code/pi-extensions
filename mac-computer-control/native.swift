import Foundation
import AppKit
import CoreGraphics
import Vision
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8)); exit(1)
}
func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { fail("JSON serialization failed") }
    print(String(data: data, encoding: .utf8)!)
}
let args = CommandLine.arguments
let cmd = args.count > 1 ? args[1] : "status"
let display = CGMainDisplayID()
let bounds = CGDisplayBounds(display)
func front() -> NSRunningApplication? { NSWorkspace.shared.frontmostApplication }
func geometry() -> [String: Any] {
    ["displayId": display, "widthPoints": bounds.width, "heightPoints": bounds.height,
     "originX": bounds.origin.x, "originY": bounds.origin.y]
}
if cmd == "status" {
    emit(["screenRecording": CGPreflightScreenCaptureAccess(), "accessibility": AXIsProcessTrusted(),
          "screen": geometry(), "frontApp": front()?.localizedName ?? "unknown"])
    exit(0)
}
guard CGPreflightScreenCaptureAccess() else { fail("缺少屏幕录制权限；请在系统设置中为运行 Pi 的终端及必要时本 helper 授权，重启后重试。") }
if cmd == "capture" {
    guard args.count == 3 else { fail("capture requires an output PNG path") }
    let output = URL(fileURLWithPath: args[2])
    let original = output.deletingLastPathComponent().appendingPathComponent("original.png")
    let app = front()
    let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    p.arguments = ["-x", "-D", "1", "-t", "png", original.path]
    p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
    do { try p.run(); p.waitUntilExit() } catch { fail("screencapture launch failed") }
    guard p.terminationStatus == 0,
          let source = CGImageSourceCreateWithURL(original as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("截图失败：请检查屏幕录制权限及桌面会话。") }
    let scale = min(1.0, 1280.0 / Double(image.width))
    let width = Int(Double(image.width) * scale), height = Int(Double(image.height) * scale)
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                  bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("Image context failed") }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let resized = context.makeImage(),
          let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("PNG creation failed") }
    CGImageDestinationAddImage(dest, resized, nil)
    guard CGImageDestinationFinalize(dest) else { fail("PNG write failed") }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    var ocr: [[String: Any]] = []
    var ocrError = false
    do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        for item in (request.results ?? []).prefix(200) {
            guard let candidate = item.topCandidates(1).first else { continue }
            let r = item.boundingBox
            ocr.append(["text": String(candidate.string.prefix(300)), "confidence": candidate.confidence,
                        "x": r.midX, "y": 1 - r.midY, "width": r.width, "height": r.height])
        }
    } catch { ocrError = true }
    emit(["screen": geometry(), "imageWidth": width, "imageHeight": height,
          "frontPid": app?.processIdentifier ?? 0, "frontApp": app?.localizedName ?? "unknown",
          "ocr": ocr, "ocrFailed": ocrError])
    exit(0)
}
guard cmd == "action", args.count == 2 else { fail("Unknown command") }
guard AXIsProcessTrusted() else { fail("缺少辅助功能权限；请手动授权运行 Pi 的终端及必要时本 helper。") }
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let data = try? JSONSerialization.jsonObject(with: input) as? [String: Any],
      let action = data["action"] as? String,
      let pidValue = data["frontPid"] as? Int, let pid = Int32(exactly: pidValue),
      let displayId = data["displayId"] as? UInt32,
      displayId == display,
      let w = data["widthPoints"] as? Double, w == bounds.width,
      let h = data["heightPoints"] as? Double, h == bounds.height,
      let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { fail("截图对应的应用／显示器已改变，请重新截图。") }
let keys: [String: CGKeyCode] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,
 "b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"1":18,"2":19,"3":20,"4":21,"6":22,"5":23,
 "9":25,"7":26,"8":28,"0":29,"o":31,"u":32,"i":34,"p":35,"l":37,"j":38,"k":40,"n":45,"m":46,
 "return":36,"tab":48,"space":49,"backspace":51,"escape":53,"left":123,"right":124,"down":125,"up":126]
var events: [CGEvent] = []
let source = CGEventSource(stateID: .hidSystemState)
func addMouse(_ type: CGEventType, _ point: CGPoint, _ button: CGMouseButton) {
    guard let e = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: button) else { fail("Mouse event failed") }
    events.append(e)
}
if action == "click" || action == "move" || action == "scroll" {
    guard let x = data["x"] as? Double, let y = data["y"] as? Double,
          x.isFinite, y.isFinite, x >= 0, x < 1, y >= 0, y < 1 else { fail("坐标必须在 [0,1) 内。") }
    let point = CGPoint(x: bounds.origin.x + x * bounds.width, y: bounds.origin.y + y * bounds.height)
    addMouse(.mouseMoved, point, .left)
    if action == "click" {
        let right = data["button"] as? String == "right"
        let count = data["clicks"] as? Int ?? 1
        guard count == 1 || count == 2 else { fail("clicks must be 1 or 2") }
        for index in 1...count {
            addMouse(right ? .rightMouseDown : .leftMouseDown, point, right ? .right : .left)
            events.last!.setIntegerValueField(.mouseEventClickState, value: Int64(index))
            addMouse(right ? .rightMouseUp : .leftMouseUp, point, right ? .right : .left)
            events.last!.setIntegerValueField(.mouseEventClickState, value: Int64(index))
        }
    } else if action == "scroll" {
        guard let delta = data["delta"] as? Int, delta >= -600, delta <= 600 else { fail("scroll delta must be -600...600") }
        guard let e = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: Int32(delta), wheel2: 0, wheel3: 0) else { fail("Scroll event failed") }
        events.append(e)
    }
} else if action == "type" {
    guard let text = data["text"] as? String, !text.isEmpty, text.utf16.count <= 2000,
          !text.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { fail("type supports <=2000 UTF-16 units, no control characters; use separate key actions.") }
    // Unicode events avoid clipboard modification and keyboard-layout dependence.
    var chunks: [[UInt16]] = []; var chunk: [UInt16] = []
    for char in text { let units = Array(String(char).utf16); if chunk.count + units.count > 20 { chunks.append(chunk); chunk = [] }; chunk += units }
    if !chunk.isEmpty { chunks.append(chunk) }
    for units in chunks {
        for down in [true, false] {
            guard let e = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down) else { fail("Keyboard event failed") }
            units.withUnsafeBufferPointer { e.keyboardSetUnicodeString(stringLength: units.count, unicodeString: $0.baseAddress) }
            events.append(e)
        }
    }
} else if action == "key" {
    guard let key = data["key"] as? String, let code = keys[key],
          let mods = data["modifiers"] as? [String], mods.count <= 4 else { fail("Unsupported key/modifiers") }
    var flags = CGEventFlags()
    for mod in mods {
        switch mod { case "cmd": flags.insert(.maskCommand); case "shift": flags.insert(.maskShift)
        case "alt": flags.insert(.maskAlternate); case "ctrl": flags.insert(.maskControl); default: fail("Unknown modifier") }
    }
    for down in [true, false] {
        guard let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { fail("Keyboard event failed") }
        e.flags = flags; events.append(e)
    }
} else { fail("Unsupported action") }
// Confirmation takes place in Pi's terminal. Explicitly restore the photographed app.
app.activate(options: [])
Thread.sleep(forTimeInterval: 0.7)
guard front()?.processIdentifier == pid else { fail("无法恢复截图时的前台应用；没有发送输入，请重新截图。") }
for event in events { event.post(tap: .cghidEventTap); Thread.sleep(forTimeInterval: 0.02) }
emit(["posted": true, "action": action, "frontApp": app.localizedName ?? "unknown",
      "note": "事件已发送；这不证明操作成功，必须重新截图验证。"])
