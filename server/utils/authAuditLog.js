/** Structured auth audit logs — never log passwords or full tokens */

function authLog(event, meta = {}) {
  const safe = { ...meta }
  delete safe.password
  delete safe.token
  delete safe.refreshToken
  delete safe.authorization
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: 'auth',
      event,
      ...safe,
    })
  )
}

module.exports = { authLog }
