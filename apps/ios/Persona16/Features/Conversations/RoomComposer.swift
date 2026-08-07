import SwiftUI

struct RoomComposer: View {
  @Binding var draft: String
  @Binding var calledAgent: AgentType?
  let agents: [AgentType]
  let canSubmit: Bool
  let canStop: Bool
  let onSubmit: () -> Void
  let onStop: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      HStack {
        Menu {
          Button("不指定人物") {
            calledAgent = nil
          }
          ForEach(agents) { agent in
            Button(AgentPresentation.name(for: agent)) {
              calledAgent = agent
            }
          }
        } label: {
          Label(calledAgentName, systemImage: "at")
            .font(.subheadline)
        }
        .accessibilityLabel("指定回应人物")

        Spacer()

        if canStop {
          Button("停止", systemImage: "stop.fill", action: onStop)
            .buttonStyle(.bordered)
            .tint(.red)
            .accessibilityHint("停止等待；结果会进入待确认状态")
        }
      }

      HStack(alignment: .bottom, spacing: 10) {
        TextField("输入消息", text: $draft, axis: .vertical)
          .lineLimit(1...6)
          .textFieldStyle(.roundedBorder)
          .submitLabel(.send)
          .onSubmit(onSubmit)
          .accessibilityIdentifier("room.composer")

        Button(action: onSubmit) {
          Image(systemName: "arrow.up.circle.fill")
            .font(.title)
        }
        .disabled(!canSubmit || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityLabel("发送")
        .accessibilityIdentifier("room.send")
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(.bar)
  }

  private var calledAgentName: String {
    calledAgent.map(AgentPresentation.name(for:)) ?? "全房间"
  }
}
