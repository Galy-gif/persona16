import Foundation
import Testing
@testable import Persona16

@Suite("Persona16 HTTP and Turn streaming client", .serialized)
struct Persona16APITests {
  @Test("A persisted replay reports its header and delivers done")
  func replay() async throws {
    let body = try NetworkFixtureData.load("normal-single.ndjson")
    MockURLProtocol.install { request in
      #expect(request.httpMethod == "POST")
      #expect(request.url?.path == "/api/turn")
      return MockResponse(
        status: 200,
        headers: [
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "X-Persona16-Replay": "1",
        ],
        chunks: [body]
      )
    }
    defer { MockURLProtocol.reset() }
    let collector = EventCollector()
    let api = makeAPI()
    let result = try await api.streamTurn(Self.turnRequest) { event in
      await collector.append(event)
    }

    #expect(result.replayed)
    guard case .done(let done) = result.terminal else {
      Issue.record("Expected done terminal")
      return
    }
    #expect(done.roomVersion == 2)
    #expect(await collector.types().last == "done")
  }

  @Test("EOF without done or error remains an unknown Turn result")
  func prematureEOF() async throws {
    let body = try NetworkFixtureData.load("unknown-result.ndjson")
    let request = Self.turnRequest(turnId: "00000000-0000-4000-8000-000000000105")
    MockURLProtocol.install { _ in
      MockResponse(
        status: 200,
        headers: ["Content-Type": "application/x-ndjson"],
        chunks: [body]
      )
    }
    defer { MockURLProtocol.reset() }
    let api = makeAPI()

    await #expect(throws: APIError.turnResultUnknown(turnId: request.turnId)) {
      try await api.streamTurn(request) { _ in }
    }
  }

  @Test("A streamed unknown-outcome error preserves its fields and returns unknown")
  func streamedUnknownError() async throws {
    let body = try NetworkFixtureData.load("unknown-error.ndjson")
    let request = Self.turnRequest(turnId: "00000000-0000-4000-8000-000000000106")
    MockURLProtocol.install { _ in
      MockResponse(
        status: 200,
        headers: ["Content-Type": "application/x-ndjson"],
        chunks: [body]
      )
    }
    defer { MockURLProtocol.reset() }
    let collector = EventCollector()

    await #expect(throws: APIError.turnResultUnknown(turnId: request.turnId)) {
      try await makeAPI().streamTurn(request) { event in
        await collector.append(event)
      }
    }
    let failure = try #require(await collector.lastFailure())
    #expect(failure.code == "TURN_RESULT_UNKNOWN")
    #expect(failure.outcome == .unknown)
    #expect(failure.recoveryAction == .refresh)
  }

  @Test("A consumer failure after done preserves the known terminal result")
  func consumerFailureAfterTerminal() async throws {
    let body = try NetworkFixtureData.load("normal-single.ndjson")
    MockURLProtocol.install { _ in
      MockResponse(
        status: 200,
        headers: ["Content-Type": "application/x-ndjson"],
        chunks: [body]
      )
    }
    defer { MockURLProtocol.reset() }

    do {
      _ = try await makeAPI().streamTurn(Self.turnRequest) { event in
        if case .done = event { throw TestConsumerFailure() }
      }
      Issue.record("Expected the consumer failure")
    } catch let APIError.eventConsumerFailed(turnId, terminal) {
      #expect(turnId == Self.turnRequest.turnId)
      guard case .done(let done) = terminal else {
        Issue.record("Expected the known done terminal")
        return
      }
      #expect(done.roomVersion == 2)
    } catch {
      Issue.record("Expected eventConsumerFailed, got \(error)")
    }
  }

  @Test("HTTP failures preserve Harness recovery fields and Retry-After")
  func serverFailure() async throws {
    let payload = Data("""
      {"error":{"code":"RATE_LIMITED","message":"虚构限流","recoverable":true,"recoveryAction":"retry","outcome":"known_failed"}}
      """.utf8)
    MockURLProtocol.install { _ in
      MockResponse(status: 429, headers: ["Retry-After": "3"], chunks: [payload])
    }
    defer { MockURLProtocol.reset() }

    do {
      _ = try await makeAPI().fetchRoom(id: "00000000-0000-4000-8000-000000000001")
      Issue.record("Expected the server error")
    } catch let APIError.server(status, failure) {
      #expect(status == 429)
      #expect(failure.code == "RATE_LIMITED")
      #expect(failure.recoveryAction == .retry)
      #expect(failure.outcome == .knownFailed)
      #expect(failure.retryAfterMs == 3_000)
    }
  }

  @Test("Room creation encodes the narrow request and decodes the shared room")
  func createRoom() async throws {
    let body = try NetworkFixtureData.load("room.json")
    MockURLProtocol.install { request in
      let requestBody = try requestBody(request)
      let json = try #require(
        JSONSerialization.jsonObject(with: requestBody) as? [String: Any]
      )
      #expect(request.httpMethod == "POST")
      #expect(request.url?.path == "/api/rooms")
      #expect(json["agents"] as? [String] == ["INTJ"])
      return MockResponse(status: 201, headers: [:], chunks: [body])
    }
    defer { MockURLProtocol.reset() }

    let room = try await makeAPI().createRoom(agents: [.intj])
    #expect(room.version == 2)
    #expect(room.id == "00000000-0000-4000-8000-000000000001")
  }

  private static let turnRequest = turnRequest(
    turnId: "00000000-0000-4000-8000-000000000101"
  )

  private static func turnRequest(turnId: String) -> TurnRequest {
    TurnRequest(
      roomId: "00000000-0000-4000-8000-000000000001",
      turnId: turnId,
      roomVersion: 1,
      command: .init(text: "请记住，我希望回复时先给结论。", calledAgent: nil)
    )
  }

  private func makeAPI() -> Persona16API {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    configuration.httpShouldSetCookies = true
    configuration.httpCookieStorage = .shared
    return Persona16API(
      baseURL: URL(string: "https://persona16.invalid")!,
      session: URLSession(configuration: configuration)
    )
  }
}

