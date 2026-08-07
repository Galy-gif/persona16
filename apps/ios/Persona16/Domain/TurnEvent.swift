import Foundation

enum TurnStopReason: String, Codable, Sendable {
  case complete
  case needsUserInput = "needs_user_input"
  case summaryComplete = "summary_complete"
  case noNewValue = "no_new_value"
  case budgetExhausted = "budget_exhausted"
  case safetyRedirect = "safety_redirect"
  case cancelled
  case error
}

enum RoomAction: Equatable, Sendable {
  case speak(agent: AgentType, speechType: SpeechType, angle: String)
  case summarize(agent: AgentType, reason: String)
  case askUser(agent: AgentType, question: String)
  case stop(reason: TurnStopReason)
}

struct TurnPlanSummary: Codable, Equatable, Sendable {
  let scene: TurnScene
  let userEmotion: UserEmotion
}

struct SpeakerStart: Equatable, Sendable {
  let agent: AgentType
  let speechType: SpeechType
}

struct TurnDelta: Equatable, Sendable {
  let agent: AgentType
  let delta: String
}

struct SpeakerEnd: Equatable, Sendable {
  let messageId: String
  let agent: AgentType
  let speechType: SpeechType
  let text: String
}

struct SafetyNotice: Equatable, Sendable {
  let level: SafetyLevel
  let text: String
}

struct TurnEnd: Equatable, Sendable {
  let stopReason: TurnStopReason
  let roomVersion: Int
}

struct TurnDone: Equatable, Sendable {
  let room: RoomState
  let roomVersion: Int
  let plan: TurnPlanSummary?
  let safetyLevel: SafetyLevel
}

struct UnknownTurnEvent: Equatable, Sendable {
  let type: String
}

enum TurnEvent: Equatable, Sendable {
  case turnStart(turnId: String)
  case plan(turnId: String, summary: TurnPlanSummary)
  case roomAction(turnId: String, action: RoomAction)
  case speakerStart(turnId: String, value: SpeakerStart)
  case delta(turnId: String, value: TurnDelta)
  case speakerEnd(turnId: String, value: SpeakerEnd)
  case safetyNotice(turnId: String, value: SafetyNotice)
  case memoryCandidate(turnId: String, candidate: MemoryCandidate)
  case turnEnd(turnId: String, value: TurnEnd)
  case done(turnId: String, value: TurnDone)
  case error(turnId: String, failure: ServerFailure)
  case unknown(turnId: String, value: UnknownTurnEvent)

  var turnId: String {
    switch self {
    case .turnStart(let turnId),
         .plan(let turnId, _),
         .roomAction(let turnId, _),
         .speakerStart(let turnId, _),
         .delta(let turnId, _),
         .speakerEnd(let turnId, _),
         .safetyNotice(let turnId, _),
         .memoryCandidate(let turnId, _),
         .turnEnd(let turnId, _),
         .done(let turnId, _),
         .error(let turnId, _),
         .unknown(let turnId, _):
      turnId
    }
  }

  var type: String {
    switch self {
    case .turnStart: "turn_start"
    case .plan: "plan"
    case .roomAction: "room_action"
    case .speakerStart: "speaker_start"
    case .delta: "delta"
    case .speakerEnd: "speaker_end"
    case .safetyNotice: "safety_notice"
    case .memoryCandidate: "memory_candidate"
    case .turnEnd: "turn_end"
    case .done: "done"
    case .error: "error"
    case .unknown(_, let value): value.type
    }
  }

  var trustedTerminal: TurnTerminal? {
    switch self {
    case .done(_, let value): .done(value)
    case .error(_, let failure) where failure.outcome == .knownFailed: .error(failure)
    default: nil
    }
  }

  var isStreamTerminal: Bool {
    switch self {
    case .done, .error: true
    default: false
    }
  }
}

enum TurnTerminal: Equatable, Sendable {
  case done(TurnDone)
  case error(ServerFailure)
}

struct TurnStreamResult: Equatable, Sendable {
  let replayed: Bool
  let terminal: TurnTerminal
}

struct TurnRequest: Encodable, Equatable, Sendable {
  struct Command: Encodable, Equatable, Sendable {
    let type = "message"
    let text: String
    let calledAgent: AgentType?
  }

  let roomId: String
  let turnId: String
  let roomVersion: Int
  let command: Command
}

enum TurnProtocolError: Error, Equatable, Sendable {
  case malformedEnvelope
  case unsupportedVersion(Int)
  case mismatchedTurnId(expected: String, actual: String)
  case malformedKnownEvent(String)
  case invalidUTF8
  case eventAfterTerminal(String)
}

extension TurnProtocolError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .malformedEnvelope:
      "Turn 事件不是有效的 v1 JSON envelope。"
    case .unsupportedVersion(let version):
      "不支持 Turn 事件版本 \(version)。"
    case .mismatchedTurnId:
      "Turn 事件与当前请求不匹配。"
    case .malformedKnownEvent(let type):
      "Turn 事件 \(type) 的字段不完整。"
    case .invalidUTF8:
      "Turn 事件不是有效的 UTF-8。"
    case .eventAfterTerminal:
      "可信终态之后仍收到 Turn 事件。"
    }
  }
}

enum TurnEventCodec {
  private static let decoder = JSONDecoder()
  private static let knownTypes: Set<String> = [
    "turn_start", "plan", "room_action", "speaker_start", "delta",
    "speaker_end", "safety_notice", "memory_candidate", "turn_end", "done", "error",
  ]

