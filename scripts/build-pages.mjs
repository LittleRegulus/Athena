import { build } from 'vite'

process.env.ATHENA_GITHUB_PAGES = 'true'
await build()
