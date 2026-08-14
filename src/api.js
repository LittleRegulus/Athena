import { getAthenaIdToken } from './firebase.js'

const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export const usesRemoteApi = Boolean(import.meta.env.VITE_API_BASE_URL)

function endpoint(path) {
  const normalized = String(path).replace(/^\/api(?=\/|$)/, '')
  return `${configuredBase}${normalized.startsWith('/') ? normalized : `/${normalized}`}`
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = await getAthenaIdToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(endpoint(path), { ...options, headers })
}

export function apiUrl(path) {
  return endpoint(path)
}

