import SwiftUI

struct RoomSessionOwnerView: View {
  private let restoreRoomID: String?
  private let fallbackAgents: [AgentType]
  private let savesInitialArchive: Bool
  @State private var session: RoomSession

  init(environment: AppEnvironment, room: ServerRoom) {
    restoreRoomID = nil
    fallbackAgents = room.state.agents.map(\.type)
    savesInitialArchive = true
    _session = State(initialValue: environment.makeRoomSession(room: room))
  }

  init(environment: AppEnvironment, archive: RoomArchive) {
    restoreRoomID = archive.roomId
    fallbackAgents = archive.agents
    savesInitialArchive = false
    _session = State(initialValue: environment.makeRoomSession())
  }

  var body: some View {
    RoomScreen(
      session: session,
      restoreRoomID: restoreRoomID,
      fallbackAgents: fallbackAgents
    )
    .task {
      if savesInitialArchive {
        await session.saveLocalArchive()
      }
    }
  }
}