  static func decode(_ data: Data, expectedTurnId: String) throws -> TurnEvent {
    let envelope: EventEnvelope
    do {
      envelope = try decoder.decode(EventEnvelope.self, from: data)
    } catch {
      throw TurnProtocolError.malformedEnvelope
    }
    guard envelope.v == 1 else {
      throw TurnProtocolError.unsupportedVersion(envelope.v)
    }
    guard envelope.turnId == expectedTurnId else {
      throw TurnProtocolError.mismatchedTurnId(expected: expectedTurnId, actual: envelope.turnId)
    }
    guard knownTypes.contains(envelope.type) else {
      return .unknown(
        turnId: envelope.turnId,
        value: UnknownTurnEvent(type: envelope.type)
      )
    }

    do {
      switch envelope.type {
      case "turn_start":
        return .turnStart(turnId: envelope.turnId)
      case "plan":
        let event = try decoder.decode(PlanEventWire.self, from: data)
        return .plan(
          turnId: envelope.turnId,
          summary: TurnPlanSummary(scene: event.scene, userEmotion: event.userEmotion)
        )
      case "room_action":
        let event = try decoder.decode(RoomActionEventWire.self, from: data)
        return .roomAction(turnId: envelope.turnId, action: event.action)
      case "speaker_start":
        let event = try decoder.decode(SpeakerStartWire.self, from: data)
        return .speakerStart(
          turnId: envelope.turnId,
          value: SpeakerStart(agent: event.agent, speechType: event.speechType)
        )
      case "delta":
        let event = try decoder.decode(DeltaWire.self, from: data)
        return .delta(
          turnId: envelope.turnId,
          value: TurnDelta(agent: event.agent, delta: event.delta)
        )
      case "speaker_end":
        let event = try decoder.decode(SpeakerEndWire.self, from: data)
        return .speakerEnd(
          turnId: envelope.turnId,
          value: SpeakerEnd(
            messageId: event.messageId,
            agent: event.agent,
            speechType: event.speechType,
            text: event.text
          )
        )
      case "safety_notice":
        let event = try decoder.decode(SafetyNoticeWire.self, from: data)
        return .safetyNotice(
          turnId: envelope.turnId,
          value: SafetyNotice(level: event.level, text: event.text)
        )
      case "memory_candidate":
        let event = try decoder.decode(MemoryCandidateWire.self, from: data)
        return .memoryCandidate(turnId: envelope.turnId, candidate: event.candidate)
      case "turn_end":
        let event = try decoder.decode(TurnEndWire.self, from: data)
        return .turnEnd(
          turnId: envelope.turnId,
          value: TurnEnd(stopReason: event.stopReason, roomVersion: event.roomVersion)
        )
      case "done":
        let event = try decoder.decode(DoneWire.self, from: data)
        return .done(
          turnId: envelope.turnId,
          value: TurnDone(
            room: event.room,
            roomVersion: event.roomVersion,
            plan: event.plan,
            safetyLevel: event.safetyLevel
          )
        )
      case "error":
        let event = try decoder.decode(ErrorWire.self, from: data)
        return .error(
          turnId: envelope.turnId,
          failure: ServerFailure(
            code: event.code,
            message: event.message,
            recoverable: event.recoverable,
            recoveryAction: event.recoveryAction,
            outcome: event.outcome,
            retryAfterMs: event.retryAfterMs
          )
        )
      default:
        throw TurnProtocolError.malformedKnownEvent(envelope.type)
      }
    } catch let error as TurnProtocolError {
      throw error
    } catch {
      throw TurnProtocolError.malformedKnownEvent(envelope.type)
    }
  }
}

private struct EventEnvelope: Decodable {
  let v: Int
  let turnId: String
  let type: String
}

private struct PlanEventWire: Decodable {
  let scene: TurnScene
  let userEmotion: UserEmotion
}

private struct RoomActionEventWire: Decodable {
  let action: RoomAction
}

extension RoomAction: Decodable {
  private enum CodingKeys: String, CodingKey {
    case type
    case agent
    case speechType
    case angle
    case reason
    case question
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let type = try container.decode(String.self, forKey: .type)
    switch type {
    case "speak":
      self = try .speak(
        agent: container.decode(AgentType.self, forKey: .agent),
        speechType: container.decode(SpeechType.self, forKey: .speechType),
        angle: container.decode(String.self, forKey: .angle)
      )
    case "summarize":
      self = try .summarize(
        agent: container.decode(AgentType.self, forKey: .agent),
        reason: container.decode(String.self, forKey: .reason)
      )
    case "ask_user":
      self = try .askUser(
        agent: container.decode(AgentType.self, forKey: .agent),
        question: container.decode(String.self, forKey: .question)
      )
    case "stop":
      self = try .stop(reason: container.decode(TurnStopReason.self, forKey: .reason))
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .type,
        in: container,
        debugDescription: "Unknown room action: \(type)"
      )
    }
  }
}

private struct SpeakerStartWire: Decodable {
  let agent: AgentType
  let speechType: SpeechType
}

private struct DeltaWire: Decodable {
  let agent: AgentType
  let delta: String
}

private struct SpeakerEndWire: Decodable {
  let messageId: String
  let agent: AgentType
  let speechType: SpeechType
  let text: String
}

private struct SafetyNoticeWire: Decodable {
  let level: SafetyLevel
  let text: String
}

private struct MemoryCandidateWire: Decodable {
  let candidate: MemoryCandidate
}

private struct TurnEndWire: Decodable {
  let stopReason: TurnStopReason
  let roomVersion: Int
}

private struct DoneWire: Decodable {
  let room: RoomState
  let roomVersion: Int
  let plan: TurnPlanSummary?
  let safetyLevel: SafetyLevel
}

private struct ErrorWire: Decodable {
  let code: String
  let message: String
  let recoverable: Bool
  let recoveryAction: RecoveryAction
  let outcome: FailureOutcome
  let retryAfterMs: Int?
}
