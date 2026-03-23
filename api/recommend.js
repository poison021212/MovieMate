// api/recommend.js
export const config = {
  runtime: 'edge', // 使用 Edge Runtime，更快
};

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

    // 调用通义千问 API（OpenAI 兼容模式）
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`, // 从环境变量读取 Key
      },
      body: JSON.stringify({
        model: 'qwen-turbo', // 可选 qwen-turbo, qwen-plus, qwen-max
        messages: [
          {
            role: 'system',
            content: '你是一个电影推荐助手，请根据用户需求推荐电影，返回格式为 JSON 数组，每个电影包含 title（片名）、reason（推荐理由）、year（年份）字段。只返回 JSON，不要其他文字。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        stream: true, // 启用流式响应
      }),
    });

    // 直接将通义千问的流式响应转发给前端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}