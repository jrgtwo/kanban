import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../db.ts'
import type { DB } from '../db.ts'
import { ApiFailure } from '../errors.ts'
import { createProject, getBoard } from './projects.ts'
import { createColumn } from './columns.ts'
import { createCard, deleteCard, moveCard, resolveCard, searchCards } from './cards.ts'

/**
 * Sub-boards used as **epics**: a card on the project board that is a bucket
 * holding every ticket for one feature, with its own columns and its own flow.
 *
 * This is the shape the board is being dogfooded in, so it is asserted directly
 * rather than inferred from the sub-board unit tests. The question each test
 * answers is "does the epic bucket actually hold up", not "does the API work".
 */

let db: DB
let projectId: string
let projectColumns: string[]

beforeEach(() => {
  db = openDb(':memory:')
  projectId = createProject(db, { name: 'Fretwork Composer' }).id
  projectColumns = getBoard(db, projectId).columns.map((c) => c.id)
})

/** An epic: a sub-board card, its four columns, and the tickets inside it. */
function makeEpic(key: string, title: string, tickets: [string, string, number][]) {
  const epic = createCard(db, {
    columnId: projectColumns[1]!, // epics sit in In Progress on the project board
    type: 'subboard',
    title,
    key,
    tags: ['epic'],
  })

  const columns = ['Backlog', 'In Progress', 'Review', 'Done'].map(
    (name) => createColumn(db, { projectId, parentCardId: epic.id, name }).id,
  )

  for (const [ticketKey, ticketTitle, columnIndex] of tickets) {
    createCard(db, {
      columnId: columns[columnIndex]!,
      type: 'task',
      key: ticketKey,
      title: ticketTitle,
    })
  }

  return { epic, columns }
}

describe('a sub-board as an epic', () => {
  it('holds its tickets on its own board, not the project board', () => {
    const { epic } = makeEpic('E-AGENT', 'agent', [
      ['AG-06', 'The command panel', 0],
      ['AG-07', 'Generation jobs', 0],
      ['AG-03', 'Embed the harness', 3],
    ])

    // The project board shows the EPIC and nothing inside it.
    const project = getBoard(db, projectId)
    expect(project.cards.map((c) => c.key)).toEqual(['E-AGENT'])

    // The epic's own board shows its three tickets.
    const inside = getBoard(db, projectId, epic.id)
    expect(inside.columns.map((c) => c.name)).toEqual([
      'Backlog',
      'In Progress',
      'Review',
      'Done',
    ])
    expect(inside.cards.map((c) => c.key).sort()).toEqual(['AG-03', 'AG-06', 'AG-07'])
  })

  it('keeps two epics from seeing each other', () => {
    const agent = makeEpic('E-AGENT', 'agent', [['AG-06', 'Command panel', 0]])
    const composition = makeEpic('E-COMP', 'composition page', [
      ['CP-01', 'Page routing', 0],
      ['CP-02', 'Composition service', 3],
    ])

    expect(getBoard(db, projectId, agent.epic.id).cards.map((c) => c.key)).toEqual([
      'AG-06',
    ])
    expect(
      getBoard(db, projectId, composition.epic.id)
        .cards.map((c) => c.key)
        .sort(),
    ).toEqual(['CP-01', 'CP-02'])

    // And the project board holds both epics and no tickets.
    expect(getBoard(db, projectId).cards.map((c) => c.key).sort()).toEqual([
      'E-AGENT',
      'E-COMP',
    ])
  })

  it('moves a ticket through the epic’s own columns by key', () => {
    const { epic, columns } = makeEpic('E-AGENT', 'agent', [
      ['AG-06', 'The command panel', 0],
      ['AG-07', 'Generation jobs', 0],
    ])

    moveCard(db, 'AG-06', columns[1]!, 0)

    const inside = getBoard(db, projectId, epic.id)
    const named = Object.fromEntries(inside.columns.map((c) => [c.id, c.name]))
    const placed = Object.fromEntries(inside.cards.map((c) => [c.key, named[c.columnId]]))

    expect(placed).toEqual({ 'AG-06': 'In Progress', 'AG-07': 'Backlog' })
    // …and the ticket left behind renumbered to close the gap.
    expect(inside.cards.find((c) => c.key === 'AG-07')!.order).toBe(0)
  })

  it('refuses to move a ticket out of its epic onto the project board', () => {
    makeEpic('E-AGENT', 'agent', [['AG-06', 'The command panel', 0]])

    let failure: ApiFailure | undefined
    try {
      moveCard(db, 'AG-06', projectColumns[0]!, 0)
    } catch (error) {
      failure = error as ApiFailure
    }

    // Worth knowing before planning around it: a ticket cannot be dragged out
    // of its epic. Re-parenting is not an operation the API has.
    expect(failure?.code).toBe('invalid_parent')
  })

  it('finds a ticket by key without knowing which epic holds it', () => {
    makeEpic('E-AGENT', 'agent', [['AG-06', 'The command panel', 0]])
    makeEpic('E-COMP', 'composition page', [['CP-01', 'Page routing', 0]])

    // This is the property that makes epics usable from an agent: nesting a
    // ticket inside an epic does not change how it is addressed.
    expect(resolveCard(db, 'AG-06').title).toBe('The command panel')
    expect(resolveCard(db, 'CP-01').title).toBe('Page routing')
  })

  it('searches across every epic in the project at once', () => {
    makeEpic('E-AGENT', 'agent', [['AG-06', 'The command panel', 0]])
    makeEpic('E-COMP', 'composition page', [['CP-04', 'Arrangement panel', 0]])

    expect(
      searchCards(db, 'panel', projectId)
        .map((c) => c.key)
        .sort(),
    ).toEqual(['AG-06', 'CP-04'])
  })

  it('takes every ticket with it when the epic is deleted', () => {
    const { epic } = makeEpic('E-AGENT', 'agent', [
      ['AG-06', 'The command panel', 0],
      ['AG-07', 'Generation jobs', 1],
    ])

    deleteCard(db, 'E-AGENT')

    expect(getBoard(db, projectId).cards).toEqual([])
    expect(getBoard(db, projectId, epic.id).columns).toEqual([])
    expect(searchCards(db, 'AG-0')).toEqual([])
  })

  it('counts every ticket in the project total, epics included', () => {
    makeEpic('E-AGENT', 'agent', [
      ['AG-06', 'a', 0],
      ['AG-07', 'b', 0],
    ])
    makeEpic('E-COMP', 'composition', [['CP-01', 'c', 0]])

    // 2 epics + 3 tickets. The index shows this, so it should not silently omit
    // work that lives inside an epic.
    const board = getBoard(db, projectId)
    expect(board.cards).toHaveLength(2)
    expect(searchCards(db, '', projectId)).toEqual([]) // empty query stays empty
    const all = db.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number }
    expect(all.n).toBe(5)
  })
})
