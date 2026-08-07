import Foundation
import Observation

protocol Persona16Serving: RoomSessionServing {
  func createRoom(agents: [AgentType], roomGoal: RoomGoal?) async throws -> ServerRoom
}

extension Persona16API: Persona16Serving {}

@MainActor
@Observable
final class AppEnvironment {
  @ObservationIgnored let api: any Persona16Serving
  @ObservationIgnored let pendingStore: any PendingTurnStoring
  @ObservationIgnored let archiveStore: any RoomArchiveStoring
  @ObservationIgnored private let initialMemoryCandidates: [MemoryCandidate]

  convenience init(configuration: AppConfiguration) throws {
    try self.init(
      api: Persona16API(baseURL: configuration.apiBaseURL),
      pendingStore: PendingTurnStore(),
      archiveStore: RoomArchiveStore(),
      initialMemoryCandidates: []
    )
  }

  init(
    api: any Persona16Serving,
    pendingStore: any PendingTurnStoring,
    archiveStore: any RoomArchiveStoring,
    initialMemoryCandidates: [MemoryCandidate] = []
  ) {
    self.api = api
    self.pendingStore = pendingStore
    self.archiveStore = archiveStore
    self.initialMemoryCandidates = initialMemoryCandidates
  }

  func makeRoomSession(room: ServerRoom? = nil) -> RoomSession {
    var state = RoomSessionState()
    if let room {
      state.installRoom(room)
      state.phase = .ready
    }
    state.memoryCandidates = initialMemoryCandidates
    return RoomSession(
      api: api,
      pendingStore: pendingStore,
      archiveStore: archiveStore,
      state: state
    )
  }
}

#if DEBUG
extension AppEnvironment {
  static func preview() -> AppEnvironment {
    AppEnvironment(
      api: PreviewPersona16Service(room: previewRoom),
      pendingStore: PreviewPendingTurnStore(),
      archiveStore: PreviewRoomArchiveStore(),
      initialMemoryCandidates: [previewMemoryCandidate]
    )
  }

  static var previewRoom: ServerRoom {
    ServerRoom(
      id: "preview-room",
      state: RoomState(
        agents: [
          RoomAgentState(
            type: .intj,
            paused: false,
            turnsSinceSpoke: 0,
            turnsInRoom: 1,
            recentOpenings: [],
            relationship: RelationshipMemory(
              intimacy: 0,
              userPrefers: [],
              repeatedPatterns: [],
              knownBoundaries: []
            )
          ),
          RoomAgentState(
            type: .enfp,
            paused: false,
            turnsSinceSpoke: 0,
            turnsInRoom: 1,
            recentOpenings: [],
            relationship: RelationshipMemory(
              intimacy: 0,
              userPrefers: [],
              repeatedPatterns: [],
              knownBoundaries: []
            )
          ),
        ],
        history: [],
        roomGoal: nil,
        conflictTopic: nil,
        conflictRounds: 0,
        calledAgent: nil,
        pendingUserRequest: nil
      ),
      version: 1,
      busy: false
    )
  }

  static var previewMemoryCandidate: MemoryCandidate {
    MemoryCandidate(
      id: "preview-memory-candidate",
      agent: .intj,
      kind: .preference,
      content: "回复时先给结论，再补充必要依据。"
    )
  }
}

private actor PreviewPersona16Service: Persona16Serving {
  private let room: ServerRoom

  init(room: ServerRoom) {
    self.room = room
  }

  func createRoom(agents: [AgentType], roomGoal: RoomGoal?) -> ServerRoom {
    room
  }

  func fetchRoom(id: String) -> ServerRoom {
    room
  }

  func updateRoom(id: String, version: Int, command: RoomCommand) -> ServerRoom {
    room
  }

  func resolveMemory(id: String, action: MemoryAction) -> SavedMemory {
    SavedMemory(
      id: id,
      userId: nil,
      agent: .intj,
      kind: .preference,
      content: "回复时先给结论，再补充必要依据。",
      status: action == .confirm ? .confirmed : .rejected,
      sourceTurnId: nil,
      sourceMessageId: nil,
      version: 1,
      createdAt: nil,
      updatedAt: nil
    )
  }

  func saveFeedback(_ input: FeedbackUpsertRequest) -> MessageFeedback {
    MessageFeedback(
      id: "preview-feedback",
      userId: nil,
      roomId: input.roomId,
      turnId: nil,
      messageId: input.messageId,
      rating: input.rating,
      tags: input.tags,
      note: input.note,
      createdAt: nil,
      updatedAt: nil
    )
  }

  func streamTurn(
    _ turn: TurnRequest,
    onEvent: @escaping @Sendable (TurnEvent) async throws -> Void
  ) async throws -> TurnStreamResult {
    throw APIError.turnResultUnknown(turnId: turn.turnId)
  }
}

private actor PreviewPendingTurnStore: PendingTurnStoring {
  private var pending: PendingTurnRequest?

  func load() -> PendingTurnRequest? { pending }
  func save(_ request: PendingTurnRequest) { pending = request }
  func remove() { pending = nil }
}

private actor PreviewRoomArchiveStore: RoomArchiveStoring {
  private var archives: [RoomArchive] = []

  func loadAll() -> [RoomArchive] { archives }

  func upsert(_ archive: RoomArchive) {
    archives.removeAll { $0.roomId == archive.roomId }
    archives.append(archive)
  }

  func remove(roomId: String) {
    archives.removeAll { $0.roomId == roomId }
  }
}
#endif
