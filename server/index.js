import 'dotenv/config'

import express from 'express'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildImageEditProviderPayload,
  buildImageProviderPayload,
  decodeProviderImage,
  IMAGE_MODELS,
} from './imageGeneration.js'
import { createStorage } from './storage.js'

const currentFile = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(currentFile), '..')
const distPath = path.join(projectRoot, 'dist')
const attachmentDirectory = path.join(projectRoot, 'data', 'attachments')
const generatedImageDirectory = path.join(projectRoot, 'data', 'generated-images')
mkdirSync(attachmentDirectory, { recursive: true })
mkdirSync(generatedImageDirectory, { recursive: true })
const storage = createStorage(projectRoot)

const app = express()
const port = Number(process.env.PORT || 8787)
const apiKey = process.env.VENICE_API_KEY?.trim()
const maxOutputTokens = Math.min(
  Math.max(Number(process.env.ATHENA_MAX_OUTPUT_TOKENS || 16384), 256),
  32768,
)
const maxAttachmentBytes = 25 * 1024 * 1024
const maxAttachmentsPerRequest = 8
const maxAttachmentContextBytes = 50 * 1024 * 1024

const ATTACHMENT_MIME_TYPES = new Map(Object.entries({
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/plain',
  '.sass': 'text/plain',
  '.less': 'text/plain',
  '.py': 'text/x-python',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.jsx': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.c': 'text/plain',
  '.h': 'text/plain',
  '.cpp': 'text/plain',
  '.cc': 'text/plain',
  '.cxx': 'text/plain',
  '.hpp': 'text/plain',
  '.cs': 'text/plain',
  '.java': 'text/plain',
  '.kt': 'text/plain',
  '.kts': 'text/plain',
  '.go': 'text/plain',
  '.rs': 'text/plain',
  '.swift': 'text/plain',
  '.dart': 'text/plain',
  '.php': 'text/plain',
  '.rb': 'text/plain',
  '.lua': 'text/plain',
  '.r': 'text/plain',
  '.ps1': 'text/plain',
  '.sh': 'text/plain',
  '.bash': 'text/plain',
  '.zsh': 'text/plain',
  '.sql': 'text/plain',
  '.toml': 'text/plain',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.log': 'text/plain',
  '.vue': 'text/plain',
  '.svelte': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}))
const EXTENSIONLESS_CODE_FILES = new Set(['dockerfile', 'makefile', 'cmakelists.txt'])

const MODELS = [
  {
    id: 'gemma-4-uncensored',
    label: 'Athena',
    description: 'Private, uncensored, and ideal for everyday coding',
    badge: 'Best value',
    badgeTone: 'value',
    cost: '$0.16 input · $0.50 output / 1M tokens',
    inputPrice: 0.1625,
    outputPrice: 0.5,
    supportsVision: true,
    supportsMultipleImages: false,
  },
  {
    id: 'qwen-3-6-plus',
    label: 'Athena Power',
    description: 'Stronger uncensored coding and complex reasoning',
    badge: 'Power · higher cost',
    badgeTone: 'power',
    cost: '$0.63 input · $3.75 output / 1M tokens',
    inputPrice: 0.625,
    outputPrice: 3.75,
    supportsVision: true,
    supportsMultipleImages: true,
  },
  {
    id: 'qwen3-coder-480b-a35b-instruct-turbo',
    label: 'Athena Coder',
    description: 'Dedicated model for demanding programming work',
    badge: 'Code specialist',
    badgeTone: 'code',
    cost: '$0.35 input · $1.50 output / 1M tokens',
    inputPrice: 0.35,
    outputPrice: 1.5,
    supportsVision: false,
    supportsMultipleImages: false,
  },
  {
    id: 'venice-uncensored-1-2',
    label: 'Athena Direct',
    description: 'General unfiltered conversation and exploration',
    badge: 'General',
    badgeTone: 'general',
    cost: '$0.20 input · $0.90 output / 1M tokens',
    inputPrice: 0.2,
    outputPrice: 0.9,
    supportsVision: true,
    supportsMultipleImages: true,
  },
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

app.disable('x-powered-by')
app.use('/api/storage', express.json({ limit: '25mb' }))

app.post(
  '/api/attachments',
  requireLocalStorageRequest,
  express.raw({ type: () => true, limit: maxAttachmentBytes }),
  (request, response) => {
    try {
      const rawFilename = request.get('x-athena-filename') || ''
      const decodedFilename = decodeURIComponent(rawFilename)
      const filename = path.basename(decodedFilename).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180)
      const extension = path.extname(filename).toLowerCase()
      const normalizedBasename = filename.toLowerCase()
      const mimeType = ATTACHMENT_MIME_TYPES.get(extension)
        || (EXTENSIONLESS_CODE_FILES.has(normalizedBasename) ? 'text/plain' : '')

      if (!filename || !mimeType) {
        return response.status(415).json({
          error: 'That file type is not supported. Try a PDF, Office document, spreadsheet, text/code file, or common image.',
        })
      }
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return response.status(400).json({ error: 'The selected file is empty.' })
      }

      const id = randomUUID()
      const dataPath = path.join(attachmentDirectory, `${id}.bin`)
      const metadataPath = path.join(attachmentDirectory, `${id}.json`)
      const metadata = {
        id,
        name: filename,
        type: mimeType,
        size: request.body.length,
        kind: mimeType.startsWith('image/') ? 'image' : 'file',
        createdAt: new Date().toISOString(),
      }

      writeFileSync(dataPath, request.body, { flag: 'wx' })
      try {
        writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      } catch (error) {
        rmSync(dataPath, { force: true })
        throw error
      }

      response.status(201).json({ attachment: metadata })
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to store that attachment.' })
    }
  },
)

