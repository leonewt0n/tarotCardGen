import type { ParsedReading, PlacedCard, VoiceId } from "../types.ts"
import { voiceById } from "../data/spreads.ts"

export const IMAGE_WIDTH = 512
export const IMAGE_HEIGHT = 768

export function systemPrompt(count: number): string {
  const cards = Array.from(
    { length: count },
    (_, index) => `CARD ${String(index + 1)}\n<two to four sentences about only card ${String(index + 1)}>`,
  ).join("\n\n")
  return [
    "You are the reader at a private tarot table. You treat the cards as a symbolic mirror for the querent's question.",
    "You do not claim supernatural certainty. You never give medical, legal, or financial instructions. You never invent cards that were not drawn.",
    "Write in the second person. Use exactly these headings, each on its own line, with no markdown and no preamble:",
    "",
    "OVERVIEW",
    "<one paragraph tying the question to the whole spread>",
    "",
    cards,
    "",
    "GUIDANCE",
    "<one short paragraph the querent could act on this week>",
  ].join("\n")
}

export function buildReadingPrompt(question: string, cards: PlacedCard[], voice: VoiceId): string {
  const selected = voiceById(voice)
  const drawn = cards.map((placed, index) => {
    const keywords = placed.reversed ? placed.card.reversedKeywords : placed.card.keywords
    const anchor = placed.reversed ? placed.card.reversedMeaning : placed.card.meaning
    return [
      `Drawn card ${String(index + 1)}: ${placed.position} — ${placed.card.name} (${placed.reversed ? "reversed" : "upright"})`,
      placed.epithet ? `Epithet: ${placed.epithet}` : "",
      `Keywords: ${keywords.join(", ")}`,
      `Anchor, which you may deepen but should not ignore: ${anchor}`,
    ]
      .filter(Boolean)
      .join("\n")
  })
  return [
    `Question: ${question.trim() || "The querent asked for a general reading, with no specific question."}`,
    `Voice: ${selected.label}. ${selected.hint}`,
    `There are ${String(cards.length)} cards. Write CARD 1 through CARD ${String(cards.length)}.`,
    "",
    drawn.join("\n\n"),
  ].join("\n")
}

export function parseReading(raw: string, count: number): ParsedReading {
  const normalized = raw.replace(/\r/g, "").replace(/^#{1,6}\s+/gm, "").replace(/^\*\*(.*?)\*\*\s*$/gm, "$1")
  const pattern = "OVERVIEW|GUIDANCE|CARD \\d+"
  const section = (label: string) => {
    const expression = new RegExp(
      `(?:^|\\n)\\s*${label}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:${pattern})\\b|$)`,
      "i",
    )
    return normalized.match(expression)?.[1]?.trim() ?? ""
  }
  return {
    overview: section("OVERVIEW"),
    guidance: section("GUIDANCE"),
    byCard: Array.from({ length: count }, (_, index) => section(`CARD ${String(index + 1)}`)),
  }
}

export function readingPlain(question: string, cards: PlacedCard[], parsed: ParsedReading, raw: string): string {
  const structured = parsed.overview || parsed.guidance || parsed.byCard.some(Boolean)
  if (!structured) return raw.trim()
  const parts = [`Question: ${question.trim() || "An open reading"}`, ""]
  if (parsed.overview) parts.push(parsed.overview, "")
  cards.forEach((placed, index) => {
    const line = parsed.byCard[index] || (placed.reversed ? placed.card.reversedMeaning : placed.card.meaning)
    parts.push(`${placed.position} — ${placed.card.name}${placed.reversed ? ", reversed" : ""}`, line, "")
  })
  if (parsed.guidance) parts.push(parsed.guidance)
  return parts.join("\n").trim()
}

export function illustrationPrompt(placed: PlacedCard, question: string): string {
  const mood = question.trim().slice(0, 180)
  return [
    `Vertical tarot card painting of ${placed.card.name}.`,
    placed.card.scene,
    placed.reversed ? "The atmosphere is shadowed and slightly unsettled." : "The atmosphere is clear and intentional.",
    mood ? `Let the mood faintly echo this question, without writing it: ${mood}` : "",
    "Painterly, symbolic, muted rich color, thin ornamental border, no text, no letters, no numbers, no watermark, no signature.",
  ]
    .filter(Boolean)
    .join(" ")
}

const FAMILIES = new Set(["major", "wands", "cups", "swords", "pentacles"])

export function parseForgedCards(text: string, positions: string[]): PlacedCard[] {
  const parsed = extractJson(text) as { cards?: unknown } | unknown[]
  const list = Array.isArray(parsed) ? parsed : parsed.cards
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("The reader did not return any cards. Try a model that can follow a JSON shape.")
  }
  return list.slice(0, positions.length).map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const familyValue = String(row.family ?? row.arcana ?? "major").toLowerCase()
    const family = FAMILIES.has(familyValue) ? familyValue : "major"
    const symbols = Array.isArray(row.symbols) ? row.symbols.map((symbol) => String(symbol)).filter(Boolean).slice(0, 4) : []
    const name = textField(row.title, `Untitled ${String(index + 1)}`)
    const keywords = symbols.length >= 2 ? symbols.slice(0, 3) : ["sign", "omen"]
    return {
      uid: crypto.randomUUID(),
      origin: "forged" as const,
      reversed: false,
      position: positions[index] ?? `Card ${String(index + 1)}`,
      epithet: textField(row.epithet, ""),
      painting: false,
      progress: null,
      card: {
        id: `forged-${String(index)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        family: family as PlacedCard["card"]["family"],
        numeral: textField(row.numeral, String(index + 1)),
        keywords,
        reversedKeywords: keywords,
        meaning: textField(row.upright, ""),
        reversedMeaning: textField(row.reversed, ""),
        scene: textField(row.scene, `A symbolic figure representing ${name}, arranged as a tarot card`),
      },
    }
  })
}

export const FORGE_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          arcana: { type: "string", enum: ["major", "wands", "cups", "swords", "pentacles"] },
          numeral: { type: "string" },
          epithet: { type: "string" },
          symbols: { type: "array", items: { type: "string" } },
          upright: { type: "string" },
          reversed: { type: "string" },
          scene: { type: "string" },
        },
        required: ["title", "arcana", "numeral", "epithet", "symbols", "upright", "reversed", "scene"],
      },
    },
  },
  required: ["cards"],
} as const

function textField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1] ?? text
  const start = source.indexOf("{")
  const end = source.lastIndexOf("}")
  if (start < 0 || end <= start) {
    const arrayStart = source.indexOf("[")
    const arrayEnd = source.lastIndexOf("]")
    if (arrayStart < 0 || arrayEnd <= arrayStart) {
      throw new Error("The reader did not return JSON. Try the forge again, or choose another text model.")
    }
    return JSON.parse(source.slice(arrayStart, arrayEnd + 1)) as unknown
  }
  return JSON.parse(source.slice(start, end + 1)) as unknown
}

export function explainFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return ""
  if (!(error instanceof Error)) return "Something went wrong while talking to mlx-serve."
  if (error.name === "AbortError") return ""
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "Could not reach mlx-serve. Start it with mlx-serve serve, then reconnect."
  }
  if (/no image model|does not support image|images\/generations|unknown model/i.test(error.message)) {
    return "mlx-serve has no image model ready. Download FLUX.2 or Krea-2 in the app. The reading and the printed faces still work."
  }
  return error.message
}
