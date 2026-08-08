import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../db.ts'
import type { DB } from '../db.ts'
import { ApiFailure } from '../errors.ts'
import { createProject, getBoard } from './projects.ts'
import { createColumn } from './columns.ts'
import { createCard, reparentCard, resolveCard, searchCards } from './cards.ts'

let db: DB
let projectId: string
let projectColumns: string[]

beforeEach(() => {
  db = openDb(':memory:')
  projectId = createProject(db, { name: 'Composer' }).id
  projectColumns = getBoard(db, projectId).columns.map((c) => c.id)
})

/** An epic — a sub-board card with its own four columns. */
function epic(key: string, onProject = projectId, inColumn?: string) {
  const columns = inColumn
    ? [inColumn]
    : getBoard(db, onProject).columns.map((c) => c.id)
  const card = createCard(db, {
    columnId: inColumn ?? columns[0]!,
    type: 'subboard',
    title: key,
    key,
  })
  const own = ['Backlog', 'In Progress', 'Review', 'Done'].map(
    (name) =>
      createColumn(db, { projectId: onProject, parentCardId: card.id, name }).id,
  )
  return { card, columns: own }
}

const ticket = (columnId: string, key: string) =>
  createCard(db, { columnId, type: 'task', title: key, key })

const failureFrom = (run: () => unknown): ApiFailure => {
  try {
    run()
  } catch (error) {
    if (error instanceof ApiFailure) return error
    throw error
  }
  throw new Error('expected a refusal, got none')
}

describe('re-filing a ticket between epics', () => {
  it('moves a ticket out of one epic and into another', () => {
    const agent = epic('E-AGENT')
    const comp = epic('E-COMP')
    ticket(agent.columns[0]!, 'AG-06')

    reparentCard(db, 'AG-06', comp.columns[0]!)

    expect(getBoard(db, projectId, agent.card.id).cards).toEqual([])
    expect(getBoard(db, projectId, comp.card.id).cards.map((c) => c.key)).toEqual([
      'AG-06',
    ])
  })

  it('moves a ticket out of an epic onto the project board', () => {
    const agent = epic('E-AGENT')
    ticket(agent.columns[0]!, 'AG-06')

    reparentCard(db, 'AG-06', projectColumns[2]!)

    const project = getBoard(db, projectId)
    const named = Object.fromEntries(project.columns.map((c) => [c.id, c.name]))
    const moved = project.cards.find((c) => c.key === 'AG-06')!
    expect(named[moved.columnId]).toBe('Review')
    expect(moved.parentCardId).toBeUndefined()
  })

  it('moves a loose ticket into an epic', () => {
    const agent = epic('E-AGENT')
    ticket(projectColumns[0]!, 'AG-06')

    reparentCard(db, 'AG-06', agent.columns[1]!)

    expect(getBoard(db, projectId).cards.map((c) => c.key)).toEqual(['E-AGENT'])
    expect(getBoard(db, projectId, agent.card.id).cards.map((c) => c.key)).toEqual([
      'AG-06',
    ])
  })

  it('closes the gap in the column it left and inserts at the index asked for', () => {
    const agent = epic('E-AGENT')
    for (const k of ['AG-01', 'AG-02', 'AG-03']) ticket(agent.columns[0]!, k)
    for (const k of ['CP-01', 'CP-02']) ticket(projectColumns[0]!, k)

    reparentCard(db, 'AG-02', projectColumns[0]!, 1)

    const inside = getBoard(db, projectId, agent.card.id)
    expect(
      inside.cards.sort((a, b) => a.order - b.order).map((c) => [c.order, c.key]),
    ).toEqual([
      [0, 'AG-01'],
      [1, 'AG-03'],
    ])

    // The epic CARD itself lives in this column too, at index 0 — it was
    // created there before the loose tickets were added.
    const project = getBoard(db, projectId)
    expect(
      project.cards
        .filter((c) => c.columnId === projectColumns[0])
        .sort((a, b) => a.order - b.order)
        .map((c) => [c.order, c.key]),
    ).toEqual([
      [0, 'E-AGENT'],
      [1, 'AG-02'],
      [2, 'CP-01'],
      [3, 'CP-02'],
    ])
  })

  it('clamps an index past the end', () => {
    const agent = epic('E-AGENT')
    ticket(agent.columns[0]!, 'AG-06')
    const moved = reparentCard(db, 'AG-06', projectColumns[0]!, 999)
    // Column 0 already holds the E-AGENT epic card, so the end is index 1.
    expect(moved.order).toBe(1)
  })
})

