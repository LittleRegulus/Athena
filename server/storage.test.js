import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createStorage } from './storage.js'

test('browser history survives import, Trash, backup, and database restart', () => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'athena-storage-'))

  try {
    let storage = createStorage(projectRoot)
    assert.equal(storage.getInfo().initialized, false)

    const imported = storage.importBrowserState({
      conversations: [{
        id: 'conversation-1',
        title: 'Protected chat',
        createdAt: '2026-08-09T00:00:00.000Z',
        updatedAt: '2026-08-09T00:01:00.000Z',
        model: 'gemma-4-uncensored',
        messages: [{ id: 'message-1', role: 'user', content: 'Keep this', parentId: null }],
      }],
      deletedConversations: [],
      settings: { name: 'Athena user' },
      usage: [],
      onboardingComplete: true,
      terms: { version: 1, acceptedAt: '2026-08-09T00:00:00.000Z' },
    }, 'http://127.0.0.1:8787')

    assert.equal(imported.conversations.length, 1)
    assert.equal(imported.conversations[0].messages[0].content, 'Keep this')
    assert.equal(storage.getInfo().initialized, true)

    const trashed = { ...imported.conversations[0], deletedAt: '2026-08-09T00:02:00.000Z' }
    storage.persistState({ ...imported, conversations: [], deletedConversations: [trashed] })
    assert.equal(storage.readState().deletedConversations.length, 1)
    storage.createManualBackup()

    const backupNames = readdirSync(path.join(projectRoot, 'data', 'backups'))
    assert.ok(backupNames.some((name) => name.startsWith('browser-import-')))
    assert.ok(backupNames.some((name) => name.startsWith('athena-before-trash-')))
    assert.ok(backupNames.some((name) => name.startsWith('athena-manual-')))
    assert.ok(existsSync(path.join(projectRoot, 'data', 'athena.db')))

    storage.close()
    storage = createStorage(projectRoot)
    assert.equal(storage.readState().deletedConversations[0].title, 'Protected chat')
    storage.close()
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})
