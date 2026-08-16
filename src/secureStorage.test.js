import 'fake-indexeddb/auto'

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  flushSecureStorage,
  lockSecureStorage,
  rewrapSecureStorage,
  secureStorage,
  unlockSecureStorage,
} from './secureStorage.js'

class MemoryStorage {
  #values = new Map()

  get length() { return this.#values.size }
  key(index) { return [...this.#values.keys()][index] ?? null }
  getItem(name) { return this.#values.has(name) ? this.#values.get(name) : null }
  setItem(name, value) { this.#values.set(String(name), String(value)) }
  removeItem(name) { this.#values.delete(String(name)) }
}

globalThis.window = { localStorage: new MemoryStorage() }

test('encrypted vault migrates, persists, rejects a wrong password, and re-wraps its key', async () => {
  const userId = crypto.randomUUID()
  window.localStorage.setItem('athena:test-record', 'legacy-value')

  await unlockSecureStorage('first-password', userId)
  assert.equal(secureStorage.getItem('athena:test-record'), 'legacy-value')
  assert.equal(window.localStorage.getItem('athena:test-record'), null)

  for (let index = 0; index < 100; index += 1) {
    secureStorage.setItem('athena:conversation', JSON.stringify({ message: `private-${index}` }))
  }
  await flushSecureStorage()
  await lockSecureStorage()

  await assert.rejects(
    unlockSecureStorage('wrong-password', userId),
    /could not unlock the encrypted device vault/i,
  )

  await unlockSecureStorage('first-password', userId)
  assert.deepEqual(JSON.parse(secureStorage.getItem('athena:conversation')), { message: 'private-99' })
  await rewrapSecureStorage('second-password')
  await lockSecureStorage()

  await assert.rejects(unlockSecureStorage('first-password', userId))
  await unlockSecureStorage('second-password', userId)
  assert.equal(secureStorage.getItem('athena:test-record'), 'legacy-value')
  await lockSecureStorage()
})
