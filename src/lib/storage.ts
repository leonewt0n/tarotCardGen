import type { PlacedCard, Ritual, Settings, SpreadId, VoiceId } from "../types.ts"

export const SETTINGS_KEY = "local-arcana-settings"
export const LAST_KEY = "local-arcana-last"

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "http://127.0.0.1:11234",
  apiKey: "",
  textModel: "",
  imageModel: "",
  spreadId: "three",
  forgeCount: 1,
  voice: "lyrical",
  steps: 9,
  interpret: true,
  paint: true,
}

function savedBase(parsed: Partial<Settings> & { readerUrl?: string }): string {
  const candidates = [parsed.baseUrl, parsed.readerUrl]
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    const trimmed = candidate.trim().replace(/\/+$/, "").replace(/\/v1$/, "")
    if (!trimmed || /:(8000|8001|11434)$/.test(trimmed)) continue
    return trimmed
  }
  return DEFAULT_SETTINGS.baseUrl
}

const SPREADS = new Set<SpreadId>(["one", "three", "crossroads"])
const VOICES = new Set<VoiceId>(["grounded", "lyrical", "wild"])
const RITUALS = new Set<Ritual>(["reading", "forge"])

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings> & { readerUrl?: string; painterUrl?: string }
    const forgeCount = parsed.forgeCount === 3 ? 3 : 1
    const steps = Number(parsed.steps)
    return {
      baseUrl: savedBase(parsed),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      textModel: typeof parsed.textModel === "string" ? parsed.textModel : "",
      imageModel: typeof parsed.imageModel === "string" ? parsed.imageModel : "",
      spreadId: parsed.spreadId && SPREADS.has(parsed.spreadId) ? parsed.spreadId : DEFAULT_SETTINGS.spreadId,
      voice: parsed.voice && VOICES.has(parsed.voice) ? parsed.voice : DEFAULT_SETTINGS.voice,
      forgeCount,
      steps: Number.isFinite(steps) ? Math.min(50, Math.max(1, Math.round(steps))) : DEFAULT_SETTINGS.steps,
      interpret: parsed.interpret ?? true,
      paint: parsed.paint ?? true,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export type SavedTable = {
  question: string
  ritual: Ritual
  raw: string
  thinking: string
  cards: PlacedCard[]
}

export function loadTable(): SavedTable | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedTable
    if (!parsed || !Array.isArray(parsed.cards) || !RITUALS.has(parsed.ritual)) return null
    const cards = parsed.cards.filter((card) => card?.card?.name && card.uid && card.position)
    if (!cards.length) return null
    return {
      question: typeof parsed.question === "string" ? parsed.question : "",
      ritual: parsed.ritual,
      raw: typeof parsed.raw === "string" ? parsed.raw : "",
      thinking: typeof parsed.thinking === "string" ? parsed.thinking : "",
      cards: cards.map((card) => ({
        ...card,
        image: undefined,
        painting: false,
        progress: null,
        imageError: undefined,
        origin: card.origin === "forged" ? "forged" : "deck",
        reversed: Boolean(card.reversed),
      })),
    }
  } catch {
    return null
  }
}

export function saveTable(table: SavedTable) {
  const cards = table.cards.map((card) => ({
    ...card,
    image: undefined,
    painting: false,
    progress: null,
    imageError: undefined,
  }))
  localStorage.setItem(LAST_KEY, JSON.stringify({ ...table, cards }))
}

export function clearTable() {
  localStorage.removeItem(LAST_KEY)
}
