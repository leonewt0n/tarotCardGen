import { useCallback, useEffect, useRef, useState } from "react"
import { FORGE_POSITIONS, spreadById, voiceById } from "../data/spreads.ts"
import { drawCards } from "../lib/draw.ts"
import {
  chatOnce,
  fetchCatalog,
  generateImage,
  imageSrc,
  isImageModel,
  isReaderModel,
  preferModel,
  preferPainter,
  resolveBase,
  streamChat,
} from "../lib/openai.ts"
import {
  FORGE_SCHEMA,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  buildReadingPrompt,
  explainFailure,
  illustrationPrompt,
  parseForgedCards,
  systemPrompt,
} from "../lib/reading.ts"
import { SETTINGS_KEY, clearTable, loadSettings, loadTable, saveTable } from "../lib/storage.ts"
import type { ConnectionState, PlacedCard, Ritual, ServedModel, Settings } from "../types.ts"

const savedTable = loadTable()

export function useArcana() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [models, setModels] = useState<ServedModel[]>([])
  const [connection, setConnection] = useState<ConnectionState>("checking")
  const [connectionError, setConnectionError] = useState("")
  const [ritual, setRitual] = useState<Ritual>(savedTable?.ritual ?? "reading")
  const [question, setQuestion] = useState(savedTable?.question ?? "")
  const [cards, setCards] = useState<PlacedCard[]>(savedTable?.cards ?? [])
  const [revealed, setRevealed] = useState(Boolean(savedTable?.cards.length))
  const [readingRaw, setReadingRaw] = useState(savedTable?.raw ?? "")
  const [thinking, setThinking] = useState(savedTable?.thinking ?? "")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const catalogAbort = useRef<AbortController | null>(null)
  const readingRef = useRef(savedTable?.raw ?? "")
  const thinkingRef = useRef(savedTable?.thinking ?? "")

  const readers = models.filter(isReaderModel)
  const painters = models.filter(isImageModel)
  const canRead = readers.some((model) => model.name === settings.textModel)
  const canPaint = painters.some((model) => model.name === settings.imageModel)
  const [probedBase, setProbedBase] = useState(settings.baseUrl)
  if (probedBase !== settings.baseUrl) {
    setProbedBase(settings.baseUrl)
    setConnection("checking")
    setConnectionError("")
  }

  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => () => abortRef.current?.abort(), [])

  const refresh = useCallback(async (signal: AbortSignal) => {
    const current = settingsRef.current
    try {
      const catalog = await fetchCatalog(resolveBase(current.baseUrl), current.apiKey, signal)
      if (signal.aborted) return
      setModels(catalog)
      setConnection("online")
      setConnectionError("")
      setSettings((prev) => ({
        ...prev,
        textModel: preferModel(catalog, prev.textModel),
        imageModel: preferPainter(catalog, prev.imageModel),
      }))
    } catch (caught) {
      if (signal.aborted) return
      setModels([])
      setConnection("offline")
      setConnectionError(explainFailure(caught) || "mlx-serve is not running.")
    }
  }, [])

  function reconnect() {
    catalogAbort.current?.abort()
    const controller = new AbortController()
    catalogAbort.current = controller
    setConnection("checking")
    setConnectionError("")
    void refresh(controller.signal)
  }

  useEffect(() => {
    const controller = new AbortController()
    catalogAbort.current?.abort()
    catalogAbort.current = controller
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh, settings.baseUrl])

  function patchSettings(patch: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...patch }))
  }

  function alive(runId: number) {
    return runRef.current === runId
  }

  function cancelRun() {
    runRef.current += 1
    abortRef.current?.abort()
    setBusy(false)
    setCards((current) => current.map((card) => ({ ...card, painting: false })))
  }

  function stop() {
    cancelRun()
    setStatus("Stopped.")
  }

  function clear() {
    cancelRun()
    setCards([])
    setRevealed(false)
    setReadingRaw("")
    setThinking("")
    readingRef.current = ""
    thinkingRef.current = ""
    setStatus("")
    setError("")
    clearTable()
  }

  function beginRun() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const runId = runRef.current + 1
    runRef.current = runId
    setBusy(true)
    setError("")
    return { runId, signal: controller.signal }
  }

  function updateCard(runId: number, uid: string, patch: Partial<PlacedCard>, latest: PlacedCard[]) {
    const next = latest.map((card) => (card.uid === uid ? { ...card, ...patch } : card))
    latest.splice(0, latest.length, ...next)
    if (!alive(runId)) return
    setCards(next)
  }

  async function interpret(runId: number, signal: AbortSignal, snapshot: Settings, placed: PlacedCard[], promptQuestion: string) {
    if (!snapshot.interpret || !snapshot.textModel) return
    readingRef.current = ""
    thinkingRef.current = ""
    setReadingRaw("")
    setThinking("")
    setStatus("The reader is speaking…")
    const voice = voiceById(snapshot.voice)
    await streamChat(
      resolveBase(snapshot.baseUrl),
      snapshot.apiKey,
      {
        model: snapshot.textModel,
        messages: [
          { role: "system", content: systemPrompt(placed.length) },
          { role: "user", content: buildReadingPrompt(promptQuestion, placed, snapshot.voice) },
        ],
        temperature: voice.temperature,
        maxTokens: 900,
      },
      (chunk) => {
        if (!alive(runId)) return
        if (chunk.message?.thinking) {
          thinkingRef.current += chunk.message.thinking
          setThinking(thinkingRef.current)
        }
        if (chunk.message?.content) {
          readingRef.current += chunk.message.content
          setReadingRaw(readingRef.current)
        }
      },
      signal,
    )
  }

  async function paint(runId: number, signal: AbortSignal, snapshot: Settings, latest: PlacedCard[], promptQuestion: string) {
    if (!snapshot.paint || !snapshot.imageModel || snapshot.imageModel === "none") return
    const base = resolveBase(snapshot.baseUrl)
    const steps = Math.min(50, Math.max(1, Math.round(snapshot.steps)))
    for (let index = 0; index < latest.length; index += 1) {
      if (!alive(runId) || signal.aborted) return
      const current = latest[index]
      setStatus(`Painting ${current.card.name} (${String(index + 1)} of ${String(latest.length)})…`)
      updateCard(runId, current.uid, { painting: true, progress: null, image: undefined, imageError: undefined }, latest)
      try {
        const image = await generateImage(
          base,
          snapshot.apiKey,
          {
            model: snapshot.imageModel,
            prompt: illustrationPrompt(current, promptQuestion),
            width: IMAGE_WIDTH,
            height: IMAGE_HEIGHT,
            steps,
          },
          signal,
        )
        updateCard(runId, current.uid, { image: imageSrc(image), painting: false, progress: 1 }, latest)
      } catch (caught) {
        updateCard(runId, current.uid, { painting: false, imageError: "The face stayed printed." }, latest)
        throw caught
      }
    }
  }

  function remember(promptQuestion: string, nextRitual: Ritual, latest: PlacedCard[]) {
    saveTable({
      question: promptQuestion,
      ritual: nextRitual,
      raw: readingRef.current,
      thinking: thinkingRef.current,
      cards: latest,
    })
  }

  async function runJob(kind: "lay" | "reread" | "repaint" | "forge") {
    const snapshot = settings
    const promptQuestion = question
    if ((kind === "forge" || kind === "reread") && !snapshot.textModel) {
      setError("This step needs a chat model. Load one in mlx-serve, then reconnect.")
      return
    }
    if (kind === "repaint" && (!snapshot.imageModel || snapshot.imageModel === "none")) {
      setError("Painting needs an image model. Download FLUX.2 or Krea-2 in mlx-serve, then reconnect.")
      return
    }
    if ((kind === "reread" || kind === "repaint") && cards.length === 0) return
    const { runId, signal } = beginRun()
    let latest: PlacedCard[] = cards.map((card) => ({ ...card }))
    let laid = kind === "reread" || kind === "repaint"
    try {
      if (kind === "lay") {
        const spread = spreadById(snapshot.spreadId)
        latest = drawCards(spread.positions)
        setCards(latest)
        setRevealed(false)
        setReadingRaw("")
        setThinking("")
        readingRef.current = ""
        thinkingRef.current = ""
        setStatus("The cards are on the table.")
        laid = true
        window.setTimeout(() => {
          if (alive(runId)) setRevealed(true)
        }, 40)
      }
      if (kind === "forge") {
        setStatus("Designing the cards…")
        setRevealed(false)
        const designed = await designCards(snapshot, promptQuestion, signal)
        if (!alive(runId)) return
        latest = designed
        setCards(latest)
        setReadingRaw("")
        setThinking("")
        readingRef.current = ""
        thinkingRef.current = ""
        laid = true
        window.setTimeout(() => {
          if (alive(runId)) setRevealed(true)
        }, 40)
      }
      if (kind === "lay" || kind === "reread") {
        await interpret(
          runId,
          signal,
          kind === "reread" ? { ...snapshot, interpret: true } : snapshot,
          latest,
          promptQuestion,
        )
      }
      if (kind === "repaint") {
        latest = latest.map((card) => ({ ...card, image: undefined, imageError: undefined, progress: null }))
        setCards(latest)
      }
      if (kind === "lay" || kind === "forge" || kind === "repaint") {
        await paint(runId, signal, { ...snapshot, paint: kind === "repaint" ? true : snapshot.paint }, latest, promptQuestion)
      }
      if (!alive(runId)) return
      setStatus(finishStatus(kind, snapshot))
      remember(promptQuestion, kind === "forge" ? "forge" : ritual, latest)
    } catch (caught) {
      if (!alive(runId)) return
      const message = explainFailure(caught)
      if (message) setError(message)
      setStatus(message ? "The table stopped early." : "Stopped.")
      setCards((current) => current.map((card) => ({ ...card, painting: false })))
      if (laid) remember(promptQuestion, kind === "forge" ? "forge" : ritual, latest)
    } finally {
      if (alive(runId)) setBusy(false)
    }
  }

  return {
    settings,
    patchSettings,
    readers,
    painters,
    connection,
    connectionError,
    reconnect,
    ritual,
    setRitual,
    question,
    setQuestion,
    cards,
    revealed,
    readingRaw,
    thinking,
    status,
    error,
    busy,
    canRead,
    canPaint,
    lay: () => void runJob("lay"),
    forge: () => void runJob("forge"),
    reread: () => void runJob("reread"),
    repaint: () => void runJob("repaint"),
    stop,
    clear,
  }
}

