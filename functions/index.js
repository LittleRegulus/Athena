import express from 'express'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import {
  buildImageEditProviderPayload,
  buildImageProviderPayload,
  decodeProviderImage,
  IMAGE_MODELS,
} from './imageGeneration.js'
import {
  decodeOwnerMetadata,
  decodeOwnerPrompt,
  encodeOwnerMetadata,
  encodeOwnerPrompt,
  hasRecentOwnerAuthentication,
  isOwnerIdentity,
  OWNER_GENERATION_PREFIX,
  OWNER_LOGIN_EMAIL,
  OWNER_REFERENCE_PREFIX,
  OWNER_REFERENCE_RETENTION_MS,
  ownerGenerationObjectName,
  ownerReferenceObjectName,
  ownerResultObjectName,
  usernameFromLoginEmail,
} from './ownerCenter.js'
import {
  accountFromToken,
  canUseModel,
  chatUsageUnits,
  imageUsageUnits,
  normalizedUsageState,
  publicAccount,
  requiredPlanForModel,
  visibleModelsForAccount,
} from './accessControl.js'

initializeApp()

const veniceApiKey = defineSecret('VENICE_API_KEY')
const firebaseStorageBucket = 'athena-3dd48.firebasestorage.app'
// Leave enough headroom for complete source files while staying within provider context limits.
const maxOutputTokens = 16384
const maxAttachmentBytes = 8 * 1024 * 1024
const maxAttachmentContextBytes = 20 * 1024 * 1024
const maxAttachmentsPerRequest = 8

const MODELS = [
  { id: 'gemma-4-uncensored', label: 'Athena', description: 'Private, uncensored, and ideal for everyday coding', badge: 'Best value', badgeTone: 'value', cost: '$0.16 input · $0.50 output / 1M tokens', inputPrice: 0.1625, outputPrice: 0.5, supportsVision: true, supportsMultipleImages: false },
  { id: 'qwen-3-6-plus', label: 'Athena Power', description: 'Stronger uncensored coding and complex reasoning', badge: 'Power · higher cost', badgeTone: 'power', cost: '$0.63 input · $3.75 output / 1M tokens', inputPrice: 0.625, outputPrice: 3.75, supportsVision: true, supportsMultipleImages: true },
  { id: 'qwen3-coder-480b-a35b-instruct-turbo', label: 'Athena Coder', description: 'Dedicated model for demanding programming work', badge: 'Code specialist', badgeTone: 'code', cost: '$0.35 input · $1.50 output / 1M tokens', inputPrice: 0.35, outputPrice: 1.5, supportsVision: false, supportsMultipleImages: false },
  { id: 'venice-uncensored-1-2', label: 'Athena Direct', description: 'General unfiltered conversation and exploration', badge: 'General', badgeTone: 'general', cost: '$0.20 input · $0.90 output / 1M tokens', inputPrice: 0.2, outputPrice: 0.9, supportsVision: true, supportsMultipleImages: true },
]
const ALLOWED_MODELS = new Set(MODELS.map((model) => model.id))
const SYSTEM_PROMPT = `You are Athena, an independent research and learning assistant.
Be direct, accurate, calm, and intellectually honest. Distinguish facts from inference and uncertainty.
Give technically useful answers without scolding or filler. For cybersecurity questions, support authorized
classroom labs, defensive analysis, CTFs, and systems the user owns or has permission to test. Do not invent
sources, results, commands, or access you do not have. When live web grounding is enabled, cite the evidence.
Treat attached documents, source files, and images as user-provided context and refer to them by filename.
When the user asks for a project, multiple files, a downloadable archive, or a ZIP, put every complete file under
a Markdown H3 heading containing its relative path, immediately followed by one fenced code block. Use paths
such as "src/App.jsx" or "package.json" and do not omit unchanged sections. Athena's interface will package
those fenced files into a ZIP; never claim that a binary archive was directly attached to your response.`

const app = express()
app.disable('x-powered-by')

function originAllowed(origin) {
  if (origin === 'https://littleregulus.github.io') return true
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  } catch {
    return false
  }
}

