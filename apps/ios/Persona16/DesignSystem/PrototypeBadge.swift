import SwiftUI

struct PrototypeBadge: View {
  let character: Character

  var body: some View {
    Label("\(character.type.rawValue) · 大众文化原型", systemImage: "sparkles")
      .font(.caption.weight(.semibold))
      .foregroundStyle(Persona16Theme.accent(for: character.slug))
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(Persona16Theme.accent(for: character.slug).opacity(0.12), in: Capsule())
      .accessibilityLabel(Text("\(character.type.rawValue)，大众文化原型，不是心理诊断"))
  }
}
