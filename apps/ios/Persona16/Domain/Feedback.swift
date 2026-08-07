import Foundation

enum FeedbackRating: String, Codable, Sendable {
  case positive
  case negative
}

enum FeedbackTag: String, Codable, CaseIterable, Sendable {
  case tooAI = "too_ai"
  case stereotyped
  case offensive
  case repetitive
  case notHelpful = "not_helpful"
  case tooLong = "too_long"
  case tooShort = "too_short"
}

struct MessageFeedback: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let userId: String?
  let roomId: String
  let turnId: String?
  let messageId: String
  let rating: FeedbackRating
  let tags: [FeedbackTag]
  let note: String?
  let createdAt: String?
  let updatedAt: String?
}

struct FeedbackListResponse: Codable, Equatable, Sendable {
  let feedback: [MessageFeedback]
}

struct FeedbackUpsertRequest: Encodable, Equatable, Sendable {
  let roomId: String
  let messageId: String
  let rating: FeedbackRating
  let tags: [FeedbackTag]
  let note: String?
}

struct FeedbackUpsertResponse: Codable, Equatable, Sendable {
  let feedback: MessageFeedback
}
