import Foundation
import Observation

@MainActor
@Observable
final class RoomSession {
  private(set) var state: RoomSessionState
  private(set) var memberCommandInFlight = false
  private var turnReservationInFlight = false

  var canSubmitNewTurn: Bool {
    state.canSubmitNewTurn && !mutationInFlight
  }

  var canManageMembers: Bool {
    memberCommands.canApply(to: state, mutationInFlight: mutationInFlight)
  }

  private var mutationInFlight: Bool {
    turnReservationInFlight || memberCommandInFlight
  }

  @ObservationIgnored private let api: any RoomSessionServing
  @ObservationIgnored private let pendingStore: any PendingTurnStoring
  @ObservationIgnored private let ancillaryCommands: RoomAncillaryCommandService
  @ObservationIgnored private let memberCommands: RoomMemberCommandService
  @ObservationIgnored private let archives: RoomArchiveService
  @ObservationIgnored private var activeTask: Task<Void, Never>?

  init(
    api: any RoomSessionServing,
    pendingStore: any PendingTurnStoring,
    archiveStore: any RoomArchiveStoring,
    state: RoomSessionState = RoomSessionState(),
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.api = api
    self.pendingStore = pendingStore
    self.ancillaryCommands = RoomAncillaryCommandService(api: api)
    self.memberCommands = RoomMemberCommandService(api: api)
    self.archives = RoomArchiveService(store: archiveStore, now: now)
    self.state = state
  }

  func restore(roomId: String) async {
    state.phase = .loading
    do {
      let pending = try await pendingStore.load()
      state.pendingTurn = pending
      if let pending {
        state.activeTurnId = pending.turnId
      }
      let room = try await api.fetchRoom(id: pending?.roomId ?? roomId)
      state.installRoom(room)
      if pending != nil {
        state.phase = .resultUnknown
      } else {
        state.phase = .ready
      }
      await archive(room)
    } catch {
      if state.pendingTurn != nil {
        state.phase = .resultUnknown
        return
      }
      state.knownFailure = RoomSessionFailure.local(
        code: "RESTORE_FAILED",
        message: "无法恢复房间。"
      )
      state.phase = .failedKnown
    }
  }

  func submit(
    text: String,
    calledAgent: AgentType? = nil,
    turnId: String = UUID().uuidString.lowercased()
  ) async throws {
    guard !text.isEmpty else { throw RoomSessionCommandError.emptyMessage }
    guard !mutationInFlight else { throw RoomSessionCommandError.roomMutationInFlight }
    guard state.pendingTurn == nil else { throw RoomSessionCommandError.turnAlreadyActive }
    guard state.phase == .ready, let room = state.room else {
      throw RoomSessionCommandError.roomNotReady
    }

    let pending = PendingTurnRequest(
      roomId: room.id,
      turnId: turnId,
      roomVersion: room.version,
      text: text,
      calledAgent: calledAgent
    )
    turnReservationInFlight = true
    do {
      try await pendingStore.save(pending)
    } catch {
      turnReservationInFlight = false
      throw error
    }
    state.pendingTurn = pending
    state.activeTurnId = pending.turnId
    state.knownFailure = nil
    state.phase = .submitting
    turnReservationInFlight = false
    state.messages.append(
      PresentedRoomMessage(
        id: "local-user-\(pending.turnId)",
        serverId: nil,
        speaker: .user,
        text: text,
        speechType: nil,
        isProvisional: true
      )
    )
    await execute(pending)
  }

  func replayPendingTurn() async throws {
    guard state.phase == .resultUnknown, let pending = state.pendingTurn else {
      throw RoomSessionCommandError.noPendingTurn
    }
    state.activeTurnId = pending.turnId
    state.knownFailure = nil
    state.phase = .submitting
    await execute(pending)
  }

  func cancelCurrentTurn() {
    activeTask?.cancel()
  }

  func dismissKnownFailure() {
    guard state.phase == .failedKnown,
          state.pendingTurn == nil,
          state.room != nil else {
      return
    }
    state.knownFailure = nil
    state.phase = .ready
  }

  func deleteLocalArchive(roomId: String) async throws {
    try await archives.remove(roomId: roomId)
  }

  func saveLocalArchive() async {
    guard let room = state.room else { return }
    await archive(room)
  }

  func pauseMember(_ agent: AgentType) async throws -> RoomMemberCommandOutcome {
    try await applyMemberCommand(.pauseAgent(agent))
  }

  func resumeMember(_ agent: AgentType) async throws -> RoomMemberCommandOutcome {
    try await applyMemberCommand(.resumeAgent(agent))
  }

