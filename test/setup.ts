import { config } from 'dotenv'

// Load env for tests. `.env.test` (if present) overrides `.env.local`.
config({ path: '.env.local' })
config({ path: '.env.test', override: true })
