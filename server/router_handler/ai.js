// controllers/aiController.js
const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 通用 TMDB 请求
async function tmdbFetch(endpoint, options = {}) {
  const url = `${TMDB_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`TMDB ${endpoint} 请求失败: ${response.status}`);
  }
  return response.json();
}

// 获取近期热门电影（近3年）
async function fetchRecentMovies() {
  const currentYear = new Date().getFullYear();
  const data = await tmdbFetch('/movie/popular?language=zh-CN&page=1&region=CN');
  return data.results
    .filter(m => {
      const year = m.release_date ? new Date(m.release_date).getFullYear() : 0;
      return year >= currentYear - 3 && year <= currentYear;
    })
    .slice(0, 20)
    .map(m => ({
      id: m.id,
      title: m.title,
      year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
      overview: m.overview,
      vote_average: m.vote_average,
      poster_path: m.poster_path,
    }));
}

// 获取经典高分电影（1980-2010，评分排序，投票数≥500）
async function fetchClassicMovies() {
  const data = await tmdbFetch(
    '/discover/movie?language=zh-CN&sort_by=vote_average.desc&vote_count.gte=500&primary_release_date.gte=1980-01-01&primary_release_date.lte=2010-12-31&page=1'
  );
  return data.results.slice(0, 20).map(m => ({
    id: m.id,
    title: m.title,
    year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
    overview: m.overview,
    vote_average: m.vote_average,
    poster_path: m.poster_path,
  }));
}

// 去重（按 id）
function deduplicateById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// 从 AI 返回内容中提取 JSON 数组
function extractJSONArray(str) {
  const match = str.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    console.error('JSON 解析失败:', match[0]);
    return null;
  }
}

// 检测用户意图
function detectIntent(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('经典') || lower.includes('老片') || lower.includes('早期') || lower.includes('怀旧')) {
    return 'classic';
  }
  if (lower.includes('近期') || lower.includes('最新') || lower.includes('热播')) {
    return 'recent';
  }
  return 'mixed';
}

// 调用通义千问
async function callQwen(systemPrompt, userPrompt) {
  const response = await fetch(QWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`通义千问请求失败: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// 主处理函数
exports.getRecommendMovies = async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: { message: '请提供有效的电影偏好描述' } });
  }

  try {
    const intent = detectIntent(prompt);

    // 获取候选电影列表
    let movieCandidates = [];
    try {
      if (intent === 'recent') {
        movieCandidates = await fetchRecentMovies();
      } else if (intent === 'classic') {
        movieCandidates = await fetchClassicMovies();
      } else {
        // 混合模式：并行获取，允许失败
        const [recentResult, classicResult] = await Promise.allSettled([
          fetchRecentMovies(),
          fetchClassicMovies()
        ]);
        const all = [];
        if (recentResult.status === 'fulfilled') all.push(...recentResult.value);
        if (classicResult.status === 'fulfilled') all.push(...classicResult.value);
        movieCandidates = deduplicateById(all).slice(0, 30);
      }
    } catch (err) {
      console.error('TMDB 获取失败:', err);
      // 降级：继续使用空候选池
    }

    // 构建系统提示词
    let systemPrompt = `你是一个电影推荐助手。`;
    if (movieCandidates.length > 0) {
      const movieListText = movieCandidates.map(m =>
        `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}，评分: ${m.vote_average}）`
      ).join('\n');
      systemPrompt += `\n\n以下是从 TMDB 获取的真实电影列表（包含近期热播和经典高分作品）：\n${movieListText}\n\n请根据用户需求，从以上列表中选择最合适的 3-5 部电影推荐。返回 JSON 数组，每个对象包含 title（片名）、reason（推荐理由）、year（年份）、tmdb_id（TMDB ID）。只返回 JSON 数组。`;
    } else {
      systemPrompt += `\n\n请根据用户需求推荐电影，返回 JSON 数组，每个对象包含 title、reason、year 字段。只返回 JSON 数组。`;
    }

    // 调用通义千问
    const aiContent = await callQwen(systemPrompt, prompt);

    // 解析 AI 返回的 JSON
    let recommendedMovies = extractJSONArray(aiContent) || [];

    // 补充 TMDB 详情（海报、评分等）
    const enrichedMovies = recommendedMovies.map(movie => {
      const tmdbMovie = movieCandidates.find(m =>
        m.title === movie.title || (movie.tmdb_id && m.id === movie.tmdb_id)
      );
      return {
        ...movie,
        id: tmdbMovie?.id || null,
        poster_path: tmdbMovie?.poster_path || null,
        vote_average: tmdbMovie?.vote_average || null,
      };
    });

    // 返回前端期望的格式
    res.json({
      success: true,
      movies: enrichedMovies,
      intent,
    });
  } catch (error) {
    console.error('AI 推荐错误:', error);
    res.status(500).json({ error: { message: error.message || 'AI 推荐失败，请稍后重试' } });
  }
};