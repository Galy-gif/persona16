import Foundation

enum AgentType: String, Codable, CaseIterable, Identifiable, Sendable {
  case intj = "INTJ"
  case intp = "INTP"
  case entj = "ENTJ"
  case entp = "ENTP"
  case infj = "INFJ"
  case infp = "INFP"
  case enfj = "ENFJ"
  case enfp = "ENFP"
  case istj = "ISTJ"
  case isfj = "ISFJ"
  case estj = "ESTJ"
  case esfj = "ESFJ"
  case istp = "ISTP"
  case isfp = "ISFP"
  case estp = "ESTP"
  case esfp = "ESFP"

  var id: String { rawValue }
}

enum SpeechType: String, Codable, Sendable {
  case long = "长发言"
  case short = "短句"
  case question = "追问"
  case rebuttal = "反驳"
  case silent = "沉默"
}

enum RoomGoal: String, Codable, CaseIterable, Sendable {
  case hearOpposition = "听见反方"
  case thinkTogether = "陪我想清楚"
  case action = "更有行动感"
  case quiet = "安静一点"
  case freeCollision = "自由碰撞"
}

enum TurnScene: String, Codable, Sendable {
  case help = "求助"
  case vent = "吐槽"
  case conflict = "冲突"
  case decision = "决策"
  case company = "陪伴"
  case creation = "创作"
  case review = "复盘"
  case chat = "闲聊"
}

enum UserEmotion: String, Codable, Sendable {
  case stable = "稳定"
  case low = "低落"
  case vulnerable = "脆弱"
  case agitated = "激动"
  case dangerous = "危险"
}

enum SafetyLevel: String, Codable, Sendable {
  case normal
  case sensitive
  case crisis
  case blocked
}
