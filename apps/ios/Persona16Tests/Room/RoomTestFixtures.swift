import Foundation
@testable import Persona16

enum RoomTestFixtures {
  static func readyState(
    turnId: String,
    agents: [AgentType] = [.intj]
  ) -> RoomSessionState {
    var state = RoomSessionState(phase: .submitting)
    state.installRoom(room(agents: agents))
    state.activeTurnId = turnId
    return state
  }

  static func room(
    version: Int = 1,
    agents: [AgentType] = [.intj],
    history: [TurnMessage] = []
  ) -> ServerRoom {
    ServerRoom(
      id: "room-1",
      state: RoomState(
        agents: agents.map(agentState),
        history: history,
        roomGoal: nil,
        conflictTopic: nil,
        conflictRounds: 0,
        calledAgent: nil,
        pendingUserRequest: nil
      ),
      version: version,
      busy: false
    )
  }

  static func done(version: Int) -> TurnDone {
    let finalRoom = room(
      version: version,
      history: [
        TurnMessage(
          id: "server-final",
          speaker: .agent(.intj),
          text: "权威最终正文",
          speechType: .short
        )
      ]
    )
    return TurnDone(
      room: finalRoom.state,
      roomVersion: version,
      plan: nil,
      safetyLevel: .normal
    )
  }

  private static func agentState(_ agent: AgentType) -> RoomAgentState {
    RoomAgentState(
      type: agent,
      paused: false,
      turnsSinceSpoke: 0,
      turnsInRoom: 1,
      recentOpenings: [],
      relationship: RelationshipMemory(
        intimacy: 0,
        userPrefers: [],
        repeatedPatterns: [],
        knownBoundaries: []
      )
    )
  }
}
