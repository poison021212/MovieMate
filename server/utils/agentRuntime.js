const db = require('../db/index.js')
const { chatResponse_schema } = require('../schema/ai.js')
const { buildTasteProfile, getProfileFeedMovies, detectChatMode } = require('./recommendCore.js')
const { resolveLocalMovieIdsForCandidates } = require('./movieUpsert.js')
const { getTrendSummary } = require('./analyticsCore.js')
const { hasLlm, chatCompletions, chatCompletionsStream, getLlmConfig } = require('./llmClient.js')
const { applyPromptBudget } = require('./promptBudget.js')

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const MAX_TOOL_ROUNDS = 6
const PLAN_ALLOWED_TOOLS = new Set([
  'get_taste_profile',
  'search_local_movies',
  'search_tmdb',
  'get_movie_detail',
  'get_trend_summary',
  'upsert_and_map_local',
])

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'plan_tasks',
      description: '必须先调用：输出有序工具执行计划',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                tool: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['id', 'tool', 'reason'],
            },
          },
        },
        required: ['steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_taste_profile',
      description: '读取当前登录用户的口味画像（收藏/评论偏好）',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_local_movies',
      description: '在站内 MySQL 片库搜索电影',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '关键词：片名/导演/演员' },
          genre: { type: 'string' },
          minRating: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['q'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tmdb',
      description: '在 TMDB 搜索或发现热门电影',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          mode: { type: 'string', enum: ['search', 'popular', 'top_rated'] },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_movie_detail',
      description: '获取 TMDB 或站内电影详情（含导演/制片人/编剧/主演，用于事实问答）',
      parameters: {
        type: 'object',
        properties: {
          tmdb_id: { type: 'number' },
          local_id: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trend_summary',
      description: '获取平台热播/类型趋势摘要，可用于解释推荐理由',
      parameters: {
        type: 'object',
        properties: {
          genre: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upsert_and_map_local',
      description: '将 TMDB 候选写回本地库并返回 local_movie_id',
      parameters: {
        type: 'object',
        properties: {
          tmdb_ids: { type: 'array', items: { type: 'number' } },
        },
        required: ['tmdb_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_recommend',
      description: '结束本轮对话并输出 reply；recommend 模式需 movies 片单，qa/chat 模式 movies 可为空数组',
      parameters: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          movies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                reason: { type: 'string' },
                year: { type: 'string' },
                tmdb_id: { type: 'number' },
              },
            },
          },
        },
        required: ['reply', 'movies'],
      },
    },
  },
]

function extractTmdbCredits(data) {
  const crew = data.credits?.crew || []
  const cast = data.credits?.cast || []
  const director = crew.find((c) => c.job === 'Director')?.name || null
  const producers = crew
    .filter((c) => c.job === 'Producer' || c.job === 'Executive Producer')
    .map((c) => c.name)
    .slice(0, 5)
  const writers = crew
    .filter((c) => c.job === 'Writer' || c.job === 'Screenplay' || c.job === 'Story')
    .map((c) => c.name)
    .slice(0, 3)
  const castNames = cast.slice(0, 8).map((c) => c.name)
  return { director, producers, writers, cast: castNames }
}

function mapLocalMovieDetail(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    director: row.director || null,
    actors: row.actors || null,
    summary: row.summary || null,
    rating: row.rating != null ? Number(row.rating) : null,
    genre: row.genre || null,
  }
}

const CURRENT_TURN_RULE =
  '重要：只服务【本轮用户消息】的需求；不要因为历史对话去搜无关片名，除非本轮仍在问该片。'

