import { useState } from "react"
import { parseReading, readingPlain } from "../lib/reading.ts"
import type { ParsedReading, PlacedCard } from "../types.ts"

export function Manuscript({
  question,
  cards,
  raw,
  thinking,
}: {
  question: string
  cards: PlacedCard[]
  raw: string
  thinking: string
}) {
  const [copied, setCopied] = useState(false)
  const parsed = parseReading(raw, cards.length)
  const structured = Boolean(parsed.overview || parsed.guidance || parsed.byCard.some(Boolean))

  async function copy() {
    try {
      await navigator.clipboard.writeText(readingPlain(question, cards, parsed, raw))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="manuscript">
      <div className="manuscript-head">
        <h2>The reading</h2>
        <button type="button" className="ghost" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {question.trim() ? <p className="asked">Asked: {question.trim()}</p> : <p className="asked">An open reading</p>}
      {parsed.overview ? <p className="overview">{parsed.overview}</p> : null}
      <div className="entries">
        {cards.map((placed, index) => (
          <article key={placed.uid}>
            <h3>
              {placed.position}
              <span>
                {placed.card.name}
                {placed.reversed ? ", reversed" : ""}
              </span>
            </h3>
            <CardBody placed={placed} parsed={parsed} index={index} />
          </article>
        ))}
      </div>
      {parsed.guidance ? <p className="guidance">{parsed.guidance}</p> : null}
      {!structured && raw.trim() ? <p className="overview">{raw.trim()}</p> : null}
      {thinking.trim() ? (
        <details>
          <summary>The reader’s private notes</summary>
          <p>{thinking.trim()}</p>
        </details>
      ) : null}
      {structured && raw.trim() ? (
        <details>
          <summary>Full reply</summary>
          <p>{raw.trim()}</p>
        </details>
      ) : null}
    </section>
  )
}

function CardBody({ placed, parsed, index }: { placed: PlacedCard; parsed: ParsedReading; index: number }) {
  const spoken = parsed.byCard[index]
  if (spoken) {
    return (
      <>
        <p>{spoken}</p>
        <small>From the reader</small>
      </>
    )
  }
  if (placed.origin === "forged") {
    return (
      <>
        <p>{placed.card.meaning}</p>
        {placed.card.reversedMeaning ? (
          <p className="shadow-note">
            <span>Shadow</span> {placed.card.reversedMeaning}
          </p>
        ) : null}
        <small>Written for this card</small>
      </>
    )
  }
  return (
    <>
      <p>{placed.reversed ? placed.card.reversedMeaning : placed.card.meaning}</p>
      <small>From the deck</small>
    </>
  )
}
