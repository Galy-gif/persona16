import SwiftUI

struct RootView: View {
  @State private var selectedTab: AppTab = .conversations

  var body: some View {
    TabView(selection: $selectedTab) {
      ForEach(AppTab.allCases) { tab in
        NavigationStack {
          tabContent(for: tab)
        }
        .tabItem {
          Label(tab.title, systemImage: tab.systemImage)
            .accessibilityLabel(tab.title)
        }
        .tag(tab)
        .accessibilityIdentifier(tab.accessibilityIdentifier)
      }
    }
  }

  @ViewBuilder
  private func tabContent(for tab: AppTab) -> some View {
    switch tab {
    case .characters:
      CharacterListView()
    case .conversations:
      RecentConversationsView {
        selectedTab = .characters
      }
    case .settings:
      SettingsPlaceholderView()
    }
  }
}

private enum AppTab: String, CaseIterable, Identifiable {
  case characters
  case conversations
  case settings

  var id: Self { self }

  var title: LocalizedStringKey {
    switch self {
    case .characters: "人物"
    case .conversations: "对话"
    case .settings: "设置"
    }
  }

  var systemImage: String {
    switch self {
    case .characters: "person.2"
    case .conversations: "bubble.left.and.bubble.right"
    case .settings: "gearshape"
    }
  }

  var accessibilityIdentifier: String {
    "tab.\(rawValue)"
  }

}

private struct SettingsPlaceholderView: View {
  var body: some View {
    ContentUnavailableView(
      "设置",
      systemImage: "gearshape",
      description: Text("更多客户端设置将在真实会话能力接入后提供。")
    )
    .symbolRenderingMode(.hierarchical)
    .navigationTitle("设置")
    .accessibilityIdentifier("settings.empty")
  }
}

#if DEBUG
#Preview {
  RootView()
    .environment(AppEnvironment.preview())
}
#endif
