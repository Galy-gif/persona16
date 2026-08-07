import SwiftUI

struct RoomProgressCard: View {
  let phase: RoomSessionPhase

  var body: some View {
    if let label = statusLabel {
      HStack(spacing: 10) {
        ProgressView()
        Text(label)
          .font(.subheadline.weight(.medium))
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(14)
      .background(Persona16Theme.cardBackground, in: RoundedRectangle(cornerRadius: 16))
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("room.progress")
    }
  }

  private var statusLabel: String? {
    switch phase {
    case .loading:
      "正在恢复对话"
    case .submitting, .understanding:
      "正在理解"
    case .organizing:
      "正在组织"
    case .confirmingReply, .presentingValidated, .awaitingTerminal:
      "正在确认回复"
    case .resultUnknown:
      "等待确认"
    case .idle, .ready, .failedKnown:
      nil
    }
  }
}

struct KnownFailureCard: View {
  let failure: ServerFailure
  let onDismiss: () -> Void

  var body: some View {
    InformationCard("这次请求已明确失败", systemImage: "exclamationmark.triangle") {
      VStack(alignment: .leading, spacing: 12) {
        Text(failure.message)
        Text("服务端已确认本次请求没有成功，可以返回输入并发送新消息。")
          .font(.footnote)
          .foregroundStyle(.secondary)
        Button("返回输入", action: onDismiss)
          .buttonStyle(.borderedProminent)
      }
    }
    .accessibilityIdentifier("room.failure.known")
  }
}

struct RestoreFailureCard: View {
  let message: String
  let onRetry: () -> Void

  var body: some View {
    InformationCard("无法恢复对话", systemImage: "exclamationmark.triangle") {
      VStack(alignment: .leading, spacing: 12) {
        Text(message)
        Text("本机最近入口仍然保留，可以再次从服务端加载。")
          .font(.footnote)
          .foregroundStyle(.secondary)
        Button("重试恢复", systemImage: "arrow.clockwise", action: onRetry)
          .buttonStyle(.borderedProminent)
      }
    }
    .accessibilityIdentifier("room.failure.restore")
  }
}

struct UnknownResultCard: View {
  let pending: PendingTurnRequest
  let onReplay: () -> Void

  var body: some View {
    InformationCard("等待确认原请求", systemImage: "arrow.triangle.2.circlepath") {
      VStack(alignment: .leading, spacing: 12) {
        Text("连接在可信终态前中断。临时服务端正文已清除，原请求保留如下；现在不能发送新消息。")
          .foregroundStyle(.secondary)
        Text(pending.text)
          .font(.body.weight(.medium))
          .padding(10)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
        Button("检查原请求", systemImage: "arrow.clockwise", action: onReplay)
          .buttonStyle(.borderedProminent)
          .accessibilityHint("使用相同的请求编号和正文检查或重放，不创建新请求")
      }
    }
    .accessibilityIdentifier("room.failure.unknown")
  }
}
