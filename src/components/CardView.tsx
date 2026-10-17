import type { PlacedCard, TarotCard } from "../types.ts"

export function CardView({ placed, revealed, index }: { placed: PlacedCard; revealed: boolean; index: number }) {
  const { card, reversed, position, epithet, image, painting, progress, imageError } = placed
  const keywords = reversed ? card.reversedKeywords : card.keywords
  return (
    <figure className="card-slot">
      <figcaption>{position}</figcaption>
      <div className={revealed ? "card-scene is-revealed" : "card-scene"}>
        <div className="card-inner" style={{ transitionDelay: `${String(index * 90)}ms` }}>
          <div className="card-face card-back" aria-hidden="true">
            <BackMark />
          </div>
          <div className={`card-face card-front family-${card.family}`}>
            <div className={reversed && !image ? "art is-reversed" : "art"}>
              {image ? (
                <img src={image} alt="" className={reversed ? "is-reversed" : undefined} />
              ) : (
                <Emblem card={card} />
              )}
              {painting && (
                <div className={progress == null ? "paint-veil is-unknown" : "paint-veil"}>
                  <span>{progress == null ? "Painting" : `${String(Math.round(progress * 100))}%`}</span>
                  <i style={{ width: progress == null ? undefined : `${String(Math.round(progress * 100))}%` }} />
                </div>
              )}
            </div>
            <div className="nameplate">
              <span>{card.numeral}</span>
              <strong>{card.name}</strong>
              {epithet ? <em>{epithet}</em> : null}
              {reversed ? <b>Reversed</b> : null}
            </div>
          </div>
        </div>
      </div>
      <p className="keywords">{keywords.join(" · ")}</p>
      {imageError ? <p className="card-note">{imageError}</p> : null}
    </figure>
  )
}

export function DeckStack() {
  return (
    <div className="empty-table">
      <div className="stack" aria-hidden="true">
        <div className="mini-back">
          <BackMark />
        </div>
        <div className="mini-back">
          <BackMark />
        </div>
        <div className="mini-back">
          <BackMark />
        </div>
      </div>
      <div>
        <h2>The deck is shuffled in the browser.</h2>
        <p>Ask a question, lay a spread, and let a local model read it. An image model can paint each face after the words.</p>
      </div>
    </div>
  )
}

function Emblem({ card }: { card: TarotCard }) {
  return (
    <svg className="emblem" viewBox="0 0 160 180" aria-hidden="true">
      <circle cx="80" cy="78" r="46" />
      <circle cx="80" cy="78" r="38" />
      {card.family === "wands" && <WandsMark />}
      {card.family === "cups" && <CupsMark />}
      {card.family === "swords" && <SwordsMark />}
      {card.family === "pentacles" && <PentaclesMark />}
      {card.family === "major" && <MajorMark numeral={card.numeral} />}
    </svg>
  )
}

function MajorMark({ numeral }: { numeral: string }) {
  return (
    <>
      <path d="M80 48.5 84.2 70.2 106 74.5 84.2 78.8 80 100.5 75.8 78.8 54 74.5 75.8 70.2Z" />
      <text x="80" y="132" textAnchor="middle">
        {numeral}
      </text>
    </>
  )
}

function WandsMark() {
  return <path d="M80 46v58M68 58c8 8 16 8 24 0M66 108c10-12 18-12 28 0" />
}

function CupsMark() {
  return <path d="M62 58h36c0 18-8 28-18 32-10-4-18-14-18-32Zm18 32v14M66 112h28" />
}

function SwordsMark() {
  return <path d="M80 46v58M80 46l8 10M80 46l-8 10M64 112h32" />
}

function PentaclesMark() {
  return <path d="M80 52 92 88H66Zm0 44 12-36H68Z" />
}

export function BackMark() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="28" />
      <circle cx="60" cy="60" r="18" />
      <path d="M60 24 66.5 53.5 96 60 66.5 66.5 60 96 53.5 66.5 24 60 53.5 53.5Z" />
    </svg>
  )
}
