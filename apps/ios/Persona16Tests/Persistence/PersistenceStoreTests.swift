import Foundation
import Testing
@testable import Persona16

@Suite("Room persistence stores", .serialized)
struct PersistenceStoreTests {
  @Test("Pending Turn round-trips every replay field and is removable")
  func pendingTurnRoundTrip() async throws {
    let directory = FileManager.default.temporaryDirectory
      .appending(path: UUID().uuidString, directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appending(path: "pending.json")
    let store = try PendingTurnStore(fileURL: file)
    let pending = PendingTurnRequest(
      roomId: "room-opaque",
      turnId: "turn-opaque",
      roomVersion: 7,
      text: "原样保留的正文\n第二行",
      calledAgent: .enfp
    )

    try await store.save(pending)
    #expect(try await store.load() == pending)

    #if !targetEnvironment(simulator)
      let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
      #expect(attributes[.protectionKey] as? FileProtectionType == .complete)
    #endif

    try await store.remove()
    #expect(try await store.load() == nil)
  }

  @Test("Room archive contains metadata only and deletion is local")
  func archiveMetadataOnly() async throws {
    let directory = FileManager.default.temporaryDirectory
      .appending(path: UUID().uuidString, directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appending(path: "rooms.json")
    let store = try RoomArchiveStore(fileURL: file)
    let archive = RoomArchive(
      roomId: "room-1",
      agents: [.intj, .enfp],
      version: 4,
      updatedAt: Date(timeIntervalSince1970: 1_000)
    )

    try await store.upsert(archive)
    #expect(try await store.loadAll() == [archive])

    let root = try #require(
      JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [[String: Any]]
    )
    #expect(Set(root[0].keys) == ["roomId", "agents", "version", "updatedAt"])

    try await store.remove(roomId: archive.roomId)
    #expect(try await store.loadAll().isEmpty)
  }
}