private struct TestConsumerFailure: Error {}

private actor EventCollector {
  private var events: [TurnEvent] = []

  func append(_ event: TurnEvent) {
    events.append(event)
  }

  func types() -> [String] {
    events.map(\.type)
  }

  func lastFailure() -> ServerFailure? {
    for event in events.reversed() {
      if case .error(_, let failure) = event { return failure }
    }
    return nil
  }
}

private struct MockResponse: Sendable {
  let status: Int
  let headers: [String: String]
  let chunks: [Data]
}

private enum MockFailure: Error {
  case handlerMissing
  case requestBodyMissing
}

private func requestBody(_ request: URLRequest) throws -> Data {
  if let body = request.httpBody { return body }
  guard let stream = request.httpBodyStream else { throw MockFailure.requestBodyMissing }
  stream.open()
  defer { stream.close() }
  var data = Data()
  var buffer = [UInt8](repeating: 0, count: 1_024)
  while stream.hasBytesAvailable {
    let count = stream.read(&buffer, maxLength: buffer.count)
    if count < 0 { throw stream.streamError ?? MockFailure.requestBodyMissing }
    if count == 0 { break }
    data.append(buffer, count: count)
  }
  guard !data.isEmpty else { throw MockFailure.requestBodyMissing }
  return data
}

private final class MockURLProtocol: URLProtocol, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var handler: (@Sendable (URLRequest) throws -> MockResponse)?

  static func install(_ handler: @escaping @Sendable (URLRequest) throws -> MockResponse) {
    lock.withLock { Self.handler = handler }
  }

  static func reset() {
    lock.withLock { handler = nil }
  }

  override class func canInit(with request: URLRequest) -> Bool { true }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      let currentHandler = Self.lock.withLock { Self.handler }
      let response = try currentHandler?(request) ?? { throw MockFailure.handlerMissing }()
      let http = try #require(HTTPURLResponse(
        url: request.url!,
        statusCode: response.status,
        httpVersion: "HTTP/1.1",
        headerFields: response.headers
      ))
      client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
      for chunk in response.chunks {
        client?.urlProtocol(self, didLoad: chunk)
      }
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}
