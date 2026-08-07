import Foundation

enum MemoryKind: String, Codable, Sendable {
  case preference
  case repeatedPattern = "repeated_pattern"
  case boundary
}

enum MemoryStatus: String, Codable, Sendable {
  case candidate
  case confirmed
  case rejected
  case deleted
}

struct MemoryCandidate: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let agent: AgentType
  let kind: MemoryKind
  let content: String
}

struct SavedMemory: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let userId: String?
  let agent: AgentType
  let kind: MemoryKind
  let content: String
  let status: MemoryStatus
  let sourceTurnId: String?
  let sourceMessageId: String?
  let version: Int?
  let createdAt: String?
  let updatedAt: String?
}

struct MemoryListResponse: Codable, Equatable, Sendable {
  let memories: [SavedMemory]
}

enum MemoryAction: String, Encodable, Sendable {
  case confirm
  case reject
  case delete
}

struct MemoryActionRequest: Encodable, Equatable, Sendable {
  let action: MemoryAction
}

struct MemoryActionResponse: Codable, Equatable, Sendable {
  let memory: SavedMemory
}
