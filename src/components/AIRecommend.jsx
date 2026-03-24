// src/pages/AIRecommend.jsx
import { useState } from 'react';
import { Input, Button, Spin, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useRecommendMoviesMutation } from '@/store/API/MovieApi';

const { TextArea } = Input;

// 辅助函数：从字符串中提取并修复 JSON 数组
const extractAndFixJSON = (str) => {
  // 1. 提取第一个数组部分
  let arrayStr = str.match(/\[\s*\{[\s\S]*\}\s*\]/)?.[0] || str.match(/\[[\s\S]*\]/)?.[0];
  if (!arrayStr) return null;

  // 2. 修复缺失引号的键名：{title: "abc"} -> {"title": "abc"}
  arrayStr = arrayStr.replace(/([{,]\s*)([a-zA-Z0-9_\u4e00-\u9fa5]+)(\s*:)/g, '$1"$2"$3');

  // 3. 修复缺失逗号： "a":"b""c":"d" -> "a":"b","c":"d"
  arrayStr = arrayStr.replace(/("\s*:\s*"[^"]*")\s*(")/g, '$1,$2');

  arrayStr = arrayStr.replace(/\}\s*\{/g, '},{');

  // 5. 移除尾随逗号
  arrayStr = arrayStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

  try {
    return JSON.parse(arrayStr);
  } catch (e) {
    console.error('修复后仍无法解析:', arrayStr);
    return null;
  }
};

const AIRecommend = () => {
  const [prompt, setPrompt] = useState('');
  const [movies, setMovies] = useState([]);
  const [recommend, { isLoading, error }] = useRecommendMoviesMutation();
  const navigate = useNavigate();

  const handleRecommend = async () => {
    if (!prompt.trim()) {
      message.warning('请输入你的电影偏好');
      return;
    }
    try {
      //unwrap()方法用于将异步操作的结果转换为同步操作的结果，
      // 它会阻塞当前线程，直到异步操作完成，然后返回结果。
      // 如果异步操作失败，unwrap()方法会抛出异常。
      const result = await recommend(prompt).unwrap();

      if (result.movies && Array.isArray(result.movies)) {
        setMovies(result.movies);
      } else {
        message.error(result.error || '推荐失败');
      }
    } catch (err) {
      message.error(err.message || '请求失败');
    }
  };

  // 查看详情 - 使用 TMDB ID 或标题跳转
  const handleViewDetail = (movie) => {
    if (movie.id) {
      // 如果有 TMDB ID，可以跳转到你项目的详情页（需要你实现根据外部ID查询）
      // 或者直接打开 TMDB 页面
      navigate(`https://www.themoviedb.org/movie/${movie.id}`, { replace: false });
    } else {
      message.warning('暂无详情页，敬请期待');
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2>AI 电影推荐</h2>
      <TextArea
        rows={3}
        placeholder="例如：推荐几部好看的悬疑片"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Button
        type="primary"
        onClick={handleRecommend}
        loading={isLoading}
        style={{ marginTop: 16 }}
      >
        获取推荐
      </Button>

      {isLoading && <Spin style={{ marginTop: 24 }} />}

      {movies.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>推荐结果：</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {movies.map((movie, idx) => (
              <Card
                key={idx}
                title={movie.title}
                style={{ width: 300 }}
                extra={
                  <Button
                    type="link"
                    onClick={() => handleViewDetail(movie)}
                  >
                    查看详情
                  </Button>
                }
              >
                <p><strong>年份：</strong>{movie.year}</p>
                <p><strong>推荐理由：</strong>{movie.reason}</p>
                {movie.vote_average && (
                  <p><strong>TMDB 评分：</strong>{movie.vote_average}/10</p>
                )}
              </Card>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
            数据来源：TMDB 热门电影榜
          </div>
        </div>
      )}
    </div>
  );
};

export default AIRecommend;