import type { DB } from '../db.ts'

/**
 * The dense-`position` invariant, in one place.
 *
 * **Every column and every card in a list holds a position of exactly `0..n-1`,
 * with no gaps and no ties.** After any insert, delete or move, the affected
 * list is renumbered. Nothing anywhere may assume a gap is safe, and nothing may
 * sort by `created_at` for display.
 *
 * This was already true in the Dexie version — `moveCard`, `deleteCard` and
 * `reorderColumns` each enforced it — but three copies of a rule is three
 * chances to fix a bug twice. Here it is one function that every mutator calls,
 * always inside the caller's transaction.
 */

/** Renumber every card in one column to `0..n-1`, preserving current order. */
export function renumberCards(db: DB, columnId: string): void {
  const ids = db
    .prepare(
      // `rowid` as the tiebreaker, not `created_at`: two cards created in the
      // same millisecond are not rare when an agent writes a batch, and a
      // tie here would make the renumber itself non-deterministic.
      'SELECT id FROM cards WHERE column_id = ? ORDER BY position, rowid',
    )
    .all(columnId)
    .map((r) => (r as { id: string }).id)

  const set = db.prepare('UPDATE cards SET position = ? WHERE id = ?')
  ids.forEach((id, i) => set.run(i, id))
}

/**
 * Renumber the columns of one board to `0..n-1`.
 *
 * A "board" is either a project's top level (`parentCardId` undefined) or one
 * sub-board. They are different lists and must not be renumbered together —
 * `IS NULL` versus `= ?` is doing real work in that query, and `= NULL` would
 * silently match nothing.
 */
export function renumberColumns(
  db: DB,
  projectId: string,
  parentCardId?: string,
): void {
  const ids = (
    parentCardId === undefined
      ? db
          .prepare(
            'SELECT id FROM columns WHERE project_id = ? AND parent_card_id IS NULL ORDER BY position, rowid',
          )
          .all(projectId)
      : db
          .prepare(
            'SELECT id FROM columns WHERE parent_card_id = ? ORDER BY position, rowid',
          )
          .all(parentCardId)
  ).map((r) => (r as { id: string }).id)

  const set = db.prepare('UPDATE columns SET position = ? WHERE id = ?')
  ids.forEach((id, i) => set.run(i, id))
}

/** How many cards a column holds — the append position for a new one. */
export function cardCount(db: DB, columnId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM cards WHERE column_id = ?')
    .get(columnId) as { n: number }
  return row.n
}
