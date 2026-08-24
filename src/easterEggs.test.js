import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EPSTEIN_EASTER_EGG_RESPONSE,
  getEasterEggResponse,
} from './easterEggs.js'

test('returns the black-file story for the exact phrase regardless of case', () => {
  assert.equal(getEasterEggResponse('Is Jeffrey Epstein still alive?'), EPSTEIN_EASTER_EGG_RESPONSE)
  assert.equal(getEasterEggResponse('  is jeffrey EPSTEIN still alive?  '), EPSTEIN_EASTER_EGG_RESPONSE)
})

test('does not activate for near matches or unrelated prompts', () => {
  assert.equal(getEasterEggResponse('Is Jeffrey Epstein still alive'), null)
  assert.equal(getEasterEggResponse('Tell me: is Jeffrey Epstein still alive?'), null)
  assert.equal(getEasterEggResponse('What is the weather?'), null)
  assert.equal(getEasterEggResponse(null), null)
})

test('keeps the fictional framing in the easter-egg response', () => {
  assert.match(EPSTEIN_EASTER_EGG_RESPONSE, /fictional satire/i)
  assert.match(EPSTEIN_EASTER_EGG_RESPONSE, /not a factual claim/i)
})
