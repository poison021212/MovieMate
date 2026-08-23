const DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1/chat/completions'
const DEFAULT_MODEL = 'qwen2.5:7b'
const DEFAULT_TIMEOUT_MS = 90000

function resolveApiKey() {
  return (
    process.env.LLM_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    ''
  ).trim()
}

function resolveBaseUrl() {
  return (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).trim()
}

function resolveModel() {
  return (process.env.LLM_MODEL || DEFAULT_MODEL).trim()
}

function isLocalLlm(baseUrl = resolveBaseUrl()) {
  const url = String(baseUrl || '').toLowerCase()
  return url.includes('127.0.0.1:11434') || url.includes('localhost:11434')
}

function hasLlm() {
  if (resolveApiKey()) return true
  return isLocalLlm()
}

function getLlmConfig() {
  const baseUrl = resolveBaseUrl()
  const apiKey = resolveApiKey()
  return {
    baseUrl,
    model: resolveModel(),
    apiKey,
    isLocal: isLocalLlm(baseUrl),
  }
}

async function readResponseErrorBody(response) {
  try {
    const text = await response.text()
    if (!text) return ''
    try {
      const json = JSON.parse(text)
      const msg = json.error || json.message || (typeof json.error === 'object' ? json.error?.message : null)
      return String(msg || text).slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return ''
  }
}

function buildLlmErrorMessage(status, baseUrl, bodyText, model) {
  const detail = bodyText ? `: ${bodyText}` : ''
  if (isLocalLlm(baseUrl)) {
    if (status === 404) {
      return `LLM 请求失败：Ollama 未找到模型「${model}」。请执行 ollama pull ${model} 或修改 LLM_MODEL`
    }
    if (status === 401 || status === 403) {
      return `LLM 请求失败：Ollama 云模型需登录。请执行 ollama signin 后重试${detail}`
    }
    if (status === 400) {
      return `LLM 请求失败（400）${detail || '：请求参数或 tools 不被该模型支持'}`
    }
    return `LLM 请求失败（${status}）${detail || '：请检查 Ollama 是否运行且模型名正确'}`
  }
  return `LLM 请求失败（${status}）${detail}`
}

function isConnectionError(err) {
  const code = err?.cause?.code || err?.code
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN'
}

function isTimeoutError(err) {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError'
}

async function chatCompletions({
  messages,
  tools,
  temperature = 0.7,
  stream = false,
  signal,
} = {}) {
  if (!hasLlm()) {
    throw new Error('缺少 LLM 配置：请启动本机 Ollama，或设置 LLM_API_KEY')
  }

  const { baseUrl, model, apiKey, isLocal } = getLlmConfig()
  const body = {
    model,
    messages,
    temperature,
    stream,
  }
  if (tools && tools.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  } else if (isLocal) {
    headers.Authorization = 'Bearer ollama'
  }

  const fetchSignal = signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS)

  let response
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: fetchSignal,
    })
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(`LLM 请求超时（${model}，90s）。云模型首包可能较慢，请稍后重试`)
    }
    if (isLocal && isConnectionError(err)) {
      throw new Error(
        'LLM 请求失败：无法连接本机 Ollama。请确认已安装 Ollama 并在运行（ollama serve），且已拉取模型'
      )
    }
    throw err
  }

  if (!response.ok) {
    const bodyText = await readResponseErrorBody(response)
    console.warn('[llmClient] request failed', {
      model,
      status: response.status,
      body: bodyText.slice(0, 200),
    })
    throw new Error(buildLlmErrorMessage(response.status, baseUrl, bodyText, model))
  }

  if (stream) return response

  const data = await response.json()
  return data.choices?.[0]?.message || { role: 'assistant', content: '' }
}

function extractStreamDelta(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed.startsWith('data:')) return { done: false, text: '' }
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return { done: data === '[DONE]', text: '' }
  try {
    const json = JSON.parse(data)
    const text = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || ''
    return { done: Boolean(json.choices?.[0]?.finish_reason), text }
  } catch {
    return { done: false, text: '' }
  }
}

async function* iterateChatCompletionStream(response) {
  if (!response?.body) {
    throw new Error('LLM 流式响应为空')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        const parsed = extractStreamDelta(line)
        if (parsed.text) yield parsed.text
        if (line.trim() === 'data: [DONE]' || line.trim() === 'data:[DONE]') return
      }
    }
    if (buffer) {
      const parsed = extractStreamDelta(buffer)
      if (parsed.text) yield parsed.text
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

async function* chatCompletionsStream(options = {}) {
  const response = await chatCompletions({ ...options, stream: true })
  yield* iterateChatCompletionStream(response)
}

async function chatCompletionsText(options = {}) {
  const message = await chatCompletions(options)
  return message?.content || ''
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  isLocalLlm,
  hasLlm,
  getLlmConfig,
  chatCompletions,
  chatCompletionsStream,
  iterateChatCompletionStream,
  chatCompletionsText,
}
