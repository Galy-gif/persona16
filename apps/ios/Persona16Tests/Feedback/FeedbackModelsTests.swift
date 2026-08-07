import Foundation
import Testing
@testable import Persona16

@Suite("Feedback presentation model")
struct FeedbackModelsTests {
  @Test("Only persisted persona messages can become sheet items")
  func eligibility() throws {
    let agentMessage = PresentedRoomMessage(
      id: "local-id",
      serverId: "server-id",
      speaker: .agent(.enfp),
      text: "回复正文",
      speechType: .short,
      isProvisional: false
    )
    let item = try #require(FeedbackSheetItem(roomId: "room-1", message: agentMessage))
    #expect(item.id == "room-1:server-id")
    #expect(item.agent == .enfp)

    let provisional = PresentedRoomMessage(
      id: "local-only",
      serverId: nil,
      speaker: .agent(.enfp),
      text: "流式正文",
      speechType: .short,
      isProvisional: true
    )
    let userMessage = PresentedRoomMessage(
      id: "user-message",
      serverId: "server-user",
      speaker: .user,
      text: "用户正文",
      speechType: nil,
      isProvisional: false
    )
    #expect(FeedbackSheetItem(roomId: "room-1", message: provisional) == nil)
    #expect(FeedbackSheetItem(roomId: "room-1", message: userMessage) == nil)
  }

  @Test("Draft builds the exact domain request with deterministic tags and optional note")
  func requestPayload() throws {
    let message = PresentedRoomMessage(
      id: "message-1",
      serverId: "message-1",
      speaker: .agent(.intj),
      text: "回复正文",
      speechType: .short,
      isProvisional: false
    )
    let item = try #require(FeedbackSheetItem(roomId: "room-1", message: message))
    let empty = FeedbackDraft()
    #expect(empty.request(for: item) == nil)

    let draft = FeedbackDraft(
      rating: .negative,
      tags: [.tooLong, .notHelpful],
      note: "  请更直接一些。\n"
    )
    let request = try #require(draft.request(for: item))
    #expect(request.roomId == "room-1")
    #expect(request.messageId == "message-1")
    #expect(request.rating == .negative)
    #expect(request.tags == [.notHelpful, .tooLong])
    #expect(request.note == "请更直接一些。")
  }
}
