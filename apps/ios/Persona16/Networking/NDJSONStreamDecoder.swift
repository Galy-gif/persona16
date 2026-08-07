import Foundation

struct NDJSONStreamDecoder: Sendable {
  let expectedTurnId: String

  private(set) var trustedTerminal: TurnTerminal?
  private var buffer = Data()
  private var receivedStreamTerminal = false

  init(expectedTurnId: String) {
    self.expectedTurnId = expectedTurnId
  }

  mutating func append(_ data: Data) throws -> [TurnEvent] {
    buffer.append(data)
    var events: [TurnEvent] = []
    while let newline = buffer.firstIndex(of: 0x0A) {
      var line = Data(buffer[..<newline])
      buffer.removeSubrange(...newline)
      if line.last == 0x0D { line.removeLast() }
      if let event = try decodeLine(line) {
        events.append(event)
      }
    }
    return events
  }

  mutating func finish() throws -> [TurnEvent] {
    guard !buffer.isEmpty else { return [] }
    var line = buffer
    buffer.removeAll(keepingCapacity: false)
    if line.last == 0x0D { line.removeLast() }
    guard let event = try decodeLine(line) else { return [] }
    return [event]
  }

  private mutating func decodeLine(_ line: Data) throws -> TurnEvent? {
    guard !line.isEmpty else { return nil }
    guard String(data: line, encoding: .utf8) != nil else {
      throw TurnProtocolError.invalidUTF8
    }
    if receivedStreamTerminal {
      throw TurnProtocolError.eventAfterTerminal(expectedTurnId)
    }
    let event = try TurnEventCodec.decode(line, expectedTurnId: expectedTurnId)
    receivedStreamTerminal = event.isStreamTerminal
    if let terminal = event.trustedTerminal {
      trustedTerminal = terminal
    }
    return event
  }
}
