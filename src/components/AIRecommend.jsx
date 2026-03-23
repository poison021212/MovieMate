// src/pages/AIRecommend.jsx
import { useState } from 'react';
import { Input, Button, Spin, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

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

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }

      let moviesData = result.data;
      // 如果后端未成功解析，再尝试用前端修复函数处理
      if (!moviesData && result.rawContent) {
        moviesData = extractAndFixJSON(result.rawContent);
      }

      if (moviesData && Array.isArray(moviesData)) {
        setMovies(moviesData);
      } else {
        message.error('AI 返回格式错误，请稍后重试');
        console.error('无效数据:', result);
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