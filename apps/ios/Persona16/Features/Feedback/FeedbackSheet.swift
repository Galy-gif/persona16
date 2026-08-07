import SwiftUI

struct FeedbackSheet: View {
  @Environment(\.dismiss) private var dismiss
  let item: FeedbackSheetItem
  private let onSubmit: @Sendable (FeedbackUpsertRequest) async throws -> Void
  @State private var draft: FeedbackDraft
  @State private var submissionState: FeedbackSubmissionState

  init(
    item: FeedbackSheetItem,
    initialDraft: FeedbackDraft = FeedbackDraft(),
    initialSubmissionState: FeedbackSubmissionState = .idle,
    onSubmit: @escaping @Sendable (FeedbackUpsertRequest) async throws -> Void
  ) {
    self.item = item
    self.onSubmit = onSubmit
    _draft = State(initialValue: initialDraft)
    _submissionState = State(initialValue: initialSubmissionState)
  }

  var body: some View {
    NavigationStack {
      Form {
        MessageContextSection(item: item)

        Section("这条回复怎么样？") {
          FeedbackRatingPicker(selection: $draft.rating)
        }

        Section("具体原因（可选）") {
          ForEach(FeedbackTag.allCases, id: \.self) { tag in
            Toggle(tag.displayName, isOn: tagBinding(tag))
          }
        }

        Section("补充说明（可选）") {
          TextField("还有什么想告诉我们？", text: $draft.note, axis: .vertical)
            .lineLimit(3...6)
            .accessibilityHint("可留空")
        }

        if case .failed(let message) = submissionState {
          Section {
            Label(message, systemImage: "exclamationmark.circle")
              .foregroundStyle(.red)
              .accessibilityLabel("提交失败：\(message)")
          }
        }
      }
      .navigationTitle("评价回复")
      .navigationBarTitleDisplayMode(.inline)
      .disabled(isLoading)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("取消", action: dismiss.callAsFunction)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(action: beginSubmit) {
            if isLoading {
              ProgressView()
                .controlSize(.small)
                .accessibilityLabel("正在提交反馈")
            } else {
              Text("提交")
            }
          }
          .disabled(draft.rating == nil)
        }
      }
    }
    .presentationDetents([.medium, .large])
    .interactiveDismissDisabled(isLoading)
  }

  private var isLoading: Bool {
    submissionState == .loading
  }

  private func tagBinding(_ tag: FeedbackTag) -> Binding<Bool> {
    Binding(
      get: { draft.tags.contains(tag) },
      set: { isSelected in
        if isSelected {
          draft.tags.insert(tag)
        } else {
          draft.tags.remove(tag)
        }
      }
    )
  }

  private func beginSubmit() {
    guard let request = draft.request(for: item), !isLoading else { return }
    submissionState = .loading
    Task { await submit(request) }
  }

  private func submit(_ request: FeedbackUpsertRequest) async {
    do {
      try await onSubmit(request)
      dismiss()
    } catch is CancellationError {
      submissionState = .idle
    } catch {
      submissionState = .failed(error.localizedDescription)
    }
  }
}

private struct MessageContextSection: View {
  let item: FeedbackSheetItem

  var body: some View {
    Section("正在评价") {
      VStack(alignment: .leading, spacing: 6) {
        Text(AgentPresentation.name(for: item.agent))
          .font(.headline)
        Text(item.messageText)
          .font(.body)
          .foregroundStyle(.secondary)
          .lineLimit(3)
      }
      .accessibilityElement(children: .combine)
    }
  }
}

private struct FeedbackRatingPicker: View {
  @Binding var selection: FeedbackRating?

  var body: some View {
    HStack(spacing: 12) {
      ratingButton(.positive, title: "有帮助", systemImage: "hand.thumbsup")
      ratingButton(.negative, title: "需改进", systemImage: "hand.thumbsdown")
    }
  }

  private func ratingButton(
    _ rating: FeedbackRating,
    title: String,
    systemImage: String
  ) -> some View {
    Button {
      selection = rating
    } label: {
      Label(title, systemImage: systemImage)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .tint(selection == rating ? Color.accentColor : Color(uiColor: .secondaryLabel))
    .accessibilityValue(selection == rating ? "已选择" : "未选择")
  }
}

extension View {
  func feedbackSheet(
    item: Binding<FeedbackSheetItem?>,
    onSubmit: @escaping @Sendable (FeedbackUpsertRequest) async throws -> Void
  ) -> some View {
    sheet(item: item) { selectedItem in
      FeedbackSheet(item: selectedItem, onSubmit: onSubmit)
    }
  }
}

#Preview("Feedback") {
  FeedbackSheet(
    item: FeedbackSheetItem(
      roomId: "preview-room",
      message: PresentedRoomMessage(
        id: "preview-message",
        serverId: "preview-message",
        speaker: .agent(.intj),
        text: "先把范围缩到今晚能完成的一小段。",
        speechType: .short,
        isProvisional: false
      )
    )!,
    onSubmit: { _ in }
  )
}

#Preview("Feedback error") {
  FeedbackSheet(
    item: FeedbackSheetItem(
      roomId: "preview-room",
      message: PresentedRoomMessage(
        id: "preview-message-error",
        serverId: "preview-message-error",
        speaker: .agent(.enfp),
        text: "那就只读十分钟，给开始留一点轻松感。",
        speechType: .short,
        isProvisional: false
      )
    )!,
    initialSubmissionState: .failed("暂时无法提交，请重试。"),
    onSubmit: { _ in }
  )
}
