import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiFetch, apiUrl, usesRemoteApi } from './api.js'
import { extractProjectFiles, makeArchiveName } from './projectFiles.js'
import { exportSecureStorage, flushSecureStorage, secureStorage } from './secureStorage.js'
import athenaHorizontal from '../AthenaHorizontal.png'
import athenaLogo from '../AthenaLogo.png'
import {
  Archive,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Bug,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  FlaskConical,
  Globe2,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  LogOut,
  LockKeyhole,
  Menu,
  MessageSquarePlus,
  Newspaper,
  Paperclip,
  PanelLeftClose,
  Pencil,
  RefreshCw,
  RotateCcw,
  Rocket,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Square,
  ScrollText,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'

const STORAGE_KEY = 'athena:conversations:v1'
const TRASH_KEY = 'athena:trash:v1'
const SETTINGS_KEY = 'athena:settings:v1'
const USAGE_KEY = 'athena:usage:v1'
const ONBOARDING_KEY = 'athena:onboarding:v1'
const TERMS_KEY = 'athena:terms:v1'
const SERVER_MIGRATION_KEY = 'athena:server-migration:v1'
const STARTERS_SESSION_KEY = 'athena:last-starters:v1'
const ADULT_IMAGE_ACK_KEY = 'athena:adult-image-ack:v1'
const MESSAGE_TREE_VERSION = 2
const ROOT_PARENT_KEY = '__root__'
const DEFAULT_MODELS = [
  { id: 'gemma-4-uncensored', label: 'Athena', description: 'Private, uncensored, and ideal for everyday coding', badge: 'Best value', badgeTone: 'value', cost: '$0.16 input · $0.50 output / 1M tokens', inputPrice: 0.1625, outputPrice: 0.5, supportsVision: true, supportsMultipleImages: false },
  { id: 'qwen-3-6-plus', label: 'Athena Power', description: 'Stronger uncensored coding and complex reasoning', badge: 'Power · higher cost', badgeTone: 'power', cost: '$0.63 input · $3.75 output / 1M tokens', inputPrice: 0.625, outputPrice: 3.75, supportsVision: true, supportsMultipleImages: true },
  { id: 'qwen3-coder-480b-a35b-instruct-turbo', label: 'Athena Coder', description: 'Dedicated model for demanding programming work', badge: 'Code specialist', badgeTone: 'code', cost: '$0.35 input · $1.50 output / 1M tokens', inputPrice: 0.35, outputPrice: 1.5, supportsVision: false, supportsMultipleImages: false },
  { id: 'venice-uncensored-1-2', label: 'Athena Direct', description: 'General unfiltered conversation and exploration', badge: 'General', badgeTone: 'general', cost: '$0.20 input · $0.90 output / 1M tokens', inputPrice: 0.2, outputPrice: 0.9, supportsVision: true, supportsMultipleImages: true },
]
const DEFAULT_IMAGE_MODELS = [
  { id: 'z-image-turbo', type: 'image', label: 'Athena Image', description: 'Fast private image generation for everyday artwork', badge: 'Fast · private', badgeTone: 'image', cost: '$0.01 / image', generationPrice: 0.01, promptLimit: 7500, adult: false },
  { id: 'grok-imagine-image', type: 'image', label: 'Athena Imagine', description: 'Private, polished generation with stronger prompt following', badge: 'Quality · private', badgeTone: 'imagine', cost: '$0.03 / 1K image', generationPrice: 0.03, promptLimit: 7500, adult: false },
  { id: 'grok-imagine-image-quality', type: 'image', label: 'Athena Imagine HQ', description: 'Highest-quality private image generation', badge: 'Premium · private', badgeTone: 'premium', cost: '$0.06 / 1K image', generationPrice: 0.06, promptLimit: 7500, adult: false },
  { id: 'wai-Illustrious', type: 'image', label: 'Athena Anime', description: 'Private illustration model tuned for anime artwork', badge: 'Anime · private', badgeTone: 'anime', cost: '$0.01 / image', generationPrice: 0.01, promptLimit: 1500, adult: false },
  { id: 'lustify-v8', type: 'image', label: 'Athena Lustify', description: 'Private uncensored artwork for consenting adults only', badge: 'Adult · private', badgeTone: 'adult', cost: '$0.01 / image', generationPrice: 0.01, promptLimit: 1500, adult: true },
]
const IMAGE_SIZE_OPTIONS = [
  { id: 'square', label: 'Square' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'landscape', label: 'Landscape' },
]
const REFERENCE_SIZE_OPTIONS = [
  { id: 'original', label: 'Original' },
  ...IMAGE_SIZE_OPTIONS,
]
const REFERENCE_EDIT_INFO = {
  'z-image-turbo': { label: 'Athena Reference', cost: 0.04, promptLimit: 4400 },
  'grok-imagine-image': { label: 'Athena Imagine Reference', cost: 0.0323, promptLimit: 6900 },
  'grok-imagine-image-quality': { label: 'Athena Imagine HQ Reference', cost: 0.0715, promptLimit: 6900 },
  'wai-Illustrious': { label: 'Athena Anime Reference', cost: 0.04, promptLimit: 4400 },
  'lustify-v8': { label: 'Athena Lustify Reference', cost: 0.04, promptLimit: 1050, providerModel: 'Qwen Edit Uncensored' },
}
const IMAGE_STARTERS = [
  { icon: Sparkles, label: 'Cinematic portrait', prompt: 'A cinematic portrait of a fictional 30-year-old explorer, dramatic golden-hour rim lighting, windswept landscape, realistic photography, intricate detail, no text or watermark.' },
  { icon: ImageIcon, label: 'Fantasy environment', prompt: 'An ancient library carved into a cliff above a luminous ocean, sweeping fantasy concept art, atmospheric fog, volumetric light, ultra-detailed architecture, no text.' },
  { icon: Rocket, label: 'Sci-fi concept', prompt: 'A sleek research spacecraft descending through the clouds of an alien world, cinematic wide composition, physically based materials, dramatic scale, high detail.' },
]
const MAX_ATTACHMENTS = 8
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const REMOTE_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const ATTACHMENT_ACCEPT = [
  '.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.markdown', '.json',
  '.yaml', '.yml', '.xml', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.py', '.js',
  '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.cs',
  '.java', '.kt', '.kts', '.go', '.rs', '.swift', '.dart', '.php', '.rb', '.lua', '.r', '.ps1',
  '.sh', '.bash', '.zsh', '.sql', '.toml', '.ini', '.cfg', '.conf', '.log', '.vue', '.svelte',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
].join(',')

const DEFAULT_SETTINGS = {
  name: '',
  avatar: '',
  defaultModel: DEFAULT_MODELS[0].id,
  defaultWebSearch: false,
}

const STARTERS = [
  {
    icon: ShieldCheck,
    label: 'Security lab',
    prompt: 'Help me design a legal, isolated cybersecurity lab for analyzing suspicious network traffic.',
  },
  {
    icon: Archive,
    label: 'Research a claim',
    prompt: 'Build an evidence checklist for investigating a controversial historical claim without jumping to conclusions.',
  },
  {
    icon: Sparkles,
    label: 'Explain a system',
    prompt: 'Explain how a modern LLM chat app works from browser input to streamed model response.',
  },
  {
    icon: Code2,
    label: 'Build an app',
    prompt: 'Act as a principal software engineer and product designer. Help me build a production-ready ___ app that feels like it was created by a world-class Silicon Valley product team. Use a clean architecture, premium responsive interface, thoughtful UX, accessible components, secure defaults, and maintainable code. Before coding, identify the most important missing requirements and ask me only the questions needed to begin.',
  },
  {
    icon: Newspaper,
    label: 'U.S. politics briefing',
    prompt: 'Give me a concise briefing on the most important United States political news today. Use current sources, separate verified reporting from analysis, include relevant publication dates, explain why each development matters, and provide direct citations so I can verify every major claim.',
    webSearch: true,
  },
  {
    icon: FlaskConical,
    label: 'Audit my code',
    prompt: 'Act as a senior application-security engineer. Review the following code only for systems I own or am authorized to test. Identify security flaws, correctness bugs, privacy risks, performance issues, and maintainability problems. Rank findings by severity, explain the impact, and provide safe corrected code. Code: ___',
  },
  {
    icon: Bug,
    label: 'Debug a problem',
    prompt: 'Act as an expert debugging partner. Diagnose this problem methodically: ___. First identify the most likely causes, then give me the smallest useful checks to distinguish between them. After finding the cause, propose a durable fix and a focused test that prevents regression.',
  },
  {
    icon: Rocket,
    label: 'Design a startup',
    prompt: 'Act as a pragmatic startup strategist and product leader. Turn this idea into a focused business: ___. Define the ideal customer, painful problem, differentiated promise, smallest valuable MVP, business model, launch strategy, major risks, and a realistic 30-day validation plan. Challenge weak assumptions instead of simply agreeing with me.',
  },
  {
    icon: Database,
    label: 'Analyze data',
    prompt: 'Act as a senior data analyst. Help me analyze this dataset or question: ___. Clarify the decision I am trying to make, inspect data quality, choose appropriate methods, identify meaningful patterns without overstating certainty, and present the result with clear tables or charts and reproducible code where useful.',
  },
  {
    icon: BrainCircuit,
    label: 'Master a topic',
    prompt: 'Teach me ___ as if I am intelligent but new to the field. Build a mental model from first principles, use concrete examples and analogies, expose common misconceptions, then test my understanding with increasingly difficult questions and a practical exercise.',
  },
  {
    icon: Lightbulb,
    label: 'Pressure-test an idea',
    prompt: 'Critically pressure-test this idea: ___. Present the strongest case for it, the strongest case against it, hidden assumptions, second-order effects, failure modes, evidence that would change the conclusion, and the cheapest experiments I can run to learn what is actually true.',
  },
  {
    icon: ListChecks,
    label: 'Create a technical plan',
    prompt: 'Act as a technical lead. Turn this objective into an implementation plan: ___. Include scope, assumptions, architecture, milestones, dependencies, risks, security and privacy considerations, testing strategy, rollout steps, and a definition of done. Make the plan specific enough that a development team could execute it.',
  },
]

function chooseRandomStarters(excludedLabels = []) {
  const excluded = new Set(excludedLabels)
  const preferredPool = STARTERS.filter((starter) => !excluded.has(starter.label))
  const pool = preferredPool.length >= 3 ? preferredPool : [...STARTERS]

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]]
  }
  return pool.slice(0, 3)
}

function loadStarterSet() {
  try {
    const previous = JSON.parse(sessionStorage.getItem(STARTERS_SESSION_KEY))
    const selected = chooseRandomStarters(Array.isArray(previous) ? previous : [])
    sessionStorage.setItem(STARTERS_SESSION_KEY, JSON.stringify(selected.map((starter) => starter.label)))
    return selected
  } catch {
    return chooseRandomStarters()
  }
}

function parentKey(parentId) {
  return parentId ?? ROOT_PARENT_KEY
}

function migrateConversation(conversation) {
  const model = conversation.messages?.length === 0 && conversation.model === 'venice-uncensored-1-2'
    ? DEFAULT_MODELS[0].id
    : conversation.model

  if (conversation.messageTreeVersion === MESSAGE_TREE_VERSION) {
    return {
      ...conversation,
      model,
      activeChildByParent: conversation.activeChildByParent ?? {},
      messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    }
  }

  const activeChildByParent = {}
  let parentId = null
  const messages = (Array.isArray(conversation.messages) ? conversation.messages : []).map((message) => {
    const node = { ...message, parentId }
    activeChildByParent[parentKey(parentId)] = node.id
    parentId = node.id
    return node
  })

  return {
    ...conversation,
    model,
    messageTreeVersion: MESSAGE_TREE_VERSION,
    activeChildByParent,
    messages,
  }
}

function getActiveMessages(conversation) {
  if (!conversation?.messages?.length) return []

  const childrenByParent = new Map()
  conversation.messages.forEach((message) => {
    const key = parentKey(message.parentId)
    const children = childrenByParent.get(key) ?? []
    children.push(message)
    childrenByParent.set(key, children)
  })

  const path = []
  const visited = new Set()
  let currentParentId = null

  while (true) {
    const key = parentKey(currentParentId)
    const children = childrenByParent.get(key)
    if (!children?.length) break

    const selectedId = conversation.activeChildByParent?.[key]
    const selected = children.find((message) => message.id === selectedId) ?? children.at(-1)
    if (!selected || visited.has(selected.id)) break

    path.push(selected)
    visited.add(selected.id)
    currentParentId = selected.id
  }

  return path
}

function getPromptVersions(conversation, message) {
  if (!conversation || message.role !== 'user') return []
  return conversation.messages.filter((candidate) =>
    candidate.role === 'user' && (candidate.parentId ?? null) === (message.parentId ?? null),
  )
}

function makeConversation(model = DEFAULT_MODELS[0].id) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    createdAt: now,
    updatedAt: now,
    model,
    imageSize: 'square',
    webSearch: false,
    messageTreeVersion: MESSAGE_TREE_VERSION,
    activeChildByParent: {},
    messages: [],
  }
}

function loadConversations() {
  try {
    const value = JSON.parse(secureStorage.getItem(STORAGE_KEY))
    if (!Array.isArray(value)) return []

    return value.map(migrateConversation)
  } catch {
    return []
  }
}

