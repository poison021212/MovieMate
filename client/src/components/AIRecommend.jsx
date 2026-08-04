// src/pages/AIRecommend.jsx
import { useState } from 'react';
import { Input, Button, Spin, message, Card, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useRecommendMoviesMutation } from '@/store/API/vercelApi';

const { TextArea } = Input;
const AIRecommend = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [movies, setMovies] = useState([]);
  const [recommendMeta, setRecommendMeta] = useState(null);
  const [recommend, { isLoading }] = useRecommendMoviesMutation();

  const handleRecommend = async () => {
    if (!prompt.trim()) {
      message.warning('请输入你的电影偏好');
      return;
    }
    try {
      const result = await recommend(prompt).unwrap();

      if (result.movies && Array.isArray(result.movies)) {
        setMovies(result.movies);
        setRecommendMeta(result.meta || null);
      } else {
        message.error(result.error || '推荐失败');
      }
    } catch (err) {
      const msg = err?.data?.error?.message || err.message || '请求失败';
      message.error(msg);
    }
  };

  const goDetail = (movie) => {
    if (movie.local_movie_id) {
      navigate(`/movie/${movie.local_movie_id}`);
      return;
    }
    if (movie.id) {
      window.open(`https://www.themoviedb.org/movie/${movie.id}`, '_blank');
      return;
    }
    message.warning('暂无站内详情，请先同步片库');
  };

  const goWriteNote = (movie) => {
    if (!movie.local_movie_id) {
      message.info('该片尚未入库，请先在列表搜索或运行 TMDB 同步');
      return;
    }
    navigate(`/movie/${movie.local_movie_id}#movie-review`);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2>AI 电影推荐</h2>
      <p style={{ color: '#666' }}>
        推荐结果来自 TMDB 候选池 + 大模型筛选；优先跳转站内详情并写观后笔记，形成「问 → 荐 → 看 → 记」闭环。
      </p>
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

      {isLoading && <Spin style={{ marginTop: 26 }} />}

      {recommendMeta && (
        <div style={{ marginTop: 16, fontSize: 13, color: '#666' }}>
          候选 {recommendMeta.candidateCount} 部 · 有效推荐 {recommendMeta.groundedCount} 部 ·
          站内可打开 {recommendMeta.localMappedCount} 部（{recommendMeta.localMappedRatePercent}%）
          {recommendMeta.profileApplied && <Tag color="blue" style={{ marginLeft: 8 }}>已注入口味档案</Tag>}
        </div>
      )}

      {movies.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>推荐结果</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {movies.map((movie, idx) => (
              <Card
                key={`${movie.tmdb_id || movie.title}-${idx}`}
                title={movie.title}
                style={{ width: 300 }}
                extra={
                  <Space>
                    <Button type="link" onClick={() => goDetail(movie)}>
                      查看详情
                    </Button>
                    <Button type="link" onClick={() => goWriteNote(movie)}>
                      写笔记
                    </Button>
                  </Space>
                }
              >
                <p><strong>年份：</strong>{movie.year}</p>
                <p><strong>推荐理由：</strong>{movie.reason}</p>
                {movie.vote_average != null && (
                  <p><strong>TMDB 评分：</strong>{movie.vote_average}/10</p>
                )}
                {movie.local_movie_id ? (
                  <Tag color="green">站内 ID: {movie.local_movie_id}</Tag>
                ) : (
                  <Tag>仅 TMDB 外链</Tag>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIRecommend;
