import Foundation

struct FeedbackSheetItem: Equatable, Identifiable, Sendable {
  let roomId: String
  let messageId: String
  let agent: AgentType
  let messageText: String

  var id: String { "\(roomId):\(messageId)" }

  init?(roomId: String, message: PresentedRoomMessage) {
    guard let messageId = message.serverId,
          case .agent(let agent) = message.speaker else {
      return nil
    }
    self.roomId = roomId
    self.messageId = messageId
    self.agent = agent
    self.messageText = message.text
  }
}

struct FeedbackDraft: Equatable, Sendable {
  var rating: FeedbackRating?
  var tags: Set<FeedbackTag> = []
  var note = ""

  func request(for item: FeedbackSheetItem) -> FeedbackUpsertRequest? {
    guard let rating else { return nil }
    let normalizedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
    return FeedbackUpsertRequest(
      roomId: item.roomId,
      messageId: item.messageId,
      rating: rating,
      tags: tags.sorted { $0.rawValue < $1.rawValue },
      note: normalizedNote.isEmpty ? nil : normalizedNote
    )
  }
}

enum FeedbackSubmissionState: Equatable, Sendable {
  case idle
  case loading
  case failed(String)
}

extension FeedbackTag {
  var displayName: String {
    switch self {
    case .tooAI: "太像 AI"
    case .stereotyped: "人物刻板"
    case .offensive: "令人不适"
    case .repetitive: "内容重复"
    case .notHelpful: "没有帮助"
    case .tooLong: "太长"
    case .tooShort: "太短"
    }
  }
}
