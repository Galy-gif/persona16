import SwiftUI

struct CharacterPortrait: View {
  let character: Character
  var size: CGFloat = 72

  var body: some View {
    Image(character.imageName)
      .resizable()
      .scaledToFill()
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
          .stroke(Persona16Theme.separator.opacity(0.35), lineWidth: 0.5)
      }
      .shadow(color: Color.primary.opacity(0.08), radius: 8, y: 3)
      .accessibilityLabel(Text("\(character.name)的人物插画"))
  }
}
