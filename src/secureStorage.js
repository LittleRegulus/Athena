const DATABASE_NAME = 'athena-secure-v1'
const DATABASE_VERSION = 1
const META_STORE = 'vaults'
const RECORD_STORE = 'records'
const PBKDF2_ITERATIONS = 310_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

let databasePromise = null
let currentUserId = null
let masterKey = null
let masterKeyBytes = null
let values = new Map()
let writeChain = Promise.resolve()

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was cancelled.'))
  })
}

function openDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'userId' })
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const store = database.createObjectStore(RECORD_STORE, { keyPath: 'id' })
        store.createIndex('byUser', 'userId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Athena could not open encrypted device storage.'))
  })
  return databasePromise
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

async function passwordKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function importMasterKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function wrapMasterKey(password, bytes) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await passwordKey(password, salt)
  const wrappedKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
  return { salt, iv, wrappedKey }
}

async function saveVaultMeta(userId, password, bytes) {
  const database = await openDatabase()
  const wrapped = await wrapMasterKey(password, bytes)
  const transaction = database.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).put({
    userId,
    version: 1,
    iterations: PBKDF2_ITERATIONS,
    salt: wrapped.salt,
    iv: wrapped.iv,
    wrappedKey: wrapped.wrappedKey,
    updatedAt: new Date().toISOString(),
  })
  await transactionComplete(transaction)
}

async function decryptMasterKey(meta, password) {
  try {
    const key = await passwordKey(password, new Uint8Array(meta.salt))
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(meta.iv) },
      key,
      meta.wrappedKey,
    )
    return new Uint8Array(bytes)
  } catch {
    throw new Error('Athena could not unlock the encrypted device vault with this password.')
  }
}

async function encryptValue(value) {
  const iv = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, encoder.encode(value))
  return { iv, ciphertext }
}

async function decryptValue(record) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
    masterKey,
    record.ciphertext,
  )
  return decoder.decode(plaintext)
}

function assertUnlocked() {
  if (!currentUserId || !masterKey) throw new Error('Athena device storage is locked.')
}

function queueWrite(task) {
  writeChain = writeChain.catch(() => {}).then(task)
  return writeChain
}

async function persistValue(name, value) {
  const database = await openDatabase()
  const encrypted = await encryptValue(value)
  const transaction = database.transaction(RECORD_STORE, 'readwrite')
  transaction.objectStore(RECORD_STORE).put({
    id: `${currentUserId}:${name}`,
    userId: currentUserId,
    name,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    updatedAt: new Date().toISOString(),
  })
  await transactionComplete(transaction)
}

async function deleteValue(name) {
  const database = await openDatabase()
  const transaction = database.transaction(RECORD_STORE, 'readwrite')
  transaction.objectStore(RECORD_STORE).delete(`${currentUserId}:${name}`)
  await transactionComplete(transaction)
}

async function migratePlainBrowserData() {
  const names = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const name = window.localStorage.key(index)
    if (name?.startsWith('athena:')) names.push(name)
  }

  const migrated = []
  for (const name of names) {
    if (values.has(name)) continue
    const value = window.localStorage.getItem(name)
    if (value === null) continue
    values.set(name, value)
    await persistValue(name, value)
    migrated.push(name)
  }
  migrated.forEach((name) => window.localStorage.removeItem(name))
}

export async function unlockSecureStorage(password, userId) {
  if (!password || !userId) throw new Error('A password and signed-in user are required to unlock Athena.')
  const database = await openDatabase()
  const metaTransaction = database.transaction(META_STORE, 'readonly')
  const meta = await requestResult(metaTransaction.objectStore(META_STORE).get(userId))

  const bytes = meta ? await decryptMasterKey(meta, password) : randomBytes(32)
  if (!meta) await saveVaultMeta(userId, password, bytes)

  currentUserId = userId
  masterKeyBytes = bytes
  masterKey = await importMasterKey(bytes)
  values = new Map()
  writeChain = Promise.resolve()

  const recordTransaction = database.transaction(RECORD_STORE, 'readonly')
  const records = await requestResult(recordTransaction.objectStore(RECORD_STORE).index('byUser').getAll(userId))
  for (const record of records) values.set(record.name, await decryptValue(record))

  await migratePlainBrowserData()
}

export const secureStorage = {
  getItem(name) {
    assertUnlocked()
    return values.has(name) ? values.get(name) : null
  },
  setItem(name, value) {
    assertUnlocked()
    const normalized = String(value)
    values.set(name, normalized)
    queueWrite(() => persistValue(name, normalized))
  },
  removeItem(name) {
    assertUnlocked()
    values.delete(name)
    queueWrite(() => deleteValue(name))
  },
}

export async function rewrapSecureStorage(newPassword) {
  assertUnlocked()
  await writeChain
  await saveVaultMeta(currentUserId, newPassword, masterKeyBytes)
}

export async function exportSecureStorage() {
  assertUnlocked()
  await writeChain
  return Object.fromEntries(values)
}

export async function flushSecureStorage() {
  await writeChain
}

export async function lockSecureStorage() {
  await flushSecureStorage().catch(() => {})
  currentUserId = null
  masterKey = null
  masterKeyBytes = null
  values = new Map()
  writeChain = Promise.resolve()
}

export function secureStorageIsUnlocked() {
  return Boolean(currentUserId && masterKey)
}
