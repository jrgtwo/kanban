import { nanoid } from 'nanoid'
import type { DB } from '../db.ts'
import { duplicateKey, invalidMove, invalidParent, notFound } from '../errors.ts'
import type { Card, CardType, ChecklistItem } from '../../shared/types.ts'
import { toCard } from './rows.ts'
import type { CardRow } from './rows.ts'
import { cardCount, renumberCards } from './order.ts'
import { cascadeSubBoard, getColumn } from './columns.ts'

const id = () => nanoid(10)

// ───────────────────────────────────────────────────── addressing ───

/**
 * Resolve a card by **id or key**, which is what lets the API be driven without
 * a lookup round-trip — "move AG-06 to In Progress" said literally.
 *
 * Ids win over keys. They are `nanoid(10)` and keys are human strings, so a
 * collision is not realistic; checking id first just makes the common path one
 * query.
 *
 * A key that matches in more than one project is **refused, not guessed**. Keys
 * are unique per project, not globally, so "AG-06" is genuinely ambiguous once
 * two projects use the same scheme — and silently picking one would be wrong in
 * a way nobody notices until the wrong board moves.
 */
export function resolveCard(db: DB, idOrKey: string, projectId?: string): Card {
  const byId = db
    .prepare('SELECT * FROM cards WHERE id = ?')
    .get(idOrKey) as CardRow | undefined
  if (byId) return toCard(byId)

  const matches = (
    projectId === undefined
      ? db.prepare('SELECT * FROM cards WHERE key = ?').all(idOrKey)
      : db
          .prepare('SELECT * FROM cards WHERE key = ? AND project_id = ?')
          .all(idOrKey, projectId)
  ) as CardRow[]

  if (matches.length === 0) notFound(`Card "${idOrKey}"`)
  if (matches.length > 1) {
    const projects = [...new Set(matches.map((m) => m.project_id))].join(', ')
    invalidMove(
      `The key "${idOrKey}" exists in more than one project (${projects}). Pass a projectId, or use the card's id.`,
    )
  }
  return toCard(matches[0]!)
}

export const getCard = (db: DB, cardId: string): Card => resolveCard(db, cardId)

/** Refuse a key already taken in the same project, naming the collision. */
function assertKeyFree(
  db: DB,
  projectId: string,
  key: string,
  exceptCardId?: string,
): void {
  const row = db
    .prepare('SELECT id FROM cards WHERE project_id = ? AND key = ?')
    .get(projectId, key) as { id: string } | undefined
  if (row && row.id !== exceptCardId) duplicateKey(key)
}

// ──────────────────────────────────────────────────────── writing ───

export interface CreateCardInput {
  columnId: string
  type: CardType
  title: string
  key?: string
  notes?: string
  tags?: string[]
  dependsOn?: string[]
  checklistItems?: ChecklistItem[]
  dueAt?: number
}

export function createCard(db: DB, input: CreateCardInput): Card {
  const cid = id()
  const now = Date.now()
  const column = getColumn(db, input.columnId)

  return db.transaction(() => {
    if (input.key) assertKeyFree(db, column.projectId, input.key)

    db.prepare(
      `INSERT INTO cards (
         id, project_id, parent_card_id, column_id, position, type, key,
         title, notes, checklist_items, tags, depends_on, due_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      cid,
      column.projectId,
      // A card belongs to whatever board its column belongs to. Taking this
      // from the column rather than the request is what stops a card being
      // created into a sub-board it does not live on.
      column.parentCardId ?? null,
      column.id,
      cardCount(db, column.id),
      input.type,
      input.key ?? null,
      input.title.trim(),
      input.notes ?? null,
      JSON.stringify(input.checklistItems ?? []),
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.dependsOn ?? []),
      input.dueAt ?? null,
      now,
      now,
    )

    return getCard(db, cid)
  })()
}

export type UpdateCardPatch = Partial<
  Pick<
    Card,
    'title' | 'notes' | 'key' | 'tags' | 'dependsOn' | 'checklistItems' | 'dueAt'
  >
>

export function updateCard(
  db: DB,
  idOrKey: string,
  patch: UpdateCardPatch,
  projectId?: string,
): Card {
  const card = resolveCard(db, idOrKey, projectId)

  return db.transaction(() => {
    if (patch.key !== undefined && patch.key !== null) {
      assertKeyFree(db, card.projectId, patch.key, card.id)
    }

    const sets: string[] = []
    const args: unknown[] = []
    const put = (col: string, value: unknown) => {
      sets.push(`${col} = ?`)
      args.push(value)
    }

    if (patch.title !== undefined) put('title', patch.title.trim())
    if (patch.notes !== undefined) put('notes', patch.notes || null)
    if (patch.key !== undefined) put('key', patch.key || null)
    if (patch.tags !== undefined) put('tags', JSON.stringify(patch.tags))
    if (patch.dependsOn !== undefined)
      put('depends_on', JSON.stringify(patch.dependsOn))
    if (patch.checklistItems !== undefined)
      put('checklist_items', JSON.stringify(patch.checklistItems))
    if (patch.dueAt !== undefined) put('due_at', patch.dueAt ?? null)

    if (sets.length) {
      put('updated_at', Date.now())
      args.push(card.id)
      db.prepare(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`).run(...args)
    }

    return getCard(db, card.id)
  })()
}

