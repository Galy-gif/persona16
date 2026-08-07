import Foundation

struct RoomMemberCommandResult: Equatable, Sendable {
  let outcome: RoomMemberCommandOutcome
  let room: ServerRoom
}

struct RoomMemberCommandService: Sendable {
  private let api: any RoomSessionServing

  init(api: any RoomSessionServing) {
    self.api = api
  }

  func canApply(to state: RoomSessionState, mutationInFlight: Bool) -> Bool {
    state.phase == .ready
      && state.activeTurnId == nil
      && state.pendingTurn == nil
      && state.room?.busy != true
      && !mutationInFlight
  }

  func apply(
    _ command: RoomCommand,
    to room: ServerRoom
  ) async throws -> RoomMemberCommandResult {
    do {
      let updated = try await api.updateRoom(
        id: room.id,
        version: room.version,
        command: command
      )
      return RoomMemberCommandResult(outcome: .updated, room: updated)
    } catch let APIError.server(_, failure) where failure.code == "ROOM_VERSION_CONFLICT" {
      do {
        let authoritative = try await api.fetchRoom(id: room.id)
        return RoomMemberCommandResult(
          outcome: .refreshedAfterVersionConflict,
          room: authoritative
        )
      } catch {
        throw RoomSessionCommandError.versionConflictRefreshFailed
      }
    }
  }
}
