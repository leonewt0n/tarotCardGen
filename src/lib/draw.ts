import { CARDS } from "../data/deck.ts"
import type { PlacedCard } from "../types.ts"

export function drawCards(positions: string[], random: () => number = Math.random): PlacedCard[] {
  const deck = [...CARDS]
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = deck[index]
    deck[index] = deck[swapIndex]
    deck[swapIndex] = current
  }
  return positions.map((position, index) => ({
    uid: crypto.randomUUID(),
    card: deck[index],
    reversed: random() < 0.3,
    position,
    origin: "deck" as const,
    painting: false,
    progress: null,
  }))
}
