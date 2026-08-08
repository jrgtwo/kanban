import type {
  Accent,
  ApiError,
  Board,
  Card,
  CardType,
  ChecklistItem,
  Column,
  Project,
} from '../../shared/types'

/**
 * The HTTP client. One function per endpoint, nothing else in the app calling
 * `fetch`.
 *
 * This is the browser's half of "one API, two clients" — it deliberately has no
 * behaviour of its own beyond turning a refusal into an `Error` a component can
 * show. Every rule about ordering, keys and cascades lives on the server, so the
 * agent and the UI cannot drift apart by one of them forgetting a step.
 */

/** A refusal the server returned. Carries the machine-readable code with it. */
export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const failure = payload as ApiError | null
    throw new ApiRequestError(
      failure?.error?.code ?? 'unknown',
      // A refusal always carries a sentence worth showing. A genuine crash does
      // not, so fall back to something that at least names the request.
      failure?.error?.message ?? `${init?.method ?? 'GET'} ${path} failed.`,
      response.status,
    )
  }

  return payload as T
}

// ────────────────────────────────────────────────────────── projects ───

export const listProjects = () => request<Project[]>('/projects')

export const getProject = (projectId: string) =>
  request<Project>(`/projects/${projectId}`)

export const createProject = (input: {
  name: string
  description?: string
  sigil?: string
  accent?: Accent
}) => request<Project>('/projects', { method: 'POST', body: input })

export const updateProject = (
  projectId: string,
  patch: Partial<Pick<Project, 'name' | 'description' | 'sigil' | 'accent'>>,
) => request<Project>(`/projects/${projectId}`, { method: 'PATCH', body: patch })

export const deleteProject = (projectId: string) =>
  request<{ ok: true }>(`/projects/${projectId}`, { method: 'DELETE' })

/** Columns and cards together — the board's only read. */
export const getBoard = (projectId: string, parentCardId?: string) =>
  request<Board>(
    `/projects/${projectId}/board${parentCardId ? `?parentCardId=${parentCardId}` : ''}`,
  )

// ─────────────────────────────────────────────────────────── columns ───

export const createColumn = (input: {
  projectId: string
  parentCardId?: string
  name: string
}) => request<Column>('/columns', { method: 'POST', body: input })

export const renameColumn = (columnId: string, name: string) =>
  request<Column>(`/columns/${columnId}`, { method: 'PATCH', body: { name } })

export const deleteColumn = (columnId: string) =>
  request<{ ok: true }>(`/columns/${columnId}`, { method: 'DELETE' })

/** Takes the WHOLE board's columns in order — the server refuses a partial list. */
export const reorderColumns = (orderedIds: string[]) =>
  request<Column[]>('/columns/reorder', { method: 'POST', body: { orderedIds } })

// ───────────────────────────────────────────────────────────── cards ───

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

export const createCard = (input: CreateCardInput) =>
  request<Card>('/cards', { method: 'POST', body: input })

/** `idOrKey` — the API resolves a human key like `AG-06` the same as an id. */
export const getCard = (idOrKey: string) => request<Card>(`/cards/${idOrKey}`)

export type UpdateCardPatch = Partial<
  Pick<Card, 'title' | 'notes' | 'key' | 'tags' | 'dependsOn' | 'checklistItems' | 'dueAt'>
>

export const updateCard = (idOrKey: string, patch: UpdateCardPatch) =>
  request<Card>(`/cards/${idOrKey}`, { method: 'PATCH', body: patch })

export const deleteCard = (idOrKey: string) =>
  request<{ ok: true }>(`/cards/${idOrKey}`, { method: 'DELETE' })

export const moveCard = (idOrKey: string, toColumnId: string, toIndex: number) =>
  request<Card>(`/cards/${idOrKey}/move`, {
    method: 'POST',
    body: { toColumnId, toIndex },
  })

export const searchCards = (q: string, projectId?: string) =>
  request<Card[]>(
    `/search?q=${encodeURIComponent(q)}${projectId ? `&projectId=${projectId}` : ''}`,
  )