app.use((request, response, next) => {
  const origin = request.get('origin')
  if (origin && originAllowed(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  }
  if (request.method === 'OPTIONS') return response.status(origin && originAllowed(origin) ? 204 : 403).end()
  return next()
})

app.use(express.json({ limit: '30mb' }))
app.use(async (request, response, next) => {
  const authorization = request.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) return response.status(401).json({ error: 'Sign in to Athena before using the model provider.' })
  try {
    const decoded = await getAuth().verifyIdToken(match[1])
    const account = accountFromToken(decoded)
    if (!account) return response.status(403).json({
      error: 'This Firebase account has not been enabled by Athena\'s owner yet.',
      code: 'ATHENA_ACCOUNT_NOT_ENABLED',
    })
    request.athenaUser = decoded
    request.athenaAccount = account
    return next()
  } catch {
    return response.status(401).json({ error: 'Your Athena login has expired. Log out and sign in again.' })
  }
})

function providerKey() {
  return String(veniceApiKey.value() || '').trim()
}

function ownerArchiveBucket() {
  return getStorage().bucket(firebaseStorageBucket)
}

function accountUsageFile(account) {
  return ownerArchiveBucket().file(`account-control/usage/${encodeURIComponent(account.uid)}.json`)
}

function storageNotFound(error) {
  return Number(error?.code) === 404 || Number(error?.response?.statusCode) === 404
}

class UsageLimitError extends Error {
  constructor(usage) {
    super('Your weekly Athena usage is fully used. It will refill automatically at the reset time shown in Settings.')
    this.usage = usage
  }
}

async function readUsageRecord(account) {
  const file = accountUsageFile(account)
  try {
    const [[metadata], [data]] = await Promise.all([file.getMetadata(), file.download()])
    return { file, generation: Number(metadata.generation || 0), raw: JSON.parse(data.toString('utf8')) }
  } catch (error) {
    if (storageNotFound(error)) return { file, generation: 0, raw: null }
    throw error
  }
}

async function changeWeeklyUsage(account, delta = 0, { enforce = true } = {}) {
  if (account.unlimited) return normalizedUsageState(null, account)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const record = await readUsageRecord(account)
    const usage = normalizedUsageState(record.raw, account)
    const change = Number.isFinite(Number(delta)) ? Number(delta) : 0
    if (enforce && change > usage.remaining) throw new UsageLimitError(usage)
    const next = normalizedUsageState({
      ...usage,
      used: Math.max(0, usage.used + change),
      resetAt: usage.resetAt,
      plan: account.tier,
    }, account)
    try {
      await record.file.save(JSON.stringify({
        plan: next.plan,
        used: next.used,
        resetAt: next.resetAt,
        updatedAt: new Date().toISOString(),
      }), {
        resumable: false,
        metadata: { contentType: 'application/json', cacheControl: 'private, no-store, max-age=0' },
        preconditionOpts: { ifGenerationMatch: record.generation },
      })
      return next
    } catch (error) {
      if (Number(error?.code) === 412) continue
      throw error
    }
  }
  throw new Error('Athena could not safely update the weekly usage ledger. Retry the request.')
}

async function reserveWeeklyUsage(request, response, units) {
  try {
    return await changeWeeklyUsage(request.athenaAccount, units)
  } catch (error) {
    if (error instanceof UsageLimitError) {
      response.status(429).json({ error: error.message, code: 'WEEKLY_USAGE_LIMIT', usage: error.usage })
      return null
    }
    response.status(503).json({ error: 'Athena could not verify the weekly usage allowance. Retry shortly.' })
    return null
  }
}

async function refundWeeklyUsage(account, units) {
  if (!units || account.unlimited) return
  await changeWeeklyUsage(account, -units, { enforce: false }).catch((error) => {
    console.error('Athena could not refund a failed request usage reservation.', { message: error instanceof Error ? error.message : 'Unknown error' })
  })
}

function requireOwner(request, response, next) {
  if (!request.athenaAccount?.isOwner || !isOwnerIdentity(request.athenaUser)) {
    return response.status(403).json({ error: 'Owner Center is available only to Athena\'s owner.' })
  }
  return next()
}

function requireRecentOwnerAuthentication(request, response, next) {
  if (!hasRecentOwnerAuthentication(request.athenaUser)) {
    return response.status(401).json({
      error: 'Enter the owner account password again to unlock Owner Center.',
      code: 'OWNER_REAUTH_REQUIRED',
    })
  }
  return next()
}

