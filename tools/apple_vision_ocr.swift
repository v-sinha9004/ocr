import Foundation
import Vision
import AppKit

struct RecognizedLine: Codable {
    let text: String
    let confidence: Float
    let bbox: [String: Double]
}

struct OCRResponse: Codable {
    let text: String
    let lines: [RecognizedLine]
    let latency_ms: Double
    let error: String?
}

func printJSON(_ response: OCRResponse) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted]
    if let data = try? encoder.encode(response), let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"error\": \"Failed to encode JSON\"}")
    }
}

guard CommandLine.arguments.count > 1 else {
    printJSON(OCRResponse(text: "", lines: [], latency_ms: 0, error: "Usage: apple_vision_ocr <image_path>"))
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: imagePath)

guard let nsImage = NSImage(contentsOf: fileURL),
      let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    printJSON(OCRResponse(text: "", lines: [], latency_ms: 0, error: "Could not load image at path: \(imagePath)"))
    exit(1)
}

let startTime = DispatchTime.now()

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
    let endTime = DispatchTime.now()
    let nanoTime = endTime.uptimeNanoseconds - startTime.uptimeNanoseconds
    let latencyMs = Double(nanoTime) / 1_000_000.0

    guard let observations = request.results else {
        printJSON(OCRResponse(text: "", lines: [], latency_ms: latencyMs, error: nil))
        exit(0)
    }

    var lines: [RecognizedLine] = []
    var fullText: [String] = []

    for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else { continue }
        let box = observation.boundingBox
        let bboxDict: [String: Double] = [
            "x": Double(box.origin.x),
            "y": Double(box.origin.y),
            "width": Double(box.size.width),
            "height": Double(box.size.height)
        ]
        lines.append(RecognizedLine(
            text: topCandidate.string,
            confidence: topCandidate.confidence,
            bbox: bboxDict
        ))
        fullText.append(topCandidate.string)
    }

    let resultText = fullText.joined(separator: "\n")
    printJSON(OCRResponse(text: resultText, lines: lines, latency_ms: latencyMs, error: nil))
} catch {
    let endTime = DispatchTime.now()
    let latencyMs = Double(endTime.uptimeNanoseconds - startTime.uptimeNanoseconds) / 1_000_000.0
    printJSON(OCRResponse(text: "", lines: [], latency_ms: latencyMs, error: error.localizedDescription))
    exit(1)
}
