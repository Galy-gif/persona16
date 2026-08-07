import Foundation

enum APIError: Error, Equatable, Sendable {
  case invalidHTTPResponse
  case server(status: Int, failure: ServerFailure)
  case protocolViolation(TurnProtocolError)
  case turnResultUnknown(turnId: String)
  case eventConsumerFailed(turnId: String, terminal: TurnTerminal)
  case transport(code: Int, description: String)
  case responseDecoding
  case requestEncoding
}

extension APIError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .invalidHTTPResponse:
      "服务返回了无法识别的响应。"
    case .server(_, let failure):
      failure.message
    case .protocolViolation(let violation):
      violation.localizedDescription
    case .turnResultUnknown:
      "本轮结果尚未确认，请使用原 Turn 检查最终状态。"
    case .eventConsumerFailed:
      "本轮已确认完成，但本地界面未能处理最终事件。"
    case .transport(_, let description):
      description
    case .responseDecoding:
      "服务响应格式不正确。"
    case .requestEncoding:
      "请求内容无法编码。"
    }
  }
}
