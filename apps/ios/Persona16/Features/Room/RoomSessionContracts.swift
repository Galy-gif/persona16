import Foundation

protocol RoomSessionServing: Sendable {
  func fetchRoom(id: String) async throws -> ServerRoom
  func updateRoom(id: String, version: Int, command: RoomCommand) async throws -> ServerRoom
  func resolveMemory(id: String, action: MemoryAction) async throws -> SavedMemory
  func saveFeedback(_ input: FeedbackUpsertRequest) async throws -> MessageFeedback
  func streamTurn(
    _ turn: TurnRequest,
    onEvent: @escaping @Sendable (TurnEvent) async throws -> Void
  ) async throws -> TurnStreamResult
}

extension Persona16API: RoomSessionServing {}

enum RoomSessionCommandError: Error, Equatable, Sendable {
  case roomNotReady
  case turnAlreadyActive
  case emptyMessage
  case noPendingTurn
  case roomMutationInFlight
  case memberChangeUnavailable
  case unavailableCanonicalCharacter
  case versionConflictRefreshFailed
  case memoryCandidateUnavailable
  case feedbackUnavailable
}

extension RoomSessionCommandError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .roomNotReady:
      "房间尚未准备好。"
    case .turnAlreadyActive:
      "当前请求尚未确认，不能开始新的操作。"
    case .emptyMessage:
      "消息不能为空。"
    case .noPendingTurn:
      "没有等待确认的原请求。"
    case .roomMutationInFlight:
      "房间正在更新，暂时不能开始新的请求。"
    case .memberChangeUnavailable:
      "房间正在处理请求，暂时不能修改成员。"
    case .unavailableCanonicalCharacter:
      "只能邀请当前人物目录中的正典人物。"
    case .versionConflictRefreshFailed:
      "房间已在其他位置更新，但暂时无法读取最新状态。请稍后重试。"
    case .memoryCandidateUnavailable:
      "这条记忆建议已经处理或不可用。"
    case .feedbackUnavailable:
      "这条消息不能提交评价。"
    }
  }
}

enum RoomMemberCommandOutcome: Equatable, Sendable {
  case updated
  case refreshedAfterVersionConflict
}

enum RoomSessionFailure {
  static func local(code: String, message: String) -> ServerFailure {
    ServerFailure(
      code: code,
      message: message,
      recoverable: true,
      recoveryAction: .retry,
      outcome: .knownFailed,
      retryAfterMs: nil
    )
  }
}
