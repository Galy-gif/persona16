import SwiftUI

struct RoomScreen: View {
  let session: RoomSession
  let restoreRoomID: String?
  let fallbackAgents: [AgentType]
  @State private var draft = ""
  @State private var calledAgent: AgentType?
  @State private var commandError: String?
  @State private var presentedSheet: RoomSheet?
  @State private var feedbackItem: FeedbackSheetItem?

  private var roomAgents: [AgentType] {
    session.state.room?.state.agents.map(\.type) ?? fallbackAgents
  }

  private var callableAgents: [AgentType] {
    session.state.room?.state.agents.filter { !$0.paused }.map(\.type) ?? fallbackAgents
  }

  private var roomTitle: String {
    let names = roomAgents.map(AgentPresentation.name(for:))
    return names.isEmpty ? "对话" : names.joined(separator: "、")
  }

  private var canStop: Bool {
    session.state.activeTurnId != nil && session.state.phase != .resultUnknown
  }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 12) {
          if session.state.messages.isEmpty && session.state.phase == .ready {
            RoomEmptyState(agents: roomAgents)
          }

          ForEach(session.state.messages) { message in
            RoomMessageRow(message: message, onFeedback: presentFeedback)
              .id(message.id)
          }

          ForEach(session.state.memoryCandidates) { candidate in
            MemoryDecisionCard(
              candidate: candidate,
              onConfirm: confirmMemory,
              onReject: rejectMemory
            )
          }

          RoomProgressCard(phase: session.state.phase)

          if let failure = session.state.knownFailure,
             session.state.phase == .failedKnown {
            if session.state.room == nil, restoreRoomID != nil {
              RestoreFailureCard(message: failure.message, onRetry: retryRestore)
            } else {
              KnownFailureCard(failure: failure, onDismiss: dismissKnownFailure)
            }
          }

          if let pending = session.state.pendingTurn,
             session.state.phase == .resultUnknown {
            UnknownResultCard(pending: pending, onReplay: replayPendingTurn)
          }

          if let commandError {
            Label(commandError, systemImage: "exclamationmark.circle")
              .font(.footnote)
              .foregroundStyle(.red)
              .frame(maxWidth: .infinity, alignment: .leading)
              .accessibilityIdentifier("room.command.error")
          }
        }
        .padding(16)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(Persona16Theme.appBackground)
      .safeAreaInset(edge: .bottom) {
        RoomComposer(
          draft: $draft,
          calledAgent: $calledAgent,
          agents: callableAgents,
          canSubmit: session.canSubmitNewTurn,
          canStop: canStop,
          onSubmit: submit,
          onStop: stop
        )
      }
      .onChange(of: session.state.messages.last?.id) { _, id in
        guard let id else { return }
        withAnimation(.easeOut(duration: 0.2)) {
          proxy.scrollTo(id, anchor: .bottom)
        }
      }
    }
    .navigationTitle(roomTitle)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button(action: presentMembers) {
          Label("成员", systemImage: "person.2")
        }
        .disabled(session.state.room == nil)
        .accessibilityIdentifier("room.members.open")
      }
    }
    .sheet(item: $presentedSheet) { destination in
      switch destination {
      case .members:
        RoomMembersSheet(session: session)
      }
    }
    .feedbackSheet(item: $feedbackItem, onSubmit: submitFeedback)
    .accessibilityIdentifier("room.screen")
    .task {
      await restoreIfNeeded()
    }
  }

  private func restoreIfNeeded() async {
    guard session.state.phase == .idle, let restoreRoomID else { return }
    await session.restore(roomId: restoreRoomID)
  }

  private func submit() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    draft = ""
    commandError = nil
    Task {
      do {
        try await session.submit(text: text, calledAgent: calledAgent)
      } catch is CancellationError {
        return
      } catch {
        draft = text
        commandError = error.localizedDescription
      }
    }
  }

  private func presentMembers() {
    presentedSheet = .members
  }

  private func presentFeedback(for message: PresentedRoomMessage) {
    guard let roomId = session.state.room?.id else { return }
    feedbackItem = FeedbackSheetItem(roomId: roomId, message: message)
  }

  private func confirmMemory(_ candidate: MemoryCandidate) async throws {
    try await session.resolveMemoryCandidate(candidate, action: .confirm)
  }

  private func rejectMemory(_ candidate: MemoryCandidate) async throws {
    try await session.resolveMemoryCandidate(candidate, action: .reject)
  }

  private func submitFeedback(_ request: FeedbackUpsertRequest) async throws {
    try await session.submitFeedback(request)
  }

  private func retryRestore() {
    guard let restoreRoomID else { return }
    commandError = nil
    Task {
      await session.restore(roomId: restoreRoomID)
    }
  }

  private func stop() {
    session.cancelCurrentTurn()
  }

  private func dismissKnownFailure() {
    commandError = nil
    session.dismissKnownFailure()
  }

  private func replayPendingTurn() {
    commandError = nil
    Task {
      do {
        try await session.replayPendingTurn()
      } catch is CancellationError {
        return
      } catch {
        commandError = error.localizedDescription
      }
    }
  }
}

private enum RoomSheet: String, Identifiable {
  case members

  var id: String { rawValue }
}

private struct RoomEmptyState: View {
  let agents: [AgentType]

  private var names: String {
    agents.map(AgentPresentation.name(for:)).joined(separator: "、")
  }

  var body: some View {
    ContentUnavailableView {
      Label("房间已准备好", systemImage: "bubble.left")
    } description: {
      Text("写下你想对\(names.isEmpty ? "房间" : names)说的内容。回复只会在服务端交付门确认后显示。")
    }
    .accessibilityIdentifier("room.ready.empty")
  }
}

#if DEBUG
#Preview("Ready room") {
  NavigationStack {
    RoomSessionOwnerView(
      environment: AppEnvironment.preview(),
      room: AppEnvironment.previewRoom
    )
  }
}
#endif
