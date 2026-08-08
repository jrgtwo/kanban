import type { Card, Column, Project } from '../../shared/types.ts'

/**
 * Row → API mapping, in one place.
 *
 * Two translations happen here and nowhere else: `position` → `order` (SQL
 * reserves the word), and the JSON-encoded array columns → real arrays. Every
 * read goes through these, so a route can never hand out a raw row with a
 * string where the contract promises a list.
 */

export interface ProjectRow {
  id: string
  name: string
  description: string | null
  sigil: string
  accent: string
  created_at: number
  updated_at: number
}

export interface ColumnRow {
  id: string
  project_id: string
  parent_card_id: string | null
  name: string
  position: number
  created_at: number
  updated_at: number
}

export interface CardRow {
  id: string
  project_id: string
  parent_card_id: string | null
  column_id: string
  position: number
  type: string
  key: string | null
  title: string
  notes: string | null
  checklist_items: string
  tags: string
  depends_on: string
  due_at: number | null
  created_at: number
  updated_at: number
}

/** `null` is how SQLite stores an absent optional; the contract says `undefined`. */
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

/**
 * Arrays are stored as JSON text. A row written by hand — or by an older
 * migration — can hold something that is valid JSON but not a list, so this
 * falls back to empty rather than handing a component something it will try to
 * `.map()` over.
 */
function jsonArray<T>(raw: string): T[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: opt(r.description),
  sigil: r.sigil,
  accent: r.accent as Project['accent'],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toColumn = (r: ColumnRow): Column => ({
  id: r.id,
  projectId: r.project_id,
  parentCardId: opt(r.parent_card_id),
  name: r.name,
  order: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export const toCard = (r: CardRow): Card => ({
  id: r.id,
  projectId: r.project_id,
  parentCardId: opt(r.parent_card_id),
  columnId: r.column_id,
  order: r.position,
  type: r.type as Card['type'],
  key: opt(r.key),
  title: r.title,
  notes: opt(r.notes),
  checklistItems: jsonArray(r.checklist_items),
  tags: jsonArray(r.tags),
  dependsOn: jsonArray(r.depends_on),
  dueAt: opt(r.due_at),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})
