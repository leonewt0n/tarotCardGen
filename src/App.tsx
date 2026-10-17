import { useEffect, useRef } from "react"
import { CardView, DeckStack } from "./components/CardView.tsx"
import { Manuscript } from "./components/Manuscript.tsx"
import { SPARKS, SPREADS, VOICES } from "./data/spreads.ts"
import { useArcana } from "./hooks/useArcana.ts"
import { modelLabel } from "./lib/openai.ts"
import type { VoiceId } from "./types.ts"

export default function App() {
  const arcana = useArcana()
  const stageRef = useRef<HTMLElement>(null)
  const wasBusy = useRef(false)

  useEffect(() => {
    if (arcana.busy && !wasBusy.current) {
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    wasBusy.current = arcana.busy
  }, [arcana.busy])

  const paintReady = arcana.settings.paint && arcana.canPaint
  const readReady = arcana.settings.interpret && arcana.canRead

  function submit() {
    if (arcana.ritual === "forge") arcana.forge()
    else arcana.lay()
  }

  return (
    <div className="app">
      <header className="mast">
        <div>
          <p className="eyebrow">On this machine</p>
          <h1>The Local Arcana</h1>
        </div>
        <div className="pills">
          <p className={`pill is-${arcana.connection}`}>{serverLabel(arcana.connection)}</p>
        </div>
      </header>

      <div className="workspace">
        <form
          className="panel"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="ritual" role="tablist" aria-label="Ritual">
            <button
              type="button"
              role="tab"
              aria-selected={arcana.ritual === "reading"}
              className={arcana.ritual === "reading" ? "is-on" : ""}
              onClick={() => arcana.setRitual("reading")}
            >
              Reading
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={arcana.ritual === "forge"}
              className={arcana.ritual === "forge" ? "is-on" : ""}
              onClick={() => arcana.setRitual("forge")}
            >
              Forge
            </button>
          </div>

          <label className="field">
            <span>{arcana.ritual === "forge" ? "Spark" : "Question"}</span>
            <textarea
              rows={4}
              value={arcana.question}
              placeholder={arcana.ritual === "forge" ? "A season, a choice, a symbol…" : "What do you want the cards to sit with?"}
              onChange={(event) => arcana.setQuestion(event.target.value)}
            />
          </label>

          <div className="sparks">
            {SPARKS.map((spark) => (
              <button key={spark} type="button" onClick={() => arcana.setQuestion(spark)}>
                {spark}
              </button>
            ))}
          </div>

          {arcana.ritual === "reading" ? (
            <fieldset className="choices">
              <legend>Spread</legend>
              {SPREADS.map((spread) => (
                <label key={spread.id} className={arcana.settings.spreadId === spread.id ? "choice is-on" : "choice"}>
                  <input
                    type="radio"
                    name="spread"
                    value={spread.id}
                    checked={arcana.settings.spreadId === spread.id}
                    onChange={() => arcana.patchSettings({ spreadId: spread.id })}
                  />
                  <strong>{spread.name}</strong>
                  <small>{spread.detail}</small>
                </label>
              ))}
            </fieldset>
          ) : (
            <fieldset className="choices">
              <legend>How many</legend>
              {[1, 3].map((count) => (
                <label key={count} className={arcana.settings.forgeCount === count ? "choice is-on" : "choice"}>
                  <input
                    type="radio"
                    name="forge-count"
                    value={count}
                    checked={arcana.settings.forgeCount === count}
                    onChange={() => arcana.patchSettings({ forgeCount: count as 1 | 3 })}
                  />
                  <strong>{count === 1 ? "One card" : "Three cards"}</strong>
                  <small>{count === 1 ? "A single invention" : "Here, help, watch"}</small>
                </label>
              ))}
            </fieldset>
          )}

          <label className="field">
            <span>Voice</span>
            <select
              value={arcana.settings.voice}
              onChange={(event) => arcana.patchSettings({ voice: event.target.value as VoiceId })}
            >
              {VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Reader</span>
            <select
              value={arcana.readers.some((model) => model.name === arcana.settings.textModel) ? arcana.settings.textModel : ""}
              onChange={(event) => arcana.patchSettings({ textModel: event.target.value })}
            >
              {arcana.readers.length === 0 && <option value="">No chat model installed</option>}
              {arcana.readers.map((model) => (
                <option key={model.name} value={model.name}>
                  {modelLabel(model)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Painter</span>
            <select
              value={
                arcana.painters.some((model) => model.name === arcana.settings.imageModel)
                  ? arcana.settings.imageModel
                  : "none"
              }
              onChange={(event) => arcana.patchSettings({ imageModel: event.target.value })}
            >
              <option value="none">Printed faces</option>
              {arcana.painters.map((model) => (
                <option key={model.name} value={model.name}>
                  {modelLabel(model)}
                </option>
              ))}
            </select>
          </label>

          {arcana.canPaint && (
            <label className="field">
              <span>Paint steps · {arcana.settings.steps}</span>
              <input
                type="range"
                min={4}
                max={50}
                step={1}
                value={arcana.settings.steps}
                onChange={(event) => arcana.patchSettings({ steps: Number(event.target.value) })}
              />
            </label>
          )}

          <div className="checks">
            {arcana.ritual === "reading" && (
              <label>
                <input
                  type="checkbox"
                  checked={arcana.settings.interpret}
                  disabled={!arcana.canRead}
                  onChange={(event) => arcana.patchSettings({ interpret: event.target.checked })}
                />
                Ask the reader
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={arcana.settings.paint}
                disabled={!arcana.canPaint}
                onChange={(event) => arcana.patchSettings({ paint: event.target.checked })}
              />
              Paint the faces
            </label>
          </div>

          <p className="hint">{expectation(arcana.ritual, readReady, paintReady, arcana.canRead)}</p>

          <label className="field">
            <span>Server</span>
            <span className="address-row">
              <input
                type="text"
                value={arcana.settings.baseUrl}
                spellCheck={false}
                onChange={(event) => arcana.patchSettings({ baseUrl: event.target.value })}
              />
              <button type="button" className="ghost" onClick={arcana.reconnect}>
                Reconnect
              </button>
            </span>
          </label>
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={arcana.settings.apiKey}
              spellCheck={false}
              autoComplete="off"
              placeholder="Leave empty on this Mac"
              onChange={(event) => arcana.patchSettings({ apiKey: event.target.value })}
              onBlur={arcana.reconnect}
            />
          </label>
          {arcana.connectionError ? <p className="banner">{arcana.connectionError}</p> : null}
          {arcana.connection === "online" && arcana.readers.length === 0 ? (
            <p className="hint">
              Load a chat model, then reconnect. <code>mlx-serve serve</code>
            </p>
          ) : null}
          {arcana.connection === "online" && arcana.painters.length === 0 ? (
            <p className="hint">Painting is optional. Download FLUX.2 or Krea-2 in mlx-serve.</p>
          ) : null}

          <div className="actions">
            <button type="submit" className="primary" disabled={arcana.busy}>
              {arcana.busy ? "Working…" : arcana.ritual === "forge" ? "Forge the cards" : "Lay the cards"}
            </button>
            {arcana.busy && (
              <button type="button" className="ghost" onClick={arcana.stop}>
                Stop
              </button>
            )}
          </div>

          {arcana.cards.length > 0 && !arcana.busy && (
            <div className="actions secondary">
              <button type="button" className="ghost" disabled={!arcana.canRead} onClick={arcana.reread}>
                Read again
              </button>
              <button type="button" className="ghost" disabled={!arcana.canPaint} onClick={arcana.repaint}>
                Paint again
              </button>
              <button type="button" className="ghost" onClick={arcana.clear}>
                Clear
              </button>
            </div>
          )}

          {arcana.error ? <p className="banner">{arcana.error}</p> : null}
          <p className="trust">
            The shuffle stays in the browser. Readings and paintings go to mlx-serve.
          </p>
        </form>

        <section className="stage" ref={stageRef} aria-busy={arcana.busy}>
          {arcana.status ? (
            <p className="table-status" role="status">
              {arcana.status}
            </p>
          ) : (
            <p className="table-status quiet">78 cards · upright and reversed</p>
          )}
          <div className={arcana.cards.length ? "felt" : "felt is-empty"}>
            {arcana.cards.length === 0 ? (
              <DeckStack />
            ) : (
              arcana.cards.map((placed, index) => (
                <CardView key={placed.uid} placed={placed} revealed={arcana.revealed} index={index} />
              ))
            )}
          </div>
          {arcana.cards.length > 0 && (
            <Manuscript question={arcana.question} cards={arcana.cards} raw={arcana.readingRaw} thinking={arcana.thinking} />
          )}
        </section>
      </div>
    </div>
  )
}

function serverLabel(connection: string) {
  if (connection === "checking") return "mlx-serve …"
  if (connection === "online") return "mlx-serve online"
  return "mlx-serve offline"
}

function expectation(ritual: string, readReady: boolean, paintReady: boolean, canRead: boolean) {
  if (ritual === "forge") {
    if (!canRead) return "Forge needs a chat model from mlx-serve."
    if (paintReady) return "A local chat model invents the cards, then an image model paints them one at a time."
    return "A local chat model invents the cards. The faces stay printed."
  }
  if (readReady && paintReady) return "The browser shuffles the deck. The chat model reads the spread, then the image model paints each card."
  if (readReady) return "The browser shuffles the deck, then the chat model reads the spread."
  if (paintReady) return "The browser shuffles the deck, then the image model paints each card."
  return "The browser shuffles the 78-card deck and shows the printed meanings."
}
