const LANGUAGE_EXTENSIONS = {
  bash: 'sh',
  c: 'c',
  csharp: 'cs',
  cs: 'cs',
  css: 'css',
  dart: 'dart',
  dockerfile: 'Dockerfile',
  go: 'go',
  html: 'html',
  java: 'java',
  javascript: 'js',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  kotlin: 'kt',
  lua: 'lua',
  markdown: 'md',
  md: 'md',
  php: 'php',
  powershell: 'ps1',
  ps1: 'ps1',
  python: 'py',
  py: 'py',
  r: 'r',
  ruby: 'rb',
  rust: 'rs',
  scss: 'scss',
  shell: 'sh',
  sh: 'sh',
  sql: 'sql',
  swift: 'swift',
  text: 'txt',
  toml: 'toml',
  ts: 'ts',
  tsx: 'tsx',
  typescript: 'ts',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yml',
}

function filenameFromHeading(heading) {
  const inlineCode = heading.match(/`([^`]+)`/)
  if (inlineCode) return inlineCode[1]

  return heading
    .replace(/^\s*(?:file\s*:|\d+[.)]\s*)/i, '')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(/\s+\((?:new|updated|complete)\)\s*$/i, '')
    .replace(/[*_]/g, '')
    .trim()
}

function filenameFromFenceInfo(info) {
  const filenameMatch = info.match(/(?:filename|file)\s*=\s*["']?([^\s"']+)/i)
  if (filenameMatch) return filenameMatch[1]

  const tokens = info.trim().split(/\s+/)
  return tokens.slice(1).find((token) => token.includes('.') || token.includes('/')) || ''
}

export function sanitizeArchivePath(input) {
  const value = String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim()
  const parts = value
    .split('/')
    .map((part) => part.trim().replace(/[<>:"|?*\u0000-\u001f]/g, '_'))
    .filter((part) => part && part !== '.' && part !== '..')
  return parts.join('/').slice(0, 240)
}

function fallbackFilename(language, index) {
  const extension = LANGUAGE_EXTENSIONS[language.toLowerCase()] || 'txt'
  if (extension === 'Dockerfile') return index === 1 ? 'Dockerfile' : `Dockerfile-${index}`
  return `snippet-${index}.${extension}`
}

function uniquePath(candidate, usedPaths) {
  if (!usedPaths.has(candidate)) return candidate
  const slashIndex = candidate.lastIndexOf('/')
  const directory = slashIndex >= 0 ? candidate.slice(0, slashIndex + 1) : ''
  const basename = slashIndex >= 0 ? candidate.slice(slashIndex + 1) : candidate
  const dotIndex = basename.lastIndexOf('.')
  const stem = dotIndex > 0 ? basename.slice(0, dotIndex) : basename
  const extension = dotIndex > 0 ? basename.slice(dotIndex) : ''
  let suffix = 2
  let next = `${directory}${stem}-${suffix}${extension}`
  while (usedPaths.has(next)) {
    suffix += 1
    next = `${directory}${stem}-${suffix}${extension}`
  }
  return next
}

export function extractProjectFiles(markdown) {
  const source = String(markdown || '')
  const files = []
  const usedPaths = new Set()
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g
  let match

  while ((match = fencePattern.exec(source))) {
    const fenceInfo = match[1].trim()
    const language = fenceInfo.split(/\s+/)[0] || 'text'
    const beforeFence = source.slice(0, match.index)
    const headingMatches = [...beforeFence.matchAll(/^#{2,6}\s+(.+)\s*$/gm)]
    const nearestHeading = headingMatches.at(-1)
    const headingIsNearby = nearestHeading && match.index - (nearestHeading.index + nearestHeading[0].length) < 240
    const suggestedPath = filenameFromFenceInfo(fenceInfo)
      || (headingIsNearby ? filenameFromHeading(nearestHeading[1]) : '')
    const sanitized = sanitizeArchivePath(suggestedPath)
    const hasUsableFilename = sanitized && (
      sanitized.includes('.')
      || sanitized.includes('/')
      || /^(?:dockerfile|makefile|license|readme)$/i.test(sanitized)
    )
    const candidate = hasUsableFilename ? sanitized : fallbackFilename(language, files.length + 1)
    const filePath = uniquePath(candidate, usedPaths)
    usedPaths.add(filePath)
    files.push({
      path: filePath,
      content: `${match[2].replace(/\n$/, '')}\n`,
      language,
    })
  }

  return files
}

export function makeArchiveName(title) {
  const base = String(title || 'athena-project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
  return `${base || 'athena-project'}.zip`
}
