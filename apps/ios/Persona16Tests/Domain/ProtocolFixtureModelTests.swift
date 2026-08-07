import Foundation
import Testing
@testable import Persona16

@Suite("Turn v1 shared fixture models")
struct ProtocolFixtureModelTests {
  @Test("Room response keeps opaque String identifiers")
  func roomFixture() throws {
    let room = try JSONDecoder().decode(
      ServerRoom.self,
      from: FixtureData.load("room.json")
    )

    #expect(room.id == "00000000-0000-4000-8000-000000000001")
    #expect(room.version == 2)
    #expect(room.busy == false)
    #expect(room.state.agents.map(\.type) == [.intj])
    #expect(room.state.history.last?.speaker == .agent(.intj))
  }

  @Test("Memory and feedback responses decode current server records")
  func memoryAndFeedbackFixtures() throws {
    let memories = try JSONDecoder().decode(
      MemoryListResponse.self,
      from: FixtureData.load("memories.json")
    )
    let feedback = try JSONDecoder().decode(
      FeedbackListResponse.self,
      from: FixtureData.load("feedback.json")
    )

    #expect(memories.memories.map(\.status) == [.candidate, .confirmed])
    #expect(memories.memories.allSatisfy { !$0.id.isEmpty })
    #expect(feedback.feedback.map(\.rating) == [.positive, .negative])
    #expect(feedback.feedback[1].tags == [.tooLong])
  }

  @Test("Room commands preserve the server discriminator contract")
  func roomCommandEncoding() throws {
    let encoded = try JSONEncoder().encode(
      RoomCommandRequest(
        roomVersion: 3,
        command: .removeAgent(.enfp, confirmed: true)
      )
    )
    let json = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    let command = try #require(json["command"] as? [String: Any])

    #expect(json["roomVersion"] as? Int == 3)
    #expect(command["type"] as? String == "remove_agent")
    #expect(command["agent"] as? String == "ENFP")
    #expect(command["confirmed"] as? Bool == true)
  }
}

private enum FixtureData {
  static func load(_ name: String) throws -> Data {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    return try Data(contentsOf: root.appending(path: "contracts/turn-v1/\(name)"))
  }
}
