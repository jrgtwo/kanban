import { nanoid } from 'nanoid'
import type { DB } from '../db.ts'
import { invalidMove, notFound } from '../errors.ts'
import type { Column } from '../../shared/types.ts'
import { toColumn } from './rows.ts'
import type { ColumnRow } from './rows.ts'
import { renumberColumns } from './order.ts'

const id = () => nanoid(10)

export function getColumn(db: DB, columnId: string): Column {
  const row = db
    .prepare('SELECT * FROM columns WHERE id = ?')
    .get(columnId) as ColumnRow | undefined
  if (!row) notFound(`Column "${columnId}"`)
  return toColumn(row as ColumnRow)
}

export interface CreateColumnInput {
  projectId: string
  parentCardId?: string
  name: string
}

export function createColumn(db: DB, input: CreateColumnInput): Column {
  const cid = id()
  const now = Date.now()

  db.transaction(() => {
    const row = (
      input.parentCardId === undefined
        ? db
            .prepare(
              'SELECT COUNT(*) AS n FROM columns WHERE project_id = ? AND parent_card_id IS NULL',
            )
            .get(input.projectId)
        : db
            .prepare('SELECT COUNT(*) AS n FROM columns WHERE parent_card_id = ?')
            .get(input.parentCardId)
    ) as { n: number }

    db.prepare(
      `INSERT INTO columns (id, project_id, parent_card_id, name, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(cid, input.projectId, input.parentCardId ?? null, input.name.trim(), row.n, now, now)
  })()

  return getColumn(db, cid)
}

export function renameColumn(db: DB, columnId: string, name: string): Column {
  getColumn(db, columnId)
  db.prepare('UPDATE columns SET name = ?, updated_at = ? WHERE id = ?').run(
    name.trim(),
    Date.now(),
    columnId,
  )
  return getColumn(db, columnId)
}

export function deleteColumn(db: DB, columnId: string): void {
  const column = getColumn(db, columnId)
  db.transaction(() => {
    // Cards go with it by cascade. Sub-boards hanging off those cards do not —
    // that is `deleteCard`'s recursive job, so route through it rather than
    // letting the cascade orphan a sub-board's columns.
    const childIds = db
      .prepare("SELECT id FROM cards WHERE column_id = ? AND type = 'subboard'")
      .all(columnId)
      .map((r) => (r as { id: string }).id)
    for (const cardId of childIds) cascadeSubBoard(db, cardId)

    db.prepare('DELETE FROM columns WHERE id = ?').run(columnId)
    renumberColumns(db, column.projectId, column.parentCardId)
  })()
}

/**
 * Recursively remove a sub-board card's columns and cards.
 *
 * Lives here rather than in `cards.ts` because `deleteColumn` needs it too and
 * the two would otherwise import each other. Ported from `cascadeDeleteSubBoard`
 * in the Dexie version, which had the recursion right.
 */
export function cascadeSubBoard(db: DB, parentCardId: string): void {
  const children = db
    .prepare('SELECT id, type FROM cards WHERE parent_card_id = ?')
    .all(parentCardId) as { id: string; type: string }[]

  for (const child of children) {
    if (child.type === 'subboard') cascadeSubBoard(db, child.id)
  }

  db.prepare('DELETE FROM cards WHERE parent_card_id = ?').run(parentCardId)
  db.prepare('DELETE FROM columns WHERE parent_card_id = ?').run(parentCardId)
}

/**
 * Reorder one board's columns.
 *
 * Refuses a partial list. Accepting one would renumber the named columns and
 * leave the rest holding stale positions — a silently corrupted board that
 * looks fine until the next render sorts by a duplicated position.
 */
export function reorderColumns(db: DB, orderedIds: string[]): Column[] {
  if (orderedIds.length === 0) {
    invalidMove('reorderColumns needs at least one column id.')
  }

  const first = getColumn(db, orderedIds[0]!)

  return db.transaction(() => {
    const siblings = (
      first.parentCardId === undefined
        ? db
            .prepare(
              'SELECT id FROM columns WHERE project_id = ? AND parent_card_id IS NULL',
            )
            .all(first.projectId)
        : db
            .prepare('SELECT id FROM columns WHERE parent_card_id = ?')
            .all(first.parentCardId)
    ).map((r) => (r as { id: string }).id)

    const given = new Set(orderedIds)
    if (given.size !== orderedIds.length) {
      invalidMove('reorderColumns was given the same column id twice.')
    }
    if (
      siblings.length !== orderedIds.length ||
      siblings.some((sid) => !given.has(sid))
    ) {
      invalidMove(
        `reorderColumns needs every column on the board, in order. Got ${orderedIds.length} of ${siblings.length}.`,
      )
    }

    const now = Date.now()
    const set = db.prepare(
      'UPDATE columns SET position = ?, updated_at = ? WHERE id = ?',
    )
    orderedIds.forEach((cid, i) => set.run(i, now, cid))

    return orderedIds.map((cid) => getColumn(db, cid))
  })()
}
