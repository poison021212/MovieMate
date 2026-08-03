// api/recommend.js
export const config = { runtime: 'edge' };

const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 获取近期热门电影（近3年）
async function fetchRecentMovies() {
  const currentYear = new Date().getFullYear();
  const response = await fetch(`${TMDB_BASE_URL}/movie/popular?language=zh-CN&page=1&region=CN`, {
    headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'Content-Type': 'application/json', 'X-Forwarded-Host': 'api.themoviedb.org' }
  });
  if (!response.ok) throw new Error(`TMDB popular 请求失败: ${response.status}`);
  const data = await response.json();
  return data.results
    .filter(m => {
      const year = m.release_date ? new Date(m.release_date).getFullYear() : 0;
      return year >= currentYear - 3 && year <= currentYear;
    })
    .slice(0, 20)
    .map(m => ({
      id: m.id, title: m.title, year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
      overview: m.overview, vote_average: m.vote_average, poster_path: m.poster_path
    }));
}

// 获取经典高分电影（例如 1980-2010 年，按评分排序）
async function fetchClassicMovies() {
  const response = await fetch(
    `${TMDB_BASE_URL}/discover/movie?language=zh-CN&sort_by=vote_average.desc&vote_count.gte=500&primary_release_date.gte=1980-01-01&primary_release_date.lte=2010-12-31&page=1`,
    {
      headers: { 'Authorization': `Bearer ${TMDB_TOKEN}`, 'Content-Type': 'application/json', 'X-Forwarded-Host': 'api.themoviedb.org' }
    }
  );
  if (!response.ok) throw new Error(`TMDB discover 请求失败: ${response.status}`);
  const data = await response.json();
  return data.results.slice(0, 20).map(m => ({
    id: m.id, title: m.title, year: m.release_date ? new Date(m.release_date).getFullYear() : '未知',
    overview: m.overview, vote_average: m.vote_average, poster_path: m.poster_path
  }));
}

// 根据用户输入判断倾向
function detectIntent(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('经典') || lower.includes('老片') || lower.includes('早期') || lower.includes('怀旧')) {
    return 'classic';
  }
  if (lower.includes('近期') || lower.includes('最新') || lower.includes('热播')) {
    return 'recent';
  }
  return 'mixed'; // 默认混合
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { prompt } = await req.json();
    const intent = detectIntent(prompt);

    let movieCandidates = [];
    try {
      if (intent === 'recent') {
        movieCandidates = await fetchRecentMovies();
      } else if (intent === 'classic') {
        movieCandidates = await fetchClassicMovies();
      } else {
        // 混合：同时获取近期和经典，合并去重（按 id）
        const [recent, classic] = await Promise.all([fetchRecentMovies(), fetchClassicMovies()]);
        const all = [...recent, ...classic];
        const unique = [];
        const ids = new Set();
        for (const m of all) {
          if (!ids.has(m.id)) {
            ids.add(m.id);
            unique.push(m);
          }
        }
        movieCandidates = unique.slice(0, 30); // 限制候选数量
      }
    } catch (err) {
      console.error('TMDB 获取失败:', err);
      // 降级：不提供候选，让 AI 自己推荐
    }

    // 构建 AI 提示词
    let systemPrompt = `你是一个电影推荐助手。`;
    if (movieCandidates.length > 0) {
      const movieListText = movieCandidates.map(m => `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}，评分: ${m.vote_average}）`).join('\n');
      systemPrompt += `\n\n以下是从 TMDB 获取的真实电影列表（包含近期热播和经典高分作品）：\n${movieListText}\n\n请根据用户需求，从以上列表中选择最合适的 3-5 部电影推荐。返回 JSON 数组，每个对象包含 title（片名）、reason（推荐理由）、year（年份）、tmdb_id（TMDB ID）。只返回 JSON 数组。`;
    } else {
      systemPrompt += `\n\n请根据用户需求推荐电影，返回 JSON 数组，每个对象包含 title、reason、year 字段。只返回 JSON 数组。`;
    }

    const qwenResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}` },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        temperature: 0.7,
        stream: false,
      }),
    });

    const qwenData = await qwenResponse.json();
    let aiContent = qwenData.choices[0]?.message?.content || '';

    // 解析 JSON
    let recommendedMovies = [];
    const jsonMatch = aiContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        recommendedMovies = JSON.parse(jsonMatch[0]);
      } catch (e) { console.error('JSON 解析失败:', jsonMatch[0]); }
    }

    // 用候选数据补充详情
    const enrichedMovies = recommendedMovies.map(movie => {
      const tmdbMovie = movieCandidates.find(m => m.title === movie.title || (movie.tmdb_id && m.id === movie.tmdb_id));
      return {
        ...movie,
        id: tmdbMovie?.id || null,
        poster_path: tmdbMovie?.poster_path || null,
        vote_average: tmdbMovie?.vote_average || null,
      };
    });

    return new Response(
      JSON.stringify({ success: true, movies: enrichedMovies, intent }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('API 错误:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}