import SwiftUI

enum AgentPresentation {
  static func name(for agent: AgentType) -> String {
    Character.catalog.first { $0.type == agent }?.name ?? agent.rawValue
  }

  static func color(for agent: AgentType) -> Color {
    guard let character = Character.catalog.first(where: { $0.type == agent }) else {
      return .accentColor
    }
    return Persona16Theme.accent(for: character.slug)
  }
}
