import Foundation

struct Persona16API: Sendable {
  let baseURL: URL
  let session: URLSession

  init(baseURL: URL, session: URLSession? = nil) {
    self.baseURL = baseURL
    if let session {
      self.session = session
    } else {
      let configuration = URLSessionConfiguration.default
      configuration.httpCookieStorage = .shared
      configuration.httpShouldSetCookies = true
      configuration.httpCookieAcceptPolicy = .always
      self.session = URLSession(configuration: configuration)
    }
  }

  func createRoom(agents: [AgentType], roomGoal: RoomGoal? = nil) async throws -> ServerRoom {
    try await sendJSON(
      method: "POST",
      path: ["api", "rooms"],
      body: CreateRoomRequest(agents: agents, roomGoal: roomGoal)
    )
  }

  func fetchRoom(id: String) async throws -> ServerRoom {
    try await sendJSON(method: "GET", path: ["api", "rooms", id])
  }

  func updateRoom(id: String, version: Int, command: RoomCommand) async throws -> ServerRoom {
    try await sendJSON(
      method: "PATCH",
      path: ["api", "rooms", id],
      body: RoomCommandRequest(roomVersion: version, command: command)
    )
  }

  func streamTurn(
    _ turn: TurnRequest,
    onEvent: @escaping @Sendable (TurnEvent) async throws -> Void
  ) async throws -> TurnStreamResult {
    let request = try makeRequest(
      method: "POST",
      path: ["api", "turn"],
      body: turn
    )
    var decoder = NDJSONStreamDecoder(expectedTurnId: turn.turnId)

    do {
      let (bytes, response) = try await session.bytes(for: request)
      guard let http = response as? HTTPURLResponse else {
        throw APIError.invalidHTTPResponse
      }
      guard (200..<300).contains(http.statusCode) else {
        var data = Data()
        for try await byte in bytes { data.append(byte) }
        throw serverError(data: data, response: http)
      }

      var pendingBytes = Data()
      for try await byte in bytes {
        pendingBytes.append(byte)
        if byte == 0x0A || pendingBytes.count >= 4_096 {
          for event in try decoder.append(pendingBytes) {
            try await deliver(event, using: onEvent)
          }
          pendingBytes.removeAll(keepingCapacity: true)
        }
      }
      if !pendingBytes.isEmpty {
        for event in try decoder.append(pendingBytes) {
          try await deliver(event, using: onEvent)
        }
      }
      for event in try decoder.finish() {
        try await deliver(event, using: onEvent)
      }
      guard let terminal = decoder.trustedTerminal else {
        throw APIError.turnResultUnknown(turnId: turn.turnId)
      }
      return TurnStreamResult(
        replayed: http.value(forHTTPHeaderField: "X-Persona16-Replay") == "1",
        terminal: terminal
      )
    } catch let error as APIError {
      throw error
    } catch let error as TurnProtocolError {
      throw APIError.protocolViolation(error)
    } catch is TurnEventConsumerError {
      if let terminal = decoder.trustedTerminal {
        throw APIError.eventConsumerFailed(turnId: turn.turnId, terminal: terminal)
      }
      throw APIError.turnResultUnknown(turnId: turn.turnId)
    } catch is CancellationError {
      throw APIError.turnResultUnknown(turnId: turn.turnId)
    } catch let error as URLError where error.code == .cancelled {
      throw APIError.turnResultUnknown(turnId: turn.turnId)
    } catch {
      // A transport or consumer failure before a trusted terminal cannot prove
      // whether the server committed the Turn. Replaying the same request is safe.
      throw APIError.turnResultUnknown(turnId: turn.turnId)
    }
  }

  private func deliver(
    _ event: TurnEvent,
    using consumer: @escaping @Sendable (TurnEvent) async throws -> Void
  ) async throws {
    do {
      try await consumer(event)
    } catch {
      throw TurnEventConsumerError()
    }
  }

  func fetchMemories(
    status: MemoryStatus = .confirmed,
    roomId: String? = nil
  ) async throws -> [SavedMemory] {
    var query = [URLQueryItem(name: "status", value: status.rawValue)]
    if let roomId { query.append(URLQueryItem(name: "roomId", value: roomId)) }
    let response: MemoryListResponse = try await sendJSON(
      method: "GET",
      path: ["api", "memories"],
      query: query
    )
    return response.memories
  }

