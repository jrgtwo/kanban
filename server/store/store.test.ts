import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../db.ts'
import type { DB } from '../db.ts'
import { ApiFailure } from '../errors.ts'
import { createProject, getBoard } from './projects.ts'
import { createColumn, deleteColumn, reorderColumns } from './columns.ts'
import { createCard, deleteCard, moveCard, resolveCard, searchCards, updateCard } from './cards.ts'

let db: DB
let projectId: string
let columns: string[]

beforeEach(() => {
  // A fresh in-memory database per test. Migrations run on open, so this also
  // exercises the migration runner on every single test.
  db = openDb(':memory:')
  const project = createProject(db, { name: 'Composer' })
  projectId = project.id
  columns = getBoard(db, projectId).columns.map((c) => c.id)
})

/** Every column's cards as `[order, key]`, which is what the invariant is about. */
const layout = (parentCardId?: string) => {
  const board = getBoard(db, projectId, parentCardId)
  const out: Record<string, [number, string | undefined][]> = {}
  for (const col of board.columns) {
    out[col.name] = board.cards
      .filter((c) => c.columnId === col.id)
      .sort((a, b) => a.order - b.order)
      .map((c) => [c.order, c.key] as [number, string | undefined])
  }
  return out
}

const add = (columnId: string, key: string) =>
  createCard(db, { columnId, type: 'task', title: `${key} thing`, key })

const failureFrom = (run: () => unknown): ApiFailure => {
  try {
    run()
  } catch (error) {
    if (error instanceof ApiFailure) return error
    throw error
  }
  throw new Error('expected a refusal, got none')
}

describe('a new project', () => {
  it('opens with four columns numbered 0..3', () => {
    const board = getBoard(db, projectId)
    expect(board.columns.map((c) => [c.order, c.name])).toEqual([
      [0, 'Backlog'],
      [1, 'In Progress'],
      [2, 'Review'],
      [3, 'Done'],
    ])
  })
})

describe('the dense-order invariant', () => {
  it('appends new cards at the end', () => {
    for (const key of ['A-1', 'A-2', 'A-3']) add(columns[0]!, key)
    expect(layout()['Backlog']).toEqual([
      [0, 'A-1'],
      [1, 'A-2'],
      [2, 'A-3'],
    ])
  })

  it('closes the gap when a card is deleted from the middle', () => {
    for (const key of ['A-1', 'A-2', 'A-3']) add(columns[0]!, key)
    deleteCard(db, 'A-2')
    expect(layout()['Backlog']).toEqual([
      [0, 'A-1'],
      [1, 'A-3'],
    ])
  })

  it('renumbers BOTH columns when a card moves across', () => {
    for (const key of ['A-1', 'A-2', 'A-3']) add(columns[0]!, key)
    for (const key of ['B-1', 'B-2']) add(columns[1]!, key)

    moveCard(db, 'A-2', columns[1]!, 1)

    expect(layout()['Backlog']).toEqual([
      [0, 'A-1'],
      [1, 'A-3'],
    ])
    expect(layout()['In Progress']).toEqual([
      [0, 'B-1'],
      [1, 'A-2'],
      [2, 'B-2'],
    ])
  })

  it('reorders within a column without touching the others', () => {
    for (const key of ['A-1', 'A-2', 'A-3']) add(columns[0]!, key)
    add(columns[1]!, 'B-1')

    moveCard(db, 'A-3', columns[0]!, 0)

    expect(layout()['Backlog']).toEqual([
      [0, 'A-3'],
      [1, 'A-1'],
      [2, 'A-2'],
    ])
    expect(layout()['In Progress']).toEqual([[0, 'B-1']])
  })

  it('clamps an index past the end rather than refusing it', () => {
    for (const key of ['A-1', 'A-2']) add(columns[0]!, key)
    const moved = moveCard(db, 'A-1', columns[1]!, 999)
    expect(moved.order).toBe(0)
    expect(layout()['Backlog']).toEqual([[0, 'A-2']])
  })

  it('refuses a negative index, because that is a bug not an approximation', () => {
    add(columns[0]!, 'A-1')
    const failure = failureFrom(() => moveCard(db, 'A-1', columns[0]!, -1))
    expect(failure.code).toBe('invalid_move')
  })

  it('survives moving a card onto its own current position', () => {
    for (const key of ['A-1', 'A-2', 'A-3']) add(columns[0]!, key)
    moveCard(db, 'A-2', columns[0]!, 1)
    expect(layout()['Backlog']).toEqual([
      [0, 'A-1'],
      [1, 'A-2'],
      [2, 'A-3'],
    ])
  })
})

