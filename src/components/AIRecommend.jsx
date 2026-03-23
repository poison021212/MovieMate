// src/pages/AIRecommend.jsx
import { useState } from 'react';
import { Input, Button, Spin, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

const { TextArea } = Input;

const AIRecommend = () => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [movies, setMovies] = useState([]);
  const navigate = useNavigate();

  const handleRecommend = async () => {
    if (!prompt.trim()) {
      message.warning('请输入你的电影偏好');
      return;
    }

    setLoading(true);
    setMovies([]);

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`请求失败：${response.status}`);
      }

      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // 通义千问 SSE 格式：data: {...}\n\n
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              fullContent += content;
            } catch (e) {
              // 忽略解析错误（可能是部分数据）
            }
          }
        }
      }

      // 流结束，尝试解析 JSON 数组
      try {
        const result = JSON.parse(fullContent);
        if (Array.isArray(result)) {
          setMovies(result);
        } else {
          message.error('AI 返回数据格式不正确');
        }
      } catch (e) {
        console.error('解析 JSON 失败', fullContent);
        message.error('AI 返回内容格式错误，请重试');
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2>AI 电影推荐</h2>
      <TextArea
        rows={3}
        placeholder='例如：推荐几部好看的悬疑片'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Button
        type='primary'
        onClick={handleRecommend}
        loading={loading}
        style={{ marginTop: 16 }}
      >
        获取推荐
      </Button>

      {loading && <Spin style={{ marginTop: 24 }} />}

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
                    type='link'
                    onClick={() => {
                      // 跳转到电影详情页（需要你根据现有路由调整）
                      navigate(`/movie/${encodeURIComponent(movie.title)}`);
                    }}
                  >
                    查看详情
                  </Button>
                }
              >
                <p>
                  <strong>年份：</strong>
                  {movie.year}
                </p>
                <p>
                  <strong>推荐理由：</strong>
                  {movie.reason}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIRecommend;