/** In-memory login rate limit + lockout (per IP and per identifier) */

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000

const failureBuckets = new Map()

function bucketKey(kind, value) {
  return `${kind}:${String(value).toLowerCase()}`
}

function getRecord(key) {
  const now = Date.now()
  let rec = failureBuckets.get(key)
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    rec = { windowStart: now, failures: 0, lockedUntil: 0 }
    failureBuckets.set(key, rec)
  }
  return rec
}

function isLocked(key) {
  const rec = getRecord(key)
  return rec.lockedUntil > Date.now()
}

function recordFailure(ip, identifier) {
  const keys = [bucketKey('ip', ip), bucketKey('id', identifier)]
  for (const key of keys) {
    const rec = getRecord(key)
    rec.failures += 1
    if (rec.failures >= MAX_FAILURES) {
      rec.lockedUntil = Date.now() + LOCK_MS
    }
  }
}

function clearFailures(ip, identifier) {
  failureBuckets.delete(bucketKey('ip', ip))
  failureBuckets.delete(bucketKey('id', identifier))
}

function checkLoginAllowed(ip, identifier) {
  const keys = [bucketKey('ip', ip), bucketKey('id', identifier)]
  for (const key of keys) {
    if (isLocked(key)) {
      return { allowed: false, reason: '登录尝试过多，请 15 分钟后再试' }
    }
  }
  return { allowed: true }
}

module.exports = {
  checkLoginAllowed,
  recordFailure,
  clearFailures,
}