app.get('/api/attachments/:id', requireLocalStorageRequest, (request, response) => {
  try {
    const attachment = readAttachment(request.params.id)
    response.setHeader('Cache-Control', 'private, max-age=3600')
    response.setHeader('Content-Disposition', `${attachment.metadata.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.metadata.name)}`)
    response.type(attachment.metadata.type).send(attachment.data)
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Attachment not found.' })
  }
})

app.delete('/api/attachments/:id', requireLocalStorageRequest, (request, response) => {
  if (!isAttachmentId(request.params.id)) {
    return response.status(400).json({ error: 'Invalid attachment ID.' })
  }
  rmSync(path.join(attachmentDirectory, `${request.params.id}.bin`), { force: true })
  rmSync(path.join(attachmentDirectory, `${request.params.id}.json`), { force: true })
  response.json({ ok: true })
})

app.use(express.json({ limit: '2mb' }))

function isAttachmentId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function readAttachment(id) {
  if (!isAttachmentId(id)) throw new Error('Invalid attachment ID.')
  const metadataPath = path.join(attachmentDirectory, `${id}.json`)
  const dataPath = path.join(attachmentDirectory, `${id}.bin`)
  if (!existsSync(metadataPath) || !existsSync(dataPath)) throw new Error('An attached file is no longer available. Please attach it again.')

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const data = readFileSync(dataPath)
  if (metadata.id !== id || data.length !== metadata.size || data.length > maxAttachmentBytes) {
    throw new Error('An attached file failed its local integrity check. Please attach it again.')
  }
  return { metadata, data }
}

function readGeneratedImage(id) {
  if (!isAttachmentId(id)) throw new Error('Invalid generated-image ID.')
  const metadataPath = path.join(generatedImageDirectory, `${id}.json`)
  const dataPath = path.join(generatedImageDirectory, `${id}.webp`)
  if (!existsSync(metadataPath) || !existsSync(dataPath)) {
    throw new Error('That generated image is no longer available.')
  }

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const data = readFileSync(dataPath)
  if (metadata.id !== id || data.length !== metadata.size || data.length > 30 * 1024 * 1024) {
    throw new Error('That generated image failed its local integrity check.')
  }
  return { metadata, data }
}

function requireLocalStorageRequest(request, response, next) {
  const origin = request.get('origin')
  if (!origin) return next()

  try {
    const url = new URL(origin)
    if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.protocol === 'http:') {
      return next()
    }
  } catch {
    // Invalid origins are rejected below.
  }
  return response.status(403).json({ error: 'Athena storage accepts local requests only.' })
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    providerConfigured: Boolean(apiKey),
    provider: 'Venice AI',
  })
})

app.get('/api/models', (_request, response) => {
  response.json({ models: [...MODELS.map((model) => ({ ...model, type: 'chat' })), ...IMAGE_MODELS] })
})

app.get('/api/storage', requireLocalStorageRequest, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json(storage.getInfo())
})

app.put('/api/storage', requireLocalStorageRequest, (request, response) => {
  try {
    response.json({ ok: true, state: storage.persistState(request.body?.state) })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to save Athena data.' })
  }
})

app.post('/api/storage/import', requireLocalStorageRequest, (request, response) => {
  try {
    const state = storage.importBrowserState(request.body?.state, request.body?.sourceOrigin)
    response.json({ ok: true, state, instanceId: storage.getInfo().instanceId })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to import browser data.' })
  }
})

app.post('/api/storage/backup', requireLocalStorageRequest, (_request, response) => {
  try {
    const backup = storage.createManualBackup()
    response.json({ ok: true, filename: backup.filename })
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create a backup.' })
  }
})