async function ownerReferenceRecords({ removeExpired = true } = {}) {
  const [files] = await ownerArchiveBucket().getFiles({ prefix: OWNER_REFERENCE_PREFIX })
  const ownerUsername = OWNER_LOGIN_EMAIL.split('@')[0]
  const records = await Promise.all(files.map(async (file) => {
    if (!/\/reference\.(?:png|jpe?g|webp)$/i.test(file.name)) return null
    const [metadata] = await file.getMetadata()
    const custom = metadata.metadata || {}
    const username = String(custom.username || 'unknown').slice(0, 80)
    const archiveId = String(custom.archiveId || '')
    if (username.toLowerCase() === ownerUsername.toLowerCase()) {
      if (removeExpired) {
        await file.delete({ ignoreNotFound: true })
        if (/^[a-f0-9-]{36}$/i.test(archiveId)) {
          const resultFile = await findOwnerResultFile(archiveId)
          await resultFile?.delete({ ignoreNotFound: true })
        }
      }
      return null
    }
    const createdAt = String(custom.createdAt || metadata.timeCreated || '')
    const expiresAt = String(custom.expiresAt || '')
    const policyExpiryMs = Date.parse(createdAt) + OWNER_REFERENCE_RETENTION_MS
    const recordedExpiryMs = Date.parse(expiresAt)
    const effectiveExpiryMs = Number.isFinite(recordedExpiryMs) ? Math.min(recordedExpiryMs, policyExpiryMs) : policyExpiryMs
    const effectiveExpiresAt = Number.isFinite(effectiveExpiryMs) ? new Date(effectiveExpiryMs).toISOString() : expiresAt
    if (removeExpired && Number.isFinite(effectiveExpiryMs) && effectiveExpiryMs <= Date.now()) {
      await file.delete({ ignoreNotFound: true })
      if (/^[a-f0-9-]{36}$/i.test(archiveId) && /\/reference\.(?:png|jpe?g|webp)$/i.test(file.name)) {
        const resultFile = await findOwnerResultFile(archiveId)
        await resultFile?.delete({ ignoreNotFound: true })
      }
      return null
    }
    return {
      id: archiveId.slice(0, 80),
      username,
      originalName: decodeOwnerMetadata(custom.originalName).slice(0, 180) || 'reference image',
      prompt: decodeOwnerPrompt(custom.prompt),
      contentType: String(metadata.contentType || 'image/jpeg'),
      size: Number(metadata.size || 0),
      createdAt,
      expiresAt: effectiveExpiresAt,
      modelId: 'lustify-v8',
    }
  }))
  return records.filter((record) => record?.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

async function findOwnerReferenceFile(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ''))) return null
  const [files] = await ownerArchiveBucket().getFiles({ prefix: `${OWNER_REFERENCE_PREFIX}${id}/` })
  return files.find((file) => /\/reference\.(?:png|jpe?g|webp)$/i.test(file.name)) || null
}

async function findOwnerResultFile(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ''))) return null
  const [files] = await ownerArchiveBucket().getFiles({ prefix: `${OWNER_REFERENCE_PREFIX}${id}/` })
  return files.find((file) => /\/result\.(?:png|jpe?g|webp)$/i.test(file.name)) || null
}

async function archiveLustifyReference(request, reference, prompt, archiveId, createdAt) {
  const expiresAt = new Date(Date.parse(createdAt) + OWNER_REFERENCE_RETENTION_MS).toISOString()
  const username = usernameFromLoginEmail(request.athenaUser?.email)
  const file = ownerArchiveBucket().file(ownerReferenceObjectName(archiveId, reference.metadata.type))
  await file.save(reference.data, {
    resumable: false,
    metadata: {
      contentType: reference.metadata.type,
      cacheControl: 'private, no-store, max-age=0',
      metadata: {
        archiveId,
        username,
        accountUid: String(request.athenaUser?.uid || request.athenaUser?.sub || '').slice(0, 128),
        originalName: encodeOwnerMetadata(reference.metadata.name),
        prompt: encodeOwnerPrompt(prompt),
        createdAt,
        expiresAt,
      },
    },
  })
}

