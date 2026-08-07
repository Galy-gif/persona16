import SwiftUI

struct RecentConversationsView: View {
  @Environment(AppEnvironment.self) private var environment
  let onBrowseCharacters: () -> Void
  @State private var archives: [RoomArchive] = []
  @State private var loadState: ArchiveLoadState = .loading
  @State private var loadAttempt = 0
  @State private var operationError: String?

  var body: some View {
    List {
      if !archives.isEmpty {
        Section {
          ForEach(archives) { archive in
            NavigationLink {
              RoomSessionOwnerView(environment: environment, archive: archive)
            } label: {
              RecentConversationRow(archive: archive)
            }
            .swipeActions {
              Button("仅本地移除", role: .destructive) {
                removeLocalArchive(archive)
              }
            }
          }
        } footer: {
          Text("这里只保存本机的最近入口。移除不会删除服务端房间或对话内容。")
        }
      }

      if let operationError {
        Section {
          Label(operationError, systemImage: "exclamationmark.triangle")
            .foregroundStyle(.secondary)
        }
      }
    }
    .overlay {
      if archives.isEmpty {
        RecentConversationsOverlay(
          state: loadState,
          onBrowseCharacters: onBrowseCharacters,
          onRetry: retry
        )
      }
    }
    .navigationTitle("Persona16")
    .accessibilityIdentifier("conversations.list")
    .task(id: loadAttempt) {
      await loadArchives()
    }
  }

  private func retry() {
    loadAttempt += 1
  }

  private func loadArchives() async {
    loadState = .loading
    do {
      let loaded = try await environment.archiveStore.loadAll()
      guard !Task.isCancelled else { return }
      archives = loaded
      loadState = .loaded
    } catch is CancellationError {
      return
    } catch {
      loadState = .failed(error.localizedDescription)
    }
  }

  private func removeLocalArchive(_ archive: RoomArchive) {
    Task {
      do {
        try await environment.archiveStore.remove(roomId: archive.roomId)
        archives.removeAll { $0.roomId == archive.roomId }
        operationError = nil
      } catch {
        operationError = "无法从本机最近列表移除：\(error.localizedDescription)"
      }
    }
  }
}

private enum ArchiveLoadState {
  case loading
  case loaded
  case failed(String)
}

private struct RecentConversationsOverlay: View {
  let state: ArchiveLoadState
  let onBrowseCharacters: () -> Void
  let onRetry: () -> Void

  var body: some View {
    switch state {
    case .loading:
      ProgressView("正在加载最近对话")
    case .loaded:
      ContentUnavailableView {
        Label("还没有最近对话", systemImage: "bubble.left.and.bubble.right")
      } description: {
        Text("选择一位人物，创建真实房间后会显示在这里。")
      } actions: {
        Button(action: onBrowseCharacters) {
          Label("浏览人物", systemImage: "person.2")
        }
        .buttonStyle(.borderedProminent)
      }
      .accessibilityIdentifier("conversations.empty")
    case .failed(let message):
      ContentUnavailableView {
        Label("无法读取最近对话", systemImage: "exclamationmark.triangle")
      } description: {
        Text(message)
      } actions: {
        Button("重试", action: onRetry)
          .buttonStyle(.borderedProminent)
      }
    }
  }
}

private struct RecentConversationRow: View {
  let archive: RoomArchive

  private var title: String {
    let names = archive.agents.map { agent in
      Character.catalog.first { $0.type == agent }?.name ?? agent.rawValue
    }
    return names.isEmpty ? "对话" : names.joined(separator: "、")
  }

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "bubble.left.and.bubble.right.fill")
        .font(.title2)
        .foregroundStyle(.tint)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline)
        Text(archive.updatedAt, format: .relative(presentation: .named))
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

#if DEBUG
#Preview {
  NavigationStack {
    RecentConversationsView(onBrowseCharacters: {})
  }
  .environment(AppEnvironment.preview())
}
#endif
