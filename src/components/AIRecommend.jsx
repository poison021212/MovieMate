// src/pages/AIRecommend.jsx
import { useState } from 'react';
import { Input, Button, Spin, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

const { TextArea } = Input;

// 辅助函数：从字符串中提取 JSON 数组
const extractJSON = (str) => {
  // 尝试去除可能的 markdown 代码块标记
  let cleaned = str.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
  // 匹配第一个完整的 JSON 数组（包括嵌套对象）
  const match = cleaned.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (match) {
    return match[0];
  }
  // 如果没找到数组，尝试匹配整个字符串中第一个 { ... } 或 [ ... ]
  const fallbackMatch = cleaned.match(/\[[\s\S]*\]/);
  return fallbackMatch ? fallbackMatch[0] : cleaned;
};

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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
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

      // 流结束，清洗并提取 JSON 数组
      const jsonString = extractJSON(fullContent);
      try {
        const result = JSON.parse(jsonString);
        if (Array.isArray(result)) {
          setMovies(result);
        } else {
          message.error('AI 返回的数据不是数组');
          console.error('非数组数据:', result);
        }
      } catch (parseError) {
        console.error('解析 JSON 失败，原始内容:', fullContent);
        console.error('提取的 JSON 字符串:', jsonString);
        message.error('AI 返回格式错误，请稍后重试');
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
        placeholder="例如：推荐几部好看的悬疑片"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Button
        type="primary"
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
                    type="link"
                    onClick={() => {
                      // 根据你的实际路由调整跳转路径
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