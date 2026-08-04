/** Browser TTS adapter; cloud TTS can replace this module later. */
export function stopSpeaking() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

export function speakText(text, { lang = 'zh-CN', rate = 1 } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.reject(new Error('当前浏览器不支持语音播报'))
  }
  const trimmed = String(text || '').trim()
  if (!trimmed) return Promise.reject(new Error('暂无简介可播报'))

  stopSpeaking()
  return new Promise((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(trimmed)
    utter.lang = lang
    utter.rate = rate
    utter.onend = () => resolve()
    utter.onerror = (e) => reject(e.error || new Error('播报失败'))
    window.speechSynthesis.speak(utter)
  })
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis)
}
