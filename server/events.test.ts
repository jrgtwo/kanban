import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDb } from './db.ts'
import { createApi } from './api.ts'
import { broadcastChange, currentRevision, subscribe, subscriberCount } from './events.ts'
import type { Board, Card, Project } from '../shared/types.ts'

describe('the change channel', () => {
  it('bumps the revision and tells every subscriber', () => {
    const a: string[] = []
    const b: string[] = []
    const dropA = subscribe({ send: (d) => a.push(d), close: () => {} })
    const dropB = subscribe({ send: (d) => b.push(d), close: () => {} })

    const before = currentRevision()
    broadcastChange()
    broadcastChange()

    expect(currentRevision()).toBe(before + 2)
    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
    expect(JSON.parse(a[1]!).rev).toBe(before + 2)

    dropA()
    dropB()
  })

  it('drops a subscriber whose socket has already gone, without losing the rest', () => {
    const alive: string[] = []
    const dropDead = subscribe({
      send: () => {
        throw new Error('socket closed')
      },
      close: () => {},
    })
    const dropAlive = subscribe({ send: (d) => alive.push(d), close: () => {} })

    expect(() => broadcastChange()).not.toThrow()
    expect(alive).toHaveLength(1)
    // The dead one is gone; the next broadcast does not try it again.
    broadcastChange()
    expect(alive).toHaveLength(2)

    dropDead()
    dropAlive()
  })

  it('unsubscribing actually removes it', () => {
    const before = subscriberCount()
    const drop = subscribe({ send: () => {}, close: () => {} })
    expect(subscriberCount()).toBe(before + 1)
    drop()
    expect(subscriberCount()).toBe(before)
  })
})

describe('the API announces its own writes', () => {
  let app: ReturnType<typeof createApi>
  let seen: number
  let unsubscribe: () => void

  beforeEach(() => {
    app = createApi(openDb(':memory:'))
    seen = 0
    unsubscribe = subscribe({ send: () => (seen += 1), close: () => {} })
  })

  // The subscriber set is module-level, so a test that leaks its subscriber
  // keeps counting into the NEXT test's `seen` — which is exactly what a leaked
  // SSE connection would do in production.
  afterEach(() => unsubscribe())

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('does NOT announce a read', async () => {
    await app.request('/api/projects')
    expect(seen).toBe(0)
  })

  it('announces a create, an update and a delete', async () => {
    const project = (await (await post('/api/projects', { name: 'X' })).json()) as Project
    expect(seen).toBe(1)

    const board = (await (await app.request(`/api/projects/${project.id}/board`)).json()) as Board
    expect(seen).toBe(1) // still just the create

    const card = (await (
      await post('/api/cards', {
        columnId: board.columns[0].id,
        type: 'task',
        title: 'a',
        key: 'A-1',
      })
    ).json()) as Card
    expect(seen).toBe(2)

    await app.request('/api/cards/A-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'b' }),
    })
    expect(seen).toBe(3)

    await post(`/api/cards/${card.id}/move`, {
      toColumnId: board.columns[1].id,
      toIndex: 0,
    })
    expect(seen).toBe(4)

    await app.request('/api/cards/A-1', { method: 'DELETE' })
    expect(seen).toBe(5)
  })

  it('announces nothing when a write is REFUSED', async () => {
    const project = (await (await post('/api/projects', { name: 'X' })).json()) as Project
    const board = (await (await app.request(`/api/projects/${project.id}/board`)).json()) as Board
    await post('/api/cards', {
      columnId: board.columns[0].id,
      type: 'task',
      title: 'a',
      key: 'A-1',
    })
    const settled = seen

    // A duplicate key is refused, so nothing changed and nobody should be told
    // to refetch — a notification here would be a lie every client acts on.
    const response = await post('/api/cards', {
      columnId: board.columns[0].id,
      type: 'task',
      title: 'b',
      key: 'A-1',
    })

    expect(response.status).toBe(409)
    expect(seen).toBe(settled)
  })
})
