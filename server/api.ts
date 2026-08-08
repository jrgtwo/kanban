import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import type { DB } from './db.ts'
import { streamSSE } from 'hono/streaming'
import { ApiFailure } from './errors.ts'
import { broadcastChange, currentRevision, subscribe } from './events.ts'
import { ERROR_STATUS } from '../shared/types.ts'
import type { ErrorCode } from '../shared/types.ts'
import {
  createProject,
  deleteProject,
  getBoard,
  getProject,
  listProjects,
  updateProject,
} from './store/projects.ts'
import {
  createColumn,
  deleteColumn,
  renameColumn,
  reorderColumns,
} from './store/columns.ts'
import {
  createCard,
  deleteCard,
  moveCard,
  reparentCard,
  resolveCard,
  searchCards,
  updateCard,
} from './store/cards.ts'

const accent = z.enum(['vermillion', 'ochre', 'moss', 'ink'])
const cardType = z.enum(['task', 'subboard', 'note', 'checklist', 'milestone'])
const checklistItem = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
})

/**
 * The HTTP surface. Takes its database as an argument so a test can hand it a
 * temp file and so `index.ts` stays a five-line entry point.
 *
 * Two rules hold everywhere in this file:
 *
 *   - **Every body is validated at the edge.** A handler never sees a shape it
 *     did not ask for, so the stores can take their inputs at face value.
 *   - **Refusals are returned, never thrown past here.** `ApiFailure` becomes
 *     `{ error: { code, message } }` with a real status; anything else is a bug
 *     and becomes a 500. An agent has to be able to read *why* — the same rule
 *     the fretwork composer's seams follow with `Result<T>`.
 */
