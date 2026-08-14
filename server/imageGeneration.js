export const IMAGE_MODELS = [
  {
    id: 'z-image-turbo',
    type: 'image',
    label: 'Athena Image',
    description: 'Fast private image generation for everyday artwork',
    badge: 'Fast · private',
    badgeTone: 'image',
    cost: '$0.01 / image',
    generationPrice: 0.01,
    promptLimit: 7500,
    sizing: 'pixels',
    steps: 8,
    adult: false,
  },
  {
    id: 'grok-imagine-image',
    type: 'image',
    label: 'Athena Imagine',
    description: 'Private, polished generation with stronger prompt following',
    badge: 'Quality · private',
    badgeTone: 'imagine',
    cost: '$0.03 / 1K image',
    generationPrice: 0.03,
    promptLimit: 7500,
    sizing: 'ratio',
    resolution: '1K',
    adult: false,
  },
  {
    id: 'grok-imagine-image-quality',
    type: 'image',
    label: 'Athena Imagine HQ',
    description: 'Highest-quality private image generation',
    badge: 'Premium · private',
    badgeTone: 'premium',
    cost: '$0.06 / 1K image',
    generationPrice: 0.06,
    promptLimit: 7500,
    sizing: 'ratio',
    resolution: '1K',
    adult: false,
  },
  {
    id: 'wai-Illustrious',
    type: 'image',
    label: 'Athena Anime',
    description: 'Private illustration model tuned for anime artwork',
    badge: 'Anime · private',
    badgeTone: 'anime',
    cost: '$0.01 / image',
    generationPrice: 0.01,
    promptLimit: 1500,
    sizing: 'pixels',
    steps: 25,
    adult: false,
  },
  {
    id: 'lustify-v8',
    type: 'image',
    label: 'Athena Lustify',
    description: 'Private uncensored artwork for consenting adults only',
    badge: 'Adult · private',
    badgeTone: 'adult',
    cost: '$0.01 / image',
    generationPrice: 0.01,
    promptLimit: 1500,
    sizing: 'pixels',
    steps: 30,
    adult: true,
  },
]

export const IMAGE_SIZES = {
  square: { label: 'Square', width: 1024, height: 1024, aspectRatio: '1:1' },
  portrait: { label: 'Portrait', width: 768, height: 1024, aspectRatio: '2:3' },
  landscape: { label: 'Landscape', width: 1024, height: 768, aspectRatio: '3:2' },
}

export const REFERENCE_EDIT_MODELS = {
  'z-image-turbo': {
    id: 'firered-image-edit',
    label: 'Athena Reference',
    price: 0.04,
    promptLimit: 5000,
  },
  'grok-imagine-image': {
    id: 'grok-imagine-edit',
    label: 'Athena Imagine Reference',
    price: 0.0323,
    promptLimit: 7500,
    resolution: '1K',
  },
  'grok-imagine-image-quality': {
    id: 'grok-imagine-quality-edit',
    label: 'Athena Imagine HQ Reference',
    price: 0.0715,
    promptLimit: 7500,
    resolution: '1K',
  },
  'wai-Illustrious': {
    id: 'firered-image-edit',
    label: 'Athena Anime Reference',
    price: 0.04,
    promptLimit: 5000,
  },
  'lustify-v8': {
    id: 'qwen-edit-uncensored',
    label: 'Athena Lustify Reference',
    price: 0.04,
    promptLimit: 1500,
  },
}

const REFERENCE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const PROHIBITED_ADULT_TERMS = /\b(?:child|children|minor|underage|preteen|pre-teen|teen|teenager|toddler|infant|schoolgirl|schoolboy|loli|lolita|shota|barely legal|young-looking)\b/i
const PROHIBITED_ADULT_AGE = /\b(?:(?:aged?|age)\s*(?:[0-9]|1[0-7])|(?:[0-9]|1[0-7])(?:-|\s*)years?(?:-|\s*)old)\b/i

