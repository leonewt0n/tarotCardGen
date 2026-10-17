import type { ServedModel } from "../types.ts"

const LOCAL_HOSTS = new Set(["http://127.0.0.1:11234", "http://localhost:11234"])
const IMAGE_NAME = /flux|krea|mage-?flow|qwen-image|z-image|stable-diffusion|\bsdxl\b|hunyuan|kolors|auraflow|glm-image|diffusion/i
const EMBED_NAME = /embed|minilm|bge-|mxbai-embed|arctic-embed/i

export function resolveBase(input: string): string {
  let trimmed = input.trim().replace(/\/+$/, "")
  trimmed = trimmed.replace(/\/v1$/, "")
  if (!trimmed) trimmed = "http://127.0.0.1:11234"
  if (import.meta.env.DEV && LOCAL_HOSTS.has(trimmed)) return "/openai"
  return trimmed
}

export function isImageModel(model: ServedModel): boolean {
  if (model.capabilities.includes("image")) return true
  if (model.capabilities.length > 0) return false
  return IMAGE_NAME.test(model.name)
}

export function isReaderModel(model: ServedModel): boolean {
  if (model.capabilities.includes("chat")) return true
  if (model.capabilities.length > 0) return false
  if (IMAGE_NAME.test(model.name)) return false
  return !(EMBED_NAME.test(model.name) && !/instruct|chat/i.test(model.name))
}

export function modelLabel(model: ServedModel): string {
  return model.maxModelLen ? `${model.name} · ${String(model.maxModelLen)} ctx` : model.name
}

export function preferModel(models: ServedModel[], current: string): string {
  const readers = models.filter(isReaderModel)
  if (readers.some((model) => model.name === current)) return current
  const ranked = readers.find((model) => /llama|gemma|qwen|mistral|phi/i.test(model.name))
  return (ranked ?? readers[0])?.name ?? ""
}

export function preferPainter(models: ServedModel[], current: string): string {
  const images = models.filter(isImageModel)
  if (current === "none") return "none"
  if (images.some((model) => model.name === current)) return current
  return images[0]?.name ?? "none"
}

type ListedModel = {
  id?: string
  owned_by?: string
  max_model_len?: number
  context_length?: number
  capabilities?: string[]
  meta?: { context_length?: number }
}

export async function fetchCatalog(base: string, apiKey: string, signal?: AbortSignal): Promise<ServedModel[]> {
  const response = await fetch(`${base}/v1/models`, { headers: authHeaders(apiKey), signal })
  if (!response.ok) throw new Error(await readError(response))
  const listed = (await response.json()) as { data?: ListedModel[] }
  return (listed.data ?? [])
    .filter((model) => model.id)
    .map((model) => ({
      name: model.id ?? "",
      ownedBy: model.owned_by ?? "",
      maxModelLen: model.max_model_len ?? model.context_length ?? model.meta?.context_length,
      capabilities: Array.isArray(model.capabilities) ? model.capabilities.filter((item) => typeof item === "string") : [],
    }))
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type ChatChunk = {
  message?: { content?: string; thinking?: string }
}

export async function streamChat(
  base: string,
  apiKey: string,
  body: {
    model: string
    messages: ChatMessage[]
    temperature: number
    maxTokens: number
  },
  onChunk: (chunk: ChatChunk) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.maxTokens,
      stream: true,
    }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  await readSse(response, (data) => {
    const chunk = JSON.parse(data) as {
      error?: { message?: string }
      choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string } }[]
    }
    if (chunk.error?.message) throw new Error(chunk.error.message)
    const delta = chunk.choices?.[0]?.delta
    if (!delta) return
    onChunk({
      message: {
        content: delta.content,
        thinking: delta.reasoning ?? delta.reasoning_content,
      },
    })
  })
}

export async function chatOnce(
  base: string,
  apiKey: string,
  body: {
    model: string
    messages: ChatMessage[]
    temperature: number
    maxTokens: number
    jsonSchema?: unknown
  },
  signal: AbortSignal,
): Promise<string> {
  const payload: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    temperature: body.temperature,
    max_tokens: body.maxTokens,
    stream: false,
  }
  if (body.jsonSchema) {
    payload.response_format = {
      type: "json_schema",
      json_schema: { name: "forged_cards", strict: true, schema: body.jsonSchema },
    }
  }
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify(payload),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  const parsed = (await response.json()) as {
    error?: { message?: string }
    choices?: { message?: { content?: string; reasoning?: string; reasoning_content?: string } }[]
  }
  if (parsed.error?.message) throw new Error(parsed.error.message)
  const message = parsed.choices?.[0]?.message
  const content = message?.content?.trim() ?? ""
  const thinking = (message?.reasoning ?? message?.reasoning_content ?? "").trim()
  if (content.includes("{")) return content
  if (thinking.includes("{")) return thinking
  return content || thinking
}

export async function generateImage(
  base: string,
  apiKey: string,
  body: { model: string; prompt: string; width: number; height: number; steps: number },
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      model: body.model,
      prompt: body.prompt,
      n: 1,
      size: `${String(body.width)}x${String(body.height)}`,
      response_format: "b64_json",
      steps: body.steps,
    }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  const image = imageFromBody(await response.json())
  if (!image) throw new Error("The painter finished without an image.")
  return image
}

export function imageSrc(base64: string): string {
  if (base64.startsWith("data:")) return base64
  return `data:image/png;base64,${base64}`
}

function imageFromBody(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return ""
  const body = parsed as {
    b64_json?: unknown
    data?: unknown
    error?: { message?: string }
  }
  if (body.error?.message) throw new Error(body.error.message)
  if (typeof body.b64_json === "string" && body.b64_json) return body.b64_json
  if (typeof body.data === "string" && body.data) return body.data
  if (!Array.isArray(body.data)) return ""
  const first = body.data[0] as { b64_json?: unknown; url?: unknown } | undefined
  if (typeof first?.b64_json === "string" && first.b64_json) return first.b64_json
  if (typeof first?.url === "string" && first.url.startsWith("data:")) return first.url
  return ""
}

function authHeaders(apiKey: string): HeadersInit {
  const key = apiKey.trim()
  return key ? { Authorization: `Bearer ${key}` } : {}
}

function jsonHeaders(apiKey: string): HeadersInit {
  return { "Content-Type": "application/json", ...authHeaders(apiKey) }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string; detail?: unknown }
    if (typeof body.error === "string" && body.error) return body.error
    if (body.error && typeof body.error === "object" && body.error.message) return body.error.message
    if (typeof body.detail === "string" && body.detail) return body.detail
    if (Array.isArray(body.detail)) {
      const messages = body.detail.map((item) => {
        if (item && typeof item === "object" && "msg" in item) return String(item.msg)
        return String(item)
      })
      const joined = messages.filter(Boolean).join(" ")
      if (joined) return joined
    }
  } catch {
    // The body was plain text.
  }
  return text.trim().slice(0, 320) || `The server returned ${String(response.status)}.`
}

async function readSse(response: Response, onData: (data: string) => void): Promise<void> {
  if (!response.body) throw new Error("The server returned an empty body.")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) emitSse(line, onData)
  }
  emitSse(buffer, onData)
}

function emitSse(line: string, onData: (data: string) => void) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("data:")) return
  const data = trimmed.slice(5).trim()
  if (!data || data === "[DONE]") return
  onData(data)
}
