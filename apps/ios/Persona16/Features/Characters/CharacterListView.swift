import SwiftUI

struct CharacterListView: View {
  private let characters = Character.catalog

  var body: some View {
    List {
      Section {
        Label {
          Text("这里的 16 型只作为大众文化原型，帮助创作人物；不是心理诊断、官方 MBTI® 测评或专业支持的替代品。")
            .font(.footnote)
        } icon: {
          Image(systemName: "info.circle")
            .foregroundStyle(.secondary)
        }
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("characters.prototype-disclosure")
      }

      Section("正典人物") {
        ForEach(characters) { character in
          NavigationLink {
            CharacterDetailView(character: character)
          } label: {
            CharacterRow(character: character)
          }
          .accessibilityLabel(Text("\(character.name)，\(character.type.rawValue) 大众文化原型。\(character.shortFragment)"))
          .accessibilityHint(Text("查看人物详情"))
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("人物")
    .accessibilityIdentifier("characters.list")
  }
}

private struct CharacterRow: View {
  let character: Character

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      CharacterPortrait(character: character)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 5) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(character.name)
            .font(.headline)

          Text(character.type.rawValue)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Persona16Theme.accent(for: character.slug))
        }

        Text(character.shortFragment)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.vertical, 6)
    .contentShape(Rectangle())
  }
}

#Preview {
  NavigationStack {
    CharacterListView()
  }
}
