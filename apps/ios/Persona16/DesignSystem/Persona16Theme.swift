import SwiftUI

enum Persona16Theme {
  static let appBackground = Color(uiColor: .systemGroupedBackground)
  static let cardBackground = Color(uiColor: .secondarySystemGroupedBackground)
  static let separator = Color(uiColor: .separator)

  static func accent(for slug: CharacterSlug) -> Color {
    switch slug {
    case .linHeng: .blue
    case .xiaXu: .orange
    case .zhouHe: .green
    case .xuYe: .purple
    }
  }
}
