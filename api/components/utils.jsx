// api/lib/utils.js
// 合并去重（按 id）
export function deduplicateById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// 从 AI 返回内容中提取 JSON 数组
export function extractJSONArray(str) {
  const match = str.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    console.error('JSON 解析失败:', match[0]);
    return null;
  }
}