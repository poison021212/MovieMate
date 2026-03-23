// api/recommend.js
export const config = {
  runtime: 'edge',
};

// TMDB 配置（使用你的 Access Token）
const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 获取近期热门电影（按年份过滤，优先近3年）
async function fetchRecentMovies() {
  const currentYear = new Date().getFullYear();

  // 请求 TMDB 热门电影 API（按流行度排序）
  const response = await fetch(
    `${TMDB_BASE_URL}/movie/popular?language=zh-CN&page=1&region=CN`,
    {
      headers: {
        'Authorization': `Bearer ${TMDB_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Forwarded-Host': 'api.themoviedb.org',//校验请求的HOST是否为TMDB的api地址
      },
    }
  );

  if (!response.ok) {
    throw new Error(`TMDB API 请求失败: ${response.status}`);
  }

  const data = await response.json();

  // 过滤：只保留近3年上映的电影，取前20部
  const recentMovies = data.results
    .filter(movie => {
      const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 0;
      return releaseYear >= currentYear - 3 && releaseYear <= currentYear;
    })
    .slice(0, 20)
    .map(movie => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : '未知',
      overview: movie.overview,
      vote_average: movie.vote_average,
    }));

  return recentMovies;
}

export default async function handler(req) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { prompt } = await req.json();

    // 1. 从 TMDB 获取近期热门电影
    let recentMovies = [];
    try {
      recentMovies = await fetchRecentMovies();
    } catch (tmdbError) {
      console.error('TMDB 获取失败:', tmdbError);
      // 如果 TMDB 失败，降级返回空列表，让 AI 用自身知识推荐
    }

    // 2. 构建 AI 提示词，包含真实电影列表
    let systemPrompt = `你是一个电影推荐助手。`;

    if (recentMovies.length > 0) {
      const movieListText = recentMovies.map(m =>
        `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}）`
      ).join('\n');

      systemPrompt += `\n\n当前真实热映电影列表如下（来自 TMDB 数据库，都是 ${new Date().getFullYear() - 3}-${new Date().getFullYear()} 年上映的）：\n${movieListText}\n\n请根据用户需求，从以上列表中选择最合适的 3-5 部电影推荐。返回 JSON 数组，每个对象包含 title（片名）、reason（推荐理由）、year（年份）、tmdb_id（TMDB ID）。只返回 JSON 数组，不要其他文字。`;
    } else {
      systemPrompt += `\n\n请根据用户需求推荐电影，返回 JSON 数组，每个对象包含 title、reason、year 字段。只返回 JSON 数组。`;
    }

    // 3. 调用通义千问
    const qwenResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        stream: false, // 非流式，获取完整 JSON
      }),
    });

    const qwenData = await qwenResponse.json();
    let aiContent = qwenData.choices[0]?.message?.content || '';

    // 4. 提取并解析 JSON
    let recommendedMovies = [];
    const jsonMatch = aiContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        recommendedMovies = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('JSON 解析失败:', jsonMatch[0]);
      }
    }

    // 5. 如果 AI 返回了 tmdb_id，用真实电影数据补全信息
    const enrichedMovies = recommendedMovies.map(movie => {
      const tmdbMovie = recentMovies.find(m =>
        m.title === movie.title ||
        (movie.tmdb_id && m.id === movie.tmdb_id)
      );
      return {
        ...movie,
        id: tmdbMovie?.id || null,
        poster_path: tmdbMovie?.poster_path || null,
      };
    });

    // 返回结果
    return new Response(
      JSON.stringify({
        success: true,
        movies: enrichedMovies,
        source: recentMovies.length > 0 ? 'tmdb_filtered' : 'ai_only'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('API 错误:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}