async function archiveLustifyResult(request, image, contentType, archiveId, createdAt) {
  const expiresAt = new Date(Date.parse(createdAt) + OWNER_REFERENCE_RETENTION_MS).toISOString()
  const username = usernameFromLoginEmail(request.athenaUser?.email)
  const file = ownerArchiveBucket().file(ownerResultObjectName(archiveId, contentType))
  await file.save(image, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'private, no-store, max-age=0',
      metadata: { archiveId, username, createdAt, expiresAt, kind: 'lustify-result' },
    },
  })
}

async function recordOwnerGeneration(request, generation, imageId, createdAt) {
  const event = {
    id: imageId,
    username: usernameFromLoginEmail(request.athenaUser?.email),
    modelId: generation.model.id,
    requestType: generation.reference ? 'reference-edit' : 'generate',
    createdAt,
  }
  await ownerArchiveBucket().file(ownerGenerationObjectName(imageId, createdAt)).save(JSON.stringify(event), {
    resumable: false,
    metadata: { contentType: 'application/json', cacheControl: 'private, no-store, max-age=0' },
  })
}

function dataUrlAttachment(input) {
  const dataUrl = String(input?.dataUrl || '')
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i)
  if (!match) throw new Error(`Attach ${String(input?.name || 'the file')} again; its encrypted device copy is unavailable.`)
  const data = Buffer.from(match[2], 'base64')
  if (!data.length || data.length > maxAttachmentBytes) throw new Error('Hosted Athena accepts attached files up to 8 MB each.')
  const type = match[1].toLowerCase()
  const name = String(input?.name || 'attachment').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180)
  const kind = type.startsWith('image/') ? 'image' : 'file'
  return {
    metadata: { id: String(input?.id || randomUUID()), name, type, size: data.length, kind },
    data,
  }
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, providerConfigured: Boolean(providerKey()), provider: 'Venice AI' })
})

app.get('/account', async (request, response) => {
  try {
    const usage = await changeWeeklyUsage(request.athenaAccount, 0, { enforce: false })
    response.setHeader('Cache-Control', 'private, no-store')
    return response.json({ account: publicAccount(request.athenaAccount, usage) })
  } catch {
    return response.status(503).json({ error: 'Athena could not load this account\'s access information.' })
  }
})

app.get('/models', (request, response) => {
  const allModels = [...MODELS.map((model) => ({ ...model, type: 'chat' })), ...IMAGE_MODELS]
  response.json({ models: visibleModelsForAccount(request.athenaAccount, allModels) })
})

app.get('/billing', async (request, response) => {
  if (!request.athenaAccount?.canViewVeniceBalance) {
    return response.status(403).json({ error: 'Venice balance access is limited to Athena\'s owner.' })
  }
  if (!providerKey()) return response.status(503).json({ error: 'Athena is not connected to Venice yet.' })
  try {
    const upstream = await fetch('https://api.venice.ai/api/v1/api_keys/rate_limits', {
      headers: { Authorization: `Bearer ${providerKey()}` },
    })
    const data = await upstream.json().catch(() => ({}))
    if (!upstream.ok) return response.status(upstream.status).json({ error: 'Venice balance is unavailable.' })
    response.setHeader('Cache-Control', 'no-store')
    return response.json({
      canConsume: Boolean(data.data?.accessPermitted),
      consumptionCurrency: Number(data.data?.balances?.USD ?? 0) > 0 ? 'USD' : 'DIEM',
      balances: { usd: Number(data.data?.balances?.USD ?? 0), diem: Number(data.data?.balances?.DIEM ?? 0) },
      apiTier: data.data?.apiTier?.id ?? null,
    })
  } catch {
    return response.status(502).json({ error: 'Athena could not retrieve the Venice balance.' })
  }
})

app.post('/billing/checkout', (request, response) => {
  const plan = String(request.body?.plan || '')
  if (!['pro-monthly', 'pro-annual', 'enterprise-monthly'].includes(plan)) {
    return response.status(400).json({ error: 'Choose a valid Athena subscription plan.' })
  }
  return response.status(503).json({
    error: 'Secure Square checkout is not connected yet. The owner must add the Square plan credentials first.',
    code: 'SQUARE_CHECKOUT_NOT_CONFIGURED',
  })
})

