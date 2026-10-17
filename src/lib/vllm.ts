import type { ServedModel } from "../types.ts"

const READER_HOSTS = new Set(["http://127.0.0.1:8000", "http://localhost:8000"])
const PAINTER_HOSTS = new Set(["http://127.0.0.1:8001", "http://localhost:8001"])

export function resolveReader(input: string): string {
  return resolveEndpoint(input, "http://127.0.0.1:8000", READER_HOSTS, "/vllm-reader")
}

export function resolvePainter(input: string): string {
  return resolveEndpoint(input, "http://127.0.0.1:8001", PAINTER_HOSTS, "/vllm-painter")
}

function resolveEndpoint(input: string, fallback: string, locals: Set<string>, proxyPath: string): string {
  let trimmed = input.trim().replace(/\/+$/, "")
  trimmed = trimmed.replace(/\/v1$/, "")
  if (!trimmed) trimmed = fallback
  if (import.meta.env.DEV && locals.has(trimmed)) return proxyPath
  return trimmed
}

export function isImageModel(model: ServedModel): boolean {
  return /z-image|flux|qwen-image|stable-diffusion|\bsdxl\b|hunyuanimage|kolors|auraflow|glm-image|diffusion/i.test(model.name)
}

export function isReaderModel(model: ServedModel): boolean {
  if (isImageModel(model)) return false
  return !(/embed|minilm|bge-|mxbai-embed|arctic-embed/i.test(model.name) && !/instruct|chat/i.test(model.name))
}

export function modelLabel(model: ServedModel): string {
  return model.maxModelLen ? `${model.name} · ${String(model.maxModelLen)} ctx` : model.name
}

export function preferModel(models: ServedModel[], current: string): string {
  if (models.some((model) => model.name === current)) return current
  const ranked = models.find((model) => /llama|gemma|qwen|mistral|phi/i.test(model.name) && !isImageModel(model))
  return (ranked ?? models[0])?.name ?? ""
}

export function preferPainter(models: ServedModel[], current: string): string {
  if (current === "none") return "none"
  if (models.some((model) => model.name === current)) return current
  const ranked = models.find((model) => isImageModel(model))
  return (ranked ?? models[0])?.name ?? "none"
}

export function painterChoices(models: ServedModel[]): ServedModel[] {
  const images = models.filter(isImageModel)
  return images.length > 0 ? images : models
}

export async function fetchCatalog(base: string, apiKey: string, signal?: AbortSignal): Promise<{ version: string; models: ServedModel[] }> {
  const [versionResponse, modelsResponse] = await Promise.all([
    fetch(`${base}/version`, { headers: authHeaders(apiKey), signal }),
    fetch(`${base}/v1/models`, { headers: authHeaders(apiKey), signal }),
  ])
  if (!modelsResponse.ok) throw new Error(await readError(modelsResponse))
  const listed = (await modelsResponse.json()) as {
    data?: { id?: string; owned_by?: string; max_model_len?: number }[]
  }
  let version = ""
  if (versionResponse.ok) {
    const body = (await versionResponse.json()) as { version?: string } | string
    version = typeof body === "string" ? body : (body.version ?? "")
  }
  const models = (listed.data ?? [])
    .filter((model) => model.id)
    .map((model) => ({
      name: model.id ?? "",
      ownedBy: model.owned_by ?? "",
      maxModelLen: model.max_model_len,
    }))
  return { version, models }
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
      size: `${String(body.width)}x${String(body.height)}`,
      n: 1,
      response_format: "b64_json",
      num_inference_steps: body.steps,
      negative_prompt: "text, letters, numbers, watermark, signature, blurry, low quality",
    }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  const parsed = (await response.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } }
  if (parsed.error?.message) throw new Error(parsed.error.message)
  const image = parsed.data?.[0]?.b64_json
  if (!image) throw new Error("The painter finished without an image.")
  return image
}

export function imageSrc(base64: string): string {
  if (base64.startsWith("data:")) return base64
  return `data:image/png;base64,${base64}`
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
  return text.trim().slice(0, 320) || `vLLM returned ${String(response.status)}.`
}

async function readSse(response: Response, onData: (data: string) => void): Promise<void> {
  if (!response.body) throw new Error("vLLM returned an empty body.")
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
