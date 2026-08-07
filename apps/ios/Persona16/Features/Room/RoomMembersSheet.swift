import SwiftUI

struct RoomMembersSheet: View {
  @Environment(\.dismiss) private var dismiss
  let session: RoomSession
  @State private var pendingRemoval: AgentType?
  @State private var notice: String?
  @State private var errorMessage: String?

  private var members: [RoomAgentState] {
    session.state.room?.state.agents ?? []
  }

  private var activeMemberCount: Int {
    members.filter { !$0.paused }.count
  }

  private var invitableCharacters: [Character] {
    let existing = Set(members.map { $0.type.rawValue })
    return Character.catalog.filter { !existing.contains($0.type.rawValue) }
  }

  var body: some View {
    NavigationStack {
      List {
        if !session.canManageMembers {
          Section {
            Label(
              "房间正在处理请求，成员操作暂时不可用。",
              systemImage: "hourglass"
            )
            .foregroundStyle(.secondary)
          }
        }

        Section("当前成员") {
          ForEach(members) { member in
            RoomMemberRow(
              member: member,
              operationsEnabled: session.canManageMembers,
              pauseDisabled: !member.paused && activeMemberCount <= 1,
              removeDisabled: members.count <= 1,
              onTogglePaused: { togglePaused(member) },
              onRequestRemoval: { requestRemoval(member.type) }
            )
          }
        }

        Section {
          if members.count >= 3 {
            Text("房间最多 3 位人物。")
              .foregroundStyle(.secondary)
          } else if invitableCharacters.isEmpty {
            Text("当前正典人物都已在房间中。")
              .foregroundStyle(.secondary)
          } else {
            ForEach(invitableCharacters) { character in
              Button {
                invite(character.type)
              } label: {
                Label("邀请\(character.name)", systemImage: "person.badge.plus")
              }
              .disabled(!session.canManageMembers)
              .accessibilityIdentifier("room.members.invite.\(character.slug.rawValue)")
            }
          }
        } header: {
          Text("邀请正典人物")
        } footer: {
          Text("客户端只展示人物目录中的四位正典人物；最终成员规则仍由服务端校验。")
        }

        if session.memberCommandInFlight {
          Section {
            ProgressView("正在更新房间")
          }
        }

        if let notice {
          Section {
            Label(notice, systemImage: "arrow.clockwise")
              .foregroundStyle(.secondary)
          }
        }

        if let errorMessage {
          Section {
            Label(errorMessage, systemImage: "exclamationmark.triangle")
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("房间成员")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("完成", action: close)
            .disabled(session.memberCommandInFlight)
        }
      }
    }
    .interactiveDismissDisabled(session.memberCommandInFlight)
    .confirmationDialog(
      removalTitle,
      isPresented: removalIsPresented,
      presenting: pendingRemoval
    ) { agent in
      Button("确认移除\(AgentPresentation.name(for: agent))", role: .destructive) {
        confirmRemoval(agent)
      }
      Button("取消", role: .cancel) {}
    } message: { agent in
      Text("移除后仍需服务端确认房间至少保留一位成员。")
    }
    .accessibilityIdentifier("room.members.sheet")
  }

  private var removalTitle: String {
    guard let pendingRemoval else { return "确认移除成员" }
    return "移除\(AgentPresentation.name(for: pendingRemoval))？"
  }

  private var removalIsPresented: Binding<Bool> {
    Binding(
      get: { pendingRemoval != nil },
      set: { isPresented in
        if !isPresented { pendingRemoval = nil }
      }
    )
  }

  private func togglePaused(_ member: RoomAgentState) {
    perform {
      if member.paused {
        return try await session.resumeMember(member.type)
      }
      return try await session.pauseMember(member.type)
    }
  }

  private func close() {
    dismiss()
  }

  private func invite(_ agent: AgentType) {
    perform {
      try await session.inviteMember(agent)
    }
  }

  private func requestRemoval(_ agent: AgentType) {
    pendingRemoval = agent
  }

  private func confirmRemoval(_ agent: AgentType) {
    pendingRemoval = nil
    perform {
      try await session.removeMemberAfterConfirmation(agent)
    }
  }

  private func perform(
    _ operation: @escaping @MainActor () async throws -> RoomMemberCommandOutcome
  ) {
    notice = nil
    errorMessage = nil
    Task {
      do {
        let outcome = try await operation()
        if outcome == .refreshedAfterVersionConflict {
          notice = "房间已在其他位置更新。已载入最新成员，请重新确认刚才的操作。"
        }
      } catch is CancellationError {
        return
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }
}

private struct RoomMemberRow: View {
  let member: RoomAgentState
  let operationsEnabled: Bool
  let pauseDisabled: Bool
  let removeDisabled: Bool
  let onTogglePaused: () -> Void
  let onRequestRemoval: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(AgentPresentation.name(for: member.type))
          .font(.headline)
        Text(member.type.rawValue)
          .font(.caption.weight(.semibold))
          .foregroundStyle(AgentPresentation.color(for: member.type))
        Spacer()
        if member.paused {
          Label("已暂停", systemImage: "pause.circle.fill")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      HStack {
        Button(member.paused ? "恢复" : "暂停", action: onTogglePaused)
          .buttonStyle(.bordered)
          .disabled(!operationsEnabled || pauseDisabled)
          .accessibilityIdentifier("room.members.toggle.\(member.type.rawValue)")

        Button("移除", role: .destructive, action: onRequestRemoval)
          .buttonStyle(.bordered)
          .disabled(!operationsEnabled || removeDisabled)
          .accessibilityIdentifier("room.members.remove.\(member.type.rawValue)")
      }
    }
    .padding(.vertical, 4)
  }
}

#if DEBUG
#Preview("Members") {
  RoomMembersSheet(
    session: AppEnvironment.preview().makeRoomSession(room: AppEnvironment.previewRoom)
  )
}
#endif
