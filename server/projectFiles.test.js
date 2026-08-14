import test from 'node:test'
import assert from 'node:assert/strict'
import { extractProjectFiles, makeArchiveName, sanitizeArchivePath } from '../src/projectFiles.js'

test('extractProjectFiles uses nearby Markdown headings as paths', () => {
  const files = extractProjectFiles(`### src/App.jsx

\`\`\`jsx
export default function App() {}
\`\`\`

### \`package.json\`

\`\`\`json
{"private": true}
\`\`\``)

  assert.deepEqual(files.map((file) => file.path), ['src/App.jsx', 'package.json'])
  assert.match(files[0].content, /export default/)
})

test('extractProjectFiles creates safe unique snippet names when headings are absent', () => {
  const files = extractProjectFiles('```python\nprint(1)\n```\n\n```python\nprint(2)\n```')
  assert.deepEqual(files.map((file) => file.path), ['snippet-1.py', 'snippet-2.py'])
})

test('generic prose headings are not mistaken for filenames', () => {
  const files = extractProjectFiles('### Python example\n\n```python\nprint(1)\n```')
  assert.equal(files[0].path, 'snippet-1.py')
})

test('archive paths cannot escape the ZIP root', () => {
  assert.equal(sanitizeArchivePath('../../src/../App.jsx'), 'src/App.jsx')
  assert.equal(makeArchiveName('My Great App!'), 'my-great-app.zip')
})
