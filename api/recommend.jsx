import { fetchRecentMovies, fetchClassicMovies } from '@/api/components/TMDB.js';
import { callQwen } from '@/api/components/qwen.js';
import { detectIntent } from '@/api/components/intent.js';
import { deduplicateById, extractJSONArray } from '@/api/components/utils.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { prompt } = await req.json();
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
        const [recent, classic] = await Promise.allSettled([fetchRecentMovies(), fetchClassicMovies()]);
        const all = [];
        if (recent.status === 'fulfilled') all.push(...recent.value);
        if (classic.status === 'fulfilled') all.push(...classic.value);
        movieCandidates = deduplicateById(all).slice(0, 30);
      }
    } catch (err) {
      console.error('TMDB 获取失败:', err);
      // 降级：继续使用空候选池
    }

    // 构建系统提示词
    let systemPrompt = `你是一个电影推荐助手。`;
    if (movieCandidates.length > 0) {
      const movieListText = movieCandidates.map(m => `- 《${m.title}》（${m.year}年，TMDB ID: ${m.id}，评分: ${m.vote_average}）`).join('\n');
      systemPrompt += `\n\n以下是从 TMDB 获取的真实电影列表（包含近期热播和经典高分作品）：\n${movieListText}\n\n请根据用户需求，从以上列表中选择最合适的 3-5 部电影推荐。返回 JSON 数组，每个对象包含 title（片名）、reason（推荐理由）、year（年份）、tmdb_id（TMDB ID）。只返回 JSON 数组。`;
    } else {
      systemPrompt += `\n\n请根据用户需求推荐电影，返回 JSON 数组，每个对象包含 title、reason、year 字段。只返回 JSON 数组。`;
    }

    // 调用通义千问
    const aiContent = await callQwen(systemPrompt, prompt);

    // 解析 AI 返回的 JSON
    let recommendedMovies = extractJSONArray(aiContent) || [];

    // 补充 TMDB 详情
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
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}