describe('re-filing an epic, sub-tree and all', () => {
  it('takes its tickets with it', () => {
    const agent = epic('E-AGENT')
    ticket(agent.columns[0]!, 'AG-06')
    ticket(agent.columns[1]!, 'AG-07')

    // Move the whole epic to a different column on the project board.
    reparentCard(db, 'E-AGENT', projectColumns[3]!)

    const project = getBoard(db, projectId)
    const named = Object.fromEntries(project.columns.map((c) => [c.id, c.name]))
    expect(named[project.cards.find((c) => c.key === 'E-AGENT')!.columnId]).toBe('Done')

    // Its tickets are still inside it and still addressable.
    expect(
      getBoard(db, projectId, agent.card.id)
        .cards.map((c) => c.key)
        .sort(),
    ).toEqual(['AG-06', 'AG-07'])
  })

  it('carries a whole sub-tree into ANOTHER PROJECT, reassigning project ids', () => {
    const agent = epic('E-AGENT')
    ticket(agent.columns[0]!, 'AG-06')

    const other = createProject(db, { name: 'Other' })
    const otherColumn = getBoard(db, other.id).columns[0]!.id

    reparentCard(db, 'E-AGENT', otherColumn)

    // Gone from the old project entirely — cards AND the epic's own columns.
    expect(getBoard(db, projectId).cards).toEqual([])
    expect(searchCards(db, 'AG-06', projectId)).toEqual([])

    // Present in the new one, nesting intact.
    expect(getBoard(db, other.id).cards.map((c) => c.key)).toEqual(['E-AGENT'])
    const inside = getBoard(db, other.id, agent.card.id)
    expect(inside.columns.map((c) => c.name)).toEqual([
      'Backlog',
      'In Progress',
      'Review',
      'Done',
    ])
    expect(inside.cards.map((c) => c.key)).toEqual(['AG-06'])

    // Assert the project ids directly. `getBoard(_, parentCardId)` looks up by
    // parent alone, so it would return these columns even if their `project_id`
    // still pointed at the old project — which would leave them stranded the
    // moment the old project was deleted and its cascade fired.
    expect(inside.columns.every((c) => c.projectId === other.id)).toBe(true)
    expect(inside.cards.every((c) => c.projectId === other.id)).toBe(true)
    expect(resolveCard(db, 'AG-06').projectId).toBe(other.id)
    expect(resolveCard(db, 'E-AGENT').projectId).toBe(other.id)
  })

  it('refuses to file an epic inside itself', () => {
    const agent = epic('E-AGENT')
    const failure = failureFrom(() => reparentCard(db, 'E-AGENT', agent.columns[0]!))
    expect(failure.code).toBe('invalid_parent')
    expect(failure.message).toContain('unreachable')
  })

  it('refuses to file an epic inside its own descendant', () => {
    const outer = epic('E-OUTER')
    // A nested epic, two levels down.
    const innerCard = createCard(db, {
      columnId: outer.columns[0]!,
      type: 'subboard',
      title: 'inner',
      key: 'E-INNER',
    })
    const innerColumn = createColumn(db, {
      projectId,
      parentCardId: innerCard.id,
      name: 'Backlog',
    })

    const failure = failureFrom(() => reparentCard(db, 'E-OUTER', innerColumn.id))
    expect(failure.code).toBe('invalid_parent')
  })

  it('refuses a cross-project move that would collide on a key', () => {
    const agent = epic('E-AGENT')
    ticket(agent.columns[0]!, 'AG-06')

    const other = createProject(db, { name: 'Other' })
    const otherColumns = getBoard(db, other.id).columns
    // The other project already has an AG-06 — nested inside the sub-tree, so
    // a check that only looked at the card being moved would miss it.
    createCard(db, {
      columnId: otherColumns[0]!.id,
      type: 'task',
      title: 'theirs',
      key: 'AG-06',
    })

    const failure = failureFrom(() =>
      reparentCard(db, 'E-AGENT', otherColumns[1]!.id),
    )
    expect(failure.code).toBe('duplicate_key')
    expect(failure.message).toContain('AG-06')

    // And nothing moved.
    expect(getBoard(db, projectId).cards.map((c) => c.key)).toEqual(['E-AGENT'])
  })
})

describe('re-parenting onto the same board', () => {
  it('behaves as an ordinary move', () => {
    ticket(projectColumns[0]!, 'AG-06')
    ticket(projectColumns[0]!, 'AG-07')

    const moved = reparentCard(db, 'AG-07', projectColumns[0]!, 0)

    expect(moved.order).toBe(0)
    expect(
      getBoard(db, projectId)
        .cards.sort((a, b) => a.order - b.order)
        .map((c) => c.key),
    ).toEqual(['AG-07', 'AG-06'])
  })
})