async function designCards(snapshot: Settings, promptQuestion: string, signal: AbortSignal): Promise<PlacedCard[]> {
  const count = snapshot.forgeCount
  const positions = FORGE_POSITIONS[count]
  const voice = voiceById(snapshot.voice)
  const spark = promptQuestion.trim() || "An open omen for this season."
  const messages = [
    {
      role: "system" as const,
      content:
        "You design original tarot cards for one querent. Each card is newly invented and is not a renamed classic card. scene is a picture for an illustrator and must not request letters, numbers, captions, or watermarks. upright and reversed are two sentences each, written in the second person.",
    },
    {
      role: "user" as const,
      content: [
        `Spark: ${spark}`,
        `Invent exactly ${String(count)} card${count === 1 ? "" : "s"}.`,
        count === 3 ? "The three cards form a sequence: what is here, what helps, and what to watch." : "Make the single card specific to the spark.",
        `Voice: ${voice.label}. ${voice.hint}`,
        'Reply as JSON: {"cards":[{"title":"","arcana":"major","numeral":"","epithet":"","symbols":[""],"upright":"","reversed":"","scene":""}]}',
      ].join("\n"),
    },
  ]
  const base = resolveBase(snapshot.baseUrl)
  const attempts = [FORGE_SCHEMA, undefined]
  let lastError: unknown = new Error("The reader did not return any cards.")
  for (const jsonSchema of attempts) {
    try {
      const text = await chatOnce(
        base,
        snapshot.apiKey,
        {
          model: snapshot.textModel,
          messages,
          temperature: voice.temperature,
          maxTokens: 1400,
          jsonSchema,
        },
        signal,
      )
      return parseForgedCards(text, positions)
    } catch (caught) {
      lastError = caught
      if (signal.aborted) throw caught
      const message = caught instanceof Error ? caught.message : ""
      if (/not found|failed to fetch|network/i.test(message)) throw caught
    }
  }
  throw lastError
}

function finishStatus(kind: string, snapshot: Settings): string {
  const willRead = Boolean(snapshot.textModel && (kind === "reread" || snapshot.interpret))
  const willPaint = Boolean(snapshot.imageModel && snapshot.imageModel !== "none" && (kind === "repaint" || snapshot.paint))
  if (kind === "reread") return "The reading is complete."
  if (kind === "repaint") return "The faces are painted."
  if (kind === "forge") return willPaint ? "The forged cards are painted." : "The forged cards are on the table."
  if (willRead && willPaint) return "The reading and the paintings are complete."
  if (willRead) return "The reading is complete."
  if (willPaint) return "The faces are painted."
  return "The printed deck answered."
}