export function deleteCard(db: DB, idOrKey: string, projectId?: string): void {
  const card = resolveCard(db, idOrKey, projectId)

  db.transaction(() => {
    if (card.type === 'subboard') cascadeSubBoard(db, card.id)
    db.prepare('DELETE FROM cards WHERE id = ?').run(card.id)
    renumberCards(db, card.columnId)
  })()
}

/**
 * Move a card to a column and an index within it.
 *
 * `toIndex` is clamped rather than refused at the top end — a client that asks
 * for "the end" by passing a large index means the end, and an off-by-one there
 * is not worth a failed drag. A **negative** index is refused, because that is a
 * bug rather than an approximation.
 */
export function moveCard(
  db: DB,
  idOrKey: string,
  toColumnId: string,
  toIndex: number,
  projectId?: string,
): Card {
  const card = resolveCard(db, idOrKey, projectId)
  const target = getColumn(db, toColumnId)

  if (toIndex < 0 || !Number.isInteger(toIndex)) {
    invalidMove(`toIndex must be a non-negative integer, got ${toIndex}.`)
  }
  if (target.projectId !== card.projectId) {
    invalidParent(
      `Card ${card.key ?? card.id} is in project ${card.projectId} and column ${toColumnId} is in ${target.projectId}. Cards do not move between projects.`,
    )
  }
  if ((target.parentCardId ?? null) !== (card.parentCardId ?? null)) {
    invalidParent(
      `Column ${toColumnId} is on a different board than card ${card.key ?? card.id}. Cards do not move between a project and its sub-boards.`,
    )
  }

  return db.transaction(() => {
    const from = card.columnId

    // Build the destination list explicitly and write it back, rather than
    // nudging positions with arithmetic. Same result, but the invariant is
    // visible in the code instead of being a property of three UPDATEs that
    // have to run in the right order.
    const others = (
      db
        .prepare(
          'SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position, rowid',
        )
        .all(target.id, card.id) as { id: string }[]
    ).map((r) => r.id)

    const index = Math.min(toIndex, others.length)
    const final = [...others.slice(0, index), card.id, ...others.slice(index)]

    const now = Date.now()
    const setPosition = db.prepare('UPDATE cards SET position = ? WHERE id = ?')
    const setMoved = db.prepare(
      'UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?',
    )
    final.forEach((cid, i) => {
      if (cid === card.id) setMoved.run(target.id, i, now, cid)
      else setPosition.run(i, cid)
    })

    // The source list now has a hole where the card was.
    if (from !== target.id) renumberCards(db, from)

    return getCard(db, card.id)
  })()
}

// ───────────────────────────────────────────────────── re-parenting ───

/** Every card beneath this one, at any depth, itself included. */
function withDescendants(db: DB, cardId: string): string[] {
  const out = [cardId]
  const queue = [cardId]
  while (queue.length) {
    const parent = queue.shift()!
    const children = db
      .prepare('SELECT id FROM cards WHERE parent_card_id = ?')
      .all(parent) as { id: string }[]
    for (const child of children) {
      out.push(child.id)
      queue.push(child.id)
    }
  }
  return out
}

/** Walk up the sub-board chain from a card, yielding each ancestor's id. */
function ancestorsOf(db: DB, cardId: string | null): string[] {
  const out: string[] = []
  let current = cardId
  while (current) {
    out.push(current)
    const row = db
      .prepare('SELECT parent_card_id FROM cards WHERE id = ?')
      .get(current) as { parent_card_id: string | null } | undefined
    current = row?.parent_card_id ?? null
  }
  return out
}