function buildSystemPrompt(chatMode, sessionSummary, feedbackHint) {
  let prompt = ''
  if (chatMode === 'qa') {
    prompt =
      '你是 MovieMate 受控电影问答助手。必须先 plan_tasks，再按计划搜索并 get_movie_detail。' +
      '只能依据工具返回的事实回答（导演/制片人/编剧/主演/简介/剧情等），资料里没有的请明确说无法确认，禁止编造。' +
      '最后 finish_recommend：reply 为中文回答，movies 通常为空或最多 1-2 条指向片名的卡片。' +
      CURRENT_TURN_RULE
  } else if (chatMode === 'chat') {
    prompt =
      '你是 MovieMate 电影话题助手。用户想聊观点、主题、叙事风格等。' +
      '可先 plan_tasks（若无需检索可 steps 为空），点名具体片名时建议 search + get_movie_detail 再讨论。' +
      'finish_recommend 时 movies 通常为空，不要硬推片单；专注有见地的中文对话。' +
      '若已检索到资料，可直接输出中文回复，不必强行推荐片单。' +
      CURRENT_TURN_RULE
  } else {
    prompt =
      '你是 MovieMate 电影推荐 Agent。必须先 plan_tasks，再按计划搜片。' +
      '最后 finish_recommend：movies 需含 title、reason、year、tmdb_id（若来自 TMDB）。禁止编造未检索事实。' +
      CURRENT_TURN_RULE
  }
  if (sessionSummary) {
    prompt += `\n\n【会话记忆摘要】${sessionSummary}`
  }
  if (feedbackHint) {
    prompt += `\n\n【用户近期反馈】\n${feedbackHint}`
  }
  return prompt
}

function buildGroundedReplyFromCtx(ctx, chatMode) {
  const movies = ctx.retrievedMovies || []
  if (movies.length) {
    const m = movies[0]
    const title = m.title || '该片'
    const overview = m.overview || m.summary || ''
    const director = m.director ? `导演：${m.director}。` : ''
    const castHint = m.actors ? `主演：${String(m.actors).slice(0, 80)}。` : ''
    if (chatMode === 'qa') {
      const body = overview
        ? `剧情简介：${overview}`
        : '当前资料中暂无更完整剧情简介，请换关键词或稍后再试。'
      return {
        reply: `《${title}》${director}${castHint}\n\n${body}`,
        movies: [],
      }
    }
    if (chatMode === 'chat') {
      const intro = overview
        ? `《${title}》大致讲的是：${overview.slice(0, 400)}`
        : `已找到《${title}》，但简介较短。你可以问我具体主题、角色或观感。`
      return { reply: intro, movies: [] }
    }
  }
  if (chatMode === 'chat' && ctx.candidates.length) {
    const titles = ctx.candidates
      .slice(0, 3)
      .map((c) => c.title)
      .join('、')
    return {
      reply: `我找到了 ${titles} 等相关影片。你想从哪个角度聊？`,
      movies: [],
    }
  }
  return null
}

function buildNonRecommendFallback(chatMode, ctx, agentTrace) {
  const grounded = buildGroundedReplyFromCtx(ctx, chatMode)
  if (grounded) {
    return {
      reply: grounded.reply,
      movies: grounded.movies || [],
      meta: {
        mode: chatMode,
        degraded: true,
        agentTrace: [...agentTrace, { tool: 'fallback_grounded', ok: true, latencyMs: 0 }],
        sources: ctx?.sources || [],
      },
    }
  }
  const reply =
    chatMode === 'qa'
      ? '暂时无法从片库检索到足够资料回答你的问题，请换个片名或稍后再试。'
      : '暂时无法继续这个话题，请稍后再试。你可以换个说法或指定片名。'
  return {
    reply,
    movies: [],
    meta: {
      mode: chatMode,
      degraded: true,
      agentTrace: [...agentTrace, { tool: 'fallback_non_recommend', ok: true, latencyMs: 0 }],
      sources: ctx?.sources || [],
    },
  }
}

async function tmdbFetch(endpoint) {
  if (!TMDB_TOKEN) throw new Error('缺少 TMDB_ACCESS_TOKEN')
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) throw new Error(`TMDB 请求失败: ${response.status}`)
  return response.json()
}

function mapTmdbCandidate(m) {
  return {
    id: m.id,
    title: m.title,
    year: m.release_date ? String(m.release_date).slice(0, 4) : '未知',
    overview: m.overview,
    vote_average: m.vote_average,
    poster_path: m.poster_path,
  }
}

