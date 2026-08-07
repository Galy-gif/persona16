import Foundation

enum RecoveryAction: String, Codable, Sendable {
  case retry
  case transform
  case refresh
  case stop
}

enum FailureOutcome: String, Codable, Sendable {
  case knownFailed = "known_failed"
  case unknown
}

struct ServerFailure: Codable, Equatable, Error, Sendable {
  let code: String
  let message: String
  let recoverable: Bool
  let recoveryAction: RecoveryAction
  let outcome: FailureOutcome
  let retryAfterMs: Int?
}

struct ErrorEnvelope: Codable, Equatable, Sendable {
  let error: ServerFailure
}