/**
 * Move a card to a **different board** — out of an epic, into one, or between
 * two epics. Its whole sub-tree goes with it.
 *
 * Deliberately separate from {@link moveCard} rather than relaxing its
 * cross-board guard. A drag can only ever land on the board being looked at, so
 * a cross-board move is always programmatic and always deliberate; keeping it a
 * distinct operation means a bug in the drag path can never silently re-file a
 * ticket under the wrong epic.
 *
 * Three things it has to refuse, and each is a real way to corrupt a board:
 *
 *   - **A cycle.** Filing an epic inside its own descendant detaches the whole
 *     sub-tree from every board — the cards still exist and nothing can reach
 *     them.
 *   - **A key collision.** Keys are unique per project, so moving `AG-06` into
 *     a project that already has an `AG-06` would break that guarantee. The
 *     whole sub-tree is checked, not just the card being moved.
 *   - **An unknown card or column**, same as everywhere else.
 */
export function reparentCard(
  db: DB,
  idOrKey: string,
  toColumnId: string,
  toIndex = 0,
  projectId?: string,
): Card {
  const card = resolveCard(db, idOrKey, projectId)
  const target = getColumn(db, toColumnId)

  if (toIndex < 0 || !Number.isInteger(toIndex)) {
    invalidMove(`toIndex must be a non-negative integer, got ${toIndex}.`)
  }

  const sameBoard =
    target.projectId === card.projectId &&
    (target.parentCardId ?? null) === (card.parentCardId ?? null)

  // Already on that board — this is an ordinary move, so do that instead of
  // running the sub-tree machinery for nothing.
  if (sameBoard) return moveCard(db, card.id, toColumnId, toIndex)

  if (ancestorsOf(db, target.parentCardId ?? null).includes(card.id)) {
    invalidParent(
      `Cannot file "${card.key ?? card.id}" inside itself or one of its own sub-boards — the whole sub-tree would become unreachable.`,
    )
  }

  const subtree = withDescendants(db, card.id)

  if (target.projectId !== card.projectId) {
    const keyed = db
      .prepare(
        `SELECT id, key FROM cards WHERE id IN (${subtree.map(() => '?').join(',')}) AND key IS NOT NULL`,
      )
      .all(...subtree) as { id: string; key: string }[]

    for (const { key } of keyed) {
      const clash = db
        .prepare('SELECT id FROM cards WHERE project_id = ? AND key = ?')
        .get(target.projectId, key) as { id: string } | undefined
      if (clash) duplicateKey(key)
    }
  }

  return db.transaction(() => {
    const from = card.columnId
    const now = Date.now()

    // The sub-tree keeps its internal shape — children point at their parent
    // card, not at a board — so only `project_id` has to follow the move.
    if (target.projectId !== card.projectId) {
      const placeholders = subtree.map(() => '?').join(',')
      db.prepare(
        `UPDATE cards SET project_id = ?, updated_at = ? WHERE id IN (${placeholders})`,
      ).run(target.projectId, now, ...subtree)
      db.prepare(
        `UPDATE columns SET project_id = ? WHERE parent_card_id IN (${placeholders})`,
      ).run(target.projectId, ...subtree)
    }

    const others = (
      db
        .prepare(
          'SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position, rowid',
        )
        .all(target.id, card.id) as { id: string }[]
    ).map((r) => r.id)

    const index = Math.min(toIndex, others.length)
    const final = [...others.slice(0, index), card.id, ...others.slice(index)]

    db.prepare(
      'UPDATE cards SET column_id = ?, parent_card_id = ?, updated_at = ? WHERE id = ?',
    ).run(target.id, target.parentCardId ?? null, now, card.id)

    const setPosition = db.prepare('UPDATE cards SET position = ? WHERE id = ?')
    final.forEach((cid, i) => setPosition.run(i, cid))

    renumberCards(db, from)

    return getCard(db, card.id)
  })()
}

// ───────────────────────────────────────────────────────── search ───

/**
 * Substring search over titles, notes, keys and tags.
 *
 * Deliberately simple. This exists to replace `grep` over a folder of markdown
 * tickets, and `LIKE` over a few hundred rows is faster than the request that
 * carries it. If it ever needs ranking, SQLite's FTS5 is the upgrade.
 */
export function searchCards(db: DB, query: string, projectId?: string): Card[] {
  const q = `%${query.trim()}%`
  if (query.trim() === '') return []

  const rows = (
    projectId === undefined
      ? db
          .prepare(
            `SELECT * FROM cards
             WHERE title LIKE ? OR notes LIKE ? OR key LIKE ? OR tags LIKE ?
             ORDER BY updated_at DESC LIMIT 100`,
          )
          .all(q, q, q, q)
      : db
          .prepare(
            `SELECT * FROM cards
             WHERE project_id = ?
               AND (title LIKE ? OR notes LIKE ? OR key LIKE ? OR tags LIKE ?)
             ORDER BY updated_at DESC LIMIT 100`,
          )
          .all(projectId, q, q, q, q)
  ) as CardRow[]

  return rows.map(toCard)
}
