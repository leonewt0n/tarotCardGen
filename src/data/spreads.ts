import type { SpreadId, VoiceId } from "../types.ts"

export const SPREADS: {
  id: SpreadId
  name: string
  detail: string
  positions: string[]
}[] = [
  {
    id: "one",
    name: "One card",
    detail: "A single signal",
    positions: ["The signal"],
  },
  {
    id: "three",
    name: "Three cards",
    detail: "Past, present, future",
    positions: ["Past", "Present", "Future"],
  },
  {
    id: "crossroads",
    name: "Crossroads",
    detail: "Five cards around a choice",
    positions: ["The heart", "What crosses you", "Above you", "Beneath you", "The road ahead"],
  },
]

export const FORGE_POSITIONS: Record<1 | 3, string[]> = {
  1: ["The made card"],
  3: ["What is here", "What helps", "What to watch"],
}

export const VOICES: {
  id: VoiceId
  label: string
  temperature: number
  hint: string
}[] = [
  {
    id: "grounded",
    label: "Grounded",
    temperature: 0.55,
    hint: "Speak plainly. Prefer concrete life over mystic fog.",
  },
  {
    id: "lyrical",
    label: "Lyrical",
    temperature: 0.85,
    hint: "Use a few vivid images, then land on something practical.",
  },
  {
    id: "wild",
    label: "Wild",
    temperature: 1.12,
    hint: "Be surprising and associative, but stay with these exact cards.",
  },
]

export const SPARKS = [
  "What wants to begin?",
  "Where am I holding on too tightly?",
  "What should I tend this month?",
]

export function spreadById(id: SpreadId) {
  return SPREADS.find((spread) => spread.id === id) ?? SPREADS[1]
}

export function voiceById(id: VoiceId) {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[1]
}
