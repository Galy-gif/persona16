import Foundation

enum RoomSessionPhase: Equatable, Sendable {
  case idle
  case loading
  case ready
  case submitting
  case understanding
  case organizing
  case confirmingReply
  case presentingValidated
  case awaitingTerminal
  case failedKnown
  case resultUnknown
}

struct PresentedRoomMessage: Equatable, Identifiable, Sendable {
  let id: String
  let serverId: String?
  let speaker: MessageSpeaker
  let text: String
  let speechType: SpeechType?
  let isProvisional: Bool
}

struct RoomSessionState: Equatable, Sendable {
  var phase: RoomSessionPhase = .idle
  var room: ServerRoom?
  var messages: [PresentedRoomMessage] = []
  var activeTurnId: String?
  var activeSpeaker: SpeakerStart?
  var knownFailure: ServerFailure?
  var pendingTurn: PendingTurnRequest?
  var memoryCandidates: [MemoryCandidate] = []

  var canSubmitNewTurn: Bool {
    phase == .ready && pendingTurn == nil && room != nil
  }

  mutating func installRoom(_ room: ServerRoom) {
    self.room = room
    messages = Self.present(room.state.history)
  }

  mutating func prepareForUnknownResult(_ pending: PendingTurnRequest) {
    messages = room.map { Self.present($0.state.history) } ?? []
    messages.append(
      PresentedRoomMessage(
        id: "local-user-\(pending.turnId)",
        serverId: nil,
        speaker: .user,
        text: pending.text,
        speechType: nil,
        isProvisional: true
      )
    )
    activeSpeaker = nil
  }

  static func present(_ history: [TurnMessage]) -> [PresentedRoomMessage] {
    history.enumerated().map { index, message in
      PresentedRoomMessage(
        id: message.id ?? "history-\(index)",
        serverId: message.id,
        speaker: message.speaker,
        text: message.text,
        speechType: message.speechType,
        isProvisional: false
      )
    }
  }
}
