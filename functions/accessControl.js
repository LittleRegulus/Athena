export const OWNER_EMAIL = 'swipingcc@athena.invalid'
export const ADMIN_EMAILS = new Set(['glizzyuli@athena.invalid'])
// Accounts created by the owner before the Owner Center enable flow is deployed.
// Future accounts should be enabled from Owner Center, which issues the same server-side claim.
export const INITIAL_FREE_EMAILS = new Set(['bsunner04@athena.invalid'])
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const PLAN_DEFINITIONS = Object.freeze({
  free: Object.freeze({ id: 'free', label: 'Free', weeklyLimit: 15 }),
  pro: Object.freeze({ id: 'pro', label: 'Athena Pro', weeklyLimit: 75 }),
  enterprise: Object.freeze({ id: 'enterprise', label: 'Athena Enterprise', weeklyLimit: 500 }),
  privileged: Object.freeze({ id: 'privileged', label: 'Athena Unlimited', weeklyLimit: null }),
})

export const FREE_MODEL_IDS = new Set([
  'venice-uncensored-1-2',
  'z-image-turbo',
  'wai-Illustrious',
])

export const PRO_MODEL_IDS = new Set([
  ...FREE_MODEL_IDS,
  'gemma-4-uncensored',
  'qwen3-coder-480b-a35b-instruct-turbo',
  'grok-imagine-image',
  'grok-imagine-image-quality',
])

export const ENTERPRISE_MODEL_IDS = new Set([
  ...PRO_MODEL_IDS,
  'qwen-3-6-plus',
])

export const PRIVILEGED_MODEL_IDS = new Set([
  ...ENTERPRISE_MODEL_IDS,
  'lustify-v8',
])

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function usernameFromEmail(email) {
  return normalizedEmail(email).split('@')[0] || 'member'
}

export function planForId(value) {
  return PLAN_DEFINITIONS[value] || PLAN_DEFINITIONS.free
}

export function accountFromToken(decoded) {
  const email = normalizedEmail(decoded?.email)
  if (email === OWNER_EMAIL) {
    return {
      uid: decoded.uid || decoded.sub,
      email,
      username: usernameFromEmail(email),
      role: 'Owner / Developer',
      roleTone: 'owner',
      tier: 'privileged',
      isOwner: true,
      isAdmin: false,
      canViewVeniceBalance: true,
      unlimited: true,
    }
  }
  if (ADMIN_EMAILS.has(email)) {
    return {
      uid: decoded.uid || decoded.sub,
      email,
      username: usernameFromEmail(email),
      role: 'Admin / Co-Developer',
      roleTone: 'admin',
      tier: 'privileged',
      isOwner: false,
      isAdmin: true,
      canViewVeniceBalance: true,
      unlimited: true,
    }
  }
  if (decoded?.athenaAccess !== true && !INITIAL_FREE_EMAILS.has(email)) return null
  const tier = ['pro', 'enterprise'].includes(decoded?.athenaPlan) ? decoded.athenaPlan : 'free'
  const plan = planForId(tier)
  return {
    uid: decoded.uid || decoded.sub,
    email,
    username: usernameFromEmail(email),
    role: tier === 'enterprise' ? 'Enterprise member' : tier === 'pro' ? 'Pro member' : 'Free member',
    roleTone: tier,
    tier,
    isOwner: false,
    isAdmin: false,
    canViewVeniceBalance: false,
    unlimited: false,
    planLabel: plan.label,
  }
}

export function modelIdsForAccount(account) {
  if (account?.tier === 'privileged') return PRIVILEGED_MODEL_IDS
  if (account?.tier === 'enterprise') return ENTERPRISE_MODEL_IDS
  if (account?.tier === 'pro') return PRO_MODEL_IDS
  return FREE_MODEL_IDS
}

export function canUseModel(account, modelId) {
  return modelIdsForAccount(account).has(String(modelId || ''))
}

export function requiredPlanForModel(modelId) {
  if (modelId === 'lustify-v8') return 'privileged'
  if (modelId === 'qwen-3-6-plus') return 'enterprise'
  if (FREE_MODEL_IDS.has(modelId)) return 'free'
  return 'pro'
}

export function visibleModelsForAccount(account, models) {
  return models
    .filter((model) => model.id !== 'lustify-v8' || account?.tier === 'privileged')
    .map((model) => ({
      ...model,
      locked: !canUseModel(account, model.id),
      requiredPlan: requiredPlanForModel(model.id),
    }))
}

export function chatUsageUnits(modelId, webSearch = false) {
  const base = modelId === 'qwen-3-6-plus' ? 3 : modelId === 'qwen3-coder-480b-a35b-instruct-turbo' ? 2 : 1
  return base + (webSearch ? 1 : 0)
}

export function imageUsageUnits(modelId, hasReference = false) {
  const base = modelId === 'grok-imagine-image-quality'
    ? 8
    : modelId === 'grok-imagine-image'
      ? 5
      : modelId === 'lustify-v8'
        ? 5
        : 3
  return base + (hasReference ? 2 : 0)
}

export function normalizedUsageState(raw, account, now = Date.now()) {
  const plan = planForId(account?.tier)
  if (account?.unlimited) {
    return { plan: account.tier, unlimited: true, used: 0, limit: null, remaining: null, percentage: 100, resetAt: null }
  }
  const current = raw && typeof raw === 'object' ? raw : {}
  const resetTime = Date.parse(current.resetAt || '')
  const shouldReset = current.plan !== account?.tier || !Number.isFinite(resetTime) || resetTime <= now
  const used = shouldReset ? 0 : Math.max(0, Number(current.used || 0))
  const resetAt = shouldReset ? new Date(now + WEEK_MS).toISOString() : new Date(resetTime).toISOString()
  const limit = plan.weeklyLimit
  const remaining = Math.max(0, limit - used)
  return {
    plan: account?.tier || 'free',
    unlimited: false,
    used,
    limit,
    remaining,
    percentage: Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))),
    resetAt,
  }
}

export function publicAccount(account, usage) {
  return {
    username: account.username,
    role: account.role,
    roleTone: account.roleTone,
    tier: account.tier,
    planLabel: planForId(account.tier).label,
    canViewVeniceBalance: account.canViewVeniceBalance,
    isOwner: account.isOwner,
    isAdmin: account.isAdmin,
    unlimited: account.unlimited,
    allowedModelIds: [...modelIdsForAccount(account)],
    usage,
  }
}
