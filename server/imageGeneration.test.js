import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildImageEditProviderPayload,
  buildImageProviderPayload,
  decodeProviderImage,
  validateImageRequest,
} from './imageGeneration.js'

test('pixel image models receive safe bounded dimensions', () => {
  const result = buildImageProviderPayload({
    model: 'z-image-turbo',
    prompt: 'A moonlit forest',
    size: 'portrait',
  })
  assert.equal(result.payload.width, 768)
  assert.equal(result.payload.height, 1024)
  assert.equal(result.payload.safe_mode, true)
  assert.equal(result.payload.aspect_ratio, undefined)
})

test('ratio image models receive model-compatible sizing', () => {
  const result = buildImageProviderPayload({
    model: 'grok-imagine-image',
    prompt: 'A moonlit forest',
    size: 'landscape',
  })
  assert.equal(result.payload.aspect_ratio, '3:2')
  assert.equal(result.payload.resolution, '1K')
  assert.equal(result.payload.width, undefined)
})

test('Lustify requires adult acknowledgement and rejects minor terms', () => {
  assert.throws(
    () => validateImageRequest({ model: 'lustify-v8', prompt: 'An adult portrait', size: 'square' }),
    /adults-only notice/,
  )
  assert.throws(
    () => validateImageRequest({ model: 'lustify-v8', prompt: 'A schoolgirl portrait', size: 'square', adultAcknowledged: true }),
    /cannot depict/,
  )
  assert.throws(
    () => validateImageRequest({ model: 'lustify-v8', prompt: 'A 16-year-old portrait', size: 'square', adultAcknowledged: true }),
    /cannot depict/,
  )
  assert.equal(
    buildImageProviderPayload({ model: 'lustify-v8', prompt: 'A fictional 28-year-old adult portrait', size: 'square', adultAcknowledged: true }).payload.safe_mode,
    false,
  )
})

test('provider base64 images are decoded with bounds', () => {
  const source = Buffer.from('RIFFxxxxWEBPmore-image-data')
  assert.deepEqual(decodeProviderImage(source.toString('base64')), source)
  assert.throws(() => decodeProviderImage(''), /no image data/)
})

test('Lustify reference edits use the private uncensored edit engine with explicit consent', () => {
  const reference = {
    metadata: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'consented-adult.webp',
      type: 'image/webp',
      kind: 'image',
    },
    data: Buffer.from('RIFFxxxxWEBPconsented-reference-image'),
  }

  assert.throws(
    () => buildImageEditProviderPayload({
      model: 'lustify-v8',
      prompt: 'Place this fictional 28-year-old adult above the ocean',
      adultAcknowledged: true,
    }, reference),
    /explicit permission/,
  )

  const result = buildImageEditProviderPayload({
    model: 'lustify-v8',
    prompt: 'Place this fictional 28-year-old adult above the ocean',
    size: 'landscape',
    adultAcknowledged: true,
    referenceConsentAcknowledged: true,
  }, reference)

  assert.equal(result.editModel.id, 'qwen-edit-uncensored')
  assert.equal(result.payload.safe_mode, false)
  assert.equal(result.payload.aspect_ratio, '3:2')
  assert.equal(result.payload.image, reference.data.toString('base64'))
  assert.match(result.payload.prompt, /Preserve the subject’s recognizable identity/)
  assert.match(result.payload.prompt, /Requested change:/)
})

test('reference edits preserve the source composition by default when requested', () => {
  const result = buildImageEditProviderPayload({
    model: 'lustify-v8',
    prompt: 'Change only the clothing color',
    size: 'original',
    adultAcknowledged: true,
    referenceConsentAcknowledged: true,
  }, {
    metadata: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'self-portrait.png',
      type: 'image/png',
      kind: 'image',
    },
    data: Buffer.from('long-enough-consented-reference-image'),
  })

  assert.equal(result.sizeKey, 'original')
  assert.equal(result.payload.aspect_ratio, 'auto')
})

test('reference edits accept only supported image uploads', () => {
  assert.throws(
    () => buildImageEditProviderPayload({
      model: 'z-image-turbo',
      prompt: 'Move this subject over the ocean',
      referenceConsentAcknowledged: true,
    }, {
      metadata: { name: 'notes.txt', type: 'text/plain', kind: 'file' },
      data: Buffer.from('not-an-image'),
    }),
    /supports PNG, JPEG, and WebP/,
  )
})