app.get('/api/storage/export', requireLocalStorageRequest, (_request, response) => {
  const filename = `athena-export-${new Date().toISOString().slice(0, 10)}.json`
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  response.type('application/json').send(`${JSON.stringify(storage.readState(), null, 2)}\n`)
})

app.get('/api/billing', async (_request, response) => {
  if (!apiKey) {
    return response.status(503).json({ error: 'Athena is not connected to Venice.' })
  }

  try {
    const upstream = await fetch('https://api.venice.ai/api/v1/api_keys/rate_limits', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await upstream.json()

    if (!upstream.ok) {
      return response.status(upstream.status).json({ error: 'Venice balance is unavailable.' })
    }

    response.setHeader('Cache-Control', 'no-store')
    response.json({
      canConsume: Boolean(data.data?.accessPermitted),
      consumptionCurrency: Number(data.data?.balances?.USD ?? 0) > 0 ? 'USD' : 'DIEM',
      balances: {
        usd: Number(data.data?.balances?.USD ?? 0),
        diem: Number(data.data?.balances?.DIEM ?? 0),
      },
      apiTier: data.data?.apiTier?.id ?? null,
    })
  } catch {
    response.status(502).json({ error: 'Athena could not retrieve the Venice balance.' })
  }
})

app.post('/api/images/generate', requireLocalStorageRequest, async (request, response) => {
  if (!apiKey) {
    return response.status(503).json({ error: 'Athena needs a VENICE_API_KEY in .env before it can create images.' })
  }

  let generation
  let providerMode = 'generate'
  try {
    if (request.body?.referenceAttachmentId) {
      const reference = readAttachment(request.body.referenceAttachmentId)
      generation = buildImageEditProviderPayload(request.body, reference)
      providerMode = 'reference-edit'
    } else {
      generation = buildImageProviderPayload(request.body)
    }
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid image request.' })
  }

  const controller = new AbortController()
  response.on('close', () => {
    if (!response.writableEnded) controller.abort()
  })

  try {
    const upstream = await fetch(`https://api.venice.ai/api/v1/image/${providerMode === 'reference-edit' ? 'edit' : 'generate'}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(generation.payload),
    })

    if (!upstream.ok) {
      const detail = await upstream.text()
      let providerError = ''
      try {
        const parsed = JSON.parse(detail)
        providerError = parsed.error?.message || parsed.error || parsed.message || ''
      } catch {
        providerError = detail
      }
      if (upstream.status === 402) {
        return response.status(402).json({
          error: `Your Venice ${providerMode === 'reference-edit' ? 'image-edit' : 'image'} balance is empty. Add USD or Diem credits, then try again.`,
        })
      }
      return response.status(upstream.status).json({
        error: String(providerError || `Venice rejected the image request (${upstream.status}).`).slice(0, 1000),
      })
    }

    let data = {}
    let image
    let outputType = 'image/webp'
    if (providerMode === 'reference-edit') {
      image = Buffer.from(await upstream.arrayBuffer())
      if (image.length < 12 || image.length > 30 * 1024 * 1024) {
        throw new Error('The edited image failed Athena\'s local integrity check.')
      }
      const responseType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (['image/png', 'image/jpeg', 'image/webp'].includes(responseType)) outputType = responseType
    } else {
      data = await upstream.json().catch(() => ({}))
      image = decodeProviderImage(data.images?.[0])
    }

    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const outputExtension = outputType === 'image/png' ? 'png' : outputType === 'image/jpeg' ? 'jpg' : 'webp'
    const filename = `athena-${generation.model.id}${providerMode === 'reference-edit' ? '-reference' : ''}-${createdAt.slice(0, 19).replace(/[:T]/g, '-')}.${outputExtension}`
    const metadata = {
      id,
      name: filename,
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
      referenceAttachment: providerMode === 'reference-edit'
        ? { id: generation.reference.id, name: generation.reference.name }
        : null,
      estimatedCost: providerMode === 'reference-edit' ? generation.editModel.price : generation.model.generationPrice,
      providerRequestId: String(data.id || upstream.headers.get('x-request-id') || '').slice(0, 200) || null,
      createdAt,
    }
    const dataPath = path.join(generatedImageDirectory, `${id}.webp`)
    const metadataPath = path.join(generatedImageDirectory, `${id}.json`)
    writeFileSync(dataPath, image, { flag: 'wx' })
    try {
      writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      rmSync(dataPath, { force: true })
      throw error
    }

    response.status(201).json({
      image: { ...metadata, url: `/api/generated-images/${id}` },
      timing: data.timing ?? null,
    })
  } catch (error) {
    if (error?.name === 'AbortError') return
    if (!response.headersSent) {
      response.status(502).json({ error: error instanceof Error ? error.message : 'Athena could not reach the image provider.' })
    }
  }
})

app.get('/api/generated-images/:id', requireLocalStorageRequest, (request, response) => {
  try {
    const image = readGeneratedImage(request.params.id)
    response.setHeader('Cache-Control', 'private, max-age=3600')
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(image.metadata.name)}`)
    response.type(image.metadata.type).send(image.data)
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Generated image not found.' })
  }
})

app.delete('/api/generated-images/:id', requireLocalStorageRequest, (request, response) => {
  if (!isAttachmentId(request.params.id)) {
    return response.status(400).json({ error: 'Invalid generated-image ID.' })
  }
  rmSync(path.join(generatedImageDirectory, `${request.params.id}.webp`), { force: true })
  rmSync(path.join(generatedImageDirectory, `${request.params.id}.json`), { force: true })
  response.json({ ok: true })
})

app.post('/api/chat', async (request, response) => {
  if (!apiKey) {
    return response.status(503).json({
      error: 'Athena needs a VENICE_API_KEY in .env before it can answer.',
    })
  }

  const { messages, model, webSearch = false } = request.body ?? {}

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80) {
    return response.status(400).json({ error: 'A conversation with 1–80 messages is required.' })
  }

  if (!ALLOWED_MODELS.has(model)) {
    return response.status(400).json({ error: 'That model is not enabled in Athena.' })
  }

  const normalizedMessages = messages.map((message) => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: String(message?.content ?? '').slice(0, 60_000),
    attachmentIds: message?.role === 'assistant' || !Array.isArray(message?.attachments)
      ? []
      : message.attachments.map((attachment) => String(attachment?.id || '')),
  }))

  if (normalizedMessages.some((message) => !message.content.trim())) {
    return response.status(400).json({ error: 'Empty messages are not accepted.' })
  }

  let cleanMessages
  try {
    const modelInfo = MODELS.find((entry) => entry.id === model)
    let attachmentCount = 0
    let attachmentBytes = 0
    let imageCount = 0

    cleanMessages = normalizedMessages.map((message) => {
      if (!message.attachmentIds.length) return { role: message.role, content: message.content }

      const content = [{ type: 'text', text: message.content }]
      for (const id of message.attachmentIds) {
        attachmentCount += 1
        if (attachmentCount > maxAttachmentsPerRequest) {
          throw new Error(`A chat request can include at most ${maxAttachmentsPerRequest} attached files.`)
        }

        const attachment = readAttachment(id)
        attachmentBytes += attachment.data.length
        if (attachmentBytes > maxAttachmentContextBytes) {
          throw new Error('The active chat contains more than 50 MB of attachments. Start a new chat or use fewer files.')
        }

        const dataUrl = `data:${attachment.metadata.type};base64,${attachment.data.toString('base64')}`
        if (attachment.metadata.kind === 'image') {
          imageCount += 1
          if (!modelInfo?.supportsVision) throw new Error('The selected model cannot analyze images. Choose Athena, Athena Power, or Athena Direct.')
          if (imageCount > 1 && !modelInfo.supportsMultipleImages) {
            throw new Error('The selected model accepts only one image. Choose Athena Power or Athena Direct for multiple images.')
          }
          content.push({ type: 'image_url', image_url: { url: dataUrl } })
        } else {
          content.push({
            type: 'file',
            file: { file_data: dataUrl, filename: attachment.metadata.name },
          })
        }
      }
      return { role: message.role, content }
    })
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to prepare the attached files.' })
  }

  const controller = new AbortController()
  response.on('close', () => {
    if (!response.writableEnded) controller.abort()
  })

  try {
    const upstream = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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

      if (upstream.status === 402) {
        return response.status(402).json({
          error: 'Your Venice key is valid, but its API balance is empty. Add USD or Diem credits at https://venice.ai/settings/api, then try again.',
        })
      }

      return response.status(upstream.status).json({
        error: `The model provider rejected the request (${upstream.status}).`,
        detail,
      })
    }

    response.status(200)
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders()

    const reader = upstream.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      response.write(value)
    }
    response.end()
  } catch (error) {
    if (error?.name === 'AbortError') return
    if (!response.headersSent) {
      response.status(502).json({ error: 'Athena could not reach the model provider.' })
    } else {
      response.end()
    }
  }
})

app.use(express.static(distPath))
app.get('/{*path}', (request, response, next) => {
  if (request.path.startsWith('/api/')) return next()
  response.sendFile(path.join(distPath, 'index.html'), (error) => {
    if (error) next()
  })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Athena API listening at http://127.0.0.1:${port}`)
  console.log(`Athena data stored at ${storage.getInfo().databasePath}`)
  if (!apiKey) console.log('Add VENICE_API_KEY to .env to enable model responses.')
})
