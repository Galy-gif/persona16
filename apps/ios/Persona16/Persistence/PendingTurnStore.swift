import Foundation

struct PendingTurnRequest: Codable, Equatable, Sendable {
  let roomId: String
  let turnId: String
  let roomVersion: Int
  let text: String
  let calledAgent: AgentType?

  init(
    roomId: String,
    turnId: String,
    roomVersion: Int,
    text: String,
    calledAgent: AgentType?
  ) {
    self.roomId = roomId
    self.turnId = turnId
    self.roomVersion = roomVersion
    self.text = text
    self.calledAgent = calledAgent
  }

  init(_ request: TurnRequest) {
    self.init(
      roomId: request.roomId,
      turnId: request.turnId,
      roomVersion: request.roomVersion,
      text: request.command.text,
      calledAgent: request.command.calledAgent
    )
  }

  var turnRequest: TurnRequest {
    TurnRequest(
      roomId: roomId,
      turnId: turnId,
      roomVersion: roomVersion,
      command: .init(text: text, calledAgent: calledAgent)
    )
  }
}

protocol PendingTurnStoring: Sendable {
  func load() async throws -> PendingTurnRequest?
  func save(_ request: PendingTurnRequest) async throws
  func remove() async throws
}

actor PendingTurnStore: PendingTurnStoring {
  private let fileURL: URL
  private let fileManager: FileManager

  init(fileURL: URL? = nil, fileManager: FileManager = .default) throws {
    self.fileManager = fileManager
    self.fileURL = try fileURL ?? Self.defaultFileURL(fileManager: fileManager)
  }

  func load() throws -> PendingTurnRequest? {
    guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
    return try JSONDecoder().decode(PendingTurnRequest.self, from: Data(contentsOf: fileURL))
  }

  func save(_ request: PendingTurnRequest) throws {
    try prepareDirectory()
    let data = try JSONEncoder().encode(request)
    try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    try fileManager.setAttributes(
      [.protectionKey: FileProtectionType.complete],
      ofItemAtPath: fileURL.path
    )
  }

  func remove() throws {
    guard fileManager.fileExists(atPath: fileURL.path) else { return }
    try fileManager.removeItem(at: fileURL)
  }

  private func prepareDirectory() throws {
    let directory = fileURL.deletingLastPathComponent()
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  private static func defaultFileURL(fileManager: FileManager) throws -> URL {
    let support = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return support
      .appending(path: "Persona16", directoryHint: .isDirectory)
      .appending(path: "pending-turn.json", directoryHint: .notDirectory)
  }
}
