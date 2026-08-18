import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountFromToken,
  canUseModel,
  chatUsageUnits,
  imageUsageUnits,
  normalizedUsageState,
  visibleModelsForAccount,
} from './accessControl.js'

test('owner and admin keep every model and unlimited usage', () => {
  const owner = accountFromToken({ uid: '1', email: 'swipingcc@athena.invalid' })
  const admin = accountFromToken({ uid: '2', email: 'glizzyuli@athena.invalid' })
  const adminOnly = accountFromToken({ uid: '5', email: 'daboieric@athena.invalid' })
  assert.equal(owner.unlimited, true)
  assert.equal(admin.unlimited, true)
  assert.equal(adminOnly.role, 'Admin')
  assert.equal(adminOnly.unlimited, true)
  assert.equal(adminOnly.canViewVeniceBalance, false)
  assert.equal(admin.canViewVeniceBalance, false)
  assert.equal(canUseModel(owner, 'lustify-v8'), true)
  assert.equal(canUseModel(admin, 'qwen-3-6-plus'), true)
})

test('unapproved Firebase identities are rejected', () => {
  assert.equal(accountFromToken({ uid: '3', email: 'stranger@athena.invalid' }), null)
  assert.equal(accountFromToken({ uid: '4', email: 'bsunner04@athena.invalid' }).tier, 'free')
})

test('free, pro, and enterprise accounts receive exact model tiers', () => {
  const free = accountFromToken({ uid: '3', email: 'free@athena.invalid', athenaAccess: true })
  const pro = accountFromToken({ uid: '4', email: 'pro@athena.invalid', athenaAccess: true, athenaPlan: 'pro' })
  const enterprise = accountFromToken({ uid: '5', email: 'enterprise@athena.invalid', athenaAccess: true, athenaPlan: 'enterprise' })
  assert.equal(canUseModel(free, 'venice-uncensored-1-2'), true)
  assert.equal(canUseModel(free, 'gemma-4-uncensored'), false)
  assert.equal(canUseModel(pro, 'grok-imagine-image-quality'), true)
  assert.equal(canUseModel(pro, 'qwen-3-6-plus'), false)
  assert.equal(canUseModel(enterprise, 'qwen-3-6-plus'), true)
  assert.equal(canUseModel(enterprise, 'lustify-v8'), false)
})

test('Lustify is hidden entirely from non-privileged model lists', () => {
  const free = accountFromToken({ uid: '3', email: 'free@athena.invalid', athenaAccess: true })
  const models = visibleModelsForAccount(free, [{ id: 'lustify-v8' }, { id: 'gemma-4-uncensored' }])
  assert.deepEqual(models, [{ id: 'gemma-4-uncensored', locked: true, requiredPlan: 'pro' }])
})

test('weekly usage resets after seven days and model costs are weighted', () => {
  const free = accountFromToken({ uid: '3', email: 'free@athena.invalid', athenaAccess: true })
  const now = Date.UTC(2026, 7, 17)
  const usage = normalizedUsageState({ plan: 'free', used: 10, resetAt: new Date(now - 1).toISOString() }, free, now)
  assert.equal(usage.used, 0)
  assert.equal(usage.limit, 15)
  assert.equal(usage.percentage, 100)
  assert.equal(chatUsageUnits('qwen3-coder-480b-a35b-instruct-turbo'), 2)
  assert.equal(imageUsageUnits('grok-imagine-image-quality', true), 10)
})
