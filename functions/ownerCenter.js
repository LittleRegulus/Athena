export const OWNER_LOGIN_EMAIL = 'swipingcc@athena.invalid'
export const OWNER_REFERENCE_PREFIX = 'owner-center/lustify-references/'
export const OWNER_GENERATION_PREFIX = 'owner-center/generations/'
export const OWNER_REFERENCE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const OWNER_REAUTH_WINDOW_MS = 5 * 60 * 1000

export function normalizedLoginEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function usernameFromLoginEmail(value) {
  return normalizedLoginEmail(value).split('@')[0] || 'unknown'
}

export function isOwnerIdentity(decoded) {
  return normalizedLoginEmail(decoded?.email) === OWNER_LOGIN_EMAIL
}

export function hasRecentOwnerAuthentication(decoded, now = Date.now()) {
  const authenticatedAt = Number(decoded?.auth_time || 0) * 1000
  return authenticatedAt > 0 && now - authenticatedAt <= OWNER_REAUTH_WINDOW_MS
}

export function ownerReferenceExtension(contentType) {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

export function ownerReferenceObjectName(id, contentType) {
  return `${OWNER_REFERENCE_PREFIX}${id}/reference.${ownerReferenceExtension(contentType)}`
}

export function ownerGenerationObjectName(id, createdAt) {
  const sortableTime = String(createdAt || new Date().toISOString()).replace(/[:.]/g, '-')
  return `${OWNER_GENERATION_PREFIX}${sortableTime}-${id}.json`
}

export function encodeOwnerMetadata(value) {
  return encodeURIComponent(String(value || '').slice(0, 180))
}

export function decodeOwnerMetadata(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

export function encodeOwnerPrompt(value) {
  return Buffer.from(String(value || '').slice(0, 1500), 'utf8').toString('base64url')
}

export function decodeOwnerPrompt(value) {
  try {
    return Buffer.from(String(value || ''), 'base64url').toString('utf8').slice(0, 1500)
  } catch {
    return ''
  }
}
