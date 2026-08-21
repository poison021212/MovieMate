/**
 * API base URL for RTK Query.
 * Dev: `/api` via Vite proxy (avoids cross-host localhost/127.0.0.1 issues).
 * Prod: set VITE_API_URL, or fall back to localhost backend.
 */
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:1337/api')

/** Backend origin for relative `/uploads` poster paths in dev. */
export const API_ORIGIN =
  import.meta.env.VITE_API_ORIGIN ||
  (API_BASE.startsWith('http') ? API_BASE.replace(/\/api\/?$/, '') : '')
