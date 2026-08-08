import { serve } from '@hono/node-server'
import { createApi } from './api.ts'
import { openDb, DB_PATH } from './db.ts'

/**
 * Fixed, and it must stay in step with `vite.config.ts`'s proxy target — the
 * browser reaches the API only through that proxy. `API_PORT` overrides both.
 */
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 7474)

const db = openDb()
const app = createApi(db)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`kanban api  →  http://localhost:${info.port}/api`)
  console.log(`database    →  ${DB_PATH}`)
})
