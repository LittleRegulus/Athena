import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_SETTINGS = {
  name: '',
  avatar: '',
  defaultModel: 'gemma-4-uncensored',
  defaultWebSearch: false,
}

const EMPTY_STATE = {
  schemaVersion: 1,
  conversations: [],
  deletedConversations: [],
  settings: DEFAULT_SETTINGS,
  usage: [],
  onboardingComplete: false,
  terms: null,
  updatedAt: null,
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function jsonClone(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function normalizeConversation(conversation, deleted = false) {
  if (!conversation || typeof conversation !== 'object') return null
  const id = String(conversation.id || '').slice(0, 200)
  if (!id) return null

  const normalized = jsonClone(conversation, {})
  normalized.id = id
  normalized.title = String(conversation.title || 'Untitled Chat').slice(0, 200)
  normalized.createdAt = String(conversation.createdAt || new Date().toISOString()).slice(0, 80)
  normalized.updatedAt = String(conversation.updatedAt || normalized.createdAt).slice(0, 80)
  normalized.messages = Array.isArray(conversation.messages) ? conversation.messages.slice(0, 10_000) : []

  if (deleted) {
    normalized.deletedAt = String(conversation.deletedAt || new Date().toISOString()).slice(0, 80)
  } else {
    delete normalized.deletedAt
  }
  return normalized
}

function normalizeState(input = {}) {
  const conversations = Array.isArray(input.conversations)
    ? input.conversations.map((item) => normalizeConversation(item)).filter(Boolean)
    : []
  const deletedConversations = Array.isArray(input.deletedConversations)
    ? input.deletedConversations.map((item) => normalizeConversation(item, true)).filter(Boolean)
    : []
  const deletedIds = new Set(deletedConversations.map((item) => item.id))

  return {
    schemaVersion: 1,
    conversations: conversations.filter((item) => !deletedIds.has(item.id)),
    deletedConversations,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(input.settings && typeof input.settings === 'object' ? jsonClone(input.settings, {}) : {}),
    },
    usage: Array.isArray(input.usage) ? jsonClone(input.usage.slice(0, 10_000), []) : [],
    onboardingComplete: Boolean(input.onboardingComplete),
    terms: input.terms && typeof input.terms === 'object' ? jsonClone(input.terms, null) : null,
    updatedAt: new Date().toISOString(),
  }
}

function hasMeaningfulState(state) {
  return Boolean(
    state.conversations.length
    || state.deletedConversations.length
    || state.usage.length
    || state.onboardingComplete
    || state.settings.name
    || state.settings.avatar,
  )
}

function mergeById(existing, incoming, dateKey = 'updatedAt') {
  const merged = new Map()
  for (const item of [...existing, ...incoming]) {
    if (!item?.id) continue
    const current = merged.get(item.id)
    if (!current || String(item[dateKey] || '') >= String(current[dateKey] || '')) {
      merged.set(item.id, item)
    }
  }
  return [...merged.values()]
}

function mergeImportedState(existingInput, browserInput) {
  const existing = normalizeState(existingInput)
  const browser = normalizeState(browserInput)
  const deletedConversations = mergeById(
    existing.deletedConversations,
    browser.deletedConversations,
    'deletedAt',
  )
  const deletedIds = new Set(deletedConversations.map((item) => item.id))
  const conversations = mergeById(existing.conversations, browser.conversations)
    .filter((item) => !deletedIds.has(item.id))

  return normalizeState({
    conversations,
    deletedConversations,
    settings: { ...existing.settings, ...browser.settings },
    usage: mergeById(existing.usage, browser.usage, 'timestamp'),
    onboardingComplete: existing.onboardingComplete || browser.onboardingComplete,
    terms: browser.terms ?? existing.terms,
  })
}

export function createStorage(projectRoot) {
  const dataDirectory = path.join(projectRoot, 'data')
  const backupDirectory = path.join(dataDirectory, 'backups')
  const exportDirectory = path.join(dataDirectory, 'exports')
  mkdirSync(backupDirectory, { recursive: true })
  mkdirSync(exportDirectory, { recursive: true })

  const databasePath = path.join(dataDirectory, 'athena.db')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const getMetadata = database.prepare('SELECT value FROM metadata WHERE key = ?')
  const setMetadata = database.prepare(`
    INSERT INTO metadata (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  let instanceId = getMetadata.get('instance_id')?.value
  if (!instanceId) {
    instanceId = randomUUID()
    setMetadata.run('instance_id', instanceId)
  }

  const getStateRow = database.prepare("SELECT value FROM app_state WHERE key = 'root'")
  const setStateRow = database.prepare(`
    INSERT INTO app_state (key, value, updated_at) VALUES ('root', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)

  function readState() {
    const row = getStateRow.get()
    if (!row) return normalizeState(EMPTY_STATE)
    try {
      return normalizeState(JSON.parse(row.value))
    } catch {
      return normalizeState(EMPTY_STATE)
    }
  }

  function writeJsonBackup(prefix, state, metadata = {}) {
    const filename = `${prefix}-${safeTimestamp()}.json`
    const targetPath = path.join(backupDirectory, filename)
    writeFileSync(targetPath, `${JSON.stringify({
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      ...metadata,
      state,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return { filename, path: targetPath }
  }

  function createDailyBackup(state = readState()) {
    if (!hasMeaningfulState(state)) return null
    const day = new Date().toISOString().slice(0, 10)
    const targetPath = path.join(backupDirectory, `athena-daily-${day}.json`)
    if (existsSync(targetPath)) return null
    writeFileSync(targetPath, `${JSON.stringify({
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      reason: 'daily',
      state,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return { filename: path.basename(targetPath), path: targetPath }
  }

  function persistState(input) {
    const previous = readState()
    const state = normalizeState(input)
    if (state.deletedConversations.length > previous.deletedConversations.length) {
      writeJsonBackup('athena-before-trash', previous, { reason: 'before-trash' })
    }
    createDailyBackup(previous)

    const timestamp = new Date().toISOString()
    database.exec('BEGIN IMMEDIATE')
    try {
      setStateRow.run(JSON.stringify(state), timestamp)
      setMetadata.run('last_saved_at', timestamp)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return state
  }

  function importBrowserState(input, sourceOrigin = 'unknown') {
    const browserState = normalizeState(input)
    writeJsonBackup('browser-import', browserState, {
      reason: 'browser-import',
      sourceOrigin: String(sourceOrigin).slice(0, 500),
    })
    return persistState(mergeImportedState(readState(), browserState))
  }

  function createManualBackup() {
    return writeJsonBackup('athena-manual', readState(), { reason: 'manual' })
  }

  function getInfo() {
    const state = readState()
    return {
      instanceId,
      initialized: hasMeaningfulState(state),
      databasePath,
      backupDirectory,
      lastSavedAt: getMetadata.get('last_saved_at')?.value ?? null,
      state,
    }
  }

  createDailyBackup()

  return {
    close: () => database.close(),
    createManualBackup,
    getInfo,
    importBrowserState,
    persistState,
    readState,
  }
}