describe('addressing a card by key', () => {
  it('resolves a key the same as an id', () => {
    const created = add(columns[0]!, 'AG-06')
    expect(resolveCard(db, 'AG-06').id).toBe(created.id)
    expect(resolveCard(db, created.id).key).toBe('AG-06')
  })

  it('refuses a key already used in the same project', () => {
    add(columns[0]!, 'AG-06')
    const failure = failureFrom(() => add(columns[1]!, 'AG-06'))
    expect(failure.code).toBe('duplicate_key')
    expect(failure.message).toContain('AG-06')
  })

  it('allows the same key in a DIFFERENT project', () => {
    add(columns[0]!, 'AG-06')
    const other = createProject(db, { name: 'Other' })
    const otherColumn = getBoard(db, other.id).columns[0]!.id
    expect(() =>
      createCard(db, { columnId: otherColumn, type: 'task', title: 'x', key: 'AG-06' }),
    ).not.toThrow()
  })

  it('refuses an ambiguous key rather than guessing which project', () => {
    add(columns[0]!, 'AG-06')
    const other = createProject(db, { name: 'Other' })
    const otherColumn = getBoard(db, other.id).columns[0]!.id
    createCard(db, { columnId: otherColumn, type: 'task', title: 'x', key: 'AG-06' })

    const failure = failureFrom(() => resolveCard(db, 'AG-06'))
    expect(failure.code).toBe('invalid_move')
    expect(failure.message).toContain('more than one project')

    // …and scoping it resolves cleanly.
    expect(resolveCard(db, 'AG-06', projectId).projectId).toBe(projectId)
  })

  it('lets a card keep its own key when updated', () => {
    add(columns[0]!, 'AG-06')
    expect(() => updateCard(db, 'AG-06', { key: 'AG-06', title: 'renamed' })).not.toThrow()
    expect(resolveCard(db, 'AG-06').title).toBe('renamed')
  })
})

describe('sub-boards', () => {
  const buildSubBoard = () => {
    const parent = createCard(db, {
      columnId: columns[0]!,
      type: 'subboard',
      title: 'agent',
      key: 'F-AGENT',
    })
    const inner = createColumn(db, { projectId, parentCardId: parent.id, name: 'Todo' })
    createCard(db, { columnId: inner.id, type: 'task', title: 'nested', key: 'N-1' })
    return { parent, inner }
  }

  it('keeps its columns and cards on their own board', () => {
    const { parent } = buildSubBoard()
    expect(layout()['Backlog']).toEqual([[0, 'F-AGENT']])
    expect(layout(parent.id)['Todo']).toEqual([[0, 'N-1']])
  })

  it('takes its children with it when deleted', () => {
    const { parent } = buildSubBoard()
    deleteCard(db, 'F-AGENT')
    expect(getBoard(db, projectId, parent.id).columns).toEqual([])
    expect(failureFrom(() => resolveCard(db, 'N-1')).code).toBe('not_found')
  })

  it('cascades through a sub-board nested in a sub-board', () => {
    const { parent, inner } = buildSubBoard()
    const deeper = createCard(db, {
      columnId: inner.id,
      type: 'subboard',
      title: 'deeper',
      key: 'F-DEEP',
    })
    const deepColumn = createColumn(db, { projectId, parentCardId: deeper.id, name: 'Deep' })
    createCard(db, { columnId: deepColumn.id, type: 'task', title: 'deepest', key: 'N-2' })

    deleteCard(db, 'F-AGENT')

    expect(getBoard(db, projectId, parent.id).columns).toEqual([])
    expect(failureFrom(() => resolveCard(db, 'N-2')).code).toBe('not_found')
  })

  it('cascades when the column HOLDING a sub-board card is deleted', () => {
    const { parent } = buildSubBoard()
    deleteColumn(db, columns[0]!)
    expect(getBoard(db, projectId, parent.id).columns).toEqual([])
    expect(failureFrom(() => resolveCard(db, 'N-1')).code).toBe('not_found')
  })

  it('refuses to move a card between a project and one of its sub-boards', () => {
    const { inner } = buildSubBoard()
    add(columns[1]!, 'A-1')
    const failure = failureFrom(() => moveCard(db, 'A-1', inner.id, 0))
    expect(failure.code).toBe('invalid_parent')
  })

  it('refuses to move a card into another project', () => {
    add(columns[0]!, 'A-1')
    const other = createProject(db, { name: 'Other' })
    const otherColumn = getBoard(db, other.id).columns[0]!.id
    const failure = failureFrom(() => moveCard(db, 'A-1', otherColumn, 0))
    expect(failure.code).toBe('invalid_parent')
  })
})

