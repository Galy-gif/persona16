import Foundation

enum MessageSpeaker: Equatable, Sendable {
  case user
  case safety
  case agent(AgentType)
}

extension MessageSpeaker: Codable {
  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    if value == "user" {
      self = .user
    } else if value == "safety" {
      self = .safety
    } else if let agent = AgentType(rawValue: value) {
      self = .agent(agent)
    } else {
      throw DecodingError.dataCorruptedError(
        in: try decoder.singleValueContainer(),
        debugDescription: "Unknown message speaker: \(value)"
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .user:
      try container.encode("user")
    case .safety:
      try container.encode("safety")
    case .agent(let agent):
      try container.encode(agent.rawValue)
    }
  }
}

struct RelationshipMemory: Codable, Equatable, Sendable {
  let intimacy: Int
  let userPrefers: [String]
  let repeatedPatterns: [String]
  let knownBoundaries: [String]
}

struct TurnMessage: Codable, Equatable, Identifiable, Sendable {
  let id: String?
  let speaker: MessageSpeaker
  let text: String
  let speechType: SpeechType?
}

struct RoomAgentState: Codable, Equatable, Identifiable, Sendable {
  let type: AgentType
  let paused: Bool
  let turnsSinceSpoke: Int
  let turnsInRoom: Int
  let recentOpenings: [String]
  let relationship: RelationshipMemory

  var id: String { type.rawValue }
}

struct PendingUserRequest: Codable, Equatable, Sendable {
  enum Mode: String, Codable, Sendable {
    case analyze
    case advise
    case decideTogether = "decide_together"
  }

  let mode: Mode
  let sourceTurnId: String
}

struct RoomState: Codable, Equatable, Sendable {
  let agents: [RoomAgentState]
  let history: [TurnMessage]
  let roomGoal: RoomGoal?
  let conflictTopic: String?
  let conflictRounds: Int
  let calledAgent: AgentType?
  let pendingUserRequest: PendingUserRequest?
}

struct ServerRoom: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let state: RoomState
  let version: Int
  let busy: Bool?
}

struct CreateRoomRequest: Encodable, Equatable, Sendable {
  let agents: [AgentType]
  let roomGoal: RoomGoal?
}

enum RoomCommand: Encodable, Equatable, Sendable {
  case pauseAgent(AgentType)
  case resumeAgent(AgentType)
  case inviteAgent(AgentType)
  case removeAgent(AgentType, confirmed: Bool)

  private enum CodingKeys: String, CodingKey {
    case type
    case agent
    case confirmed
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .pauseAgent(let agent):
      try container.encode("pause_agent", forKey: .type)
      try container.encode(agent, forKey: .agent)
    case .resumeAgent(let agent):
      try container.encode("resume_agent", forKey: .type)
      try container.encode(agent, forKey: .agent)
    case .inviteAgent(let agent):
      try container.encode("invite_agent", forKey: .type)
      try container.encode(agent, forKey: .agent)
    case .removeAgent(let agent, let confirmed):
      try container.encode("remove_agent", forKey: .type)
      try container.encode(agent, forKey: .agent)
      try container.encode(confirmed, forKey: .confirmed)
    }
  }
}

struct RoomCommandRequest: Encodable, Equatable, Sendable {
  let roomVersion: Int
  let command: RoomCommand
}
