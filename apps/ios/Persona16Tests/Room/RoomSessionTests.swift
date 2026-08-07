import Foundation
import Testing
@testable import Persona16

@Suite("Room session kernel", .serialized)
@MainActor
struct RoomSessionTests {
  @Test("Known error clears pending while unknown failure blocks new Turns")
  func knownAndUnknown() async throws {
    let knownFailure = ServerFailure(
      code: "TURN_FAILED",
      message: "明确失败",
      recoverable: true,
      recoveryAction: .retry,
      outcome: .knownFailed,
      retryAfterMs: nil
    )
    let knownAPI = MockRoomSessionAPI(
      room: RoomTestFixtures.room(),
      mode: .events(
        [.error(turnId: "known-turn", failure: knownFailure)],
        .error(knownFailure)
      )
    )
    let knownStore = MemoryPendingTurnStore()
    let knownSession = makeSession(api: knownAPI, pending: knownStore)
    await knownSession.restore(roomId: "room-1")
    try await knownSession.submit(text: "正文", turnId: "known-turn")

    #expect(knownSession.state.phase == .failedKnown)
    #expect(knownSession.state.pendingTurn == nil)
    #expect(await knownStore.current() == nil)
    knownSession.dismissKnownFailure()
    #expect(knownSession.state.phase == .ready)
    #expect(knownSession.state.canSubmitNewTurn)

    let unknownAPI = MockRoomSessionAPI(
      room: RoomTestFixtures.room(),
      mode: .eventsThenFailure(
        [
          .delta(
            turnId: "unknown-turn",
            value: TurnDelta(agent: .intj, delta: "不能保留的临时服务端正文")
          ),
          .speakerEnd(
            turnId: "unknown-turn",
            value: SpeakerEnd(
              messageId: "unconfirmed-message",
              agent: .intj,
              speechType: .short,
              text: "仍未收到可信终态"
            )
          ),
        ],
        .turnResultUnknown(turnId: "unknown-turn")
      )
    )
    let unknownStore = MemoryPendingTurnStore()
    let unknownSession = makeSession(api: unknownAPI, pending: unknownStore)
    await unknownSession.restore(roomId: "room-1")
    try await unknownSession.submit(text: "必须原样重放", calledAgent: .enfp, turnId: "unknown-turn")

    #expect(unknownSession.state.phase == .resultUnknown)
    #expect(await unknownStore.current()?.text == "必须原样重放")
    #expect(unknownSession.state.messages.map(\.text) == ["必须原样重放"])
    #expect(unknownSession.state.messages.first?.speaker == .user)
    await #expect(throws: RoomSessionCommandError.turnAlreadyActive) {
      try await unknownSession.submit(text: "禁止的新消息")
    }
  }

  @Test("A streamed unknown-outcome error preserves the exact pending request")
  func streamedUnknownError() async throws {
    let failure = ServerFailure(
      code: "TURN_RESULT_UNKNOWN",
      message: "无法确认本轮结果",
      recoverable: true,
      recoveryAction: .refresh,
      outcome: .unknown,
      retryAfterMs: nil
    )
    let api = MockRoomSessionAPI(
      room: RoomTestFixtures.room(),
      mode: .eventsThenFailure(
        [
          .delta(
            turnId: "unknown-error-turn",
            value: TurnDelta(agent: .intj, delta: "必须清除的未确认正文")
          ),
          .error(turnId: "unknown-error-turn", failure: failure),
        ],
        .turnResultUnknown(turnId: "unknown-error-turn")
      )
    )
    let store = MemoryPendingTurnStore()
    let session = makeSession(api: api, pending: store)
    await session.restore(roomId: "room-1")

    try await session.submit(
      text: "原始请求不能改变",
      calledAgent: .enfp,
      turnId: "unknown-error-turn"
    )

    let pending = try #require(await store.current())
    #expect(session.state.phase == .resultUnknown)
    #expect(session.state.pendingTurn == pending)
    #expect(session.state.activeTurnId == pending.turnId)
    #expect(session.state.knownFailure == nil)
    #expect(session.state.messages.map(\.text) == [pending.text])
    #expect(!session.canSubmitNewTurn)
    await #expect(throws: RoomSessionCommandError.turnAlreadyActive) {
      try await session.submit(text: "禁止的新请求")
    }

    try await session.replayPendingTurn()
    #expect(await api.requests() == [pending.turnRequest, pending.turnRequest])
    #expect(session.state.phase == .resultUnknown)
    #expect(await store.current() == pending)
  }

  @Test("Restart restores pending data and replay uses the exact original request")
  func restartAndReplay() async throws {
    let pending = PendingTurnRequest(
      roomId: "room-1",
      turnId: "replay-turn",
      roomVersion: 1,
      text: "原正文\n不能改变",
      calledAgent: .enfp
    )
    let store = MemoryPendingTurnStore(initial: pending)
    let done = RoomTestFixtures.done(version: 2)
    let api = MockRoomSessionAPI(
      room: RoomTestFixtures.room(version: 9),
      mode: .events([.done(turnId: pending.turnId, value: done)], .done(done))
    )
    let session = makeSession(api: api, pending: store)

    await session.restore(roomId: pending.roomId)
    #expect(session.state.phase == .resultUnknown)
    try await session.replayPendingTurn()

    #expect(await api.requests() == [pending.turnRequest])
    #expect(session.state.phase == .ready)
    #expect(session.state.room?.version == 2)
    #expect(await store.current() == nil)
  }

  @Test("Cancellation and timeout preserve the pending request as unknown")
  func cancellationAndTimeout() async throws {
    let cancellationAPI = MockRoomSessionAPI(
      room: RoomTestFixtures.room(),
      mode: .waitForCancellation
    )
    let cancellationStore = MemoryPendingTurnStore()
    let cancellationSession = makeSession(api: cancellationAPI, pending: cancellationStore)
    await cancellationSession.restore(roomId: "room-1")

    let submission = Task {
      try await cancellationSession.submit(text: "取消也要保留", turnId: "cancel-turn")
    }
    while await cancellationAPI.requests().isEmpty { await Task.yield() }
    cancellationSession.cancelCurrentTurn()
    try await submission.value

    #expect(cancellationSession.state.phase == .resultUnknown)
    #expect(await cancellationStore.current()?.turnId == "cancel-turn")

    let timeoutAPI = MockRoomSessionAPI(
      room: RoomTestFixtures.room(),
      mode: .failure(.transport(code: NSURLErrorTimedOut, description: "timeout"))
    )
    let timeoutStore = MemoryPendingTurnStore()
    let timeoutSession = makeSession(api: timeoutAPI, pending: timeoutStore)
    await timeoutSession.restore(roomId: "room-1")
    try await timeoutSession.submit(text: "超时也要保留", turnId: "timeout-turn")

    #expect(timeoutSession.state.phase == .resultUnknown)
    #expect(await timeoutStore.current()?.turnId == "timeout-turn")
  }

  @Test("A newly created room can be saved as a local recent entry")
  func createdRoomArchive() async {
    let room = RoomTestFixtures.room(version: 3, agents: [.intj])
    var state = RoomSessionState(phase: .ready)
    state.installRoom(room)
    let archive = MemoryRoomArchiveStore()
    let session = RoomSession(
      api: MockRoomSessionAPI(room: room, mode: .waitForCancellation),
      pendingStore: MemoryPendingTurnStore(),
      archiveStore: archive,
      state: state,
      now: { Date(timeIntervalSince1970: 1_000) }
    )

    await session.saveLocalArchive()

    #expect(await archive.current().map(\.roomId) == [room.id])
    #expect(await archive.current().first?.version == 3)
  }

  @Test("Member commands send the current room version and confirmed removal")
  func memberCommandsUseCurrentVersion() async throws {
    let cases: [(RoomCommand, ServerRoom)] = [
      (.pauseAgent(.intj), memberRoom(version: 5, members: [(.intj, true), (.enfp, false)])),
      (.resumeAgent(.intj), memberRoom(version: 5, members: [(.intj, false), (.enfp, false)])),
      (.inviteAgent(.enfp), memberRoom(version: 5, members: [(.intj, false), (.enfp, false)])),
      (.removeAgent(.enfp, confirmed: true), memberRoom(version: 5, members: [(.intj, false)])),
    ]

    for (command, updated) in cases {
      let initialMembers: [(AgentType, Bool)]
      switch command {
      case .resumeAgent:
        initialMembers = [(.intj, true), (.enfp, false)]
      case .inviteAgent:
        initialMembers = [(.intj, false)]
      case .pauseAgent, .removeAgent:
        initialMembers = [(.intj, false), (.enfp, false)]
      }
      let initial = memberRoom(version: 4, members: initialMembers)
      let api = MockRoomSessionAPI(
        room: updated,
        mode: .waitForCancellation,
        memberMode: .updated(updated)
      )
      let archive = MemoryRoomArchiveStore()
      let session = makeReadySession(room: initial, api: api, archive: archive)

      let outcome: RoomMemberCommandOutcome
      switch command {
      case .pauseAgent(let agent):
        outcome = try await session.pauseMember(agent)
      case .resumeAgent(let agent):
        outcome = try await session.resumeMember(agent)
      case .inviteAgent(let agent):
        outcome = try await session.inviteMember(agent)
      case .removeAgent(let agent, _):
        outcome = try await session.removeMemberAfterConfirmation(agent)
      }

      #expect(outcome == .updated)
      #expect(
        await api.memberUpdates() == [
          MemberUpdateCall(roomID: initial.id, version: 4, command: command),
        ]
      )
      #expect(session.state.room?.version == 5)
      #expect(await archive.current().first?.version == 5)
    }
  }

  @Test("Version conflict refreshes once and never repeats the member command")
  func memberVersionConflict() async throws {
    let stale = memberRoom(version: 2, members: [(.intj, false), (.enfp, false)])
    let authoritative = memberRoom(version: 8, members: [(.intj, false), (.enfp, true)])
    let api = MockRoomSessionAPI(
      room: authoritative,
      mode: .waitForCancellation,
      memberMode: .versionConflict
    )
    let archive = MemoryRoomArchiveStore()
    let session = makeReadySession(room: stale, api: api, archive: archive)

    let outcome = try await session.pauseMember(.intj)

    #expect(outcome == .refreshedAfterVersionConflict)
    #expect(await api.memberUpdates().count == 1)
    #expect(await api.fetches() == [stale.id])
    #expect(session.state.room == authoritative)
    #expect(await archive.current().first?.version == 8)
  }

  @Test("Busy rooms block member changes before PATCH")
  func busyRoomBlocksMemberChange() async {
    let base = memberRoom(version: 1, members: [(.intj, false), (.enfp, false)])
    let busy = ServerRoom(id: base.id, state: base.state, version: base.version, busy: true)
    let api = MockRoomSessionAPI(room: busy, mode: .waitForCancellation)
    let session = makeReadySession(
      room: busy,
      api: api,
      archive: MemoryRoomArchiveStore()
    )

    await #expect(throws: RoomSessionCommandError.memberChangeUnavailable) {
      try await session.pauseMember(.intj)
    }
    #expect(await api.memberUpdates().isEmpty)
  }

  @Test("A suspended member PATCH blocks Turn submission until its room is installed")
  func memberPatchBlocksTurnSubmission() async throws {
    let initial = memberRoom(version: 4, members: [(.intj, false), (.enfp, false)])
    let updated = memberRoom(version: 5, members: [(.intj, true), (.enfp, false)])
    let api = MockRoomSessionAPI(
      room: initial,
      mode: .waitForCancellation,
      memberMode: .suspended
    )
    let session = makeReadySession(
      room: initial,
      api: api,
      archive: MemoryRoomArchiveStore()
    )

    let patch = Task { try await session.pauseMember(.intj) }
    while !(await api.memberUpdateIsSuspended()) { await Task.yield() }

    #expect(session.memberCommandInFlight)
    #expect(!session.canSubmitNewTurn)
    await #expect(throws: RoomSessionCommandError.roomMutationInFlight) {
      try await session.submit(text: "不能与 PATCH 共用旧版本", turnId: "blocked-turn")
    }
    #expect(await api.requests().isEmpty)
    #expect(session.state.room?.version == 4)

    await api.resumeMemberUpdate(with: updated)
    #expect(try await patch.value == .updated)
    #expect(session.state.room == updated)
    #expect(session.canSubmitNewTurn)
    #expect(await api.requests().isEmpty)
  }

  @Test("Memory decisions send the action and only remove candidates after success")
  func memoryDecisionLifecycle() async throws {
    for action in [MemoryAction.confirm, .reject] {
      let candidate = MemoryCandidate(
        id: "memory-\(action.rawValue)",
        agent: .intj,
        kind: .preference,
        content: "先给结论"
      )
      let room = RoomTestFixtures.room()
      let api = MockRoomSessionAPI(room: room, mode: .waitForCancellation)
      var state = RoomSessionState(phase: .ready)
      state.installRoom(room)
      state.memoryCandidates = [candidate]
      let session = RoomSession(
        api: api,
        pendingStore: MemoryPendingTurnStore(),
        archiveStore: MemoryRoomArchiveStore(),
        state: state
      )

      try await session.resolveMemoryCandidate(candidate, action: action)

      #expect(
        await api.memoryDecisions() == [
          MemoryDecisionCall(id: candidate.id, action: action),
        ]
      )
      #expect(session.state.memoryCandidates.isEmpty)
    }

    let candidate = MemoryCandidate(
      id: "memory-failure",
      agent: .enfp,
      kind: .boundary,
      content: "不要公开私人经历"
    )
    let room = RoomTestFixtures.room()
    let failingAPI = MockRoomSessionAPI(
      room: room,
      mode: .waitForCancellation,
      memoryFailure: .transport(code: -1, description: "offline")
    )
    var failingState = RoomSessionState(phase: .ready)
    failingState.installRoom(room)
    failingState.memoryCandidates = [candidate]
    let failingSession = RoomSession(
      api: failingAPI,
      pendingStore: MemoryPendingTurnStore(),
      archiveStore: MemoryRoomArchiveStore(),
      state: failingState
    )

    await #expect(throws: APIError.transport(code: -1, description: "offline")) {
      try await failingSession.resolveMemoryCandidate(candidate, action: .confirm)
    }
    #expect(failingSession.state.memoryCandidates == [candidate])
  }

  @Test("Feedback sends the exact request without creating mirrored session state")
  func feedbackRequest() async throws {
    let message = TurnMessage(
      id: "agent-message",
      speaker: .agent(.intj),
      text: "服务端回复",
      speechType: .short
    )
    let room = RoomTestFixtures.room(history: [message])
    let api = MockRoomSessionAPI(room: room, mode: .waitForCancellation)
    let session = makeReadySession(
      room: room,
      api: api,
      archive: MemoryRoomArchiveStore()
    )
    let request = FeedbackUpsertRequest(
      roomId: room.id,
      messageId: "agent-message",
      rating: .negative,
      tags: [.notHelpful, .tooLong],
      note: "请更直接"
    )
    let stateBeforeSubmission = session.state

    try await session.submitFeedback(request)

    #expect(await api.feedbackRequests() == [request])
    #expect(session.state == stateBeforeSubmission)

    let invalid = FeedbackUpsertRequest(
      roomId: room.id,
      messageId: "local-only",
      rating: .positive,
      tags: [],
      note: nil
    )
    await #expect(throws: RoomSessionCommandError.feedbackUnavailable) {
      try await session.submitFeedback(invalid)
    }
    #expect(await api.feedbackRequests() == [request])
  }

  private func makeSession(
    api: MockRoomSessionAPI,
    pending: MemoryPendingTurnStore
  ) -> RoomSession {
    RoomSession(
      api: api,
      pendingStore: pending,
      archiveStore: MemoryRoomArchiveStore(),
      now: { Date(timeIntervalSince1970: 1_000) }
    )
  }

  private func makeReadySession(
    room: ServerRoom,
    api: MockRoomSessionAPI,
    archive: MemoryRoomArchiveStore
  ) -> RoomSession {
    var state = RoomSessionState(phase: .ready)
    state.installRoom(room)
    return RoomSession(
      api: api,
      pendingStore: MemoryPendingTurnStore(),
      archiveStore: archive,
      state: state,
      now: { Date(timeIntervalSince1970: 1_000) }
    )
  }

  private func memberRoom(
    version: Int,
    members: [(AgentType, Bool)]
  ) -> ServerRoom {
    ServerRoom(
      id: "room-members",
      state: RoomState(
        agents: members.map { agent, paused in
          RoomAgentState(
            type: agent,
            paused: paused,
            turnsSinceSpoke: 0,
            turnsInRoom: 1,
            recentOpenings: [],
            relationship: RelationshipMemory(
              intimacy: 0,
              userPrefers: [],
              repeatedPatterns: [],
              knownBoundaries: []
            )
          )
        },
        history: [],
        roomGoal: nil,
        conflictTopic: nil,
        conflictRounds: 0,
        calledAgent: nil,
        pendingUserRequest: nil
      ),
      version: version,
      busy: false
    )
  }
}