describe('column ordering', () => {
  it('renumbers the remaining columns when one is deleted', () => {
    deleteColumn(db, columns[1]!)
    expect(getBoard(db, projectId).columns.map((c) => [c.order, c.name])).toEqual([
      [0, 'Backlog'],
      [1, 'Review'],
      [2, 'Done'],
    ])
  })

  it('reorders a full list', () => {
    const reversed = [...columns].reverse()
    reorderColumns(db, reversed)
    expect(getBoard(db, projectId).columns.map((c) => c.name)).toEqual([
      'Done',
      'Review',
      'In Progress',
      'Backlog',
    ])
  })

  it('refuses a partial list, which would leave stale positions behind', () => {
    const failure = failureFrom(() => reorderColumns(db, [columns[0]!, columns[1]!]))
    expect(failure.code).toBe('invalid_move')
    expect(failure.message).toContain('2 of 4')
  })

  it('refuses a list containing the same column twice', () => {
    const failure = failureFrom(() =>
      reorderColumns(db, [columns[0]!, columns[0]!, columns[1]!, columns[2]!]),
    )
    expect(failure.code).toBe('invalid_move')
  })

  it('keeps a sub-board column out of the parent board reorder', () => {
    const parent = createCard(db, {
      columnId: columns[0]!,
      type: 'subboard',
      title: 'agent',
      key: 'F-AGENT',
    })
    createColumn(db, { projectId, parentCardId: parent.id, name: 'Todo' })

    // The parent board still has exactly its four columns — the sub-board's is
    // a different list, and mixing them is what `IS NULL` vs `= ?` prevents.
    expect(() => reorderColumns(db, [...columns].reverse())).not.toThrow()
  })
})

describe('search', () => {
  it('finds by title, key and tag', () => {
    createCard(db, {
      columnId: columns[0]!,
      type: 'task',
      title: 'Command panel',
      key: 'AG-06',
      tags: ['slice-3'],
      notes: 'registers the 37 tools',
    })

    expect(searchCards(db, 'command').map((c) => c.key)).toEqual(['AG-06'])
    expect(searchCards(db, 'AG-0').map((c) => c.key)).toEqual(['AG-06'])
    expect(searchCards(db, 'slice-3').map((c) => c.key)).toEqual(['AG-06'])
    expect(searchCards(db, '37 tools').map((c) => c.key)).toEqual(['AG-06'])
  })

  it('returns nothing for an empty query rather than everything', () => {
    add(columns[0]!, 'A-1')
    expect(searchCards(db, '   ')).toEqual([])
  })

  it('can be scoped to one project', () => {
    add(columns[0]!, 'A-1')
    const other = createProject(db, { name: 'Other' })
    const otherColumn = getBoard(db, other.id).columns[0]!.id
    createCard(db, { columnId: otherColumn, type: 'task', title: 'A-1 thing', key: 'A-1' })

    expect(searchCards(db, 'A-1')).toHaveLength(2)
    expect(searchCards(db, 'A-1', projectId)).toHaveLength(1)
  })
})

describe('array fields', () => {
  it('round-trips tags, dependsOn and checklist items', () => {
    const card = createCard(db, {
      columnId: columns[0]!,
      type: 'checklist',
      title: 'thing',
      tags: ['slice-3', 'blocked-on-user'],
      dependsOn: ['AG-05'],
      checklistItems: [{ id: 'x', text: 'do it', done: false }],
    })

    const read = resolveCard(db, card.id)
    expect(read.tags).toEqual(['slice-3', 'blocked-on-user'])
    expect(read.dependsOn).toEqual(['AG-05'])
    expect(read.checklistItems).toEqual([{ id: 'x', text: 'do it', done: false }])
  })

  it('defaults them to empty arrays, never undefined', () => {
    const card = add(columns[0]!, 'A-1')
    expect(card.tags).toEqual([])
    expect(card.dependsOn).toEqual([])
    expect(card.checklistItems).toEqual([])
  })
})
