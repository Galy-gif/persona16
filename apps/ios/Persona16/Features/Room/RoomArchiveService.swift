import Foundation

struct RoomArchiveService: Sendable {
  private let store: any RoomArchiveStoring
  private let now: @Sendable () -> Date

  init(
    store: any RoomArchiveStoring,
    now: @escaping @Sendable () -> Date
  ) {
    self.store = store
    self.now = now
  }

  func remove(roomId: String) async throws {
    try await store.remove(roomId: roomId)
  }

  func archive(_ room: ServerRoom) async {
    try? await store.upsert(
      RoomArchive(
        roomId: room.id,
        agents: room.state.agents.map(\.type),
        version: room.version,
        updatedAt: now()
      )
    )
  }
}