function extractJSONObject(str) {
  const match = String(str || '').match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function callQwenAgent(messages, useTools = true, stream = false) {
  if (!hasLlm()) {
    throw new Error('缺少 LLM 配置：请启动本机 Ollama，或设置 LLM_API_KEY')
  }
  return chatCompletions({
    messages: applyPromptBudget(messages),
    tools: useTools ? AGENT_TOOLS : undefined,
    temperature: 0.6,
    stream,
  })
}

async function streamWriteUserReply({ convo, chatMode, draftReply, emit }) {
  const hint =
    '根据以上对话与工具结果，用中文写出给用户的最终回复。只输出正文，不要 JSON，不要调用工具。' +
    `当前模式：${chatMode}。不要编造工具未提供的事实。` +
    (chatMode === 'recommend' ? '简要说明推荐理由即可，不必重复罗列完整片单。' : '') +
    (draftReply ? `\n可参考草稿：${String(draftReply).slice(0, 500)}` : '')

  const writeConvo = applyPromptBudget([
    ...convo,
    { role: 'system', content: hint },
  ])

  let full = ''
  for await (const chunk of chatCompletionsStream({
    messages: writeConvo,
    temperature: 0.6,
  })) {
    if (!chunk) continue
    full += chunk
    emit('token', { text: chunk })
  }
  return full.trim()
}

function emitReplyIfStreaming(emit, reply) {
  if (reply) emit('token', { text: reply })
}

async function searchLocalMovies(args) {
  const q = String(args.q || '').trim()
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20)
  const conditions = ['(title LIKE ? OR director LIKE ? OR actors LIKE ?)']
  const params = [`%${q}%`, `%${q}%`, `%${q}%`]
  if (args.genre) {
    conditions.push('genre LIKE ?')
    params.push(`%${args.genre}%`)
  }
  if (args.minRating != null) {
    conditions.push('rating >= ?')
    params.push(Number(args.minRating))
  }
  const [rows] = await db.query(
    `SELECT id, title, genre, year, rating, summary
     FROM movies WHERE ${conditions.join(' AND ')}
     ORDER BY rating DESC LIMIT ?`,
    [...params, limit]
  )
  return { items: rows }
}

