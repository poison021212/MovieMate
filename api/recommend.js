// api/recommend.js
export const config = {
  runtime: 'edge', // 使用 Edge Runtime，响应更快
};

export default async function handler(req) {
  // 仅允许 POST 请求
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { prompt } = await req.json();
    const currentYear = new Date().getFullYear();
    const systemPrompt = `当前年份是 ${currentYear}。用户需求：${prompt}。请推荐符合需求的电影，优先选择 ${currentYear - 1} 年至 ${currentYear} 年上映或热播的作品。返回 JSON 数组，每个对象包含 title、reason、year（年份）。`;
    // 严格的系统提示，要求只返回 JSON 数组
    // const systemPrompt = `你是一个电影推荐助手。用户会给出喜好，你需要返回一个 JSON 数组，数组中每个对象包含三个字段：title（电影名称，字符串）、reason（推荐理由，字符串）、year（上映年份，数字）。请只返回 JSON 数组，不要包含任何其他文字、注释或额外标记。例如：[{"title":"肖申克的救赎","reason":"经典励志","year":1994}]`;

    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, // 从环境变量读取
      },
      body: JSON.stringify({
        model: 'qwen-turbo', // 可选 qwen-turbo, qwen-plus, qwen-max
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        stream: false, // 非流式，获得完整 JSON
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // 提取 JSON 数组（防止 AI 输出多余文本）
    let jsonArray = null;
    const match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        jsonArray = JSON.parse(match[0]);
      } catch (e) {
        console.error('JSON 解析失败:', match[0]);
      }
    }

    // 返回标准 JSON 格式
    return new Response(
      JSON.stringify({ success: true, data: jsonArray }),
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