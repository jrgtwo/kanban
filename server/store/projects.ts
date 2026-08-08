import { nanoid } from 'nanoid'
import type { DB } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Accent, Board, Project } from '../../shared/types.ts'
import { toCard, toColumn, toProject } from './rows.ts'
import type { CardRow, ColumnRow, ProjectRow } from './rows.ts'

const id = () => nanoid(10)

const DEFAULT_COLUMNS = ['Backlog', 'In Progress', 'Review', 'Done']
const ACCENTS: Accent[] = ['vermillion', 'ochre', 'moss', 'ink']

export function listProjects(db: DB): Project[] {
  const projects = (
    db
      .prepare('SELECT * FROM projects ORDER BY created_at DESC')
      .all() as ProjectRow[]
  ).map(toProject)

  // One grouped query for every project's card count, rather than one query per
  // project — the index renders this for the whole list.
  const counts = new Map(
    (
      db
        .prepare('SELECT project_id, COUNT(*) AS n FROM cards GROUP BY project_id')
        .all() as { project_id: string; n: number }[]
    ).map((r) => [r.project_id, r.n]),
  )

  return projects.map((p) => ({ ...p, cardCount: counts.get(p.id) ?? 0 }))
}

export function getProject(db: DB, projectId: string): Project {
  const row = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(projectId) as ProjectRow | undefined
  if (!row) notFound(`Project "${projectId}"`)
  return toProject(row as ProjectRow)
}

export interface CreateProjectInput {
  name: string
  description?: string
  sigil?: string
  accent?: Accent
}

export function createProject(db: DB, input: CreateProjectInput): Project {
  const pid = id()
  const now = Date.now()

  // Same derivation the Dexie version used: an explicit sigil wins, else the
  // first letter of the name, else a middle dot so the card face is never blank.
  const sigil =
    input.sigil?.trim().slice(0, 2) ||
    input.name.trim().charAt(0).toUpperCase() ||
    '·'
  const accent = input.accent ?? ACCENTS[Math.floor(Math.random() * ACCENTS.length)]!

  db.transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, name, description, sigil, accent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      pid,
      input.name.trim(),
      input.description?.trim() || null,
      sigil,
      accent,
      now,
      now,
    )

    const insert = db.prepare(
      `INSERT INTO columns (id, project_id, parent_card_id, name, position, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    )
    DEFAULT_COLUMNS.forEach((name, i) => insert.run(id(), pid, name, i, now, now))
  })()

  return getProject(db, pid)
}

export function updateProject(
  db: DB,
  projectId: string,
  patch: Partial<Pick<Project, 'name' | 'description' | 'sigil' | 'accent'>>,
): Project {
  getProject(db, projectId) // 404s before touching anything

  const sets: string[] = []
  const args: unknown[] = []
  const put = (col: string, value: unknown) => {
    sets.push(`${col} = ?`)
    args.push(value)
  }

  if (patch.name !== undefined) put('name', patch.name.trim())
  if (patch.description !== undefined)
    put('description', patch.description.trim() || null)
  if (patch.sigil !== undefined)
    put('sigil', patch.sigil.trim().slice(0, 2) || '·')
  if (patch.accent !== undefined) put('accent', patch.accent)

  if (sets.length) {
    put('updated_at', Date.now())
    args.push(projectId)
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  return getProject(db, projectId)
}

export function deleteProject(db: DB, projectId: string): void {
  getProject(db, projectId)
  // Columns and cards go with it via ON DELETE CASCADE — which only works
  // because `openDb` turns foreign keys on. See the note there.
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
}

/**
 * One project's board — top level, or one sub-board — in a single read.
 *
 * The UI's only query. Returning columns and cards together is what lets the
 * client hold one cache entry per board rather than one per list, which is what
 * makes an optimistic drag a single rollback instead of two.
 */
export function getBoard(db: DB, projectId: string, parentCardId?: string): Board {
  const project = getProject(db, projectId)

  const columns = (
    parentCardId === undefined
      ? db
          .prepare(
            'SELECT * FROM columns WHERE project_id = ? AND parent_card_id IS NULL ORDER BY position',
          )
          .all(projectId)
      : db
          .prepare(
            'SELECT * FROM columns WHERE parent_card_id = ? ORDER BY position',
          )
          .all(parentCardId)
  ) as ColumnRow[]

  const cards = (
    parentCardId === undefined
      ? db
          .prepare(
            'SELECT * FROM cards WHERE project_id = ? AND parent_card_id IS NULL ORDER BY position',
          )
          .all(projectId)
      : db
          .prepare('SELECT * FROM cards WHERE parent_card_id = ? ORDER BY position')
          .all(parentCardId)
  ) as CardRow[]

  return {
    project,
    columns: columns.map(toColumn),
    cards: cards.map(toCard),
  }
}