async function executeAgentTool(name, args, ctx) {
  switch (name) {
    case 'plan_tasks': {
      const steps = (args.steps || [])
        .filter((s) => s && PLAN_ALLOWED_TOOLS.has(s.tool))
        .slice(0, 6)
      ctx.plan = steps
      ctx.planIndex = 0
      return { steps, count: steps.length }
    }
    case 'get_taste_profile': {
      const profile = ctx.tasteProfile || (await buildTasteProfile(ctx.username))
      ctx.tasteProfile = profile
      ctx.sources.push({ type: 'taste_profile', ok: Boolean(profile) })
      return { profile: profile || { note: '暂无画像' } }
    }
    case 'search_local_movies': {
      const result = await searchLocalMovies(args)
      ctx.sources.push({ type: 'local_search', q: args.q, count: result.items.length })
      return result
    }
    case 'search_tmdb': {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20)
      const mode = args.mode || (args.query ? 'search' : 'popular')
      let results = []
      if (mode === 'search' && args.query) {
        const data = await tmdbFetch(
          `/search/movie?query=${encodeURIComponent(args.query)}&language=zh-CN&page=1`
        )
        results = (data.results || []).slice(0, limit).map(mapTmdbCandidate)
      } else if (mode === 'top_rated') {
        const data = await tmdbFetch('/movie/top_rated?language=zh-CN&page=1')
        results = (data.results || []).slice(0, limit).map(mapTmdbCandidate)
      } else {
        const data = await tmdbFetch('/movie/popular?language=zh-CN&page=1')
        results = (data.results || []).slice(0, limit).map(mapTmdbCandidate)
      }
      ctx.candidates.push(...results)
      const dedup = new Map()
      ctx.candidates.forEach((c) => dedup.set(c.id, c))
      ctx.candidates = [...dedup.values()]
      ctx.sources.push({ type: 'tmdb', mode, count: results.length, ids: results.map((r) => r.id) })
      return { count: results.length, items: results }
    }
    case 'get_movie_detail': {
      if (args.local_id) {
        const [rows] = await db.query('SELECT * FROM movies WHERE id = ? LIMIT 1', [args.local_id])
        const movie = mapLocalMovieDetail(rows[0])
        ctx.sources.push({ type: 'local_detail', local_id: args.local_id })
        if (movie) {
          ctx.retrievedMovies = ctx.retrievedMovies || []
          ctx.retrievedMovies.push(movie)
        }
        return { source: 'local', movie }
      }
      if (args.tmdb_id) {
        const data = await tmdbFetch(`/movie/${args.tmdb_id}?language=zh-CN&append_to_response=credits`)
        const credits = extractTmdbCredits(data)
        ctx.sources.push({ type: 'tmdb_detail', tmdb_id: args.tmdb_id })
        const detailMovie = {
          id: data.id,
          title: data.title,
          year: data.release_date ? String(data.release_date).slice(0, 4) : null,
          overview: data.overview,
          vote_average: data.vote_average,
          ...credits,
        }
        ctx.retrievedMovies = ctx.retrievedMovies || []
        ctx.retrievedMovies.push(detailMovie)
        return {
          source: 'tmdb',
          movie: detailMovie,
        }
      }
      return { error: '需要提供 tmdb_id 或 local_id' }
    }
    case 'get_trend_summary': {
      const summary = await getTrendSummary({ genre: args.genre || '' })
      ctx.sources.push({ type: 'trend_summary', genre: args.genre || '' })
      return summary
    }
    case 'upsert_and_map_local': {
      const ids = Array.isArray(args.tmdb_ids) ? args.tmdb_ids.map(Number).filter(Boolean) : []
      const selected = ctx.candidates.filter((c) => ids.includes(Number(c.id)))
      const localIdByTmdb = await resolveLocalMovieIdsForCandidates(selected)
      ctx.localIdByTmdb = localIdByTmdb
      const mapped = selected.map((c) => ({
        tmdb_id: c.id,
        local_movie_id: localIdByTmdb.get(Number(c.id)) || null,
        title: c.title,
      }))
      ctx.sources.push({ type: 'upsert_map', tmdb_ids: ids, mapped })
      return { mapped }
    }
    case 'finish_recommend':
      return { finished: true, payload: args }
    default:
      return { error: `未知工具: ${name}` }
  }
}

function isToolInPlan(toolName, ctx) {
  if (toolName === 'plan_tasks' || toolName === 'finish_recommend') return true
  if (!ctx.plan || !ctx.plan.length) return false
  const planned = ctx.plan.map((s) => s.tool)
  return planned.includes(toolName)
}

async function runToolWithRetry(toolName, args, ctx, agentTrace, attempt = 1) {
  const started = Date.now()
  try {
    const result = await executeAgentTool(toolName, args, ctx)
    agentTrace.push({
      tool: toolName,
      args,
      ok: true,
      attempt,
      latencyMs: Date.now() - started,
    })
    if (toolName !== 'plan_tasks' && toolName !== 'finish_recommend' && ctx.plan) {
      ctx.planIndex = Math.min(ctx.planIndex + 1, ctx.plan.length)
    }
    return result
  } catch (err) {
    agentTrace.push({
      tool: toolName,
      args,
      ok: false,
      attempt,
      error: err.message,
      latencyMs: Date.now() - started,
    })
    if (attempt < 2) {
      return runToolWithRetry(toolName, args, ctx, agentTrace, attempt + 1)
    }
    if (toolName === 'search_tmdb') {
      const q = args.query || '热门'
      const local = await searchLocalMovies({ q, limit: args.limit || 8 })
      ctx.sources.push({ type: 'degraded_local', from: 'search_tmdb', q })
      agentTrace.push({
        tool: 'search_local_movies',
        args: { q, degraded: true },
        ok: true,
        degraded: true,
        attempt: 1,
        latencyMs: 0,
      })
      return { degraded: true, items: local.items }
    }
    return { error: err.message }
  }
}

