import SwiftUI

struct CharacterDetailView: View {
  let character: Character

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 16) {
        VStack(spacing: 14) {
          CharacterPortrait(character: character, size: 156)

          Text(character.name)
            .font(.largeTitle.bold())

          PrototypeBadge(character: character)

          Text(character.fragment)
            .font(.title3.weight(.medium))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 4)

        InformationCard("怎样看事情", systemImage: "eye") {
          Text(character.pointOfView)
        }

        InformationCard("人物张力", systemImage: "arrow.left.and.right") {
          Text(character.tension)
        }

        InformationCard("相处边界", systemImage: "hand.raised") {
          Text(character.boundary)
        }

        InformationCard("可以这样开场", systemImage: "quote.bubble") {
          VStack(alignment: .leading, spacing: 10) {
            ForEach(character.starters, id: \.self) { starter in
              Label(starter, systemImage: "text.bubble")
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }

        NavigationLink {
          ConversationEntryView(character: character)
        } label: {
          Label("进入对话", systemImage: "bubble.left.and.bubble.right")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(Persona16Theme.accent(for: character.slug))
        .accessibilityHint(Text("创建与\(character.name)的一人房并进入对话"))

        Text("人物基于大众文化原型创作，不用于心理诊断或专业建议。")
          .font(.footnote)
          .foregroundStyle(.tertiary)
          .frame(maxWidth: .infinity, alignment: .center)
          .multilineTextAlignment(.center)
      }
      .padding(16)
    }
    .background(Persona16Theme.appBackground)
    .navigationTitle(character.name)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("character.detail.\(character.slug.rawValue)")
  }
}

#Preview {
  NavigationStack {
    CharacterDetailView(character: Character.catalog[0])
  }
}
