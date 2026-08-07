import SwiftUI

enum MemoryDecisionState: Equatable, Sendable {
  case idle
  case loading(MemoryAction)
  case failed(String)
}

struct MemoryDecisionCard: View {
  let candidate: MemoryCandidate
  private let onConfirm: @Sendable (MemoryCandidate) async throws -> Void
  private let onReject: @Sendable (MemoryCandidate) async throws -> Void
  @State private var state: MemoryDecisionState

  init(
    candidate: MemoryCandidate,
    initialState: MemoryDecisionState = .idle,
    onConfirm: @escaping @Sendable (MemoryCandidate) async throws -> Void,
    onReject: @escaping @Sendable (MemoryCandidate) async throws -> Void
  ) {
    self.candidate = candidate
    self.onConfirm = onConfirm
    self.onReject = onReject
    _state = State(initialValue: initialState)
  }

  var body: some View {
    InformationCard("记忆建议", systemImage: "brain.head.profile") {
      VStack(alignment: .leading, spacing: 12) {
        Text(candidate.content)
          .foregroundStyle(.primary)
          .fixedSize(horizontal: false, vertical: true)

        Text("\(AgentPresentation.name(for: candidate.agent)) · \(kindLabel)")
          .font(.footnote)
          .foregroundStyle(.secondary)

        if case .failed(let message) = state {
          Label(message, systemImage: "exclamationmark.circle")
            .font(.footnote)
            .foregroundStyle(.red)
            .accessibilityLabel("操作失败：\(message)")
        }

        MemoryDecisionActions(
          loadingAction: loadingAction,
          onReject: reject,
          onConfirm: confirm
        )
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("memory-decision-\(candidate.id)")
  }

  private var isLoading: Bool {
    if case .loading = state { true } else { false }
  }

  private var loadingAction: MemoryAction? {
    if case .loading(let action) = state { action } else { nil }
  }

  private var kindLabel: String {
    switch candidate.kind {
    case .preference: "偏好"
    case .repeatedPattern: "重复模式"
    case .boundary: "边界"
    }
  }

  private func confirm() {
    perform(.confirm, action: onConfirm)
  }

  private func reject() {
    perform(.reject, action: onReject)
  }

  private func perform(
    _ memoryAction: MemoryAction,
    action: @escaping @Sendable (MemoryCandidate) async throws -> Void
  ) {
    guard !isLoading else { return }
    state = .loading(memoryAction)
    Task {
      do {
        try await action(candidate)
        state = .idle
      } catch is CancellationError {
        state = .idle
      } catch {
        state = .failed(error.localizedDescription)
      }
    }
  }
}

private struct MemoryDecisionActions: View {
  let loadingAction: MemoryAction?
  let onReject: () -> Void
  let onConfirm: () -> Void

  private var isLoading: Bool { loadingAction != nil }

  var body: some View {
    HStack(spacing: 12) {
      Button(action: onReject) {
        if loadingAction == .reject {
          ProgressView()
            .controlSize(.small)
            .accessibilityLabel("正在忽略记忆建议")
        } else {
          Text("忽略")
        }
      }
        .buttonStyle(.bordered)
        .accessibilityHint("拒绝保存这条记忆建议")

      Button(action: onConfirm) {
        if loadingAction == .confirm {
          ProgressView()
            .controlSize(.small)
            .accessibilityLabel("正在保存记忆")
        } else {
          Text("记住")
        }
      }
      .buttonStyle(.borderedProminent)
      .accessibilityHint("确认保存这条记忆建议")
    }
    .disabled(isLoading)
  }
}

#Preview("Memory candidate") {
  MemoryDecisionCard(
    candidate: MemoryCandidate(
      id: "preview-memory",
      agent: .intj,
      kind: .preference,
      content: "回复时先给结论，再补充必要依据。"
    ),
    onConfirm: { _ in },
    onReject: { _ in }
  )
  .padding()
  .background(Persona16Theme.appBackground)
}

#Preview("Memory error") {
  MemoryDecisionCard(
    candidate: MemoryCandidate(
      id: "preview-memory-error",
      agent: .enfp,
      kind: .boundary,
      content: "不要把私人经历带入公开房间。"
    ),
    initialState: .failed("暂时无法保存，请重试。"),
    onConfirm: { _ in },
    onReject: { _ in }
  )
  .padding()
  .background(Persona16Theme.appBackground)
}
