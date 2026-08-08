/**
 * The API contract, imported by **both** the server and the browser client.
 *
 * It lives outside `src/` and `server/` on purpose: there is one API and two
 * clients, and the moment the contract has two definitions they start drifting
 * in the direction nobody notices — a field the server stopped sending and the
 * UI still renders as `undefined`.
 *
 * Field names here are the *API's* names. Storage differs where SQL forces it
 * (`order` is a reserved word, so the column is `position`); that mapping is
 * `server/store/`'s business and stops there.
 */

export type CardType = 'task' | 'subboard' | 'note' | 'checklist' | 'milestone'

export type Accent = 'vermillion' | 'ochre' | 'moss' | 'ink'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Project {
  id: string
  name: string
  description?: string
  sigil: string
  accent: Accent
  createdAt: number
  updatedAt: number

  /**
   * Total cards in the project, sub-boards included.
   *
   * Only present on the **list** endpoint, which is the only place that wants
   * it. Computed by the server in one grouped query — the index used to do it
   * as one count per project, which was invisible against IndexedDB and would
   * be N requests over HTTP.
   */
  cardCount?: number
}

export interface Column {
  id: string
  projectId: string
  parentCardId?: string
  name: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface Card {
  id: string
  projectId: string
  parentCardId?: string
  columnId: string
  order: number
  type: CardType

  /**
   * The human key — `"AG-06"`. Unique within a project when present.
   *
   * This is what makes the API usable without a lookup round-trip: an agent
   * says "move AG-06 to In Progress" and means it literally. Every route that
   * takes a card id takes a key instead.
   */
  key?: string

  title: string
  notes?: string
  checklistItems: ChecklistItem[]

  /** Free-form labels. A column is not a status — "done · follow-up owed" is a
   *  column *plus* a tag, and so is "slice-1" or "blocked-on-user". */
  tags: string[]

  /** Keys of cards this one waits on. Prose today, renderable once it is data. */
  dependsOn: string[]

  dueAt?: number
  createdAt: number
  updatedAt: number
}

/** One project's board in a single read — the only shape the UI needs to draw. */
export interface Board {
  project: Project
  columns: Column[]
  cards: Card[]
}

// ─────────────────────────────────────────────────────────── errors ───

/**
 * Every refusal comes back in this shape with a real status code — never a 500,
 * never a silent no-op. An agent has to be able to read *why* it was refused;
 * that is the same rule the fretwork composer's seams follow with `Result<T>`.
 */
export interface ApiError {
  error: {
    code: ErrorCode
    message: string
  }
}

export type ErrorCode =
  | 'not_found'
  | 'duplicate_key'
  | 'invalid_body'
  | 'invalid_move'
  | 'invalid_parent'

export const ERROR_STATUS: Record<ErrorCode, number> = {
  not_found: 404,
  duplicate_key: 409,
  invalid_body: 400,
  invalid_move: 422,
  invalid_parent: 422,
}