export function createApi(db: DB) {
  const app = new Hono()

  /**
   * Run a handler, turning a validation failure or an `ApiFailure` into JSON.
   *
   * **Do the `.parse()` inside the callback**, not before it — a `ZodError`
   * thrown outside this try never becomes a 400 and surfaces as a 500 instead,
   * which is the one thing this whole file exists to prevent.
   */
  const guard = (c: Context, run: () => unknown) => {
    try {
      const result = run() as object
      // Anything that is not a GET changed something. Announcing it here rather
      // than in each handler means a new mutating route cannot forget to, which
      // is the failure mode where one operation silently stops updating open
      // tabs and nobody notices for a week.
      if (c.req.method !== 'GET') broadcastChange()
      return c.json(result)
    } catch (error) {
      if (error instanceof ApiFailure) {
        return c.json(
          { error: { code: error.code, message: error.message } },
          ERROR_STATUS[error.code] as 400,
        )
      }
      if (error instanceof z.ZodError) {
        const code: ErrorCode = 'invalid_body'
        return c.json(
          {
            error: {
              code,
              message: error.issues
                .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
                .join('; '),
            },
          },
          ERROR_STATUS[code] as 400,
        )
      }
      throw error
    }
  }

  // ──────────────────────────────────────────────────── projects ───

  app.get('/api/projects', (c) => guard(c, () => listProjects(db)))

  app.post('/api/projects', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () =>
      createProject(
        db,
        z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            sigil: z.string().optional(),
            accent: accent.optional(),
          })
          .parse(body),
      ),
    )
  })

  app.get('/api/projects/:id', (c) =>
    guard(c, () => getProject(db, c.req.param('id'))),
  )

  app.patch('/api/projects/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () =>
      updateProject(
        db,
        c.req.param('id'),
        z
          .object({
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            sigil: z.string().optional(),
            accent: accent.optional(),
          })
          .parse(body),
      ),
    )
  })

  app.delete('/api/projects/:id', (c) =>
    guard(c, () => {
      deleteProject(db, c.req.param('id'))
      return { ok: true }
    }),
  )

  /**
   * The board — columns and cards together, for the project's top level or for
   * one sub-board via `?parentCardId=`. This is the UI's only read.
   */
  app.get('/api/projects/:id/board', (c) =>
    guard(c, () =>
      getBoard(db, c.req.param('id'), c.req.query('parentCardId') || undefined),
    ),
  )

  // ───────────────────────────────────────────────────── columns ───

  app.post('/api/columns', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () =>
      createColumn(
        db,
        z
          .object({
            projectId: z.string().min(1),
            parentCardId: z.string().optional(),
            name: z.string().min(1),
          })
          .parse(body),
      ),
    )
  })

  app.patch('/api/columns/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () => {
      const { name } = z.object({ name: z.string().min(1) }).parse(body)
      return renameColumn(db, c.req.param('id'), name)
    })
  })

  app.delete('/api/columns/:id', (c) =>
    guard(c, () => {
      deleteColumn(db, c.req.param('id'))
      return { ok: true }
    }),
  )

  app.post('/api/columns/reorder', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () => {
      const { orderedIds } = z
        .object({ orderedIds: z.array(z.string().min(1)).min(1) })
        .parse(body)
      return reorderColumns(db, orderedIds)
    })
  })

  // ─────────────────────────────────────────────────────── cards ───

  app.post('/api/cards', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () =>
      createCard(
        db,
        z
          .object({
            columnId: z.string().min(1),
            type: cardType,
            title: z.string().min(1),
            key: z.string().min(1).optional(),
            notes: z.string().optional(),
            tags: z.array(z.string()).optional(),
            dependsOn: z.array(z.string()).optional(),
            checklistItems: z.array(checklistItem).optional(),
            dueAt: z.number().int().optional(),
          })
          .parse(body),
      ),
    )
  })

  /** `:id` is a card id **or** a key — see `resolveCard`. */
  app.get('/api/cards/:id', (c) =>
    guard(c, () =>
      resolveCard(db, c.req.param('id'), c.req.query('projectId') || undefined),
    ),
  )

  app.patch('/api/cards/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () =>
      updateCard(
        db,
        c.req.param('id'),
        z
          .object({
            title: z.string().min(1).optional(),
            notes: z.string().optional(),
            key: z.string().optional(),
            tags: z.array(z.string()).optional(),
            dependsOn: z.array(z.string()).optional(),
            checklistItems: z.array(checklistItem).optional(),
            dueAt: z.number().int().nullable().optional(),
          })
          .parse(body) as Parameters<typeof updateCard>[2],
        c.req.query('projectId') || undefined,
      ),
    )
  })

  app.delete('/api/cards/:id', (c) =>
    guard(c, () => {
      deleteCard(db, c.req.param('id'), c.req.query('projectId') || undefined)
      return { ok: true }
    }),
  )

  /**
   * Re-file a card onto a DIFFERENT board — out of an epic, into one, or
   * between two. Its sub-tree goes with it. Separate from `/move` on purpose;
   * see `reparentCard`.
   */
  app.post('/api/cards/:id/reparent', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () => {
      const { toColumnId, toIndex } = z
        .object({
          toColumnId: z.string().min(1),
          toIndex: z.number().int().optional(),
        })
        .parse(body)
      return reparentCard(
        db,
        c.req.param('id'),
        toColumnId,
        toIndex ?? 0,
        c.req.query('projectId') || undefined,
      )
    })
  })

  app.post('/api/cards/:id/move', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return guard(c, () => {
      const { toColumnId, toIndex } = z
        .object({ toColumnId: z.string().min(1), toIndex: z.number().int() })
        .parse(body)
      return moveCard(
        db,
        c.req.param('id'),
        toColumnId,
        toIndex,
        c.req.query('projectId') || undefined,
      )
    })
  })

  // ────────────────────────────────────────────────────── events ───

  /**
   * The change stream. Emits `{ rev }` whenever anything is written, by any
   * client — a browser tab, another tab, or an agent over HTTP.
   *
   * The heartbeat is not decoration: an idle SSE connection is closed by
   * proxies and by some browsers, and a silently dead stream looks exactly like
   * a quiet board. `EventSource` reconnects on its own once the socket actually
   * drops, so the comment line is what turns a silent failure into a visible
   * one.
   */
  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      let open = true

      const unsubscribe = subscribe({
        send: (data) => void stream.writeSSE({ event: 'change', data }),
        close: () => {
          open = false
        },
      })

      stream.onAbort(() => {
        open = false
        unsubscribe()
      })

      // Tell a fresh client where the world is, so it can tell "I have missed
      // nothing" from "I have missed everything" after a reconnect.
      await stream.writeSSE({
        event: 'hello',
        data: JSON.stringify({ rev: currentRevision() }),
      })

      while (open) {
        await stream.sleep(25_000)
        if (!open) break
        await stream.writeSSE({ event: 'ping', data: '' })
      }

      unsubscribe()
    }),
  )

  // ────────────────────────────────────────────────────── search ───

  app.get('/api/search', (c) =>
    guard(c, () =>
      searchCards(
        db,
        c.req.query('q') ?? '',
        c.req.query('projectId') || undefined,
      ),
    ),
  )

  return app
}
