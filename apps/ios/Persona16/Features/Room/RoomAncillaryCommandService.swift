import Foundation

struct RoomAncillaryCommandService: Sendable {
  private let api: any RoomSessionServing

  init(api: any RoomSessionServing) {
    self.api = api
  }

  func resolveMemoryCandidate(
    _ candidate: MemoryCandidate,
    action: MemoryAction,
    availableCandidates: [MemoryCandidate]
  ) async throws {
    guard action == .confirm || action == .reject,
          availableCandidates.contains(where: { $0.id == candidate.id }) else {
      throw RoomSessionCommandError.memoryCandidateUnavailable
    }
    _ = try await api.resolveMemory(id: candidate.id, action: action)
  }

  func submitFeedback(
    _ request: FeedbackUpsertRequest,
    roomId: String?,
    messages: [PresentedRoomMessage]
  ) async throws {
    guard roomId == request.roomId,
          messages.contains(where: { message in
            guard message.serverId == request.messageId else { return false }
            if case .agent = message.speaker { return true }
            return false
          }) else {
      throw RoomSessionCommandError.feedbackUnavailable
    }
    _ = try await api.saveFeedback(request)
  }
}