private struct MemberUpdateCall: Equatable, Sendable {
  let roomID: String
  let version: Int
  let command: RoomCommand
}

private struct MemoryDecisionCall: Equatable, Sendable {
  let id: String
  let action: MemoryAction
}

private actor MockRoomSessionAPI: RoomSessionServing {
  enum Mode: Sendable {
    case events([TurnEvent], TurnTerminal)
    case eventsThenFailure([TurnEvent], APIError)
    case failure(APIError)
    case waitForCancellation
  }

  enum MemberMode: Sendable {
    case updated(ServerRoom)
    case versionConflict
    case suspended
  }

  private let room: ServerRoom
  private let mode: Mode
  private let memberMode: MemberMode
  private let memoryFailure: APIError?
  private let feedbackFailure: APIError?
  private var received: [TurnRequest] = []
  private var receivedMemberUpdates: [MemberUpdateCall] = []
  private var fetchedRoomIDs: [String] = []
  private var receivedMemoryDecisions: [MemoryDecisionCall] = []
  private var receivedFeedback: [FeedbackUpsertRequest] = []
  private var memberUpdateContinuation: CheckedContinuation<ServerRoom, any Error>?

  init(
    room: ServerRoom,
    mode: Mode,
    memberMode: MemberMode? = nil,
    memoryFailure: APIError? = nil,
    feedbackFailure: APIError? = nil
  ) {
    self.room = room
    self.mode = mode
    self.memberMode = memberMode ?? .updated(room)
    self.memoryFailure = memoryFailure
    self.feedbackFailure = feedbackFailure
  }

  func fetchRoom(id: String) async throws -> ServerRoom {
    fetchedRoomIDs.append(id)
    return room
  }

  func updateRoom(id: String, version: Int, command: RoomCommand) async throws -> ServerRoom {
    receivedMemberUpdates.append(
      MemberUpdateCall(roomID: id, version: version, command: command)
    )
    switch memberMode {
    case .updated(let updated):
      return updated
    case .versionConflict:
      throw APIError.server(
        status: 409,
        failure: ServerFailure(
          code: "ROOM_VERSION_CONFLICT",
          message: "房间版本已更新",
          recoverable: true,
          recoveryAction: .refresh,
          outcome: .knownFailed,
          retryAfterMs: nil
        )
      )
    case .suspended:
      return try await withCheckedThrowingContinuation { continuation in
        memberUpdateContinuation = continuation
      }
    }
  }

  func resolveMemory(id: String, action: MemoryAction) throws -> SavedMemory {
    receivedMemoryDecisions.append(MemoryDecisionCall(id: id, action: action))
    if let memoryFailure { throw memoryFailure }
    return SavedMemory(
      id: id,
      userId: nil,
      agent: .intj,
      kind: .preference,
      content: "测试记忆",
      status: action == .confirm ? .confirmed : .rejected,
      sourceTurnId: nil,
      sourceMessageId: nil,
      version: 1,
      createdAt: nil,
      updatedAt: nil
    )
  }

  func saveFeedback(_ input: FeedbackUpsertRequest) throws -> MessageFeedback {
    receivedFeedback.append(input)
    if let feedbackFailure { throw feedbackFailure }
    return MessageFeedback(
      id: "feedback-1",
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
    received.append(turn)
    switch mode {
    case .events(let events, let terminal):
      for event in events { try await onEvent(event) }
      return TurnStreamResult(replayed: false, terminal: terminal)
    case .eventsThenFailure(let events, let error):
      for event in events { try await onEvent(event) }
      throw error
    case .failure(let error):
      throw error
    case .waitForCancellation:
      try await Task.sleep(for: .seconds(60))
      throw APIError.turnResultUnknown(turnId: turn.turnId)
    }
  }

  func requests() -> [TurnRequest] { received }
  func memberUpdates() -> [MemberUpdateCall] { receivedMemberUpdates }
  func fetches() -> [String] { fetchedRoomIDs }
  func memoryDecisions() -> [MemoryDecisionCall] { receivedMemoryDecisions }
  func feedbackRequests() -> [FeedbackUpsertRequest] { receivedFeedback }
  func memberUpdateIsSuspended() -> Bool { memberUpdateContinuation != nil }
  func resumeMemberUpdate(with room: ServerRoom) {
    let continuation = memberUpdateContinuation
    memberUpdateContinuation = nil
    continuation?.resume(returning: room)
  }
}

private actor MemoryPendingTurnStore: PendingTurnStoring {
  private var value: PendingTurnRequest?

  init(initial: PendingTurnRequest? = nil) { value = initial }

  func load() -> PendingTurnRequest? { value }
  func save(_ request: PendingTurnRequest) { value = request }
  func remove() { value = nil }
  func current() -> PendingTurnRequest? { value }
}

private actor MemoryRoomArchiveStore: RoomArchiveStoring {
  private var archives: [RoomArchive] = []

  func loadAll() -> [RoomArchive] { archives }
  func upsert(_ archive: RoomArchive) {
    archives.removeAll { $0.roomId == archive.roomId }
    archives.append(archive)
  }
  func remove(roomId: String) { archives.removeAll { $0.roomId == roomId } }
  func current() -> [RoomArchive] { archives }
}
