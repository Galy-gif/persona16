import SwiftUI
import Testing
@testable import Persona16

@Suite("Memory decision presentation model")
struct MemoryDecisionCardTests {
  @Test("Candidate identity stays stable across decision states")
  @MainActor
  func stableCandidateIdentity() {
    let candidate = MemoryCandidate(
      id: "memory-stable",
      agent: .intj,
      kind: .preference,
      content: "先给结论"
    )
    let view = MemoryDecisionCard(
      candidate: candidate,
      initialState: .loading(.confirm),
      onConfirm: { _ in },
      onReject: { _ in }
    )

    #expect(view.candidate.id == "memory-stable")
    #expect(MemoryDecisionState.loading(.confirm) != .failed("失败"))
  }
}