app.post('/owner-center/accounts', requireOwner, async (request, response) => {
  const username = String(request.body?.username || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    return response.status(400).json({ error: 'Use a 3-32 character username containing letters, numbers, dots, dashes, or underscores.' })
  }
  const email = `${username}@athena.invalid`
  try {
    const user = await getAuth().getUserByEmail(email)
    const claims = user.customClaims || {}
    await getAuth().setCustomUserClaims(user.uid, {
      ...claims,
      athenaAccess: true,
      athenaPlan: ['pro', 'enterprise'].includes(claims.athenaPlan) ? claims.athenaPlan : 'free',
    })
    return response.status(200).json({ username, email, enabled: true })
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      return response.status(404).json({ error: `Create ${email} in Firebase Authentication first, then enable it here.` })
    }
    return response.status(503).json({ error: 'Athena could not enable that Firebase account.' })
  }
})

app.get('/owner-center/stats', requireOwner, async (_request, response) => {
  try {
    const [[generationFiles], references] = await Promise.all([
      ownerArchiveBucket().getFiles({ prefix: OWNER_GENERATION_PREFIX }),
      ownerReferenceRecords(),
    ])
    response.setHeader('Cache-Control', 'private, no-store')
    return response.json({ totalGenerated: generationFiles.length, lustifyReferences: references.length })
  } catch {
    return response.status(503).json({ error: 'Owner Center storage is unavailable. Check Firebase Storage billing and permissions.' })
  }
})

app.get('/owner-center/images', requireOwner, requireRecentOwnerAuthentication, async (_request, response) => {
  try {
    const references = await ownerReferenceRecords()
    response.setHeader('Cache-Control', 'private, no-store')
    return response.json({ images: references })
  } catch {
    return response.status(503).json({ error: 'Athena could not load the private Lustify archive.' })
  }
})

app.get('/owner-center/images/:id', requireOwner, requireRecentOwnerAuthentication, async (request, response) => {
  try {
    const file = await findOwnerReferenceFile(request.params.id)
    if (!file) return response.status(404).json({ error: 'That archived image is no longer available.' })
    const [[metadata], [bytes]] = await Promise.all([file.getMetadata(), file.download()])
    response.setHeader('Cache-Control', 'private, no-store, max-age=0')
    response.setHeader('Content-Type', String(metadata.contentType || 'image/jpeg'))
    response.setHeader('Content-Length', String(bytes.length))
    response.setHeader('X-Content-Type-Options', 'nosniff')
    return response.status(200).end(bytes)
  } catch {
    return response.status(503).json({ error: 'Athena could not retrieve that private image.' })
  }
})

app.get('/owner-center/images/:id/result', requireOwner, requireRecentOwnerAuthentication, async (request, response) => {
  try {
    const file = await findOwnerResultFile(request.params.id)
    if (!file) return response.status(404).json({ error: 'A remixed output is not available for this archive item.' })
    const [[metadata], [bytes]] = await Promise.all([file.getMetadata(), file.download()])
    response.setHeader('Cache-Control', 'private, no-store, max-age=0')
    response.setHeader('Content-Type', String(metadata.contentType || 'image/webp'))
    response.setHeader('Content-Length', String(bytes.length))
    response.setHeader('X-Content-Type-Options', 'nosniff')
    return response.status(200).end(bytes)
  } catch {
    return response.status(503).json({ error: 'Athena could not retrieve that private remixed image.' })
  }
})

app.delete('/owner-center/images/:id', requireOwner, requireRecentOwnerAuthentication, async (request, response) => {
  try {
    const file = await findOwnerReferenceFile(request.params.id)
    if (!file) return response.status(404).json({ error: 'That archived image is no longer available.' })
    const resultFile = await findOwnerResultFile(request.params.id)
    await Promise.all([
      file.delete({ ignoreNotFound: true }),
      resultFile?.delete({ ignoreNotFound: true }),
    ])
    return response.status(204).end()
  } catch {
    return response.status(503).json({ error: 'Athena could not delete that private image.' })
  }
})