function enrichAgentMovies(movies, ctx) {
  return (movies || []).map((movie) => {
    const tmdbId = movie.tmdb_id || movie.id || null
    const candidate = ctx.candidates.find((c) => Number(c.id) === Number(tmdbId))
    const localMovieId = tmdbId ? ctx.localIdByTmdb.get(Number(tmdbId)) || null : null
    return {
      ...movie,
      id: tmdbId,
      tmdb_id: tmdbId,
      local_movie_id: localMovieId,
      poster_path: candidate?.poster_path || null,
      vote_average: candidate?.vote_average || null,
    }
  })
}

async function buildDegradedReply(
  username,
  message,
  tasteProfile,
  chatMode = 'recommend',
  ctx = null,
  agentTrace = [],
  reason = null
) {
  const model = getLlmConfig().model
  const reasonBrief = reason ? String(reason).replace(/^LLM 请求失败[：:]?\s*/i, '').slice(0, 200) : ''
  const reasonPrefix = reasonBrief ? `AI 服务暂不可用（${model}：${reasonBrief}）。` : 'AI 服务暂不可用，'

  if (chatMode === 'qa' || chatMode === 'chat') {
    const grounded = ctx ? buildNonRecommendFallback(chatMode, ctx, agentTrace) : null
    if (grounded?.meta?.agentTrace?.some((t) => t.tool === 'fallback_grounded')) {
      if (reasonBrief) {
        return {
          ...grounded,
          reply: `${reasonPrefix}${grounded.reply}`,
          meta: {
            ...grounded.meta,
            degraded: true,
            llmError: reasonBrief,
          },
        }
      }
      return grounded
    }
    const fallback = buildNonRecommendFallback(
      chatMode,
      ctx || { sources: [], retrievedMovies: [], candidates: [] },
      agentTrace
    )
    if (reasonBrief) {
      return {
        ...fallback,
        reply: `${reasonPrefix}${fallback.reply}`,
        meta: { ...fallback.meta, llmError: reasonBrief },
      }
    }
    return fallback
  }
  const feed = await getProfileFeedMovies(username, 6)
  const movies = (feed?.movies || []).slice(0, 3).map((m) => ({
    title: m.title,
    reason: '基于你的收藏与评论规则召回（Agent 降级）',
    year: m.year || '未知',
    tmdb_id: m.tmdb_id || null,
    local_movie_id: m.id,
    poster_path: m.poster_path || null,
  }))
  const genres = tasteProfile?.topGenres?.join('、') || '综合'
  const titles = movies.map((m) => m.title).join('、') || '暂无'
  return {
    reply: `${reasonPrefix}以下为根据你的口味（${genres}）从本地片库挑选：${titles}。`,
    movies,
    meta: {
      mode: 'recommend',
      degraded: true,
      llmError: reasonBrief || null,
      agentTrace: [
        ...agentTrace,
        { tool: 'degraded_profile_feed', ok: true, degraded: true, latencyMs: 0 },
      ],
      sources: [{ type: 'profile_feed', count: movies.length }],
    },
  }
}

function fallbackFromCandidates(ctx, partialPayload) {
  const picked = ctx.candidates.slice(0, 3).map((c) => ({
    title: c.title,
    reason: partialPayload?.movies?.[0]?.reason || '基于已检索候选的兜底推荐',
    year: c.year || '未知',
    tmdb_id: c.id,
  }))
  return {
    reply: partialPayload?.reply || '已根据检索结果为你挑选以下影片：',
    movies: picked.length ? picked : [{ title: '暂无', reason: '请换关键词重试', year: '', tmdb_id: null }],
  }
}

