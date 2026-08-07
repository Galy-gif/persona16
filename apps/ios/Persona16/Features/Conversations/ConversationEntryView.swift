import SwiftUI

struct ConversationEntryView: View {
  @Environment(AppEnvironment.self) private var environment
  let character: Character
  @State private var creationState: RoomCreationState = .loading
  @State private var loadAttempt = 0

  private var roomIsLoaded: Bool {
    if case .loaded = creationState { return true }
    return false
  }

  var body: some View {
    ZStack {
      ScrollView {
        VStack(spacing: 20) {
          CharacterPortrait(character: character, size: 112)

          Text("正在建立与\(character.name)的对话")
            .font(.title2.bold())
            .multilineTextAlignment(.center)

          switch creationState {
          case .loading:
            ProgressView("正在创建房间")
              .controlSize(.large)
          case .failed(let message):
            ContentUnavailableView {
              Label("暂时无法创建房间", systemImage: "wifi.exclamationmark")
            } description: {
              Text(message)
            } actions: {
              Button("重试", action: retry)
                .buttonStyle(.borderedProminent)
            }
          case .loaded:
            EmptyView()
          }

          InformationCard("开场参考", systemImage: "text.bubble") {
            VStack(alignment: .leading, spacing: 10) {
              ForEach(character.starters, id: \.self) { starter in
                Text("“\(starter)”")
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
      }
      .allowsHitTesting(!roomIsLoaded)
      .accessibilityHidden(roomIsLoaded)

      if case .loaded(let room) = creationState {
        RoomSessionOwnerView(environment: environment, room: room)
          .transition(.opacity)
      }
    }
    .background(Persona16Theme.appBackground)
    .navigationTitle(character.name)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("conversation.entry.\(character.slug.rawValue)")
    .task(id: loadAttempt) {
      await createRoomIfNeeded()
    }
  }

  private func retry() {
    loadAttempt += 1
  }

  private func createRoomIfNeeded() async {
    if case .loaded = creationState { return }
    creationState = .loading
    do {
      let room = try await environment.api.createRoom(
        agents: [character.type],
        roomGoal: nil
      )
      guard !Task.isCancelled else { return }
      creationState = .loaded(room)
    } catch is CancellationError {
      return
    } catch {
      creationState = .failed(error.localizedDescription)
    }
  }
}

private enum RoomCreationState {
  case loading
  case loaded(ServerRoom)
  case failed(String)
}

#if DEBUG
#Preview {
  NavigationStack {
    ConversationEntryView(character: Character.catalog[1])
  }
  .environment(AppEnvironment.preview())
}
#endif
