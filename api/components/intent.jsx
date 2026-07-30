// api/lib/intent.js
export function detectIntent(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('经典') || lower.includes('老片') || lower.includes('早期') || lower.includes('怀旧')) {
    return 'classic';
  }
  if (lower.includes('近期') || lower.includes('最新') || lower.includes('热播')) {
    return 'recent';
  }
  return 'mixed';
}