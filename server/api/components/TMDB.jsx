// api/lib/tmdb.js
const TMDB_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const BASE_URL = 'https://api.themoviedb.org/3';

// 通用请求函数，带统一 headers
async function tmdbFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Forwarded-Host': 'api.themoviedb.org',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`TMDB ${endpoint} 请求失败: ${response.status}`);
  }
  return response.json();
}

// 获取近期热门电影（近3年）
export async function fetchRecentMovies() {
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
export async function fetchClassicMovies() {
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