async function runAgentChatTurnCore({
  message,
  tasteProfile,
  historyMessages,
  username,
  sessionSummary,
  feedbackHint,
  onEvent,
}) {
  const emit = (type, data) => {
    if (typeof onEvent === 'function') onEvent({ type, ...data })
  }

  const chatMode = detectChatMode(message)
  const agentTrace = []
  const ctx = {
    username,
    tasteProfile,
    chatMode,
    candidates: [],
    localIdByTmdb: new Map(),
    retrievedMovies: [],
    plan: null,
    planIndex: 0,
    sources: [],
  }

  const systemPrompt = buildSystemPrompt(chatMode, sessionSummary, feedbackHint)

  const convo = [{ role: 'system', content: systemPrompt }]
  ;(historyMessages || []).slice(-8).forEach((m) => {
    if (m.role === 'user' || m.role === 'assistant') {
      convo.push({ role: m.role, content: m.content })
    }
  })
  convo.push({ role: 'user', content: message })

  let finalPayload = null
  let needsPlan = true

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let assistantMsg
    try {
      assistantMsg = await callQwenAgent(convo, true, false)
    } catch (err) {
      agentTrace.push({
        tool: 'llm_error',
        ok: false,
        error: err.message,
        latencyMs: 0,
      })
      emit('error', { message: err.message })
      const degraded = await buildDegradedReply(
        username,
        message,
        tasteProfile,
        chatMode,
        ctx,
        agentTrace,
        err.message
      )
      emitReplyIfStreaming(emit, degraded.reply)
      emit('done', { result: degraded })
      return degraded
    }

    const toolCalls = assistantMsg.tool_calls || []

    if (toolCalls.length === 0) {
      const parsed = extractJSONObject(assistantMsg.content)
      if (parsed?.reply) {
        finalPayload = parsed
        agentTrace.push({ tool: 'direct_json', ok: true, latencyMs: 0 })
        break
      }
      const plain = String(assistantMsg.content || '').trim()
      if (
        (chatMode === 'chat' || chatMode === 'qa') &&
        plain.length >= 8 &&
        !plain.startsWith('{')
      ) {
        finalPayload = { reply: plain, movies: [] }
        agentTrace.push({ tool: 'direct_text', ok: true, latencyMs: 0 })
        break
      }
      if (needsPlan && !ctx.plan) {
        convo.push({
          role: 'system',
          content: '你必须先调用 plan_tasks 输出执行计划，再执行其他工具。',
        })
      }
      convo.push({
        role: 'assistant',
        content:
          assistantMsg.content ||
          (chatMode === 'chat'
            ? '请调用 finish_recommend 完成回复。'
            : '请调用 finish_recommend 完成推荐。'),
      })
      continue
    }

    convo.push({
      role: 'assistant',
      content: assistantMsg.content || '',
      tool_calls: toolCalls,
    })

    for (const tc of toolCalls) {
      const fn = tc.function || {}
      const toolName = fn.name
      let args = {}
      try {
        args = fn.arguments ? JSON.parse(fn.arguments) : {}
      } catch {
        args = {}
      }

      if (needsPlan && toolName !== 'plan_tasks' && !ctx.plan) {
        const skipResult = { error: '不在计划中：尚未 plan_tasks', skipped: true }
        agentTrace.push({ tool: toolName, args, ok: false, skipped: true, latencyMs: 0 })
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(skipResult) })
        continue
      }

      if (ctx.plan && toolName !== 'plan_tasks' && toolName !== 'finish_recommend' && !isToolInPlan(toolName, ctx)) {
        const skipResult = { error: '不在计划中', skipped: true }
        agentTrace.push({ tool: toolName, args, ok: false, skipped: true, latencyMs: 0 })
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(skipResult) })
        continue
      }

      const result = await runToolWithRetry(toolName, args, ctx, agentTrace)
      emit('trace', { entry: agentTrace[agentTrace.length - 1] })

      if (toolName === 'plan_tasks') {
        needsPlan = false
        emit('plan', { steps: ctx.plan })
      }

      if (toolName === 'finish_recommend' && result?.finished) {
        finalPayload = result.payload
      }

      convo.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, 4000),
      })
    }

    if (finalPayload) break
  }

  if (!finalPayload) {
    if (chatMode === 'recommend' && ctx.candidates.length) {
      finalPayload = fallbackFromCandidates(ctx, null)
      agentTrace.push({ tool: 'fallback_candidates', ok: true, degraded: true })
    } else if (chatMode === 'recommend') {
      const degraded = await buildDegradedReply(username, message, tasteProfile, chatMode, ctx, agentTrace)
      emitReplyIfStreaming(emit, degraded.reply)
      emit('done', { result: degraded })
      return degraded
    } else {
      const fallback = buildNonRecommendFallback(chatMode, ctx, agentTrace)
      emitReplyIfStreaming(emit, fallback.reply)
      emit('done', { result: { ...fallback, movies: fallback.movies || [] } })
      return {
        reply: fallback.reply,
        movies: fallback.movies || [],
        meta: {
          ...fallback.meta,
          plan: ctx.plan,
          agentTrace: fallback.meta?.agentTrace || agentTrace,
          sources: ctx.sources,
        },
      }
    }
  }

  const { error } = chatResponse_schema.validate(finalPayload)
  if (error) {
    if (chatMode === 'recommend') {
      finalPayload = fallbackFromCandidates(ctx, finalPayload)
      agentTrace.push({ tool: 'fallback_validate', ok: true, degraded: true, detail: error.message })
    } else {
      finalPayload = {
        reply: finalPayload?.reply || buildNonRecommendFallback(chatMode, ctx, agentTrace).reply,
        movies: [],
      }
      agentTrace.push({ tool: 'fallback_validate', ok: true, degraded: true, detail: error.message })
    }
  }

  if (chatMode !== 'recommend' && (!finalPayload.movies || finalPayload.movies.length === 0)) {
    finalPayload.movies = []
  }

  if (typeof onEvent === 'function') {
    try {
      const streamed = await streamWriteUserReply({
        convo,
        chatMode,
        draftReply: finalPayload.reply,
        emit,
      })
      if (streamed) {
        finalPayload.reply = streamed
        agentTrace.push({ tool: 'stream_write_reply', ok: true, latencyMs: 0 })
      } else if (finalPayload.reply) {
        emitReplyIfStreaming(emit, finalPayload.reply)
      }
    } catch (err) {
      agentTrace.push({
        tool: 'stream_write_reply',
        ok: false,
        error: err.message,
        latencyMs: 0,
      })
      if (finalPayload.reply) {
        emitReplyIfStreaming(emit, finalPayload.reply)
      } else {
        const degraded = await buildDegradedReply(
          username,
          message,
          tasteProfile,
          chatMode,
          ctx,
          agentTrace,
          err.message
        )
        emitReplyIfStreaming(emit, degraded.reply)
        emit('done', { result: degraded })
        return degraded
      }
    }
  }

  const enrichedMovies = enrichAgentMovies(finalPayload.movies || [], ctx)

  const result = {
    reply: finalPayload.reply,
    movies: enrichedMovies,
    meta: {
      mode: chatMode,
      plan: ctx.plan,
      agentTrace,
      sources: ctx.sources,
      toolRounds: agentTrace.filter((t) => !['direct_json', 'fallback_candidates', 'fallback_validate'].includes(t.tool)).length,
      candidateCount: ctx.candidates.length,
      groundedCount: enrichedMovies.length,
      localMappedCount: enrichedMovies.filter((m) => m.local_movie_id).length,
      profileApplied: Boolean(ctx.tasteProfile),
      toolsUsed: [...new Set(agentTrace.map((t) => t.tool))],
      degraded: agentTrace.some((t) => t.degraded),
    },
  }

  emit('done', { result })
  return result
}

async function runAgentChatTurn(opts) {
  return runAgentChatTurnCore({ ...opts, onEvent: null })
}

module.exports = {
  runAgentChatTurn,
  runAgentChatTurnCore,
  AGENT_TOOLS,
  buildDegradedReply,
}
