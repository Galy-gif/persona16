import Foundation
import Testing
@testable import Persona16

@Suite("Incremental Turn v1 NDJSON decoding")
struct NDJSONStreamDecoderTests {
  @Test("UTF-8 may cross chunks and the final line may omit a newline")
  func fragmentedUTF8AndTail() throws {
    let turnId = "00000000-0000-4000-8000-000000000501"
    let source = "\n{\"v\":1,\"turnId\":\"\(turnId)\",\"type\":\"turn_start\"}\n"
      + "{\"v\":1,\"turnId\":\"\(turnId)\",\"type\":\"delta\",\"agent\":\"INTJ\",\"delta\":\"跨块中文\"}"
    var decoder = NDJSONStreamDecoder(expectedTurnId: turnId)
    var events: [TurnEvent] = []

    for byte in Data(source.utf8) {
      events.append(contentsOf: try decoder.append(Data([byte])))
    }
    events.append(contentsOf: try decoder.finish())

    #expect(events.map(\.type) == ["turn_start", "delta"])
    guard case .delta(_, let value) = events.last else {
      Issue.record("Expected a decoded delta")
      return
    }
    #expect(value.delta == "跨块中文")
  }

  @Test("Unknown v1 events are tolerated after their envelope is verified")
  func unknownEvent() throws {
    let turnId = "00000000-0000-4000-8000-000000000502"
    let line = "{\"v\":1,\"turnId\":\"\(turnId)\",\"type\":\"future_hint\",\"value\":1}\n"
    var decoder = NDJSONStreamDecoder(expectedTurnId: turnId)
    let event = try #require(decoder.append(Data(line.utf8)).first)

    #expect(event.type == "future_hint")
    guard case .unknown = event else {
      Issue.record("Expected an unknown forward-compatible event")
      return
    }
  }

  @Test("A mismatched turn identifier and a damaged known event fail closed")
  func strictKnownEvents() throws {
    let expected = "00000000-0000-4000-8000-000000000503"
    let other = "00000000-0000-4000-8000-000000000504"
    var mismatched = NDJSONStreamDecoder(expectedTurnId: expected)
    let wrongTurn = "{\"v\":1,\"turnId\":\"\(other)\",\"type\":\"turn_start\"}\n"
    #expect(throws: TurnProtocolError.mismatchedTurnId(expected: expected, actual: other)) {
      try mismatched.append(Data(wrongTurn.utf8))
    }

    var malformed = NDJSONStreamDecoder(expectedTurnId: expected)
    let damagedDelta = "{\"v\":1,\"turnId\":\"\(expected)\",\"type\":\"delta\",\"agent\":\"INTJ\"}\n"
    #expect(throws: TurnProtocolError.malformedKnownEvent("delta")) {
      try malformed.append(Data(damagedDelta.utf8))
    }
  }

  @Test("Shared fixtures expose only done or error as a trusted terminal")
  func sharedFixtureTerminals() throws {
    let expectations: [(String, String?)] = [
      ("normal-single.ndjson", "done"),
      ("normal-room.ndjson", "done"),
      ("safety.ndjson", "done"),
      ("known-failure.ndjson", "error"),
      ("unknown-result.ndjson", nil),
      ("unknown-error.ndjson", nil),
    ]

    for (name, terminalType) in expectations {
      let data = try NetworkFixtureData.load(name)
      let firstLine = try #require(String(data: data, encoding: .utf8)?.split(separator: "\n").first)
      let envelope = try #require(
        JSONSerialization.jsonObject(with: Data(firstLine.utf8)) as? [String: Any]
      )
      let turnId = try #require(envelope["turnId"] as? String)
      var decoder = NDJSONStreamDecoder(expectedTurnId: turnId)
      let events = try decoder.append(data) + decoder.finish()

      #expect(events.first?.type == "turn_start")
      switch (terminalType, decoder.trustedTerminal) {
      case ("done", .done): break
      case ("error", .error): break
      case (nil, nil): break
      default: Issue.record("Unexpected terminal for \(name)")
      }
    }
  }

  @Test("An unknown-outcome error ends framing without becoming a trusted result")
  func unknownOutcomeError() throws {
    let data = try NetworkFixtureData.load("unknown-error.ndjson")
    let turnId = "00000000-0000-4000-8000-000000000106"
    var decoder = NDJSONStreamDecoder(expectedTurnId: turnId)
    let events = try decoder.append(data) + decoder.finish()

    guard case .error(_, let failure) = events.last else {
      Issue.record("Expected a decoded error event")
      return
    }
    #expect(failure.code == "TURN_RESULT_UNKNOWN")
    #expect(failure.outcome == .unknown)
    #expect(failure.recoveryAction == .refresh)
    #expect(decoder.trustedTerminal == nil)

    let extra = "{\"v\":1,\"turnId\":\"(turnId)\",\"type\":\"turn_start\"}\n"
    #expect(throws: TurnProtocolError.eventAfterTerminal(turnId)) {
      try decoder.append(Data(extra.utf8))
    }
  }
}

enum NetworkFixtureData {
  static func load(_ name: String) throws -> Data {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    return try Data(contentsOf: root.appending(path: "contracts/turn-v1/\(name)"))
  }
}
