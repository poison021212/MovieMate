function envInt(name, fallback) {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function getPromptBudgets() {
  return {
    system: envInt('LLM_PROMPT_BUDGET_SYSTEM', 4000),
    history: envInt('LLM_PROMPT_BUDGET_HISTORY', 6000),
    tool: envInt('LLM_PROMPT_BUDGET_TOOL', 2000),
    total: envInt('LLM_PROMPT_BUDGET_TOTAL', 16000),
  }
}

function contentLen(message) {
  return String(message?.content || '').length
}

function totalChars(messages) {
  return (messages || []).reduce((sum, m) => sum + contentLen(m), 0)
}

function lastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i
  }
  return -1
}

function hasToolCalls(message) {
  return Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
}

/**
 * Character-budget trim: keep current user message and newest tool results.
 * Does not mutate the input array.
 */
function applyPromptBudget(messages) {
  const budget = getPromptBudgets()
  const out = (messages || []).map((m) => ({
    ...m,
    content: m.content == null ? '' : String(m.content),
  }))

  const lastUserIdx = lastUserIndex(out)

  for (const m of out) {
    if (m.role === 'system' && m.content.length > budget.system) {
      m.content = m.content.slice(0, budget.system)
    }
    if (m.role === 'tool' && m.content.length > budget.tool) {
      m.content = m.content.slice(0, budget.tool)
    }
  }

  let historyChars = 0
  const historyIdx = []
  out.forEach((m, i) => {
    if (i === lastUserIdx) return
    if (m.role === 'user' || m.role === 'assistant') {
      historyIdx.push(i)
      historyChars += m.content.length
    }
  })
  for (const i of historyIdx) {
    if (historyChars <= budget.history) break
    historyChars -= out[i].content.length
    out[i].content = ''
  }

  const kept = out.filter((m, i) => {
    if (i === lastUserIdx) return true
    if (m.role === 'system' || m.role === 'tool') return true
    if (m.role === 'assistant' && hasToolCalls(m)) return true
    return Boolean(m.content)
  })

  const dropOldestHistory = () => {
    const lu = lastUserIndex(kept)
    const idx = kept.findIndex((m, i) => {
      if (i === 0 || i === lu) return false
      if (m.role === 'system' || m.role === 'tool') return false
      if (m.role === 'assistant' && hasToolCalls(m)) return false
      return m.role === 'user' || m.role === 'assistant'
    })
    if (idx === -1) return false
    kept.splice(idx, 1)
    return true
  }

  while (totalChars(kept) > budget.total && kept.length > 2) {
    if (!dropOldestHistory()) break
  }

  if (totalChars(kept) > budget.total) {
    for (const m of kept) {
      if (m.role !== 'tool') continue
      const overflow = totalChars(kept) - budget.total
      if (overflow <= 0) break
      if (m.content.length <= overflow) m.content = ''
      else m.content = m.content.slice(0, m.content.length - overflow)
    }
  }

  return kept
}

module.exports = {
  applyPromptBudget,
  getPromptBudgets,
}
