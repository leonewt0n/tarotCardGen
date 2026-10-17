export type Family = "major" | "wands" | "cups" | "swords" | "pentacles"

export type TarotCard = {
  id: string
  name: string
  family: Family
  numeral: string
  keywords: string[]
  reversedKeywords: string[]
  meaning: string
  reversedMeaning: string
  scene: string
}

export type CardOrigin = "deck" | "forged"

export type PlacedCard = {
  uid: string
  card: TarotCard
  reversed: boolean
  position: string
  epithet?: string
  origin: CardOrigin
  image?: string
  painting: boolean
  progress: number | null
  imageError?: string
}

export type VoiceId = "grounded" | "lyrical" | "wild"
export type Ritual = "reading" | "forge"
export type SpreadId = "one" | "three" | "crossroads"
export type ConnectionState = "checking" | "online" | "offline"

export type Settings = {
  baseUrl: string
  apiKey: string
  textModel: string
  imageModel: string
  spreadId: SpreadId
  forgeCount: 1 | 3
  voice: VoiceId
  steps: number
  interpret: boolean
  paint: boolean
}

export type ServedModel = {
  name: string
  ownedBy: string
  maxModelLen?: number
  capabilities: string[]
}

export type ParsedReading = {
  overview: string
  guidance: string
  byCard: string[]
}