app.post('/images/generate', async (request, response) => {
  if (!providerKey()) return response.status(503).json({ error: 'Athena is not connected to Venice yet.' })
  let generation
  let providerMode = 'generate'
  let referenceAttachment = null
  const imageId = randomUUID()
  const requestCreatedAt = new Date().toISOString()
  try {
    if (request.body?.referenceAttachment) {
      referenceAttachment = dataUrlAttachment(request.body.referenceAttachment)
      generation = buildImageEditProviderPayload(request.body, referenceAttachment)
      providerMode = 'reference-edit'
    } else {
      generation = buildImageProviderPayload(request.body)
    }
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid image request.' })
  }

  if (!canUseModel(request.athenaAccount, generation.model.id)) {
    return response.status(403).json({
      error: 'Upgrade your Athena plan to use that image model.',
      code: 'MODEL_UPGRADE_REQUIRED',
      requiredPlan: requiredPlanForModel(generation.model.id),
    })
  }
  const usageUnits = imageUsageUnits(generation.model.id, Boolean(referenceAttachment), request.athenaAccount)
  const usage = await reserveWeeklyUsage(request, response, usageUnits)
  if (!usage) return undefined

  if (generation.model.id === 'lustify-v8' && referenceAttachment && !isOwnerIdentity(request.athenaUser)) {
    await archiveLustifyReference(request, referenceAttachment, generation.prompt, imageId, requestCreatedAt).catch((error) => {
      console.error('Owner Center could not archive a Lustify reference.', { message: error instanceof Error ? error.message : 'Unknown storage error' })
    })
  }

  try {
    const upstream = await fetch(`https://api.venice.ai/api/v1/image/${providerMode === 'reference-edit' ? 'edit' : 'generate'}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(generation.payload),
    })
    if (!upstream.ok) {
      const detail = await upstream.text()
      let providerError = detail
      try {
        const parsed = JSON.parse(detail)
        providerError = parsed.error?.message || parsed.error || parsed.message || detail
      } catch {
        // Plain-text provider error.
      }
      await refundWeeklyUsage(request.athenaAccount, usageUnits)
      return response.status(upstream.status).json({ error: String(providerError || 'Venice rejected the image request.').slice(0, 1000) })
    }

    let providerData = {}
    let image
    let outputType = 'image/webp'
    if (providerMode === 'reference-edit') {
      image = Buffer.from(await upstream.arrayBuffer())
      const responseType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (['image/png', 'image/jpeg', 'image/webp'].includes(responseType)) outputType = responseType
    } else {
      providerData = await upstream.json().catch(() => ({}))
      image = decodeProviderImage(providerData.images?.[0])
    }
    if (image.length < 12 || image.length > 22 * 1024 * 1024) throw new Error('The generated image is too large for the hosted response.')

    const createdAt = new Date().toISOString()
    const extension = outputType === 'image/png' ? 'png' : outputType === 'image/jpeg' ? 'jpg' : 'webp'
    const metadata = {
      id: imageId,
      name: `athena-${generation.model.id}-${createdAt.slice(0, 19).replace(/[:T]/g, '-')}.${extension}`,
      type: outputType,
      size: image.length,
      width: providerMode === 'generate' && generation.model.sizing === 'pixels' ? generation.size.width : null,
      height: providerMode === 'generate' && generation.model.sizing === 'pixels' ? generation.size.height : null,
      aspectRatio: generation.payload.aspect_ratio ?? `${generation.size.width}:${generation.size.height}`,
      resolution: generation.payload.resolution ?? null,
      sizeKey: generation.sizeKey,
      modelId: generation.model.id,
      modelLabel: providerMode === 'reference-edit' ? generation.editModel.label : generation.model.label,
      providerModelId: providerMode === 'reference-edit' ? generation.editModel.id : generation.model.id,
      requestType: providerMode,
      referenceAttachment: providerMode === 'reference-edit' ? { id: generation.reference.id, name: generation.reference.name } : null,
      estimatedCost: providerMode === 'reference-edit' ? generation.editModel.price : generation.model.generationPrice,
      providerRequestId: String(providerData.id || upstream.headers.get('x-request-id') || '').slice(0, 200) || null,
      createdAt,
      url: `data:${outputType};base64,${image.toString('base64')}`,
    }
    if (generation.model.id === 'lustify-v8' && referenceAttachment && !isOwnerIdentity(request.athenaUser)) {
      await archiveLustifyResult(request, image, outputType, imageId, requestCreatedAt).catch((error) => {
        console.error('Owner Center could not archive the Lustify result.', { message: error instanceof Error ? error.message : 'Unknown storage error' })
      })
    }
    await recordOwnerGeneration(request, generation, imageId, createdAt).catch((error) => {
      console.error('Owner Center could not record an image generation.', { message: error instanceof Error ? error.message : 'Unknown storage error' })
    })
    return response.status(201).json({ image: metadata, timing: providerData.timing ?? null, usage })
  } catch (error) {
    await refundWeeklyUsage(request.athenaAccount, usageUnits)
    return response.status(502).json({ error: error instanceof Error ? error.message : 'Athena could not reach the image provider.' })
  }
})

app.post('/chat', async (request, response) => {
  if (!providerKey()) return response.status(503).json({ error: 'Athena is not connected to Venice yet.' })
  const { messages, model, webSearch = false } = request.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80) {
    return response.status(400).json({ error: 'A conversation with 1-80 messages is required.' })
  }
  if (!ALLOWED_MODELS.has(model)) return response.status(400).json({ error: 'That model is not enabled in Athena.' })
  if (!canUseModel(request.athenaAccount, model)) {
    return response.status(403).json({
      error: 'Upgrade your Athena plan to use that chat model.',
      code: 'MODEL_UPGRADE_REQUIRED',
      requiredPlan: requiredPlanForModel(model),
    })
  }
  const usageUnits = chatUsageUnits(model, Boolean(webSearch), request.athenaAccount)
  const usage = await reserveWeeklyUsage(request, response, usageUnits)
  if (!usage) return undefined

  try {
    const modelInfo = MODELS.find((entry) => entry.id === model)
    let attachmentCount = 0
    let attachmentBytes = 0
    let imageCount = 0
    const cleanMessages = messages.map((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : 'user'
      const text = String(message?.content ?? '').slice(0, 60_000)
      if (!text.trim()) throw new Error('Empty messages are not accepted.')
      const attachments = role === 'assistant' || !Array.isArray(message?.attachments) ? [] : message.attachments
      if (!attachments.length) return { role, content: text }

      const content = [{ type: 'text', text }]
      for (const input of attachments) {
        attachmentCount += 1
        if (attachmentCount > maxAttachmentsPerRequest) throw new Error(`A chat request can include at most ${maxAttachmentsPerRequest} attached files.`)
        const attachment = dataUrlAttachment(input)
        attachmentBytes += attachment.data.length
        if (attachmentBytes > maxAttachmentContextBytes) throw new Error('The active chat contains more than 20 MB of attachments. Start a new chat or use fewer files.')
        const dataUrl = `data:${attachment.metadata.type};base64,${attachment.data.toString('base64')}`
        if (attachment.metadata.kind === 'image') {
          imageCount += 1
          if (!modelInfo?.supportsVision) throw new Error('The selected model cannot analyze images.')
          if (imageCount > 1 && !modelInfo.supportsMultipleImages) throw new Error('Choose Athena Power or Athena Direct for multiple images.')
          content.push({ type: 'image_url', image_url: { url: dataUrl } })
        } else {
          content.push({ type: 'file', file: { file_data: dataUrl, filename: attachment.metadata.name } })
        }
      }
      return { role, content }
    })

    const upstream = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${providerKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...cleanMessages],
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: maxOutputTokens,
        temperature: 0.65,
        venice_parameters: {
          include_venice_system_prompt: true,
          enable_web_search: webSearch ? 'auto' : 'off',
          enable_web_citations: Boolean(webSearch),
          include_search_results_in_stream: Boolean(webSearch),
        },
      }),
    })
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 1000)
      await refundWeeklyUsage(request.athenaAccount, usageUnits)
      return response.status(upstream.status).json({ error: `The model provider rejected the request (${upstream.status}).`, detail })
    }

    response.status(200)
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.flushHeaders()
    const reader = upstream.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      response.write(value)
    }
    return response.end()
  } catch (error) {
    await refundWeeklyUsage(request.athenaAccount, usageUnits)
    if (response.headersSent) return response.end()
    const message = error instanceof Error ? error.message : 'Athena could not reach the model provider.'
    const status = /attach|image|empty|conversation/i.test(message) ? 400 : 502
    return response.status(status).json({ error: message })
  }
})

export const api = onRequest({
  region: 'us-west1',
  timeoutSeconds: 300,
  memory: '1GiB',
  secrets: [veniceApiKey],
}, app)