  func inviteMember(_ agent: AgentType) async throws -> RoomMemberCommandOutcome {
    guard Character.catalog.contains(where: { $0.type == agent }) else {
      throw RoomSessionCommandError.unavailableCanonicalCharacter
    }
    return try await applyMemberCommand(.inviteAgent(agent))
  }

  func removeMemberAfterConfirmation(
    _ agent: AgentType
  ) async throws -> RoomMemberCommandOutcome {
    try await applyMemberCommand(.removeAgent(agent, confirmed: true))
  }

  func resolveMemoryCandidate(
    _ candidate: MemoryCandidate,
    action: MemoryAction
  ) async throws {
    try await ancillaryCommands.resolveMemoryCandidate(
      candidate,
      action: action,
      availableCandidates: state.memoryCandidates
    )
    state.memoryCandidates.removeAll { $0.id == candidate.id }
  }

  func submitFeedback(_ request: FeedbackUpsertRequest) async throws {
    try await ancillaryCommands.submitFeedback(
      request,
      roomId: state.room?.id,
      messages: state.messages
    )
  }

  private func applyMemberCommand(
    _ command: RoomCommand
  ) async throws -> RoomMemberCommandOutcome {
    guard canManageMembers, let room = state.room else {
      throw RoomSessionCommandError.memberChangeUnavailable
    }

    memberCommandInFlight = true
    defer { memberCommandInFlight = false }

    let result = try await memberCommands.apply(command, to: room)
    state.installRoom(result.room)
    await archive(result.room)
    return result.outcome
  }

  private func execute(_ pending: PendingTurnRequest) async {
    let task = Task { [api] in
      do {
        let result = try await api.streamTurn(pending.turnRequest) { [weak self] event in
          guard let self else { throw CancellationError() }
          try await self.consume(event)
        }
        await self.ensureTerminal(result.terminal, turnId: pending.turnId)
      } catch {
        await self.handleStreamFailure(error, pending: pending)
      }
    }
    activeTask = task
    await task.value
    if activeTask == task { activeTask = nil }
  }

  private func consume(_ event: TurnEvent) async throws {
    if event.trustedTerminal != nil {
      try await pendingStore.remove()
      state.pendingTurn = nil
    }
    try RoomEventReducer.reduce(&state, event: event)
    if case .done = event, let room = state.room {
      await archive(room)
    }
  }

  private func ensureTerminal(_ terminal: TurnTerminal, turnId: String) async {
    guard state.activeTurnId != nil else { return }
    do {
      switch terminal {
      case .done(let done):
        try await consume(.done(turnId: turnId, value: done))
      case .error(let failure):
        try await consume(.error(turnId: turnId, failure: failure))
      }
    } catch {
      await handleKnownTerminalPersistenceFailure(terminal)
    }
  }

  private func handleStreamFailure(_ error: Error, pending: PendingTurnRequest) async {
    if let apiError = error as? APIError {
      switch apiError {
      case .eventConsumerFailed(_, let terminal):
        await handleKnownTerminalPersistenceFailure(terminal)
        return
      case .server(_, let failure) where failure.outcome == .knownFailed:
        await clearKnownFailure(failure)
        return
      case .turnResultUnknown,
           .protocolViolation,
           .transport,
           .invalidHTTPResponse,
           .responseDecoding,
           .requestEncoding,
           .server:
        break
      }
    }

    state.prepareForUnknownResult(pending)
    state.pendingTurn = pending
    state.activeTurnId = pending.turnId
    state.knownFailure = nil
    state.phase = .resultUnknown
  }

  private func handleKnownTerminalPersistenceFailure(_ terminal: TurnTerminal) async {
    try? await pendingStore.remove()
    state.pendingTurn = nil
    switch terminal {
    case .done(let done):
      if let room = state.room {
        state.installRoom(
          ServerRoom(id: room.id, state: done.room, version: done.roomVersion, busy: false)
        )
        state.phase = .ready
        await archive(state.room!)
      }
    case .error(let failure):
      state.knownFailure = failure
      state.activeTurnId = nil
      state.phase = .failedKnown
    }
  }

  private func clearKnownFailure(_ failure: ServerFailure) async {
    do {
      try await pendingStore.remove()
      state.pendingTurn = nil
      state.activeTurnId = nil
      state.knownFailure = failure
      state.phase = .failedKnown
    } catch {
      state.knownFailure = RoomSessionFailure.local(
        code: "PENDING_TURN_CLEANUP_FAILED",
        message: "请求已明确失败，但本地请求记录清理失败。"
      )
      state.phase = .failedKnown
    }
  }

  private func archive(_ room: ServerRoom) async {
    await archives.archive(room)
  }
}
