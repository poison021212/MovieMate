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
            content: `你是一个电影推荐助手。用户会给出喜好，你需要返回一个 JSON 数组，数组中每个对象包含三个字段：title（电影名称，字符串）、reason（推荐理由，字符串）、year（上映年份，数字）。请只返回 JSON 数组，不要包含任何其他文字、注释或额外标记。例如：[{"title":"肖申克的救赎","reason":"经典励志","year":1994}]。`
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