export function validateImageRequest(input = {}) {
  const model = IMAGE_MODELS.find((entry) => entry.id === input.model)
  if (!model) throw new Error('That image model is not enabled in Athena.')

  const prompt = String(input.prompt || '').trim()
  if (!prompt) throw new Error('Describe the image you want Athena to create.')
  if (prompt.length > model.promptLimit) {
    throw new Error(`${model.label} accepts prompts up to ${model.promptLimit.toLocaleString('en-US')} characters.`)
  }

  const sizeKey = Object.hasOwn(IMAGE_SIZES, input.size) ? input.size : 'square'
  if (model.adult) {
    if (!input.adultAcknowledged) {
      throw new Error('Confirm the adults-only notice before using Athena Lustify.')
    }
    if (PROHIBITED_ADULT_TERMS.test(prompt) || PROHIBITED_ADULT_AGE.test(prompt)) {
      throw new Error('Adult image prompts cannot depict or sexualize minors or age-ambiguous subjects.')
    }
  }

  return { model, prompt, sizeKey, size: IMAGE_SIZES[sizeKey] }
}

export function buildImageProviderPayload(input) {
  const { model, prompt, sizeKey, size } = validateImageRequest(input)
  const payload = {
    model: model.id,
    prompt,
    negative_prompt: model.adult
      ? 'child, minor, underage, young-looking, low quality, blurry, distorted anatomy, extra limbs, text, watermark'
      : 'low quality, blurry, distorted anatomy, extra limbs, text, watermark',
    format: 'webp',
    variants: 1,
    return_binary: false,
    safe_mode: !model.adult,
  }

  if (model.sizing === 'ratio') {
    payload.aspect_ratio = size.aspectRatio
    payload.resolution = model.resolution
  } else {
    payload.width = size.width
    payload.height = size.height
    payload.steps = model.steps
  }

  return { model, prompt, sizeKey, size, payload }
}

export function buildImageEditProviderPayload(input, reference) {
  const preserveOriginalComposition = input.size === 'original'
  const generation = validateImageRequest({
    ...input,
    size: preserveOriginalComposition ? 'square' : input.size,
  })
  if (!input.referenceConsentAcknowledged) {
    throw new Error('Confirm that you own the reference image or have explicit permission to use every person’s likeness.')
  }
  if (!reference?.metadata || !Buffer.isBuffer(reference.data)) {
    throw new Error('The reference image is unavailable. Attach it again and retry.')
  }
  if (reference.metadata.kind !== 'image' || !REFERENCE_IMAGE_TYPES.has(reference.metadata.type)) {
    throw new Error('Reference editing supports PNG, JPEG, and WebP images.')
  }

  const editModel = REFERENCE_EDIT_MODELS[generation.model.id]
  if (!editModel) throw new Error('Reference editing is not available for that image model.')

  const providerPrompt = [
    'Edit the supplied source image itself; do not replace it with a newly invented person or unrelated composition.',
    'Preserve the subject’s recognizable identity, facial structure, skin tone, hair, body proportions, pose, camera perspective, and every region not explicitly requested to change.',
    `Requested change: ${generation.prompt}`,
    'Make only the changes needed for that request and keep the result visibly based on the original photograph.',
  ].join(' ')
  if (providerPrompt.length > editModel.promptLimit) {
    throw new Error(`Shorten the reference-edit instruction to ${Math.max(1, editModel.promptLimit - 420).toLocaleString('en-US')} characters or fewer.`)
  }

  const editSize = preserveOriginalComposition
    ? { label: 'Original', width: null, height: null, aspectRatio: 'auto' }
    : generation.size

  const payload = {
    model: editModel.id,
    prompt: providerPrompt,
    image: reference.data.toString('base64'),
    aspect_ratio: editSize.aspectRatio,
    output_format: 'webp',
    safe_mode: !generation.model.adult,
  }
  if (editModel.resolution) payload.resolution = editModel.resolution

  return {
    ...generation,
    sizeKey: preserveOriginalComposition ? 'original' : generation.sizeKey,
    size: editSize,
    editModel,
    reference: reference.metadata,
    payload,
  }
}

export function decodeProviderImage(value) {
  const encoded = String(value || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
  if (!encoded) throw new Error('The image provider returned no image data.')
  const image = Buffer.from(encoded, 'base64')
  if (image.length < 12 || image.length > 30 * 1024 * 1024) {
    throw new Error('The generated image failed Athena\'s local integrity check.')
  }
  return image
}
