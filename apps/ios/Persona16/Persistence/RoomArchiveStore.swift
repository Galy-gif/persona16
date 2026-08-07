import Foundation

struct RoomArchive: Codable, Equatable, Identifiable, Sendable {
  let roomId: String
  let agents: [AgentType]
  let version: Int
  let updatedAt: Date

  var id: String { roomId }
}

protocol RoomArchiveStoring: Sendable {
  func loadAll() async throws -> [RoomArchive]
  func upsert(_ archive: RoomArchive) async throws
  func remove(roomId: String) async throws
}

actor RoomArchiveStore: RoomArchiveStoring {
  private let fileURL: URL
  private let fileManager: FileManager

  init(fileURL: URL? = nil, fileManager: FileManager = .default) throws {
    self.fileManager = fileManager
    self.fileURL = try fileURL ?? Self.defaultFileURL(fileManager: fileManager)
  }

  func loadAll() throws -> [RoomArchive] {
    guard fileManager.fileExists(atPath: fileURL.path) else { return [] }
    return try JSONDecoder().decode([RoomArchive].self, from: Data(contentsOf: fileURL))
      .sorted { $0.updatedAt > $1.updatedAt }
  }

  func upsert(_ archive: RoomArchive) throws {
    var archives = try loadAll().filter { $0.roomId != archive.roomId }
    archives.append(archive)
    try write(archives.sorted { $0.updatedAt > $1.updatedAt })
  }

  func remove(roomId: String) throws {
    let archives = try loadAll().filter { $0.roomId != roomId }
    if archives.isEmpty {
      guard fileManager.fileExists(atPath: fileURL.path) else { return }
      try fileManager.removeItem(at: fileURL)
    } else {
      try write(archives)
    }
  }

  private func write(_ archives: [RoomArchive]) throws {
    try fileManager.createDirectory(
      at: fileURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try JSONEncoder().encode(archives).write(to: fileURL, options: .atomic)
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
      .appending(path: "room-archive.json", directoryHint: .notDirectory)
  }
}
