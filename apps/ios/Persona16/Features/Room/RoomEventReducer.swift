import Foundation

enum RoomEventReducerError: Error, Equatable, Sendable {
  case mismatchedTurnId(expected: String, actual: String)
  case missingRoom
}

enum RoomEventReducer {
  static func reduce(_ state: inout RoomSessionState, event: TurnEvent) throws {
    if let expected = state.activeTurnId, event.turnId != expected {
      throw RoomEventReducerError.mismatchedTurnId(expected: expected, actual: event.turnId)
    }

    switch event {
    case .turnStart:
      state.phase = .understanding
    case .plan:
      state.phase = .organizing
    case .roomAction:
      state.phase = .organizing
    case .speakerStart(_, let value):
      state.activeSpeaker = value
      state.phase = .confirmingReply
    case .delta(_, let value):
      appendDelta(value, to: &state)
      state.phase = .presentingValidated
    case .speakerEnd(_, let value):
      finalizeSpeaker(value, in: &state)
      state.activeSpeaker = nil
      state.phase = .organizing
    case .safetyNotice(_, let value):
      state.messages.append(
        PresentedRoomMessage(
          id: "safety-\(event.turnId)",
          serverId: nil,
          speaker: .safety,
          text: value.text,
          speechType: nil,
          isProvisional: true
        )
      )
      state.phase = .presentingValidated
    case .memoryCandidate(_, let candidate):
      upsertMemoryCandidate(candidate, in: &state)
    case .turnEnd:
      state.phase = .awaitingTerminal
    case .done(_, let value):
      guard let current = state.room else { throw RoomEventReducerError.missingRoom }
      state.installRoom(
        ServerRoom(id: current.id, state: value.room, version: value.roomVersion, busy: false)
      )
      state.activeTurnId = nil
      state.activeSpeaker = nil
      state.knownFailure = nil
      state.phase = .ready
    case .error(_, let failure):
      state.activeSpeaker = nil
      if failure.outcome == .knownFailed {
        state.activeTurnId = nil
        state.knownFailure = failure
        state.phase = .failedKnown
      } else {
        state.knownFailure = nil
        state.phase = .resultUnknown
      }
    case .unknown:
      break
    }
  }

  private static func upsertMemoryCandidate(
    _ candidate: MemoryCandidate,
    in state: inout RoomSessionState
  ) {
    if let index = state.memoryCandidates.firstIndex(where: { $0.id == candidate.id }) {
      state.memoryCandidates[index] = candidate
    } else {
      state.memoryCandidates.append(candidate)
    }
  }

  private static func appendDelta(_ delta: TurnDelta, to state: inout RoomSessionState) {
    if let index = state.messages.lastIndex(where: {
      $0.isProvisional && $0.speaker == .agent(delta.agent)
    }) {
      let current = state.messages[index]
      state.messages[index] = PresentedRoomMessage(
        id: current.id,
        serverId: nil,
        speaker: current.speaker,
        text: current.text + delta.delta,
        speechType: current.speechType,
        isProvisional: true
      )
      return
    }

    state.messages.append(
      PresentedRoomMessage(
        id: "stream-\(state.activeTurnId ?? "unknown")-\(state.messages.count)",
        serverId: nil,
        speaker: .agent(delta.agent),
        text: delta.delta,
        speechType: state.activeSpeaker?.agent == delta.agent
          ? state.activeSpeaker?.speechType
          : nil,
        isProvisional: true
      )
    )
  }

  private static func finalizeSpeaker(_ end: SpeakerEnd, in state: inout RoomSessionState) {
    guard let index = state.messages.lastIndex(where: {
      $0.isProvisional && $0.speaker == .agent(end.agent)
    }) else {
      return
    }
    state.messages[index] = PresentedRoomMessage(
      id: end.messageId,
      serverId: end.messageId,
      speaker: .agent(end.agent),
      text: end.text,
      speechType: end.speechType,
      isProvisional: false
    )
  }
}