function loadDeletedConversations() {
  try {
    const value = JSON.parse(secureStorage.getItem(TRASH_KEY))
    return Array.isArray(value) ? value.map(migrateConversation) : []
  } catch {
    return []
  }
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(secureStorage.getItem(SETTINGS_KEY)) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function loadUsage() {
  try {
    const value = JSON.parse(secureStorage.getItem(USAGE_KEY))
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function loadOnboardingComplete() {
  try {
    return secureStorage.getItem(ONBOARDING_KEY) === 'complete'
  } catch {
    return false
  }
}

function loadTerms() {
  try {
    const value = JSON.parse(secureStorage.getItem(TERMS_KEY))
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function loadMigrationRecord() {
  try {
    return JSON.parse(secureStorage.getItem(SERVER_MIGRATION_KEY))
  } catch {
    return null
  }
}

function getBrowserState() {
  return {
    schemaVersion: 1,
    conversations: loadConversations(),
    deletedConversations: loadDeletedConversations(),
    settings: loadSettings(),
    usage: loadUsage(),
    onboardingComplete: loadOnboardingComplete(),
    terms: loadTerms(),
  }
}

function hasMeaningfulBrowserState(state) {
  return Boolean(
    state.conversations.length
    || state.deletedConversations.length
    || state.usage.length
    || state.onboardingComplete
    || state.settings.name
    || state.settings.avatar,
  )
}

function formatMoney(value, minimumFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits: Math.max(minimumFractionDigits, 4),
  }).format(Number(value || 0))
}

function formatTokens(value) {
  return new Intl.NumberFormat('en-US', { notation: value > 9999 ? 'compact' : 'standard' }).format(value || 0)
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Athena could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function AttachmentChip({ attachment, removable = false, onRemove = null }) {
  const source = attachment.dataUrl || apiUrl(`/api/attachments/${attachment.id}`)
  return (
    <div className={`attachment-chip ${attachment.kind === 'image' ? 'attachment-chip--image' : ''}`}>
      {attachment.kind === 'image'
        ? <img src={source} alt="" loading="lazy" decoding="async" />
        : <span className="attachment-file-icon"><FileText size={16} /></span>}
      <span className="attachment-chip-copy">
        <strong title={attachment.name}>{attachment.name}</strong>
        <small>{attachment.kind === 'image' ? 'Image' : 'File'} · {formatFileSize(attachment.size)}</small>
      </span>
      {removable ? (
        <button type="button" onClick={() => onRemove?.(attachment.id)} aria-label={`Remove ${attachment.name}`} title="Remove attachment">
          <X size={14} />
        </button>
      ) : (
        <a href={source} download={attachment.name} aria-label={`Download ${attachment.name}`} title="Download original file">
          <Download size={14} />
        </a>
      )}
    </div>
  )
}

function GeneratedImageCard({ image, prompt, onReuse }) {
  const source = image.url || apiUrl(`/api/generated-images/${image.id}`)
  return (
    <div className="generated-image-card">
      <a href={source} target="_blank" rel="noreferrer" className="generated-image-link" title="Open full-size image">
        <img src={source} alt={prompt || 'Generated by Athena'} loading="lazy" decoding="async" />
      </a>
      <div className="generated-image-meta">
        <span>
          <strong>{image.modelLabel}</strong>
          <small>{image.width && image.height
            ? `${image.width} × ${image.height}`
            : `${image.resolution || '1K'} · ${image.aspectRatio}`}{` · ${image.sizeKey}`}{image.requestType === 'reference-edit' ? ' · reference edit' : ''}</small>
        </span>
        <div>
          <button type="button" onClick={onReuse}><RefreshCw size={13} /> Reuse prompt</button>
          <a href={source} download={image.name}><Download size={13} /> Download image</a>
        </div>
      </div>
    </div>
  )
}

function OwnerArchiveImage({ entry, onOpen }) {
  return (
    <button type="button" className="owner-archive-card owner-archive-card--button" onClick={() => onOpen(entry)} aria-label={`View private reference from ${entry.username}`}>
      <div className="owner-archive-card-icon"><ImageIcon size={22} /></div>
      <div className="owner-archive-copy">
        <span><strong>@{entry.username}</strong><small>{new Date(entry.createdAt).toLocaleString()}</small></span>
        <small title={entry.originalName}>{entry.originalName} · {formatFileSize(entry.size)}</small>
        <p className="owner-archive-summary">{entry.prompt || 'Prompt unavailable for this older archive item.'}</p>
        <span className="owner-archive-open-hint">Click to view uploaded image and full prompt <ChevronRight size={13} /></span>
      </div>
    </button>
  )
}

function OwnerArchiveDetail({ entry, onClose, onDelete }) {
  const [sources, setSources] = useState({ reference: '', result: '' })
  const [loadError, setLoadError] = useState('')
  const [activeImage, setActiveImage] = useState(0)
  const touchStartX = useRef(null)

  useEffect(() => {
    let cancelled = false
    const objectUrls = []
    const loadImage = async (kind, endpoint) => {
      const response = await apiFetch(endpoint, { cache: 'no-store' })
      if (!response.ok) {
        if (kind === 'result' && response.status === 404) return
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Private image unavailable.')
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      objectUrls.push(objectUrl)
      if (!cancelled) setSources((current) => ({ ...current, [kind]: objectUrl }))
    }
    Promise.all([
      loadImage('reference', `/api/owner-center/images/${entry.id}`),
      loadImage('result', `/api/owner-center/images/${entry.id}/result`),
    ]).catch((error) => !cancelled && setLoadError(error.message))
    return () => {
      cancelled = true
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
    }
  }, [entry.id])

  const imageSource = activeImage === 1 ? sources.result : sources.reference
  const hasResult = Boolean(sources.result)
  function moveImage(direction) {
    if (!hasResult) return
    setActiveImage((current) => Math.min(1, Math.max(0, current + direction)))
  }

  return (
    <div className="settings-overlay owner-center-overlay owner-image-detail-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="owner-image-detail-panel" role="dialog" aria-modal="true" aria-labelledby="owner-image-detail-title">
        <header className="settings-header owner-center-header">
          <div>
            <p className="eyebrow">Private reference detail</p>
            <h2 id="owner-image-detail-title">@{entry.username}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close image detail"><X size={19} /></button>
        </header>
        <div className="owner-image-detail-body">
          <div className="owner-image-detail-preview" onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null }} onTouchEnd={(event) => {
            if (touchStartX.current === null) return
            const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
            if (Math.abs(delta) > 45) moveImage(delta < 0 ? 1 : -1)
            touchStartX.current = null
          }}>
            {imageSource ? <img src={imageSource} alt={`${activeImage === 1 ? 'Lustify output' : 'Uploaded reference'} for ${entry.username}`} /> : loadError ? <span className="owner-archive-load-error"><ImageIcon size={19} />{loadError}</span> : <span className="owner-archive-loading"><RefreshCw size={18} className="spin" />Loading private images</span>}
            {hasResult && <div className="owner-image-detail-nav"><button type="button" onClick={() => moveImage(-1)} disabled={activeImage === 0} aria-label="Show uploaded reference"><ChevronLeft size={17} /></button><span>{activeImage === 0 ? 'Uploaded reference' : 'Lustify output'} · swipe</span><button type="button" onClick={() => moveImage(1)} disabled={activeImage === 1} aria-label="Show Lustify output"><ChevronRight size={17} /></button></div>}
          </div>
          <div className="owner-image-detail-meta">
            <div className="owner-image-detail-facts"><span><small>Uploaded by</small><strong>@{entry.username}</strong></span><span><small>Prompt time</small><strong>{new Date(entry.createdAt).toLocaleString()}</strong></span><span><small>File</small><strong>{entry.originalName} · {formatFileSize(entry.size)}</strong></span></div>
            <div className="owner-archive-prompt"><small>Prompt used</small><p>{entry.prompt || 'Prompt unavailable for this older archive item.'}</p></div>
            <div className="owner-image-detail-actions">
              {imageSource && <a href={imageSource} download={activeImage === 1 ? `athena-lustify-output-${entry.id}.webp` : entry.originalName}><Download size={13} /> Download {activeImage === 1 ? 'output' : 'reference'}</a>}
              <button type="button" onClick={() => onDelete(entry)}><Trash2 size={13} /> Delete archive item</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function UpgradeModal({ currentTier, requiredPlan, loading, error, onCheckout, onClose }) {
  const plans = [
    {
      id: 'pro-monthly',
      name: 'Pro Monthly',
      price: '$17.99',
      cadence: 'per month',
      detail: 'Flexible access to Athena, Coder, Imagine, and Imagine HQ.',
      tone: 'pro',
    },
    {
      id: 'pro-annual',
      name: 'Pro Annual',
      price: '$149',
      cadence: 'per year',
      detail: 'The complete Pro model set with the strongest long-term value.',
      tone: 'annual',
      badge: 'Save $66.88',
    },
    {
      id: 'enterprise-monthly',
      name: 'Enterprise',
      price: '$299',
      cadence: 'per month',
      detail: 'Adds Athena Power, the largest weekly allowance, and no request cooldown.',
      tone: 'enterprise',
      badge: requiredPlan === 'enterprise' ? 'Required for Power' : 'Maximum access',
    },
  ]

  return (
    <div className="settings-overlay upgrade-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="upgrade-panel" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <button className="icon-button upgrade-close" type="button" onClick={onClose} aria-label="Close upgrade plans"><X size={18} /></button>
        <div className="upgrade-heading">
          <span className="upgrade-mark"><Sparkles size={20} /></span>
          <p className="eyebrow">Athena membership</p>
          <h2 id="upgrade-title">Unlock more ways to create.</h2>
          <p>Upgrade for advanced coding, stronger reasoning, premium image generation, and a larger weekly allowance.</p>
        </div>
        <div className="upgrade-plan-grid">
          {plans.map((plan) => {
            const alreadyIncluded = currentTier === 'enterprise' || (currentTier === 'pro' && plan.id !== 'enterprise-monthly')
            return (
              <article className={`upgrade-plan upgrade-plan--${plan.tone}`} key={plan.id}>
                <div className="upgrade-plan-title"><strong>{plan.name}</strong>{plan.badge && <span>{plan.badge}</span>}</div>
                <div className="upgrade-price"><strong>{plan.price}</strong><small>{plan.cadence}</small></div>
                <p>{plan.detail}</p>
                <ul>
                  <li><Check size={12} /> Advanced chat models</li>
                  <li><Check size={12} /> Premium image models</li>
                  <li><Check size={12} /> Seven-day usage refill</li>
                </ul>
                <button type="button" onClick={() => onCheckout(plan.id)} disabled={loading || alreadyIncluded}>
                  {alreadyIncluded ? 'Current access' : loading ? 'Connecting...' : `Choose ${plan.name}`}
                </button>
              </article>
            )
          })}
        </div>
        {error && <p className="upgrade-error" role="alert">{error}</p>}
        <button className="upgrade-continue" type="button" onClick={onClose}>Continue with my current models</button>
      </section>
    </div>
  )
}

function titleFromMessage(content) {
  const words = content.trim().replace(/\s+/g, ' ').split(' ')
  const title = words.slice(0, 7).join(' ')
  return title.length > 48 ? `${title.slice(0, 47)}…` : title
}

function parseSseEvent(block) {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')

  if (!data || data === '[DONE]') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function createAvatarDataUrl(file) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error('Choose a PNG, JPG, or WebP image.')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 8 MB.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
    const sourceX = (image.naturalWidth - sourceSize) / 2
    const sourceY = (image.naturalHeight - sourceSize) / 2
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare that profile picture.')
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256)
    return canvas.toDataURL('image/webp', 0.86)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function validateReferenceImageFile(file) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error('Reference editing supports PNG, JPG, and WebP images.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    const pixels = image.naturalWidth * image.naturalHeight
    if (pixels < 65_536) throw new Error('Choose a reference image that is at least 256 × 256 pixels.')
    if (pixels > 33_177_600) throw new Error('That reference image has too many pixels. Use an image under about 33 megapixels.')
  } catch (error) {
    if (error instanceof Error && error.message) throw error
    throw new Error('Athena could not read that reference image.')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function App({
  currentUsername,
  currentRole,
  currentRoleTone,
  canViewVeniceBalance,
  isOwner,
  isAdmin,
  accountTier,
  accountPlanLabel,
  accountUsage,
  allowedModelIds,
  onLogout,
  onChangePassword,
  onUnlockOwnerCenter,
  onRefreshAccount,
}) {
  const [conversations, setConversations] = useState(loadConversations)
  const [deletedConversations, setDeletedConversations] = useState(loadDeletedConversations)
  const [activeId, setActiveId] = useState(() => loadConversations()[0]?.id ?? null)
  const [models, setModels] = useState([...DEFAULT_MODELS.map((model) => ({ ...model, type: 'chat' })), ...DEFAULT_IMAGE_MODELS])
  const [input, setInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [providerConfigured, setProviderConfigured] = useState(null)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [onboardingComplete, setOnboardingComplete] = useState(loadOnboardingComplete)
  const [onboardingName, setOnboardingName] = useState(() => loadSettings().name ?? '')
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsScrolled, setTermsScrolled] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [starterSet, setStarterSet] = useState(loadStarterSet)
  const [starterCycle, setStarterCycle] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [preferences, setPreferences] = useState(loadSettings)
  const [usageEntries, setUsageEntries] = useState(loadUsage)
  const [termsRecord, setTermsRecord] = useState(loadTerms)
  const [storageReady, setStorageReady] = useState(false)
  const [storageStatus, setStorageStatus] = useState('loading')
  const [storageInfo, setStorageInfo] = useState(null)
  const [storageMessage, setStorageMessage] = useState('')
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [attachmentsUploading, setAttachmentsUploading] = useState(false)
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [zipDownloadingId, setZipDownloadingId] = useState(null)
  const [adultImageAcknowledged, setAdultImageAcknowledged] = useState(() => secureStorage.getItem(ADULT_IMAGE_ACK_KEY) === 'accepted')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountMessage, setAccountMessage] = useState('')
  const [accountError, setAccountError] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [ownerStats, setOwnerStats] = useState(null)
  const [ownerStatsLoading, setOwnerStatsLoading] = useState(false)
  const [ownerStatsError, setOwnerStatsError] = useState('')
  const [ownerPasswordOpen, setOwnerPasswordOpen] = useState(false)
  const [ownerPassword, setOwnerPassword] = useState('')
  const [ownerUnlocking, setOwnerUnlocking] = useState(false)
  const [ownerUnlockError, setOwnerUnlockError] = useState('')
  const [ownerCenterOpen, setOwnerCenterOpen] = useState(false)
  const [ownerImages, setOwnerImages] = useState([])
  const [ownerImagesLoading, setOwnerImagesLoading] = useState(false)
  const [ownerImagesError, setOwnerImagesError] = useState('')
  const [ownerSelectedImage, setOwnerSelectedImage] = useState(null)
  const [adultConfirmModel, setAdultConfirmModel] = useState(null)
  const [adultConfirmChecked, setAdultConfirmChecked] = useState(false)
  const [referenceConsentAcknowledged, setReferenceConsentAcknowledged] = useState(false)
  const [referenceImageSize, setReferenceImageSize] = useState('original')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeRequiredPlan, setUpgradeRequiredPlan] = useState('pro')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [ownerEnableUsername, setOwnerEnableUsername] = useState('')
  const [ownerEnableLoading, setOwnerEnableLoading] = useState(false)
  const [ownerEnableError, setOwnerEnableError] = useState('')
  const [ownerEnableMessage, setOwnerEnableMessage] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const editTextareaRef = useRef(null)
  const conversationTitleRef = useRef(null)
  const avatarInputRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const termsContentRef = useRef(null)
  const storageSaveChainRef = useRef(Promise.resolve())
  const conversationsRef = useRef(conversations)
  const conversationPersistTimerRef = useRef(null)
  const lastConversationPersistAtRef = useRef(0)

  const allowedModelSet = useMemo(() => new Set(allowedModelIds || []), [allowedModelIds])

  function isModelLocked(model) {
    if (!model) return false
    if (typeof model.locked === 'boolean') return model.locked
    return allowedModelSet.size > 0 && !allowedModelSet.has(model.id)
  }

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null
  const activeMessages = useMemo(() => getActiveMessages(active), [active])
  const activeAttachmentCount = useMemo(
    () => activeMessages.reduce((total, message) => total + (message.attachments?.length ?? 0), 0),
    [activeMessages],
  )
  const selectedConversationModel = models.find((model) => model.id === active?.model)
  const accessibleFallbackModel = models.find((model) => model.id === 'venice-uncensored-1-2' && !isModelLocked(model))
    ?? models.find((model) => !isModelLocked(model))
  const activeModel = selectedConversationModel && !isModelLocked(selectedConversationModel)
    ? selectedConversationModel
    : accessibleFallbackModel ?? models[0]
  const chatModels = useMemo(() => models.filter((model) => model.type !== 'image'), [models])
  const imageModels = useMemo(
    () => models.filter((model) => model.type === 'image' && (model.id !== 'lustify-v8' || isOwner || isAdmin)),
    [isAdmin, isOwner, models],
  )
  const isImageMode = activeModel?.type === 'image'
  const imageReference = isImageMode && pendingAttachments.length === 1 && pendingAttachments[0].kind === 'image'
    ? pendingAttachments[0]
    : null
  const invalidImageAttachments = isImageMode && pendingAttachments.length > 0 && !imageReference
  const referenceEditInfo = isImageMode ? REFERENCE_EDIT_INFO[activeModel?.id] : null
  const starterGridReady = onboardingComplete

  useEffect(() => {
    conversationsRef.current = conversations
    if (conversationPersistTimerRef.current !== null) return
    const elapsed = Date.now() - lastConversationPersistAtRef.current
    conversationPersistTimerRef.current = window.setTimeout(() => {
      conversationPersistTimerRef.current = null
      secureStorage.setItem(STORAGE_KEY, JSON.stringify(conversationsRef.current))
      lastConversationPersistAtRef.current = Date.now()
    }, Math.max(0, 500 - elapsed))
  }, [conversations])

  useEffect(() => {
    function persistBeforePageHide() {
      if (conversationPersistTimerRef.current !== null) {
        window.clearTimeout(conversationPersistTimerRef.current)
        conversationPersistTimerRef.current = null
      }
      void flushSecureStorage()
    }

    window.addEventListener('pagehide', persistBeforePageHide)
    return () => {
      window.removeEventListener('pagehide', persistBeforePageHide)
      if (conversationPersistTimerRef.current !== null) window.clearTimeout(conversationPersistTimerRef.current)
    }
  }, [])

  useEffect(() => {
    secureStorage.setItem(TRASH_KEY, JSON.stringify(deletedConversations))
  }, [deletedConversations])

  useEffect(() => {
    secureStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences))
  }, [preferences])

  useEffect(() => {
    secureStorage.setItem(USAGE_KEY, JSON.stringify(usageEntries.slice(0, 1000)))
  }, [usageEntries])

  useEffect(() => {
    if (!attachmentNotice) return undefined
    const dismissTimer = window.setTimeout(() => setAttachmentNotice(''), 3500)
    return () => window.clearTimeout(dismissTimer)
  }, [attachmentNotice])

  useEffect(() => {
    let cancelled = false

    async function hydrateStorage() {
      const browserState = getBrowserState()
      if (usesRemoteApi) {
        setTermsAccepted(Boolean(browserState.terms))
        setStorageInfo({ databasePath: 'Encrypted IndexedDB on this device' })
        setStorageStatus('saved')
        setStorageMessage('AES-GCM encrypted device vault is active.')
        setStorageReady(true)
        return
      }
      try {
        const response = await apiFetch('/api/storage', { cache: 'no-store' })
        const info = await response.json()
        if (!response.ok) throw new Error(info.error || 'Local storage is unavailable.')

        let storedState = info.state
        const migrationRecord = loadMigrationRecord()
        if (hasMeaningfulBrowserState(browserState) && migrationRecord?.instanceId !== info.instanceId) {
          const importResponse = await apiFetch('/api/storage/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: browserState, sourceOrigin: window.location.origin }),
          })
          const imported = await importResponse.json()
          if (!importResponse.ok) throw new Error(imported.error || 'Athena could not import browser history.')
          storedState = imported.state
          secureStorage.setItem(SERVER_MIGRATION_KEY, JSON.stringify({
            instanceId: imported.instanceId,
            importedAt: new Date().toISOString(),
            sourceOrigin: window.location.origin,
          }))
        }

        if (cancelled) return
        const storedConversations = Array.isArray(storedState?.conversations)
          ? storedState.conversations.map(migrateConversation)
          : []
        const storedDeleted = Array.isArray(storedState?.deletedConversations)
          ? storedState.deletedConversations.map(migrateConversation)
          : []
        const storedSettings = { ...DEFAULT_SETTINGS, ...(storedState?.settings ?? {}) }

        setConversations(storedConversations)
        setDeletedConversations(storedDeleted)
        setActiveId((current) => storedConversations.some((item) => item.id === current)
          ? current
          : storedConversations[0]?.id ?? null)
        setPreferences(storedSettings)
        setOnboardingName(storedSettings.name ?? '')
        setUsageEntries(Array.isArray(storedState?.usage) ? storedState.usage : [])
        setOnboardingComplete(Boolean(storedState?.onboardingComplete))
        setTermsRecord(storedState?.terms ?? null)
        setTermsAccepted(Boolean(storedState?.terms))
        setStorageInfo(info)
        setStorageStatus('saved')
        setStorageReady(true)
      } catch (storageError) {
        if (cancelled) return
        setStorageStatus('error')
        setStorageMessage(storageError.message)
      }
    }

    hydrateStorage()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!storageReady) return undefined

    if (usesRemoteApi) {
      setStorageStatus('saved')
      return undefined
    }

    const timer = window.setTimeout(() => {
      const state = {
        schemaVersion: 1,
        conversations,
        deletedConversations,
        settings: preferences,
        usage: usageEntries,
        onboardingComplete,
        terms: termsRecord,
      }
      setStorageStatus('saving')
      storageSaveChainRef.current = storageSaveChainRef.current
        .catch(() => {})
        .then(async () => {
          const response = await apiFetch('/api/storage', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state }),
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Athena could not save its local database.')
          setStorageStatus('saved')
          setStorageMessage('')
          setStorageInfo((current) => ({ ...current, lastSavedAt: new Date().toISOString() }))
        })
        .catch((saveError) => {
          setStorageStatus('error')
          setStorageMessage(saveError.message)
        })
    }, 450)

    return () => window.clearTimeout(timer)
  }, [conversations, deletedConversations, onboardingComplete, preferences, storageReady, termsRecord, usageEntries])

  useEffect(() => {
    apiFetch('/api/health')
      .then((response) => response.json())
      .then((data) => setProviderConfigured(Boolean(data.providerConfigured)))
      .catch(() => setProviderConfigured(false))

    apiFetch('/api/models')
      .then((response) => response.json())
      .then((data) => Array.isArray(data.models) && setModels(data.models))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!active || (selectedConversationModel && !isModelLocked(selectedConversationModel))) return
    const fallback = models.find((model) => model.id === 'venice-uncensored-1-2' && !isModelLocked(model))
      ?? models.find((model) => !isModelLocked(model))
    if (fallback && active.model !== fallback.id) {
      updateConversation(active.id, (current) => ({ ...current, model: fallback.id }))
    }
  }, [active?.id, active?.model, allowedModelSet, models, selectedConversationModel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' })
  }, [activeMessages, isStreaming])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = '0px'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
  }, [input])

  useEffect(() => {
    if (!editingMessageId || !editTextareaRef.current) return
    editTextareaRef.current.style.height = '0px'
    editTextareaRef.current.style.height = `${Math.min(editTextareaRef.current.scrollHeight, 240)}px`
  }, [editText, editingMessageId])

  const visibleConversations = useMemo(() => {
    const needle = searchText.trim().toLowerCase()
    return [...conversations]
      .filter((conversation) => !needle || conversation.title.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [conversations, searchText])

  const usageSummary = useMemo(() => usageEntries.reduce((summary, entry) => ({
    requests: summary.requests + 1,
    inputTokens: summary.inputTokens + Number(entry.inputTokens || 0),
    outputTokens: summary.outputTokens + Number(entry.outputTokens || 0),
    estimatedCost: summary.estimatedCost + Number(entry.estimatedCost || 0),
    webRequests: summary.webRequests + (entry.webSearchUsed ? 1 : 0),
  }), { requests: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, webRequests: 0 }), [usageEntries])

  const usageByModel = useMemo(() => {
    const grouped = new Map()
    usageEntries.forEach((entry) => {
      const current = grouped.get(entry.modelId) ?? { requests: 0, tokens: 0, cost: 0 }
      current.requests += 1
      current.tokens += Number(entry.totalTokens || 0)
      current.cost += Number(entry.estimatedCost || 0)
      grouped.set(entry.modelId, current)
    })
    return [...grouped.entries()].sort((a, b) => b[1].cost - a[1].cost)
  }, [usageEntries])

  async function refreshBilling() {
    if (!canViewVeniceBalance) return
    setBillingLoading(true)
    setBillingError('')
    try {
      const response = await apiFetch('/api/billing', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Balance unavailable')
      setBilling(data)
    } catch (requestError) {
      setBillingError(requestError.message)
    } finally {
      setBillingLoading(false)
    }
  }

  async function refreshOwnerStats() {
    if (!isOwner) return
    setOwnerStatsLoading(true)
    setOwnerStatsError('')
    try {
      const response = await apiFetch('/api/owner-center/stats', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Owner Center statistics are unavailable.')
      setOwnerStats(data)
    } catch (requestError) {
      setOwnerStatsError(requestError.message)
    } finally {
      setOwnerStatsLoading(false)
    }
  }

  async function beginCheckout(plan) {
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const response = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Secure checkout is unavailable.')
      if (!/^https:\/\//i.test(data.url || '')) throw new Error('Square returned an invalid checkout address.')
      window.location.assign(data.url)
    } catch (requestError) {
      setCheckoutError(requestError.message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  function showUpgrade(requiredPlan = 'pro') {
    setUpgradeRequiredPlan(requiredPlan === 'enterprise' ? 'enterprise' : 'pro')
    setCheckoutError('')
    setModelMenuOpen(false)
    setUpgradeOpen(true)
  }

  async function enableFirebaseAccount(event) {
    event.preventDefault()
    if (!ownerEnableUsername.trim() || ownerEnableLoading) return
    setOwnerEnableLoading(true)
    setOwnerEnableError('')
    setOwnerEnableMessage('')
    try {
      const response = await apiFetch('/api/owner-center/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ownerEnableUsername }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Athena could not enable that account.')
      setOwnerEnableMessage(`@${data.username} can now sign in with Free access.`)
      setOwnerEnableUsername('')
    } catch (requestError) {
      setOwnerEnableError(requestError.message)
    } finally {
      setOwnerEnableLoading(false)
    }
  }

  function requestOwnerCenterUnlock() {
    if (!isOwner) return
    setOwnerPassword('')
    setOwnerUnlockError('')
    setOwnerPasswordOpen(true)
  }

  async function unlockOwnerCenter(event) {
    event.preventDefault()
    if (!ownerPassword || ownerUnlocking) return
    setOwnerUnlocking(true)
    setOwnerUnlockError('')
    try {
      await onUnlockOwnerCenter(ownerPassword)
      setOwnerImagesLoading(true)
      const response = await apiFetch('/api/owner-center/images', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The private Lustify archive is unavailable.')
      setOwnerImages(Array.isArray(data.images) ? data.images : [])
      setOwnerPassword('')
      setOwnerPasswordOpen(false)
      setOwnerSelectedImage(null)
      setOwnerCenterOpen(true)
      setOwnerImagesError('')
      await refreshOwnerStats()
    } catch (requestError) {
      setOwnerUnlockError(requestError.message)
    } finally {
      setOwnerUnlocking(false)
      setOwnerImagesLoading(false)
    }
  }

  async function deleteOwnerImage(entry) {
    if (!window.confirm(`Delete the private Lustify reference uploaded by @${entry.username}?`)) return
    setOwnerImagesError('')
    try {
      const response = await apiFetch(`/api/owner-center/images/${entry.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'The private image could not be deleted.')
      }
      setOwnerImages((current) => current.filter((image) => image.id !== entry.id))
      setOwnerSelectedImage(null)
      setOwnerStats((current) => current ? {
        ...current,
        lustifyReferences: Math.max(0, Number(current.lustifyReferences || 0) - 1),
      } : current)
    } catch (requestError) {
      setOwnerImagesError(requestError.message)
    }
  }

  function openSettings() {
    setSettingsOpen(true)
    setMobileSidebar(false)
    if (canViewVeniceBalance) refreshBilling()
    if (isOwner) refreshOwnerStats()
  }

  async function saveNewPassword(event) {
    event.preventDefault()
    setAccountError('')
    setAccountMessage('')
    if (!currentPassword) {
      setAccountError('Enter your current password to confirm the change.')
      return
    }
    if (newPassword.length < 8) {
      setAccountError('Use at least 8 characters for the new password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setAccountError('The two new-password entries do not match.')
      return
    }
    setAccountSaving(true)
    try {
      await onChangePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setAccountMessage('Password changed. Your encrypted device vault was updated too.')
    } catch (changeError) {
      setAccountError(changeError.message)
    } finally {
      setAccountSaving(false)
    }
  }

  async function logout() {
    setAccountError('')
    setAccountMessage('')
    setAccountSaving(true)
    try {
      if (conversationPersistTimerRef.current !== null) {
        window.clearTimeout(conversationPersistTimerRef.current)
        conversationPersistTimerRef.current = null
      }
      secureStorage.setItem(STORAGE_KEY, JSON.stringify(conversationsRef.current))
      await onLogout()
    } catch (logoutError) {
      setAccountError(logoutError.message)
      setAccountSaving(false)
    }
  }

  function fillComposer(prompt) {
    setInput(prompt)
    setError('')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function fillStarter(starter) {
    fillComposer(starter.prompt)
    if (!starter.webSearch) return
    const conversation = ensureConversation()
    updateConversation(conversation.id, (current) => ({ ...current, webSearch: true }))
  }

  function cycleStarters() {
    const selected = chooseRandomStarters(starterSet.map((starter) => starter.label))
    setStarterSet(selected)
    setStarterCycle((cycle) => cycle + 1)
    try {
      sessionStorage.setItem(STARTERS_SESSION_KEY, JSON.stringify(selected.map((starter) => starter.label)))
    } catch {
      // Suggestions still rotate when session storage is unavailable.
    }
  }

  function clearUsageHistory() {
    if (window.confirm('Clear Athena\'s local token ledger? This will not change your Venice balance.')) {
      setUsageEntries([])
    }
  }

  function openAvatarPicker() {
    setAvatarError('')
    avatarInputRef.current?.click()
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setAvatarError('')
    try {
      const avatar = await createAvatarDataUrl(file)
      setPreferences((current) => ({ ...current, avatar }))
    } catch (uploadError) {
      setAvatarError(uploadError.message)
    }
  }

  function removeAvatar() {
    setPreferences((current) => ({ ...current, avatar: '' }))
    setAvatarError('')
  }

  function openTermsModal() {
    setTermsOpen(true)
    setTermsScrolled(termsAccepted)
    requestAnimationFrame(() => {
      if (!termsContentRef.current) return
      termsContentRef.current.scrollTop = 0
      if (termsContentRef.current.scrollHeight <= termsContentRef.current.clientHeight + 1) {
        setTermsScrolled(true)
      }
    })
  }

  function handleTermsScroll(event) {
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 20) {
      setTermsScrolled(true)
    }
  }

  function acceptTerms() {
    if (!termsScrolled) return
    const acceptedAt = new Date().toISOString()
    setTermsAccepted(true)
    setTermsOpen(false)
    const record = { version: 1, acceptedAt }
    setTermsRecord(record)
    secureStorage.setItem(TERMS_KEY, JSON.stringify(record))
  }

  function completeOnboarding() {
    const name = onboardingName.trim()
    if (!name || !termsAccepted) return
    setPreferences((current) => ({ ...current, name }))
    secureStorage.setItem(ONBOARDING_KEY, 'complete')
    setOnboardingComplete(true)
  }

  function createConversation() {
    if (isStreaming) abortRef.current?.abort()
    pendingAttachments.forEach((attachment) => {
      if (!usesRemoteApi) apiFetch(`/api/attachments/${attachment.id}`, { method: 'DELETE' }).catch(() => {})
    })
    const requestedModel = models.find((model) => model.id === (active?.model ?? preferences.defaultModel))
    const fallbackModel = models.find((model) => model.id === 'venice-uncensored-1-2' && !isModelLocked(model))
      ?? models.find((model) => !isModelLocked(model))
    const conversation = makeConversation(requestedModel && !isModelLocked(requestedModel) ? requestedModel.id : fallbackModel?.id)
    conversation.webSearch = active ? active.webSearch : preferences.defaultWebSearch
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    setInput('')
    setPendingAttachments([])
    setReferenceConsentAcknowledged(false)
    setReferenceImageSize('original')
    setAttachmentNotice('')
    setEditingMessageId(null)
    setEditText('')
    cancelEditingConversation()
    setError('')
    setMobileSidebar(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function ensureConversation() {
    if (active) return active
    const requestedModel = models.find((model) => model.id === preferences.defaultModel)
    const conversation = makeConversation(requestedModel && !isModelLocked(requestedModel)
      ? requestedModel.id
      : accessibleFallbackModel?.id)
    conversation.webSearch = preferences.defaultWebSearch
    setConversations((current) => [conversation, ...current])
    setActiveId(conversation.id)
    return conversation
  }

  function updateConversation(id, updater) {
    setConversations((current) => current.map((item) => (item.id === id ? updater(item) : item)))
  }

  function deleteConversation(id) {
    const deleted = conversations.find((conversation) => conversation.id === id)
    if (!deleted) return
    const deletedAt = new Date().toISOString()
    setDeletedConversations((current) => [
      { ...deleted, deletedAt },
      ...current.filter((conversation) => conversation.id !== id),
    ])
    const remaining = conversations.filter((conversation) => conversation.id !== id)
    setConversations(remaining)
    if (activeId === id) setActiveId(remaining[0]?.id ?? null)
    if (editingConversationId === id) cancelEditingConversation()
  }

  function restoreConversation(id) {
    const restored = deletedConversations.find((conversation) => conversation.id === id)
    if (!restored) return
    const { deletedAt: _deletedAt, ...conversation } = restored
    const restoredConversation = { ...conversation, updatedAt: new Date().toISOString() }
    setDeletedConversations((current) => current.filter((item) => item.id !== id))
    setConversations((current) => [restoredConversation, ...current.filter((item) => item.id !== id)])
    setActiveId(id)
    setTrashOpen(false)
    setMobileSidebar(false)
  }

  function permanentlyDeleteConversation(id) {
    const conversation = deletedConversations.find((item) => item.id === id)
    if (!conversation) return
    const confirmed = window.confirm(
      `Permanently delete "${conversation.title}" from Athena and the Chrome safety copy?\n\nHistorical backup snapshots may still contain an older copy. This action cannot be undone from Trash.`,
    )
    if (!confirmed) return
    const attachmentIds = new Set(conversation.messages.flatMap((message) => (
      message.attachments?.map((attachment) => attachment.id) ?? []
    )))
    attachmentIds.forEach((attachmentId) => {
      if (!usesRemoteApi) apiFetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' }).catch(() => {})
    })
    const generatedImageIds = new Set(conversation.messages
      .map((message) => message.generatedImage?.id)
      .filter(Boolean))
    generatedImageIds.forEach((imageId) => {
      if (!usesRemoteApi) apiFetch(`/api/generated-images/${imageId}`, { method: 'DELETE' }).catch(() => {})
    })
    setDeletedConversations((current) => current.filter((item) => item.id !== id))
  }

  async function createLocalBackup() {
    setStorageMessage('Creating backup...')
    try {
      if (usesRemoteApi) {
        const snapshot = await exportSecureStorage()
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `athena-device-backup-${new Date().toISOString().slice(0, 10)}.json`
        anchor.click()
        URL.revokeObjectURL(url)
        setStorageMessage('Downloaded a decrypted backup for your personal archive.')
        return
      }
      await storageSaveChainRef.current.catch(() => {})
      const response = await apiFetch('/api/storage/backup', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create a backup.')
      setStorageMessage(`Created ${data.filename}`)
    } catch (backupError) {
      setStorageStatus('error')
      setStorageMessage(backupError.message)
    }
  }

  async function exportAllData() {
    if (usesRemoteApi) {
      await createLocalBackup()
      return
    }
    const anchor = document.createElement('a')
    anchor.href = apiUrl('/api/storage/export')
    anchor.download = ''
    anchor.click()
  }

  function startEditingConversation(event, conversation) {
    event.stopPropagation()
    setEditingConversationId(conversation.id)
    setConversationTitleDraft(conversation.title)
    requestAnimationFrame(() => {
      conversationTitleRef.current?.focus()
      conversationTitleRef.current?.select()
    })
  }

  function cancelEditingConversation() {
    setEditingConversationId(null)
    setConversationTitleDraft('')
  }

  function saveConversationTitle(id) {
    const title = conversationTitleDraft.trim()
    if (!title) return
    updateConversation(id, (conversation) => ({ ...conversation, title }))
    cancelEditingConversation()
  }

  function handleConversationTitleKeyDown(event, id) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveConversationTitle(id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditingConversation()
    }
  }

  function startEditingMessage(message) {
    if (isStreaming) return
    setEditingMessageId(message.id)
    setEditText(message.content)
    setError('')
    requestAnimationFrame(() => {
      editTextareaRef.current?.focus()
      editTextareaRef.current?.setSelectionRange(message.content.length, message.content.length)
    })
  }

  function cancelEditingMessage() {
    setEditingMessageId(null)
    setEditText('')
  }

  function navigatePromptVersion(message, direction) {
    if (!active || isStreaming) return
    const versions = getPromptVersions(active, message)
    const currentIndex = versions.findIndex((version) => version.id === message.id)
    const nextVersion = versions[currentIndex + direction]
    if (!nextVersion) return

    cancelEditingMessage()
    updateConversation(active.id, (conversation) => ({
      ...conversation,
      activeChildByParent: {
        ...conversation.activeChildByParent,
        [parentKey(message.parentId)]: nextVersion.id,
      },
    }))
  }

  function selectModel(modelId) {
    const selected = models.find((model) => model.id === modelId)
    if (isModelLocked(selected)) {
      showUpgrade(selected?.requiredPlan)
      return
    }
    if (selected?.adult && !adultImageAcknowledged) {
      setAdultConfirmModel(selected)
      setAdultConfirmChecked(false)
      setModelMenuOpen(false)
      return
    }
    const conversation = ensureConversation()
    updateConversation(conversation.id, (current) => ({ ...current, model: modelId }))
    if (selected?.type === 'image') {
      const queuedReference = pendingAttachments.length === 1 && pendingAttachments[0].kind === 'image'
      setAttachmentNotice(queuedReference
        ? `${pendingAttachments[0].name} is ready as a reference. Confirm permission below, then describe the edit.`
        : pendingAttachments.length
          ? 'Image mode can use one PNG, JPG, or WebP reference. Remove the other queued files first.'
          : `${selected.label} image mode enabled. Create from text or attach one consented reference image.`)
    } else {
      setAttachmentNotice(pendingAttachments.length ? `${pendingAttachments.length} file${pendingAttachments.length === 1 ? '' : 's'} ready to send.` : '')
    }
    setModelMenuOpen(false)
  }

  function confirmAdultImageModel() {
    if (!adultConfirmChecked || !adultConfirmModel) return
    secureStorage.setItem(ADULT_IMAGE_ACK_KEY, 'accepted')
    setAdultImageAcknowledged(true)
    const conversation = ensureConversation()
    updateConversation(conversation.id, (current) => ({ ...current, model: adultConfirmModel.id }))
    const queuedReference = pendingAttachments.length === 1 && pendingAttachments[0].kind === 'image'
    setAttachmentNotice(queuedReference
      ? `${pendingAttachments[0].name} is ready as a reference. Confirm permission below, then describe the edit.`
      : `${adultConfirmModel.label} image mode enabled. Describe a fictional, clearly adult subject.`)
    setAdultConfirmModel(null)
    setAdultConfirmChecked(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function selectImageSize(size) {
    const availableOptions = imageReference ? REFERENCE_SIZE_OPTIONS : IMAGE_SIZE_OPTIONS
    if (!availableOptions.some((option) => option.id === size)) return
    if (imageReference) {
      setReferenceImageSize(size)
      return
    }
    const conversation = ensureConversation()
    updateConversation(conversation.id, (current) => ({ ...current, imageSize: size }))
  }

  function reuseImagePrompt(message, image) {
    const imageModel = models.find((model) => model.id === image.modelId)
    if (isModelLocked(imageModel)) {
      showUpgrade(imageModel?.requiredPlan)
      return
    }
    if (imageModel) {
      const conversation = ensureConversation()
      updateConversation(conversation.id, (current) => ({
        ...current,
        model: imageModel.id,
        imageSize: image.sizeKey || 'square',
      }))
    }
    setInput(message?.content ?? '')
    setError('')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function openAttachmentPicker() {
    attachmentInputRef.current?.click()
  }

  async function handleAttachmentSelection(event) {
    const selectedFiles = [...(event.target.files || [])]
    event.target.value = ''
    if (!selectedFiles.length) return
    if (isImageMode && (selectedFiles.length !== 1 || pendingAttachments.length)) {
      setError('Image mode accepts one reference image per request. Remove the queued attachment before choosing another.')
      return
    }
    if (!isImageMode && activeAttachmentCount + pendingAttachments.length + selectedFiles.length > MAX_ATTACHMENTS) {
      setError(`The active chat can include up to ${MAX_ATTACHMENTS} attached files. Start a new chat to use more.`)
      return
    }

    const attachmentLimit = usesRemoteApi ? REMOTE_MAX_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES
    const oversized = selectedFiles.find((file) => file.size > attachmentLimit)
    if (oversized) {
      setError(`${oversized.name} is larger than the ${usesRemoteApi ? '8' : '25'} MB per-file limit.`)
      return
    }

    if (isImageMode) {
      try {
        await validateReferenceImageFile(selectedFiles[0])
      } catch (referenceError) {
        setError(referenceError.message)
        return
      }
    }

    const targetConversation = ensureConversation()
    setAttachmentsUploading(true)
    setError('')
    setAttachmentNotice('')
    const uploaded = []

    try {
      for (const file of selectedFiles) {
        if (usesRemoteApi) {
          const dataUrl = await fileAsDataUrl(file)
          uploaded.push({
            id: crypto.randomUUID(),
            name: file.name.slice(0, 180),
            type: file.type || 'application/octet-stream',
            size: file.size,
            kind: file.type.startsWith('image/') ? 'image' : 'file',
            dataUrl,
            createdAt: new Date().toISOString(),
          })
          continue
        }
        const response = await apiFetch('/api/attachments', {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Athena-Filename': encodeURIComponent(file.name),
          },
          body: file,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || `Could not attach ${file.name}.`)
        uploaded.push(data.attachment)
      }

      setPendingAttachments((current) => [...current, ...uploaded])
      const nextAttachments = [...pendingAttachments, ...uploaded]
      const imageCount = nextAttachments.filter((attachment) => attachment.kind === 'image').length
      const selectedModel = models.find((model) => model.id === targetConversation.model)
      if (selectedModel?.type === 'image') {
        setReferenceConsentAcknowledged(false)
        setReferenceImageSize('original')
        setAttachmentNotice(`${uploaded[0].name} is ready as a reference. Confirm permission below, then describe what should change.`)
        return
      }
      const needsVisionSwitch = imageCount > 0 && !selectedModel?.supportsVision
      const needsMultiImageSwitch = imageCount > 1 && !selectedModel?.supportsMultipleImages

      if (needsVisionSwitch || needsMultiImageSwitch) {
        const compatibleModel = models.find((model) => model.id === 'qwen-3-6-plus' && !isModelLocked(model))
          ?? models.find((model) => model.supportsVision && model.supportsMultipleImages && !isModelLocked(model))
        if (compatibleModel) {
          updateConversation(targetConversation.id, (current) => ({ ...current, model: compatibleModel.id }))
          setAttachmentNotice(`Switched to ${compatibleModel.label} so Athena can analyze ${imageCount > 1 ? 'multiple images' : 'the image'}.`)
        }
      } else {
        setAttachmentNotice(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} ready to send.`)
      }
    } catch (uploadError) {
      if (uploaded.length) setPendingAttachments((current) => [...current, ...uploaded])
      setError(uploadError.message)
    } finally {
      setAttachmentsUploading(false)
    }
  }

  function removePendingAttachment(id) {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id))
    setReferenceConsentAcknowledged(false)
    setReferenceImageSize('original')
    if (!usesRemoteApi) apiFetch(`/api/attachments/${id}`, { method: 'DELETE' }).catch(() => {})
    setAttachmentNotice('')
  }

  function toggleWebSearch() {
    const conversation = ensureConversation()
    updateConversation(conversation.id, (current) => ({ ...current, webSearch: !current.webSearch }))
  }

  async function copyMessage(id, content) {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 1400)
  }

  function exportConversation() {
    if (!active) return
    const markdown = [
      `# ${active.title}`,
      '',
      `Exported from Athena on ${new Date().toLocaleString()}`,
      '',
      ...activeMessages.flatMap((message) => [
        `## ${message.role === 'user' ? 'You' : 'Athena'}`,
        '',
        message.content,
        ...(message.generatedImage
          ? ['', `Generated image: ${new URL(apiUrl(`/api/generated-images/${message.generatedImage.id}`), window.location.origin).href}`]
          : []),
        ...(message.attachments?.length
          ? ['', `Attachments: ${message.attachments.map((attachment) => attachment.name).join(', ')}`]
          : []),
        '',
      ]),
    ].join('\n')
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${active.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'athena-chat'}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function downloadProjectZip(message) {
    const files = extractProjectFiles(message.content)
    if (!files.length) return
    setZipDownloadingId(message.id)
    setError('')

    try {
      const { default: JSZip } = await import('jszip')
      const archive = new JSZip()
      files.forEach((file) => archive.file(file.path, file.content))
      const blob = await archive.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = makeArchiveName(active?.title)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (archiveError) {
      setError(archiveError.message || 'Athena could not create that ZIP file.')
    } finally {
      setZipDownloadingId(null)
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
  }

  async function sendImageMessage(text, { editMessageId = null } = {}, conversation, imageModel) {
    const content = text.trim()
    if (!content) return

    const currentPath = getActiveMessages(conversation)
    const editIndex = editMessageId
      ? currentPath.findIndex((message) => message.id === editMessageId && message.role === 'user')
      : -1
    if (editMessageId && editIndex === -1) {
      setError('That image prompt is no longer available to edit.')
      cancelEditingMessage()
      return
    }

    const messageAttachments = editIndex >= 0
      ? (currentPath[editIndex].attachments ?? [])
      : pendingAttachments
    const referenceAttachment = messageAttachments.length === 1 && messageAttachments[0].kind === 'image'
      ? messageAttachments[0]
      : null
    if (messageAttachments.length && !referenceAttachment) {
      setError('Image mode accepts exactly one PNG, JPG, or WebP reference image per request.')
      return
    }
    const referencePermissionConfirmed = referenceAttachment
      ? (editIndex >= 0
          ? Boolean(currentPath[editIndex].referenceConsentAcknowledged)
          : referenceConsentAcknowledged)
      : false
    if (referenceAttachment && !referencePermissionConfirmed) {
      setError('Confirm that you own the reference image or have explicit permission to use every person’s likeness.')
      return
    }

    const precedingMessages = editIndex >= 0 ? currentPath.slice(0, editIndex) : currentPath
    const parentId = precedingMessages.at(-1)?.id ?? null
    const sizeKey = referenceAttachment
      ? editIndex >= 0
        ? (currentPath[editIndex].imageSize || 'original')
        : referenceImageSize
      : (conversation.imageSize || 'square')
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      parentId,
      requestType: referenceAttachment ? 'image-edit' : 'image',
      imageModelId: imageModel.id,
      imageSize: sizeKey,
      ...(referenceAttachment
        ? { attachments: [referenceAttachment], referenceConsentAcknowledged: true }
        : {}),
      ...(editIndex >= 0
        ? { editedAt: new Date().toISOString(), branchedFromId: currentPath[editIndex].id }
        : {}),
    }
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      parentId: userMessage.id,
      requestType: referenceAttachment ? 'image-edit' : 'image',
    }

    setInput('')
    if (editIndex < 0) {
      setPendingAttachments([])
      setReferenceConsentAcknowledged(false)
      setReferenceImageSize('original')
    }
    cancelEditingMessage()
    setError('')
    setIsStreaming(true)
    updateConversation(conversation.id, (current) => ({
      ...current,
      title: current.messages.length ? current.title : titleFromMessage(content),
      updatedAt: new Date().toISOString(),
      messageTreeVersion: MESSAGE_TREE_VERSION,
      activeChildByParent: {
        ...current.activeChildByParent,
        [parentKey(parentId)]: userMessage.id,
        [parentKey(userMessage.id)]: assistantMessage.id,
      },
      messages: [...current.messages, userMessage, assistantMessage],
    }))

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await apiFetch('/api/images/generate', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: imageModel.id,
          prompt: content,
          size: sizeKey,
          adultAcknowledged: imageModel.adult && adultImageAcknowledged,
          referenceAttachmentId: usesRemoteApi ? undefined : referenceAttachment?.id,
          referenceAttachment: usesRemoteApi && referenceAttachment
            ? {
                id: referenceAttachment.id,
                name: referenceAttachment.name,
                type: referenceAttachment.type,
                size: referenceAttachment.size,
                kind: referenceAttachment.kind,
                dataUrl: referenceAttachment.dataUrl,
              }
            : undefined,
          referenceConsentAcknowledged: referencePermissionConfirmed,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data.code === 'MODEL_UPGRADE_REQUIRED') showUpgrade(data.requiredPlan)
        if (data.code === 'WEEKLY_USAGE_LIMIT') void onRefreshAccount().catch(() => {})
        throw new Error(data.error || `Image request failed (${response.status})`)
      }
      if (!data.image?.id) throw new Error('The provider returned an empty image response.')

      updateConversation(conversation.id, (current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        messages: current.messages.map((message) => message.id === assistantMessage.id
          ? {
              ...message,
              content: `${referenceAttachment ? 'Edited' : 'Created'} with ${data.image.modelLabel}.`,
              generatedImage: data.image,
            }
          : message),
      }))
      setUsageEntries((current) => [{
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        conversationId: conversation.id,
        modelId: imageModel.id,
        requestType: referenceAttachment ? 'image-edit' : 'image',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: Number(data.image.estimatedCost ?? imageModel.generationPrice ?? 0),
        webSearch: false,
        webSearchUsed: false,
      }, ...current].slice(0, 1000))
      refreshBilling()
      if (isOwner) refreshOwnerStats()
      void onRefreshAccount().catch(() => {})
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message)
        updateConversation(conversation.id, (current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== assistantMessage.id),
          activeChildByParent: Object.fromEntries(
            Object.entries(current.activeChildByParent).filter(([key]) => key !== parentKey(userMessage.id)),
          ),
        }))
      } else {
        updateConversation(conversation.id, (current) => ({
          ...current,
          messages: current.messages.map((message) => message.id === assistantMessage.id
            ? { ...message, content: '_Image generation stopped._' }
            : message),
        }))
      }
    } finally {
      abortRef.current = null
      setIsStreaming(false)
    }
  }

  async function sendMessage(text = input, { editMessageId = null } = {}) {
    const typedContent = text.trim()
    if (isStreaming || attachmentsUploading) return
    const conversation = ensureConversation()
    const requestedModel = models.find((model) => model.id === conversation.model)
    if (requestedModel && isModelLocked(requestedModel)) {
      showUpgrade(requestedModel.requiredPlan)
      return
    }
    const selectedModel = requestedModel ?? accessibleFallbackModel ?? models[0]
    if (selectedModel?.type === 'image') {
      if (!typedContent) return
      if (selectedModel.adult && !adultImageAcknowledged) {
        setAdultConfirmModel(selectedModel)
        setAdultConfirmChecked(false)
        return
      }
      return sendImageMessage(text, { editMessageId }, conversation, selectedModel)
    }
    if (!typedContent && (!pendingAttachments.length || editMessageId)) return
    const currentPath = getActiveMessages(conversation)
    const editIndex = editMessageId
      ? currentPath.findIndex((message) => message.id === editMessageId && message.role === 'user')
      : -1

    if (editMessageId && editIndex === -1) {
      setError('That prompt is no longer available to edit.')
      cancelEditingMessage()
      return
    }

    const precedingMessages = editIndex >= 0 ? currentPath.slice(0, editIndex) : currentPath
    const parentId = precedingMessages.at(-1)?.id ?? null
    const messageAttachments = editIndex >= 0
      ? (currentPath[editIndex].attachments ?? [])
      : pendingAttachments
    const content = typedContent || (messageAttachments.some((attachment) => attachment.kind === 'image')
      ? 'Analyze the attached image or images. Describe what you see and help me understand the important details.'
      : 'Analyze the attached file or files. Summarize what matters and help me understand or improve the contents.')
    const userMessage = editIndex >= 0
      ? {
          id: crypto.randomUUID(),
          role: 'user',
          content,
          parentId,
          editedAt: new Date().toISOString(),
          branchedFromId: currentPath[editIndex].id,
          attachments: messageAttachments,
        }
      : { id: crypto.randomUUID(), role: 'user', content, parentId, attachments: messageAttachments }
    const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', parentId: userMessage.id }
    const requestMessages = [...precedingMessages, userMessage]
    const requestAttachments = requestMessages.flatMap((message) => message.attachments ?? [])
    const requestImageCount = requestAttachments.filter((attachment) => attachment.kind === 'image').length
    const configuredModel = models.find((model) => model.id === conversation.model)
    const incompatibleWithImages = requestImageCount > 0 && !configuredModel?.supportsVision
    const incompatibleWithMultipleImages = requestImageCount > 1 && !configuredModel?.supportsMultipleImages
    let requestModel = conversation.model

    if (incompatibleWithImages || incompatibleWithMultipleImages) {
      const compatibleModel = models.find((model) => model.id === 'qwen-3-6-plus')
        ?? models.find((model) => model.supportsVision && model.supportsMultipleImages)
      if (!compatibleModel) {
        setError('No enabled Athena model can analyze the attached image.')
        return
      }
      requestModel = compatibleModel.id
      setAttachmentNotice(`Switched to ${compatibleModel.label} so the full image context remains available.`)
    }

    setInput('')
    if (editIndex < 0) setPendingAttachments([])
    cancelEditingMessage()
    setError('')
    setIsStreaming(true)
    updateConversation(conversation.id, (current) => ({
      ...current,
      model: requestModel,
      title: current.messages.length ? current.title : titleFromMessage(content),
      updatedAt: new Date().toISOString(),
      messageTreeVersion: MESSAGE_TREE_VERSION,
      activeChildByParent: {
        ...current.activeChildByParent,
        [parentKey(parentId)]: userMessage.id,
        [parentKey(userMessage.id)]: assistantMessage.id,
      },
      messages: [...current.messages, userMessage, assistantMessage],
    }))

    const controller = new AbortController()
    abortRef.current = controller
    let accumulated = ''
    let renderedContent = ''
    let streamRenderTimer = null

    function publishStreamedContent() {
      if (!accumulated || accumulated === renderedContent) return
      renderedContent = accumulated
      updateConversation(conversation.id, (current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        messages: current.messages.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: accumulated } : message,
        ),
      }))
    }

    function scheduleStreamRender() {
      if (streamRenderTimer !== null) return
      streamRenderTimer = window.setTimeout(() => {
        streamRenderTimer = null
        publishStreamedContent()
      }, 80)
    }

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: requestModel,
          webSearch: conversation.webSearch,
          messages: requestMessages.map(({ role, content: messageContent, attachments }) => ({
            role,
            content: messageContent,
            attachments: (attachments ?? []).map(({ id, name, type, size, kind, dataUrl }) => ({
              id,
              name,
              type,
              size,
              kind,
              dataUrl: usesRemoteApi ? dataUrl : undefined,
            })),
          })),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        if (data.code === 'MODEL_UPGRADE_REQUIRED') showUpgrade(data.requiredPlan)
        if (data.code === 'WEEKLY_USAGE_LIMIT') void onRefreshAccount().catch(() => {})
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let providerUsage = null
      let webSearchUsed = false

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

        let boundary
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const event = parseSseEvent(eventBlock)
          if (event?.usage) providerUsage = event.usage
          if (event?.venice_parameters?.web_search_citations?.length) webSearchUsed = true
          const delta = event?.choices?.[0]?.delta
          const nextContent = delta?.content || delta?.reasoning_content || ''
          if (!nextContent) continue
          accumulated += nextContent
          scheduleStreamRender()
        }
      }

      if (!accumulated) throw new Error('The provider returned an empty response.')
      if (streamRenderTimer !== null) {
        window.clearTimeout(streamRenderTimer)
        streamRenderTimer = null
      }
      publishStreamedContent()

      if (providerUsage) {
        const inputTokens = Number(providerUsage.prompt_tokens ?? providerUsage.input_tokens ?? 0)
        const outputTokens = Number(providerUsage.completion_tokens ?? providerUsage.output_tokens ?? 0)
        const totalTokens = Number(providerUsage.total_tokens ?? inputTokens + outputTokens)
        const modelInfo = models.find((model) => model.id === requestModel) ?? DEFAULT_MODELS[0]
        const estimatedCost = (inputTokens / 1_000_000) * Number(modelInfo.inputPrice || 0)
          + (outputTokens / 1_000_000) * Number(modelInfo.outputPrice || 0)

        setUsageEntries((current) => [{
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          conversationId: conversation.id,
          modelId: requestModel,
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCost,
          webSearch: conversation.webSearch,
          webSearchUsed,
        }, ...current].slice(0, 1000))
        refreshBilling()
      }
      void onRefreshAccount().catch(() => {})
    } catch (requestError) {
      if (streamRenderTimer !== null) {
        window.clearTimeout(streamRenderTimer)
        streamRenderTimer = null
      }
      if (requestError.name !== 'AbortError') {
        setError(requestError.message)
        if (accumulated) {
          updateConversation(conversation.id, (current) => ({
            ...current,
            updatedAt: new Date().toISOString(),
            messages: current.messages.map((message) => message.id === assistantMessage.id
              ? { ...message, content: `${accumulated}\n\n_Response interrupted before Athena finished._` }
              : message),
          }))
        } else {
          updateConversation(conversation.id, (current) => ({
            ...current,
            messages: current.messages.filter((message) => message.id !== assistantMessage.id),
            activeChildByParent: Object.fromEntries(
              Object.entries(current.activeChildByParent).filter(([key]) => key !== parentKey(userMessage.id)),
            ),
          }))
        }
      } else {
        updateConversation(conversation.id, (current) => ({
          ...current,
          messages: current.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: accumulated ? `${accumulated}\n\n_Response stopped._` : '_Response stopped._' }
              : message,
          ),
        }))
      }
    } finally {
      if (streamRenderTimer !== null) window.clearTimeout(streamRenderTimer)
      abortRef.current = null
      setIsStreaming(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  function handleEditKeyDown(event, messageId) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditingMessage()
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(editText, { editMessageId: messageId })
    }
  }

  return (
    <div className="app-shell">
      <input
        ref={avatarInputRef}
        className="avatar-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleAvatarChange}
        aria-label="Choose profile picture"
      />
      <input
        ref={attachmentInputRef}
        className="attachment-file-input"
        type="file"
        accept={isImageMode ? 'image/png,image/jpeg,image/webp' : ATTACHMENT_ACCEPT}
        multiple={!isImageMode}
        onChange={handleAttachmentSelection}
        aria-label={isImageMode ? 'Attach one consented reference image' : 'Attach documents, code, or images'}
      />
      {mobileSidebar && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileSidebar(false)} />}

      <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar--collapsed'} ${mobileSidebar ? 'sidebar--mobile-open' : ''}`}>
        <div className="brand-row">
          <img className="desktop-brand-logo" src={athenaHorizontal} alt="Athena" />
          <img className="mobile-brand-logo" src={athenaHorizontal} alt="Athena" />
          <button className="icon-button sidebar-close-mobile" onClick={() => setMobileSidebar(false)} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <button className="new-chat" onClick={createConversation}>
          <MessageSquarePlus size={17} />
          <span>New Chat</span>
        </button>

        <label className="sidebar-search">
          <Search size={15} />
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search chat history" />
        </label>

        <div className="history-label">Chat archive</div>
        <nav className="conversation-list" aria-label="Conversation history">
          {visibleConversations.map((conversation) => (
            <div className={`conversation-row ${conversation.id === activeId ? 'conversation-row--active' : ''}`} key={conversation.id}>
              {editingConversationId === conversation.id ? (
                <div className="conversation-title-editor">
                  <input
                    ref={conversationTitleRef}
                    value={conversationTitleDraft}
                    onChange={(event) => setConversationTitleDraft(event.target.value)}
                    onKeyDown={(event) => handleConversationTitleKeyDown(event, conversation.id)}
                    maxLength={80}
                    aria-label="Conversation name"
                  />
                  <button onClick={() => saveConversationTitle(conversation.id)} disabled={!conversationTitleDraft.trim()} aria-label="Save conversation name">
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEditingConversation} aria-label="Cancel renaming conversation">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="conversation-select"
                    onClick={() => {
                      pendingAttachments.forEach((attachment) => {
                        if (!usesRemoteApi) apiFetch(`/api/attachments/${attachment.id}`, { method: 'DELETE' }).catch(() => {})
                      })
                      setPendingAttachments([])
                      setReferenceConsentAcknowledged(false)
                      setReferenceImageSize('original')
                      setAttachmentNotice('')
                      setActiveId(conversation.id)
                      cancelEditingMessage()
                      setMobileSidebar(false)
                    }}
                  >
                    <span>{conversation.title}</span>
                    <small>{new Date(conversation.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small>
                  </button>
                  <button
                    className="conversation-rename"
                    onClick={(event) => startEditingConversation(event, conversation)}
                    aria-label={`Rename ${conversation.title}`}
                    title="Rename conversation"
                  >
                    <Pencil size={13} />
                  </button>
                  <button className="conversation-delete" onClick={() => deleteConversation(conversation.id)} aria-label={`Delete ${conversation.title}`}>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
          {!visibleConversations.length && <p className="empty-history">No saved inquiries.</p>}
        </nav>

        <button className="trash-button" onClick={() => setTrashOpen(true)}>
          <Trash2 size={15} />
          <span>Trash</span>
          <small>{deletedConversations.length}</small>
        </button>

        <button className="settings-button" onClick={openSettings}>
          <SettingsIcon size={16} />
          <span>
            <strong>Settings</strong>
            <small>{preferences.name ? preferences.name : 'Profile, balance, and usage'}</small>
          </span>
          <ChevronDown size={14} />
        </button>

        <div className="privacy-card">
          <div><ShieldCheck size={16} /> Stored on this device</div>
          <p>{usesRemoteApi
            ? 'Chat history is protected by an encrypted device vault.'
            : storageStatus === 'error'
              ? 'Database unavailable. The encrypted browser vault still holds a safety copy.'
              : 'Chats are stored in Athena/data with an encrypted browser safety copy.'}</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button desktop-sidebar-toggle" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
              <PanelLeftClose size={19} />
            </button>
            <button className="icon-button mobile-menu" onClick={() => setMobileSidebar(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <div className="model-picker">
              <button className="model-button" onClick={() => setModelMenuOpen((value) => !value)}>
                <span className={`status-orb ${isImageMode ? 'status-orb--image' : ''}`} />
                <span>{activeModel?.label ?? 'Athena Direct'}</span>
                {activeModel?.badge && <span className={`model-badge model-badge--${activeModel.badgeTone}`}>{activeModel.badge}</span>}
                <ChevronDown size={15} />
              </button>
              {modelMenuOpen && (
                <div className="model-menu">
                  <div className="model-menu-section-label"><BrainCircuit size={12} /> Chat models</div>
                  {chatModels.map((model) => (
                    <button className={isModelLocked(model) ? 'model-option--locked' : ''} key={model.id} onClick={() => selectModel(model.id)} aria-disabled={isModelLocked(model)}>
                      <span>
                        <span className="model-menu-heading">
                          <strong>{model.label}</strong>
                          <span className={`model-badge model-badge--${model.badgeTone}`}>{model.badge}</span>
                        </span>
                        <small>{model.description}</small>
                        <small className="model-cost">{model.cost}</small>
                      </span>
                      {isModelLocked(model)
                        ? <span className="model-lock-label"><LockKeyhole size={12} />{model.requiredPlan === 'enterprise' ? 'Enterprise' : 'Pro'}</span>
                        : model.id === active?.model && <Check size={16} />}
                    </button>
                  ))}
                  <div className="model-menu-section-label model-menu-section-label--image"><ImageIcon size={12} /> Image models</div>
                  {imageModels.map((model) => (
                    <button className={isModelLocked(model) ? 'model-option--locked' : ''} key={model.id} onClick={() => selectModel(model.id)} aria-disabled={isModelLocked(model)}>
                      <span>
                        <span className="model-menu-heading">
                          <strong>{model.label}</strong>
                          <span className={`model-badge model-badge--${model.badgeTone}`}>{model.badge}</span>
                        </span>
                        <small>{model.description}</small>
                        <small className="model-cost">{model.cost}</small>
                      </span>
                      {isModelLocked(model)
                        ? <span className="model-lock-label"><LockKeyhole size={12} />{model.requiredPlan === 'enterprise' ? 'Enterprise' : 'Pro'}</span>
                        : model.id === active?.model && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="topbar-actions">
            <span className={`connection-pill ${providerConfigured === false ? 'connection-pill--warning' : ''}`}>
              <span />
              {providerConfigured === null ? 'Checking' : providerConfigured ? 'Provider ready' : 'Key needed'}
            </span>
            <button className="icon-button" onClick={exportConversation} disabled={!activeMessages.length} aria-label="Export conversation">
              <Download size={18} />
            </button>
          </div>
        </header>

        <section className={`chat-stage ${activeMessages.length ? 'chat-stage--active' : ''}`}>
          {!activeMessages.length ? (
            <div className="welcome">
              <img className="welcome-logo" src={athenaLogo} alt="Athena" />
              <p className="eyebrow">{isImageMode
                ? `${activeModel.label} · image studio`
                : preferences.name ? `Welcome back, ${preferences.name}` : 'Ask deeply. Verify everything.'}</p>
              <h1>{isImageMode ? <>Create beyond<br />the ordinary.</> : <>Go beyond<br />the obvious.</>}</h1>
              <p className="welcome-copy">{isImageMode
                ? `Describe an image, choose a composition, and Athena will generate it privately with ${activeModel.label}.`
                : 'Private intelligence for deep research, advanced technical work, and original thinking.'}</p>
              <div className="starter-suggestions">
                <div className="starter-suggestions-header">
                  <span>{isImageMode ? 'Suggested image prompts' : 'Suggested starting points'}</span>
                  {!isImageMode && (
                    <button onClick={cycleStarters} aria-label="Show different starter prompts" title="Show different ideas">
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
                <div key={starterCycle} className={`starter-grid ${starterGridReady ? 'starter-grid--ready' : ''}`}>
                  {(isImageMode ? IMAGE_STARTERS : starterSet).map((starter) => {
                    const Icon = starter.icon
                    return (
                    <button key={starter.label} onClick={() => fillStarter(starter)}>
                      <Icon size={18} />
                      <span>
                        <span className="starter-title">
                          <strong>{starter.label}</strong>
                          {starter.webSearch && <em>Live web</em>}
                        </span>
                        <small>{starter.prompt}</small>
                      </span>
                    </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="messages">
              {activeMessages.map((message) => {
                const promptVersions = getPromptVersions(active, message)
                const promptVersionIndex = promptVersions.findIndex((version) => version.id === message.id)
                const projectFiles = message.role === 'assistant' && message.content
                  ? extractProjectFiles(message.content)
                  : []
                const imagePromptMessage = message.generatedImage
                  ? activeMessages.find((candidate) => candidate.id === message.parentId)
                  : null

                return (
                  <article className={`message message--${message.role}`} key={message.id}>
                  <div className="message-identity">
                    {message.role === 'assistant' ? (
                      <div className="mini-sigil"><img src={athenaLogo} alt="" /></div>
                    ) : (
                      <button className="user-dot" onClick={openAvatarPicker} aria-label="Change your profile picture" title="Change profile picture">
                        {preferences.avatar ? <img src={preferences.avatar} alt="" /> : <UserRound size={15} />}
                      </button>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-label">{message.role === 'assistant'
                      ? message.generatedImage?.modelLabel || 'Athena'
                      : preferences.name || 'You'}</div>
                    {message.role === 'assistant' ? (
                      message.generatedImage ? (
                        <GeneratedImageCard
                          image={message.generatedImage}
                          prompt={imagePromptMessage?.content}
                          onReuse={() => reuseImagePrompt(imagePromptMessage, message.generatedImage)}
                        />
                      ) : message.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      ) : (
                        <div className="thinking"><span /><span /><span /></div>
                      )
                    ) : (
                      editingMessageId === message.id ? (
                        <div className="message-editor">
                          <textarea
                            ref={editTextareaRef}
                            value={editText}
                            onChange={(event) => setEditText(event.target.value)}
                            onKeyDown={(event) => handleEditKeyDown(event, message.id)}
                            aria-label="Edit your prompt"
                            rows={1}
                          />
                          <div className="message-editor-footer">
                            <span>A new version will be created. This prompt and its replies will remain available.</span>
                            <div className="message-editor-actions">
                              <button className="edit-cancel-button" onClick={cancelEditingMessage}>Cancel</button>
                              <button
                                className="edit-submit-button"
                                onClick={() => sendMessage(editText, { editMessageId: message.id })}
                                disabled={!editText.trim()}
                              >
                                <Send size={13} /> Update & resend
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p>{message.content}</p>
                          {!!message.attachments?.length && (
                            <div className="message-attachments">
                              {message.attachments.map((attachment) => (
                                <AttachmentChip key={attachment.id} attachment={attachment} />
                              ))}
                            </div>
                          )}
                          <div className="user-message-actions">
                            {message.editedAt && <span className="edited-label">Edited</span>}
                            {promptVersions.length > 1 && (
                              <div className="prompt-version-nav" aria-label="Prompt versions">
                                <button
                                  onClick={() => navigatePromptVersion(message, -1)}
                                  disabled={isStreaming || promptVersionIndex === 0}
                                  aria-label="Previous prompt version"
                                  title="Previous prompt and response"
                                >
                                  <ChevronLeft size={14} />
                                </button>
                                <span>{promptVersionIndex + 1} / {promptVersions.length}</span>
                                <button
                                  onClick={() => navigatePromptVersion(message, 1)}
                                  disabled={isStreaming || promptVersionIndex === promptVersions.length - 1}
                                  aria-label="Next prompt version"
                                  title="Next prompt and response"
                                >
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                            <button
                              className="edit-message-button"
                              onClick={() => startEditingMessage(message)}
                              disabled={isStreaming}
                              aria-label="Edit and resend this prompt"
                              title="Edit and resend from this point"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          </div>
                        </>
                      )
                    )}
                    {message.role === 'assistant' && message.content && !message.generatedImage && (
                      <div className="assistant-message-actions">
                        <button className="copy-button" onClick={() => copyMessage(message.id, message.content)}>
                          {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === message.id ? 'Copied' : 'Copy'}
                        </button>
                        {!!projectFiles.length && (
                          <button
                            className="copy-button zip-download-button"
                            onClick={() => downloadProjectZip(message)}
                            disabled={zipDownloadingId === message.id}
                          >
                            {zipDownloadingId === message.id ? <RefreshCw className="spin" size={14} /> : <Download size={14} />}
                            {zipDownloadingId === message.id
                              ? 'Building ZIP…'
                              : `Download ZIP (${projectFiles.length} file${projectFiles.length === 1 ? '' : 's'})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  </article>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composer-zone">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button>
            </div>
          )}
          {attachmentNotice && !error && <div className="attachment-notice">{attachmentNotice}</div>}
          <div className="composer">
            {!!pendingAttachments.length && (
              <div className="pending-attachments">
                {pendingAttachments.map((attachment) => (
                  <AttachmentChip
                    key={attachment.id}
                    attachment={attachment}
                    removable
                    onRemove={removePendingAttachment}
                  />
                ))}
              </div>
            )}
            {imageReference && (
              <label className="reference-consent">
                <input
                  type="checkbox"
                  checked={referenceConsentAcknowledged}
                  onChange={(event) => setReferenceConsentAcknowledged(event.target.checked)}
                />
                <span>
                  <strong>I own this image or have explicit permission to use it.</strong>
                  <small>If it shows people, they consented to this edit and are 18+ for adult-mode edits. Describe only what should change; “Original” keeps the source framing.</small>
                </span>
              </label>
            )}
            {invalidImageAttachments && (
              <div className="reference-consent reference-consent--warning">
                <X size={15} />
                <span><strong>One image reference is required.</strong><small>Remove documents or extra images before generating.</small></span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isImageMode
                ? imageReference
                  ? 'Describe only what should change. Athena will preserve the person and unchanged parts…'
                  : `Describe what ${activeModel.label} should create…`
                : 'Ask Athena anything…'}
              maxLength={isImageMode
                ? imageReference
                  ? referenceEditInfo?.promptLimit
                  : activeModel.promptLimit
                : undefined}
              rows={1}
            />
            <div className="composer-toolbar">
              <button
                className={`tool-toggle ${pendingAttachments.length ? 'tool-toggle--active' : ''}`}
                onClick={openAttachmentPicker}
                disabled={attachmentsUploading || isStreaming || (isImageMode
                  ? Boolean(pendingAttachments.length)
                  : activeAttachmentCount + pendingAttachments.length >= MAX_ATTACHMENTS)}
                title={isImageMode ? 'Attach one consented PNG, JPG, or WebP reference (25 MB maximum)' : 'Attach PDFs, documents, text, code, or images (25 MB per file)'}
              >
                {attachmentsUploading ? <RefreshCw className="spin" size={16} /> : <Paperclip size={16} />}
                <span>{attachmentsUploading ? 'Uploading' : isImageMode ? 'Reference' : 'Attach'}</span>
                {!!pendingAttachments.length && <small>{pendingAttachments.length}</small>}
              </button>
              {isImageMode ? (
                <div className="image-size-picker" aria-label="Generated image composition">
                  {(imageReference ? REFERENCE_SIZE_OPTIONS : IMAGE_SIZE_OPTIONS).map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={(imageReference ? referenceImageSize : (active?.imageSize || 'square')) === option.id ? 'image-size-button--active' : ''}
                      onClick={() => selectImageSize(option.id)}
                      title={option.id === 'original' ? 'Preserve the source image composition' : `${option.label} composition`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className={`tool-toggle ${active?.webSearch ? 'tool-toggle--active' : ''}`}
                  onClick={toggleWebSearch}
                  title="Search the current web with citations. Venice charges about $0.01 per search plus model tokens."
                >
                  <Globe2 size={16} />
                  <span>Live web</span>
                  <small>+$0.01</small>
                </button>
              )}
              <div className="composer-hint">{isImageMode
                ? imageReference
                  ? `~${formatMoney(referenceEditInfo?.cost, 4)} / reference edit · Enter to edit`
                  : `${activeModel.cost} · Enter to create`
                : 'Enter to send · Shift + Enter for a new line'}</div>
              {isStreaming ? (
                <button className="send-button send-button--stop" onClick={stopStreaming} aria-label={isImageMode ? 'Stop image generation' : 'Stop response'}><Square size={15} fill="currentColor" /></button>
              ) : (
                <button
                  className="send-button"
                  onClick={() => sendMessage()}
                  disabled={(isImageMode
                    ? !input.trim() || invalidImageAttachments || (Boolean(imageReference) && !referenceConsentAcknowledged)
                    : (!input.trim() && !pendingAttachments.length)) || attachmentsUploading}
                  aria-label={isImageMode ? 'Generate image' : 'Send message'}
                >
                  {isImageMode ? <ImageIcon size={17} /> : <Send size={17} />}
                </button>
              )}
            </div>
          </div>
          <p className="fine-print">{isImageMode
            ? imageReference
              ? `${referenceEditInfo?.label || 'Athena Reference'} uses a separate private image-edit engine. Source and result are stored locally; the source is sent to Venice only for this edit.${activeModel.id === 'lustify-v8' ? ' Lustify v8 is text-to-image only, so its reference workflow uses private Qwen Edit Uncensored.' : ''}`
              : `Generated images are saved locally in Athena/data/generated-images. ${activeModel.adult ? 'Adults only; use fictional or consented adult likenesses.' : 'Review generated details before relying on them.'}`
            : 'Athena can be wrong. Attached content is stored locally and sent to Venice when used in a chat.'}</p>
        </div>

        {adultConfirmModel && (
          <div
            className="settings-overlay adult-model-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAdultConfirmModel(null)
            }}
          >
            <section className="adult-model-panel" role="dialog" aria-modal="true" aria-labelledby="adult-model-title">
              <div className="adult-model-icon"><ImageIcon size={22} /></div>
              <p className="eyebrow">One-time acknowledgement</p>
              <h2 id="adult-model-title">Enable {adultConfirmModel.label}?</h2>
              <p>
                This private, uncensored image model can return explicit adult artwork. It may only be used by an
                adult for fictional, clearly adult subjects or real adults whose likeness you have permission to use.
              </p>
              <div className="adult-model-rules">
                <span><Check size={14} /> Every depicted person must clearly be 18 or older.</span>
                <span><Check size={14} /> No minors, age-ambiguous subjects, or exploitative scenarios.</span>
                <span><Check size={14} /> No real person’s likeness without their explicit permission.</span>
              </div>
              <label className="adult-model-check">
                <input
                  type="checkbox"
                  checked={adultConfirmChecked}
                  onChange={(event) => setAdultConfirmChecked(event.target.checked)}
                />
                <span>I am an adult and agree to these restrictions.</span>
              </label>
              <div className="adult-model-actions">
                <button type="button" onClick={() => setAdultConfirmModel(null)}>Cancel</button>
                <button type="button" onClick={confirmAdultImageModel} disabled={!adultConfirmChecked}>Enable adult image model</button>
              </div>
              <small>Your acknowledgement is stored only in this browser. Image prompts are sent to Venice for generation.</small>
            </section>
          </div>
        )}

        {settingsOpen && (
          <div
            className="settings-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSettingsOpen(false)
            }}
          >
            <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
              <header className="settings-header">
                <div>
                  <p className="eyebrow">Local control room</p>
                  <h2 id="settings-title">Settings</h2>
                </div>
                <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                  <X size={19} />
                </button>
              </header>

              <div className="settings-scroll">
                <section className="settings-section">
                  <div className="settings-section-title">
                    <UserRound size={17} />
                    <div><strong>Your profile</strong><small>Stored in your local Athena database</small></div>
                  </div>
                  <div className={`profile-account-card profile-account-card--${currentRoleTone}`}>
                    <div className="profile-account-name">
                      <span className="profile-account-icon"><ShieldCheck size={16} /></span>
                      <span><small>Signed in as</small><strong>@{currentUsername}</strong></span>
                    </div>
                    <span className="profile-role-badge">{currentRole}</span>
                  </div>
                  <div className="profile-picture-row">
                    <button className="profile-picture-button" onClick={openAvatarPicker} aria-label="Change your profile picture">
                      {preferences.avatar ? <img src={preferences.avatar} alt="Your profile" /> : <UserRound size={25} />}
                      <span><Pencil size={10} /></span>
                    </button>
                    <div className="profile-picture-copy">
                      <label className="profile-name-field">
                        <span>Name</span>
                        <input
                          value={preferences.name}
                          maxLength={40}
                          onChange={(event) => setPreferences((current) => ({ ...current, name: event.target.value }))}
                          placeholder="What should Athena call you?"
                        />
                      </label>
                      <small>Click the profile picture to change it</small>
                    </div>
                    {preferences.avatar && <button className="remove-avatar-button" onClick={removeAvatar}>Remove</button>}
                  </div>
                  {avatarError && <p className="profile-picture-error">{avatarError}</p>}
                </section>

                {isOwner && (
                  <section className="settings-section owner-settings-section">
                    <div className="settings-section-title settings-section-title--row">
                      <div className="settings-section-title-copy">
                        <ShieldCheck size={17} />
                        <div><strong>Owner Center</strong><small>Private Lustify safety archive</small></div>
                      </div>
                      <span className="owner-only-badge">Owner only</span>
                    </div>
                    <div className="owner-stat-grid">
                      <div>
                        <small>Total images generated</small>
                        <strong>{ownerStatsLoading && !ownerStats ? '...' : Number(ownerStats?.totalGenerated || 0).toLocaleString()}</strong>
                      </div>
                      <div>
                        <small>Stored Lustify references</small>
                        <strong>{ownerStatsLoading && !ownerStats ? '...' : Number(ownerStats?.lustifyReferences || 0).toLocaleString()}</strong>
                      </div>
                    </div>
                    {ownerStatsError && <p className="settings-error">{ownerStatsError}</p>}
                    <button className="owner-view-button" type="button" onClick={requestOwnerCenterUnlock}>
                      <LockKeyhole size={14} /> View images
                    </button>
                    <p className="settings-note">Other users’ Lustify reference uploads, paired outputs, and prompts are retained for owner-only review and expire after four days. Your own uploads are not archived here.</p>
                    <form className="owner-account-enable" onSubmit={enableFirebaseAccount}>
                      <label>
                        <span>Enable a Firebase username</span>
                        <input value={ownerEnableUsername} onChange={(event) => setOwnerEnableUsername(event.target.value)} placeholder="username" autoCapitalize="none" autoCorrect="off" />
                      </label>
                      <button type="submit" disabled={ownerEnableLoading || !ownerEnableUsername.trim()}>{ownerEnableLoading ? 'Enabling...' : 'Enable Free access'}</button>
                    </form>
                    {ownerEnableError && <p className="settings-error">{ownerEnableError}</p>}
                    {ownerEnableMessage && <p className="settings-success">{ownerEnableMessage}</p>}
                    <p className="settings-note">Create the matching username@athena.invalid user in Firebase Authentication first. This server-issued access flag prevents unapproved signups from using your Venice balance.</p>
                  </section>
                )}

                <section className="settings-section plan-usage-section">
                  <div className="settings-section-title settings-section-title--row">
                    <div className="settings-section-title-copy">
                      <BarChart3 size={17} />
                      <div><strong>Weekly plan usage</strong><small>Shared securely across signed-in devices</small></div>
                    </div>
                    <span className={`plan-tier-badge plan-tier-badge--${accountTier}`}>{accountPlanLabel}</span>
                  </div>
                  {accountUsage?.unlimited ? (
                    <div className="plan-usage-unlimited"><Sparkles size={16} /><span><strong>Unlimited access</strong><small>Owner and Admin accounts are not charged against weekly limits.</small></span></div>
                  ) : (
                    <>
                      <div className="plan-usage-copy">
                        <span><strong>{Math.round(Number(accountUsage?.percentage ?? 100))}%</strong> remaining</span>
                        <small>{Number(accountUsage?.remaining ?? accountUsage?.limit ?? 0)} of {Number(accountUsage?.limit ?? 0)} units available</small>
                      </div>
                      <div className="plan-usage-track" role="progressbar" aria-label="Weekly Athena usage remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(Number(accountUsage?.percentage ?? 100))}>
                        <span style={{ width: `${Math.max(0, Math.min(100, Number(accountUsage?.percentage ?? 100)))}%` }} />
                      </div>
                      <p className="settings-note">Text requests use 1-3 units based on the model. Images use 3-10 units. Your allowance resets {accountUsage?.resetAt ? new Date(accountUsage.resetAt).toLocaleString() : 'every seven days'}.</p>
                    </>
                  )}
                  {!accountUsage?.unlimited && accountTier === 'free' && <button className="plan-upgrade-button" type="button" onClick={() => showUpgrade('pro')}><Sparkles size={14} /> View upgrade plans</button>}
                  {accountTier === 'pro' && <button className="plan-upgrade-button" type="button" onClick={() => showUpgrade('enterprise')}><Rocket size={14} /> Explore Enterprise</button>}
                </section>

                <section className="settings-section">
                  <div className="settings-section-title">
                    <LockKeyhole size={17} />
                    <div><strong>Account security</strong><small>Signed in as {currentUsername}</small></div>
                  </div>
                  <form className="password-change-form" onSubmit={saveNewPassword}>
                    <label className="settings-field">
                      <span>Current password</span>
                      <input
                        type="password"
                        value={currentPassword}
                        autoComplete="current-password"
                        onChange={(event) => setCurrentPassword(event.target.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>New password</span>
                      <input
                        type="password"
                        value={newPassword}
                        minLength={8}
                        autoComplete="new-password"
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Repeat new password</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        minLength={8}
                        autoComplete="new-password"
                        onChange={(event) => setConfirmPassword(event.target.value)}
                      />
                    </label>
                    <div className="account-actions">
                      <button className="account-save-button" type="submit" disabled={accountSaving || !currentPassword || !newPassword || !confirmPassword}>
                        Save new password
                      </button>
                      <button className="account-logout-button" type="button" onClick={logout} disabled={accountSaving}>
                        <LogOut size={14} /> Log out
                      </button>
                    </div>
                  </form>
                  {accountError && <p className="settings-error" role="alert">{accountError}</p>}
                  {accountMessage && <p className="settings-success" role="status">{accountMessage}</p>}
                  <p className="settings-note">Athena asks you to sign in again whenever the app is launched. Changing this password also re-locks the device encryption key with the new password.</p>
                </section>

                <section className="settings-section">
                  <div className="settings-section-title">
                    <SettingsIcon size={17} />
                    <div><strong>Chat defaults</strong><small>Applied when Athena creates a new chat</small></div>
                  </div>
                  <label className="settings-field">
                    <span>Default model</span>
                    <select
                      value={preferences.defaultModel}
                      onChange={(event) => setPreferences((current) => ({ ...current, defaultModel: event.target.value }))}
                    >
                      {chatModels.filter((model) => !isModelLocked(model)).map((model) => <option value={model.id} key={model.id}>{model.label} - {model.badge}</option>)}
                    </select>
                  </label>
                  <label className="settings-check">
                    <input
                      type="checkbox"
                      checked={preferences.defaultWebSearch}
                      onChange={(event) => setPreferences((current) => ({ ...current, defaultWebSearch: event.target.checked }))}
                    />
                    <span>
                      <strong>Enable Live Web for new chats</strong>
                      <small>Searches current internet sources with citations. Approximately $0.01 per search plus model-token costs.</small>
                    </span>
                  </label>
                </section>

                <section className="settings-section">
                  <div className="settings-section-title settings-section-title--row">
                    <div className="settings-section-title-copy">
                      <Database size={17} />
                      <div><strong>{usesRemoteApi ? 'Encrypted device vault' : 'Local Athena database'}</strong><small>Chats, settings, Trash, and backups</small></div>
                    </div>
                    <span className={`storage-status storage-status--${storageStatus}`}>
                      {storageStatus === 'loading' ? 'Connecting' : storageStatus === 'saving' ? 'Saving' : storageStatus === 'error' ? 'Safety copy only' : 'Saved'}
                    </span>
                  </div>
                  <div className="storage-location">
                    <small>{usesRemoteApi ? 'Storage' : 'Database'}</small>
                    <code>{storageInfo?.databasePath || 'Athena/data/athena.db'}</code>
                  </div>
                  <div className="storage-actions">
                    <button className="refresh-button" onClick={createLocalBackup} disabled={!storageReady}>
                      <Archive size={14} /> Create backup
                    </button>
                    <button className="refresh-button" onClick={exportAllData} disabled={!storageReady}>
                      <Download size={14} /> Export all data
                    </button>
                  </div>
                  {storageMessage && <p className={storageStatus === 'error' ? 'settings-error' : 'settings-note'}>{storageMessage}</p>}
                  <p className="settings-note">{usesRemoteApi
                    ? 'Records are encrypted with AES-GCM before IndexedDB writes them on this device. Downloaded backups are decrypted files, so store them carefully.'
                    : 'The browser safety copy is encrypted. Daily and pre-Trash snapshots are stored under Athena/data/backups.'}</p>
                </section>

                {canViewVeniceBalance && (
                  <section className="settings-section">
                    <div className="settings-section-title settings-section-title--row">
                      <div className="settings-section-title-copy">
                        <Coins size={17} />
                        <div><strong>Venice balance</strong><small>Exact balance reported by your API account</small></div>
                      </div>
                      <button className="refresh-button" onClick={refreshBilling} disabled={billingLoading}>
                        <RefreshCw size={14} className={billingLoading ? 'spin' : ''} /> Refresh
                      </button>
                    </div>
                    {billingError ? (
                      <p className="settings-error">{billingError}</p>
                    ) : (
                      <div className="balance-grid">
                        <div><small>USD credits</small><strong>{billingLoading && !billing ? '...' : formatMoney(billing?.balances?.usd)}</strong></div>
                        <div><small>DIEM</small><strong>{billingLoading && !billing ? '...' : Number(billing?.balances?.diem || 0).toFixed(2)}</strong></div>
                        <div><small>Billing currency</small><strong>{billing?.consumptionCurrency || 'USD'}</strong></div>
                        <div><small>API status</small><strong className={billing?.canConsume ? 'status-good' : 'status-warn'}>{billing?.canConsume ? 'Ready' : 'Unavailable'}</strong></div>
                      </div>
                    )}
                  </section>
                )}

                <section className="settings-section">
                  <div className="settings-section-title settings-section-title--row">
                    <div className="settings-section-title-copy">
                      <BarChart3 size={17} />
                      <div><strong>Local usage ledger</strong><small>Built from provider-reported tokens on this computer</small></div>
                    </div>
                    {usageEntries.length > 0 && <button className="refresh-button refresh-button--danger" onClick={clearUsageHistory}>Clear</button>}
                  </div>
                  <div className="usage-grid">
                    <div><small>Requests</small><strong>{usageSummary.requests}</strong></div>
                    <div><small>Input tokens</small><strong>{formatTokens(usageSummary.inputTokens)}</strong></div>
                    <div><small>Output tokens</small><strong>{formatTokens(usageSummary.outputTokens)}</strong></div>
                    <div><small>Estimated spend</small><strong>{formatMoney(usageSummary.estimatedCost + usageSummary.webRequests * 0.01, 4)}</strong></div>
                  </div>

                  <div className="usage-breakdown">
                    {usageByModel.length ? usageByModel.map(([modelId, stats]) => {
                      const model = models.find((item) => item.id === modelId)
                      return (
                        <div className="usage-row" key={modelId}>
                          <span><strong>{model?.label || modelId}</strong><small>{stats.requests} request{stats.requests === 1 ? '' : 's'} · {formatTokens(stats.tokens)} tokens</small></span>
                          <strong>{formatMoney(stats.cost, 4)}</strong>
                        </div>
                      )
                    }) : <p className="usage-empty">Your ledger will appear after Athena completes its next response.</p>}
                  </div>
                  <p className="settings-note">{canViewVeniceBalance
                    ? 'The ledger estimates token charges and detected web searches. The Venice balance above is the authoritative account total and may include activity outside Athena.'
                    : 'The ledger estimates this device\'s model-token and web-search charges. It does not expose the shared Venice account balance.'}</p>
                </section>
              </div>
            </section>
          </div>
        )}

        {upgradeOpen && (
          <UpgradeModal
            currentTier={accountTier}
            requiredPlan={upgradeRequiredPlan}
            loading={checkoutLoading}
            error={checkoutError}
            onCheckout={beginCheckout}
            onClose={() => {
              if (checkoutLoading) return
              setUpgradeOpen(false)
              setCheckoutError('')
            }}
          />
        )}

        {isOwner && ownerPasswordOpen && (
          <div
            className="settings-overlay owner-center-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !ownerUnlocking) setOwnerPasswordOpen(false)
            }}
          >
            <section className="owner-unlock-panel" role="dialog" aria-modal="true" aria-labelledby="owner-unlock-title">
              <button className="icon-button owner-modal-close" onClick={() => setOwnerPasswordOpen(false)} disabled={ownerUnlocking} aria-label="Close Owner Center unlock">
                <X size={18} />
              </button>
              <div className="owner-unlock-mark"><LockKeyhole size={20} /></div>
              <p className="eyebrow">Owner verification</p>
              <h2 id="owner-unlock-title">Unlock private images</h2>
              <p>Enter the current password for the <strong>swipingcc</strong> Firebase account. Athena verifies it with Firebase and never stores it.</p>
              <form onSubmit={unlockOwnerCenter}>
                <label className="settings-field">
                  <span>Owner password</span>
                  <input
                    type="password"
                    value={ownerPassword}
                    autoComplete="current-password"
                    autoFocus
                    onChange={(event) => setOwnerPassword(event.target.value)}
                  />
                </label>
                {ownerUnlockError && <p className="settings-error" role="alert">{ownerUnlockError}</p>}
                <button className="owner-unlock-button" type="submit" disabled={!ownerPassword || ownerUnlocking}>
                  {ownerUnlocking ? <><RefreshCw size={14} className="spin" /> Verifying...</> : <><ShieldCheck size={14} /> Unlock Owner Center</>}
                </button>
              </form>
            </section>
          </div>
        )}

        {isOwner && ownerCenterOpen && (
          <div
            className="settings-overlay owner-center-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOwnerCenterOpen(false)
            }}
          >
            <section className="owner-center-panel" role="dialog" aria-modal="true" aria-labelledby="owner-center-title">
              <header className="settings-header owner-center-header">
                <div>
                  <p className="eyebrow">Owner-only review</p>
                  <h2 id="owner-center-title">Lustify reference archive</h2>
                </div>
                <button className="icon-button" onClick={() => setOwnerCenterOpen(false)} aria-label="Close Owner Center">
                  <X size={19} />
                </button>
              </header>
              <div className="owner-center-summary">
                <span><small>Total generated</small><strong>{Number(ownerStats?.totalGenerated || 0).toLocaleString()}</strong></span>
                <span><small>Private references</small><strong>{ownerImages.length.toLocaleString()}</strong></span>
                <span><small>Automatic expiry</small><strong>4 days</strong></span>
              </div>
              {ownerImagesError && <p className="settings-error owner-center-error">{ownerImagesError}</p>}
              <div className="owner-archive-grid">
                {ownerImagesLoading ? (
                  <div className="owner-archive-empty"><RefreshCw size={22} className="spin" /><strong>Loading private archive...</strong></div>
                ) : ownerImages.length ? ownerImages.map((entry) => (
                  <OwnerArchiveImage entry={entry} onOpen={setOwnerSelectedImage} key={entry.id} />
                )) : (
                  <div className="owner-archive-empty"><ImageIcon size={25} /><strong>No Lustify references stored</strong><p>References uploaded after this release will appear here for seven days.</p></div>
                )}
              </div>
            </section>
          </div>
        )}

        {isOwner && ownerSelectedImage && (
          <OwnerArchiveDetail entry={ownerSelectedImage} onClose={() => setOwnerSelectedImage(null)} onDelete={deleteOwnerImage} />
        )}

        {trashOpen && (
          <div
            className="settings-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setTrashOpen(false)
            }}
          >
            <section className="settings-panel trash-panel" role="dialog" aria-modal="true" aria-labelledby="trash-title">
              <header className="settings-header">
                <div>
                  <p className="eyebrow">Recoverable archive</p>
                  <h2 id="trash-title">Trash</h2>
                </div>
                <button className="icon-button" onClick={() => setTrashOpen(false)} aria-label="Close Trash">
                  <X size={19} />
                </button>
              </header>
              <div className="trash-list">
                {deletedConversations.length ? deletedConversations
                  .slice()
                  .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))
                  .map((conversation) => (
                    <article className="trash-row" key={conversation.id}>
                      <div className="trash-row-copy">
                        <strong>{conversation.title}</strong>
                        <small>
                          Moved to Trash {conversation.deletedAt
                            ? new Date(conversation.deletedAt).toLocaleString()
                            : 'recently'} · {conversation.messages?.length ?? 0} messages
                        </small>
                      </div>
                      <div className="trash-row-actions">
                        <button className="refresh-button" onClick={() => restoreConversation(conversation.id)}>
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button className="refresh-button refresh-button--danger" onClick={() => permanentlyDeleteConversation(conversation.id)}>
                          <Trash2 size={14} /> Delete permanently
                        </button>
                      </div>
                    </article>
                  )) : (
                    <div className="trash-empty">
                      <Trash2 size={25} />
                      <strong>Trash is empty</strong>
                      <p>Deleted chats will remain recoverable here and in Athena's backup directory.</p>
                    </div>
                  )}
              </div>
            </section>
          </div>
        )}
      </main>

      {!onboardingComplete && (
        <div className="onboarding-overlay">
          <section className="onboarding-panel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div className="onboarding-mark"><LockKeyhole size={18} /></div>
            <p className="eyebrow">Private access setup</p>
            <h2 id="onboarding-title">Before you enter Athena</h2>
            <p className="onboarding-intro">Create the identity Athena will recognize on this device. Your profile remains in your local Athena database.</p>

            <div className="onboarding-profile-row">
              <button className="profile-picture-button onboarding-avatar-button" onClick={openAvatarPicker} aria-label="Choose an optional profile picture">
                {preferences.avatar ? <img src={preferences.avatar} alt="Your profile" /> : <UserRound size={29} />}
                <span><Camera size={11} /></span>
              </button>
              <div>
                <strong>Profile image</strong>
                <small>Optional · PNG, JPG, or WebP</small>
              </div>
              {preferences.avatar && <button className="remove-avatar-button" onClick={removeAvatar}>Remove</button>}
            </div>
            {avatarError && <p className="profile-picture-error">{avatarError}</p>}

            <label className="onboarding-name-field">
              <span>Nickname</span>
              <input
                value={onboardingName}
                maxLength={40}
                onChange={(event) => setOnboardingName(event.target.value)}
                placeholder="How should Athena address you?"
                autoComplete="nickname"
              />
            </label>

            <button
              className={`onboarding-terms-row ${termsAccepted ? 'onboarding-terms-row--accepted' : ''}`}
              onClick={openTermsModal}
              role="checkbox"
              aria-checked={termsAccepted}
            >
              <span className="onboarding-checkbox">{termsAccepted && <Check size={13} />}</span>
              <span>
                <strong>{termsAccepted ? 'Usage terms accepted' : 'Review usage terms'}</strong>
                <small>Responsibility, authorized use, privacy, and limitations</small>
              </span>
              <ArrowRight size={15} />
            </button>

            <button
              className="onboarding-access-button"
              onClick={completeOnboarding}
              disabled={!onboardingName.trim() || !termsAccepted}
            >
              Access Athena <ArrowRight size={16} />
            </button>
            <p className="onboarding-note"><ShieldCheck size={12} /> This setup is saved only on this computer.</p>
          </section>
        </div>
      )}

      {termsOpen && (
        <div className="terms-overlay">
          <section className="terms-panel" role="dialog" aria-modal="true" aria-labelledby="terms-title">
            <header className="terms-header">
              <div className="terms-header-icon"><ScrollText size={18} /></div>
              <div>
                <p className="eyebrow">Access agreement</p>
                <h2 id="terms-title">Usage Terms & Responsibility</h2>
              </div>
              <button className="icon-button" onClick={() => setTermsOpen(false)} aria-label="Close usage terms"><X size={18} /></button>
            </header>

            <div className="terms-content" ref={termsContentRef} onScroll={handleTermsScroll}>
              <p className="terms-effective">Athena usage notice · Version 1 · August 8, 2026</p>
              <p>Athena is a private AI interface intended for research, programming, invention, analysis, and other lawful intellectual work. These terms explain the responsibility you accept when using it.</p>

              <h3>1. You control how Athena is used</h3>
              <p>You are solely responsible for the prompts you submit, the actions you take, and the consequences of using or sharing Athena’s output. Athena’s operator does not direct, approve, or control your activity.</p>

              <h3>2. Use only with authorization</h3>
              <p>Security, coding, and technical capabilities must be used only on systems, accounts, networks, data, and devices you own or are explicitly authorized to test. Do not use Athena to violate laws, access systems without permission, harm people, distribute malware, steal information, or evade legitimate safeguards.</p>

              <h3>3. Verify every important result</h3>
              <p>AI output may be incomplete, outdated, insecure, misleading, or incorrect. Independently review code and verify important claims before relying on them. Athena is not a substitute for qualified legal, medical, financial, security, or other professional advice.</p>

              <h3>4. Privacy and external processing</h3>
              <p>Chat history, Trash, your nickname, profile image, uploaded originals, and generated images are stored on this computer, with a browser safety copy of chat metadata. Prompts, image prompts, active conversation context, and any attached files in that context are sent to the configured AI provider when you request a response. For Lustify reference edits, the submitted reference image and prompt are also retained in the private owner-only archive for up to seven days. If Live Web is enabled, queries may also be processed by external search services. Do not submit secrets, private likenesses without permission, or data you are not permitted to share.</p>

              <h3>5. Costs and availability</h3>
              <p>Model requests and web searches may consume paid API credits. Availability, response quality, model behavior, and provider pricing can change. You are responsible for monitoring the account and credentials connected to this installation.</p>

              <h3>6. No guarantee of outcomes</h3>
              <p>Athena is provided as an experimental intelligence tool without a promise that any response will be accurate, safe, available, or suitable for a particular purpose. To the extent permitted by applicable law, you accept the risks of deciding how to use its output.</p>

              <h3>7. Your acknowledgement</h3>
              <p>By accepting below, you confirm that you understand these limitations, will use Athena lawfully and responsibly, and will obtain any permission required before acting on technical guidance.</p>

              <div className={`terms-scroll-marker ${termsScrolled ? 'terms-scroll-marker--reached' : ''}`}>
                {termsScrolled ? <Check size={14} /> : <ChevronDown size={14} />}
                {termsScrolled ? 'Review complete' : 'Continue scrolling to accept'}
              </div>
            </div>

            <footer className="terms-footer">
              <label className={`terms-acceptance ${termsScrolled ? '' : 'terms-acceptance--locked'}`}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  disabled={!termsScrolled}
                  onChange={(event) => event.target.checked && acceptTerms()}
                />
                <span>
                  <strong>I have read and accept these terms</strong>
                  <small>{termsScrolled ? 'Check this box to continue.' : 'Available after you reach the end.'}</small>
                </span>
              </label>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
