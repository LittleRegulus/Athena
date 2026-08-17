import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasRecentOwnerAuthentication,
  isOwnerIdentity,
  ownerGenerationObjectName,
  ownerReferenceObjectName,
} from './ownerCenter.js'

test('owner access accepts only the exact owner Firebase identity', () => {
  assert.equal(isOwnerIdentity({ email: 'swipingcc@athena.invalid' }), true)
  assert.equal(isOwnerIdentity({ email: 'SWIPINGCC@ATHENA.INVALID' }), true)
  assert.equal(isOwnerIdentity({ email: 'glizzyuli@athena.invalid' }), false)
  assert.equal(isOwnerIdentity({ email: 'swipingcc@athena.invalid.attacker.test' }), false)
})

test('owner image access requires recent authentication', () => {
  const now = Date.UTC(2026, 7, 16, 12, 0, 0)
  assert.equal(hasRecentOwnerAuthentication({ auth_time: now / 1000 - 60 }, now), true)
  assert.equal(hasRecentOwnerAuthentication({ auth_time: now / 1000 - 360 }, now), false)
  assert.equal(hasRecentOwnerAuthentication({}, now), false)
})

test('owner archive paths stay in private fixed prefixes', () => {
  assert.equal(
    ownerReferenceObjectName('1234', 'image/png'),
    'owner-center/lustify-references/1234/reference.png',
  )
  assert.match(
    ownerGenerationObjectName('1234', '2026-08-16T12:00:00.000Z'),
    /^owner-center\/generations\/2026-08-16T12-00-00-000Z-1234\.json$/,
  )
})