  @discardableResult
  func resolveMemory(id: String, action: MemoryAction) async throws -> SavedMemory {
    let response: MemoryActionResponse = try await sendJSON(
      method: "PATCH",
      path: ["api", "memories", id],
      body: MemoryActionRequest(action: action)
    )
    return response.memory
  }

  func fetchFeedback(roomId: String) async throws -> [MessageFeedback] {
    let response: FeedbackListResponse = try await sendJSON(
      method: "GET",
      path: ["api", "feedback"],
      query: [URLQueryItem(name: "roomId", value: roomId)]
    )
    return response.feedback
  }

  @discardableResult
  func saveFeedback(_ input: FeedbackUpsertRequest) async throws -> MessageFeedback {
    let response: FeedbackUpsertResponse = try await sendJSON(
      method: "POST",
      path: ["api", "feedback"],
      body: input
    )
    return response.feedback
  }

  private func sendJSON<Response: Decodable>(
    method: String,
    path: [String],
    query: [URLQueryItem] = []
  ) async throws -> Response {
    let request = try makeRequest(method: method, path: path, query: query)
    return try await performJSON(request)
  }

  private func sendJSON<Response: Decodable, Body: Encodable>(
    method: String,
    path: [String],
    query: [URLQueryItem] = [],
    body: Body
  ) async throws -> Response {
    let request = try makeRequest(method: method, path: path, query: query, body: body)
    return try await performJSON(request)
  }

  private func performJSON<Response: Decodable>(_ request: URLRequest) async throws -> Response {
    do {
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        throw APIError.invalidHTTPResponse
      }
      guard (200..<300).contains(http.statusCode) else {
        throw serverError(data: data, response: http)
      }
      do {
        return try JSONDecoder().decode(Response.self, from: data)
      } catch {
        throw APIError.responseDecoding
      }
    } catch let error as APIError {
      throw error
    } catch let error as URLError {
      throw APIError.transport(code: error.errorCode, description: error.localizedDescription)
    } catch {
      throw APIError.transport(code: -1, description: error.localizedDescription)
    }
  }

  private func makeRequest(
    method: String,
    path: [String],
    query: [URLQueryItem] = []
  ) throws -> URLRequest {
    var request = URLRequest(url: try makeURL(path: path, query: query))
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  private func makeRequest<Body: Encodable>(
    method: String,
    path: [String],
    query: [URLQueryItem] = [],
    body: Body
  ) throws -> URLRequest {
    var request = try makeRequest(method: method, path: path, query: query)
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    do {
      request.httpBody = try JSONEncoder().encode(body)
    } catch {
      throw APIError.requestEncoding
    }
    return request
  }

  private func makeURL(path: [String], query: [URLQueryItem]) throws -> URL {
    var url = baseURL
    for component in path {
      url.append(path: component)
    }
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
      throw APIError.requestEncoding
    }
    if !query.isEmpty { components.queryItems = query }
    guard let resolved = components.url else { throw APIError.requestEncoding }
    return resolved
  }

  private func serverError(data: Data, response: HTTPURLResponse) -> APIError {
    let decoded = try? JSONDecoder().decode(HTTPErrorEnvelope.self, from: data)
    let details = decoded?.error
    let retryAfter = details?.retryAfterMs ?? response.value(forHTTPHeaderField: "Retry-After")
      .flatMap(Double.init)
      .map { Int(($0 * 1_000).rounded(.up)) }
    let failure = ServerFailure(
      code: details?.code ?? "REQUEST_FAILED",
      message: details?.message ?? "请求失败（\(response.statusCode)）",
      recoverable: details?.recoverable ?? false,
      recoveryAction: details?.recoveryAction ?? .stop,
      outcome: details?.outcome ?? .knownFailed,
      retryAfterMs: retryAfter
    )
    return .server(status: response.statusCode, failure: failure)
  }
}

private struct TurnEventConsumerError: Error {}

private struct HTTPErrorEnvelope: Decodable {
  struct Details: Decodable {
    let code: String?
    let message: String?
    let recoverable: Bool?
    let recoveryAction: RecoveryAction?
    let outcome: FailureOutcome?
    let retryAfterMs: Int?
  }

  let error: Details
}
