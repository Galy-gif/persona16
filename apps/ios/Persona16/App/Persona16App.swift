import SwiftUI

@main
struct Persona16App: App {
  private let environment: Result<AppEnvironment, Error>

  init() {
#if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
      environment = .success(AppEnvironment.preview())
      return
    }
#endif
    environment = Result {
      try AppEnvironment(configuration: AppConfiguration())
    }
  }

  var body: some Scene {
    WindowGroup {
      switch environment {
      case .success(let environment):
        RootView()
          .environment(environment)
      case .failure(let error):
        ConfigurationFailureView(message: error.localizedDescription)
      }
    }
  }
}

private struct ConfigurationFailureView: View {
  let message: String

  var body: some View {
    ContentUnavailableView(
      "无法启动",
      systemImage: "exclamationmark.triangle",
      description: Text(message)
    )
    .accessibilityIdentifier("configuration.failure")
  }
}
