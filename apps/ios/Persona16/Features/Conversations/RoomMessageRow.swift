import SwiftUI

struct RoomMessageRow: View {
  let message: PresentedRoomMessage
  let onFeedback: (PresentedRoomMessage) -> Void

  init(
    message: PresentedRoomMessage,
    onFeedback: @escaping (PresentedRoomMessage) -> Void = { _ in }
  ) {
    self.message = message
    self.onFeedback = onFeedback
  }

  private var isUser: Bool { message.speaker == .user }

  private var canProvideFeedback: Bool {
    guard message.serverId != nil else { return false }
    if case .agent = message.speaker { return true }
    return false
  }

  var body: some View {
    HStack {
      if isUser { Spacer(minLength: 44) }

      VStack(alignment: isUser ? .trailing : .leading, spacing: 5) {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 5) {
          Text(speakerName)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)

          Text(message.text)
            .font(.body)
            .foregroundStyle(isUser ? Color.white : Color.primary)
            .textSelection(.enabled)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(bubbleColor, in: RoundedRectangle(cornerRadius: 18))

          if message.isProvisional && isUser {
            Text("等待服务端确认")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(speakerName)：\(message.text)")

        if canProvideFeedback {
          Button {
            onFeedback(message)
          } label: {
            Label("评价", systemImage: "hand.thumbsup")
          }
          .font(.caption)
          .buttonStyle(.borderless)
          .accessibilityHint("评价\(speakerName)的这条回复")
          .accessibilityIdentifier("room.feedback.\(message.serverId ?? message.id)")
        }
      }

      if !isUser { Spacer(minLength: 44) }
    }
  }

  private var speakerName: String {
    switch message.speaker {
    case .user:
      "你"
    case .safety:
      "安全提示"
    case .agent(let agent):
      AgentPresentation.name(for: agent)
    }
  }

  private var bubbleColor: Color {
    switch message.speaker {
    case .user:
      .accentColor
    case .safety:
      Color(uiColor: .systemOrange).opacity(0.16)
    case .agent:
      Persona16Theme.cardBackground
    }
  }
}
