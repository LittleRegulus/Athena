import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EPSTEIN_EASTER_EGG_RESPONSE,
  getEasterEggResponse,
} from './easterEggs.js'

test('returns the black-file story regardless of capitalization or punctuation', () => {
  assert.equal(getEasterEggResponse('Is Jeffrey Epstein still alive?'), EPSTEIN_EASTER_EGG_RESPONSE)
  assert.equal(getEasterEggResponse('  is jeffrey EPSTEIN still alive  '), EPSTEIN_EASTER_EGG_RESPONSE)
  assert.equal(getEasterEggResponse('IS JEFFREY EPSTEIN STILL ALIVE!!!'), EPSTEIN_EASTER_EGG_RESPONSE)
})

test('recognizes common misspellings in the trigger phrase', () => {
  assert.equal(getEasterEggResponse('is jeffery epstien still alive'), EPSTEIN_EASTER_EGG_RESPONSE)
  assert.equal(getEasterEggResponse('iz jefery epsten stil alive?'), EPSTEIN_EASTER_EGG_RESPONSE)
})

test('does not activate for near matches or unrelated prompts', () => {
  assert.equal(getEasterEggResponse('Is Jeffrey Epstein alive?'), null)
  assert.equal(getEasterEggResponse('Tell me: is Jeffrey Epstein still alive?'), null)
  assert.equal(getEasterEggResponse('What is the weather?'), null)
  assert.equal(getEasterEggResponse(null), null)
})

test('keeps the speculative framing in the easter-egg response', () => {
  assert.match(EPSTEIN_EASTER_EGG_RESPONSE, /deviates from verified public records/i)
  assert.match(EPSTEIN_EASTER_EGG_RESPONSE, /speculative synthesis/i)
})
