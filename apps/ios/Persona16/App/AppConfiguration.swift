import Foundation
import SwiftUI

struct AppConfiguration: Equatable, Sendable {
  let apiBaseURL: URL

  init(bundle: Bundle = .main) throws {
    guard let rawValue = bundle.object(forInfoDictionaryKey: "Persona16APIBaseURL") as? String,
          !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AppConfigurationError.missingAPIBaseURL
    }

    guard let components = URLComponents(string: rawValue),
          let url = components.url,
          let scheme = components.scheme?.lowercased(),
          components.host != nil else {
      throw AppConfigurationError.invalidAPIBaseURL
    }

#if DEBUG
    let isLocalHTTP = scheme == "http" && components.host?.lowercased() == "localhost"
    guard scheme == "https" || isLocalHTTP else {
      throw AppConfigurationError.insecureNonLocalDebugURL
    }
#else
    guard scheme == "https" else {
      throw AppConfigurationError.insecureReleaseURL
    }
    guard components.host?.lowercased().hasSuffix(".invalid") == false else {
      throw AppConfigurationError.releasePlaceholderURL
    }
#endif

    apiBaseURL = url
  }
}

enum AppConfigurationError: LocalizedError {
  case missingAPIBaseURL
  case invalidAPIBaseURL
  case insecureNonLocalDebugURL
  case insecureReleaseURL
  case releasePlaceholderURL

  var errorDescription: String? {
    switch self {
    case .missingAPIBaseURL:
      "构建配置缺少 API 地址。"
    case .invalidAPIBaseURL:
      "构建配置中的 API 地址无效。"
    case .insecureNonLocalDebugURL:
      "Debug 的 HTTP API 只允许使用 localhost。"
    case .insecureReleaseURL:
      "Release 的 API 地址必须使用 HTTPS。"
    case .releasePlaceholderURL:
      "Release 仍在使用占位 API 地址。"
    }
  }
}

private struct Persona16APIBaseURLKey: EnvironmentKey {
  static let defaultValue: URL? = nil
}

extension EnvironmentValues {
  var persona16APIBaseURL: URL? {
    get { self[Persona16APIBaseURLKey.self] }
    set { self[Persona16APIBaseURLKey.self] = newValue }
  }
}
