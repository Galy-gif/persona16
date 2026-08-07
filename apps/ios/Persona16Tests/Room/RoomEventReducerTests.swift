import Foundation
import Testing
@testable import Persona16

@Suite("Room event reducer")
struct RoomEventReducerTests {
  @Test("Multi-agent text starts at delta and speaker_end replaces provisional text")
  func multiAgentLoop() throws {
    let turnId = "turn-room"
    var state = RoomTestFixtures.readyState(turnId: turnId, agents: [.intj, .enfp])

    try RoomEventReducer.reduce(
      &state,
      event: .speakerStart(
        turnId: turnId,
        value: SpeakerStart(agent: .intj, speechType: .short)
      )
    )
    #expect(state.messages.isEmpty)
    #expect(state.phase == .confirmingReply)

    try RoomEventReducer.reduce(
      &state,
      event: .delta(turnId: turnId, value: TurnDelta(agent: .intj, delta: "临时"))
    )
    try RoomEventReducer.reduce(
      &state,
      event: .speakerEnd(
        turnId: turnId,
        value: SpeakerEnd(
          messageId: "message-intj",
          agent: .intj,
          speechType: .short,
          text: "INTJ 最终文本"
        )
      )
    )
    try RoomEventReducer.reduce(
      &state,
      event: .speakerStart(
        turnId: turnId,
        value: SpeakerStart(agent: .enfp, speechType: .short)
      )
    )
    try RoomEventReducer.reduce(
      &state,
      event: .delta(turnId: turnId, value: TurnDelta(agent: .enfp, delta: "ENFP 文本"))
    )

    #expect(state.messages.map(\.text) == ["INTJ 最终文本", "ENFP 文本"])
    #expect(state.messages[0].isProvisional == false)
    #expect(state.messages[1].isProvisional)
  }

  @Test("Safety bypass presents its notice without an agent delta")
  func safetyBypass() throws {
    let turnId = "turn-safety"
    var state = RoomTestFixtures.readyState(turnId: turnId)

    try RoomEventReducer.reduce(
      &state,
      event: .safetyNotice(
        turnId: turnId,
        value: SafetyNotice(level: .crisis, text: "安全提示")
      )
    )

    #expect(state.phase == .presentingValidated)
    #expect(state.messages.last?.speaker == .safety)
    #expect(state.messages.last?.text == "安全提示")
  }

  @Test("turn_end only awaits terminal and done installs authoritative history")
  func authoritativeDone() throws {
    let turnId = "turn-done"
    var state = RoomTestFixtures.readyState(turnId: turnId)
    try RoomEventReducer.reduce(
      &state,
      event: .delta(turnId: turnId, value: TurnDelta(agent: .intj, delta: "临时正文"))
    )
    try RoomEventReducer.reduce(
      &state,
      event: .turnEnd(
        turnId: turnId,
        value: TurnEnd(stopReason: .complete, roomVersion: 2)
      )
    )
    #expect(state.phase == .awaitingTerminal)
    #expect(state.activeTurnId == turnId)

    let authoritative = RoomTestFixtures.room(
      version: 2,
      history: [
        TurnMessage(
          id: "server-message",
          speaker: .agent(.intj),
          text: "服务端权威正文",
          speechType: .short
        )
      ]
    )
    try RoomEventReducer.reduce(
      &state,
      event: .done(
        turnId: turnId,
        value: TurnDone(
          room: authoritative.state,
          roomVersion: authoritative.version,
          plan: nil,
          safetyLevel: .normal
        )
      )
    )

    #expect(state.phase == .ready)
    #expect(state.room?.version == 2)
    #expect(state.messages.map(\.text) == ["服务端权威正文"])
    #expect(state.activeTurnId == nil)
  }

  @Test("Memory candidates deduplicate by stable id and survive done")
  func memoryCandidatesSurviveDone() throws {
    let turnId = "turn-memory"
    var state = RoomTestFixtures.readyState(turnId: turnId)
    let original = MemoryCandidate(
      id: "memory-1",
      agent: .intj,
      kind: .preference,
      content: "先给结论"
    )
    let updated = MemoryCandidate(
      id: "memory-1",
      agent: .intj,
      kind: .preference,
      content: "先给明确结论"
    )

    try RoomEventReducer.reduce(
      &state,
      event: .memoryCandidate(turnId: turnId, candidate: original)
    )
    try RoomEventReducer.reduce(
      &state,
      event: .memoryCandidate(turnId: turnId, candidate: updated)
    )
    #expect(state.memoryCandidates == [updated])

    let done = RoomTestFixtures.done(version: 2)
    try RoomEventReducer.reduce(
      &state,
      event: .done(turnId: turnId, value: done)
    )
    #expect(state.memoryCandidates == [updated])
  }

  @Test("An unknown-outcome error keeps the active Turn unresolved")
  func unknownErrorRemainsUnresolved() throws {
    let turnId = "turn-unknown-error"
    var state = RoomTestFixtures.readyState(turnId: turnId)
    state.activeSpeaker = SpeakerStart(agent: .intj, speechType: .short)
    let failure = ServerFailure(
      code: "TURN_RESULT_UNKNOWN",
      message: "无法确认本轮结果",
      recoverable: true,
      recoveryAction: .refresh,
      outcome: .unknown,
      retryAfterMs: nil
    )

    try RoomEventReducer.reduce(
      &state,
      event: .error(turnId: turnId, failure: failure)
    )

    #expect(state.phase == .resultUnknown)
    #expect(state.activeTurnId == turnId)
    #expect(state.activeSpeaker == nil)
    #expect(state.knownFailure == nil)
  }
}
