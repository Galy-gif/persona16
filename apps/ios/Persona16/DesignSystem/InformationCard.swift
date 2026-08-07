import SwiftUI

struct InformationCard<Content: View>: View {
  let title: LocalizedStringKey
  let systemImage: String
  @ViewBuilder let content: Content

  init(
    _ title: LocalizedStringKey,
    systemImage: String,
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.systemImage = systemImage
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label(title, systemImage: systemImage)
        .font(.headline)

      content
        .font(.body)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(Persona16Theme.cardBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
  }
}
