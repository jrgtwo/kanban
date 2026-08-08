import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { Board, Project } from '../../shared/types'
import type { Scope } from '../lib/scope'
import * as api from './client'

/**
 * Query keys, in one place.
 *
 * A board is keyed by its **scope** — a project's top level and each of its
 * sub-boards are separate boards with separate columns, and keying them
 * together would make a sub-board edit refetch the parent and vice versa.
 */
export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  board: (scope: Scope) =>
    ['board', scope.projectId, scope.parentCardId ?? null] as const,
}

/**
 * Anything that can change a board invalidates the board it is on. Cheap, and
 * it is the behaviour that keeps a card's own mutation from having to know what
 * else the server renumbered — which, given `moveCard` touches two columns, is
 * most of the point of doing it server-side.
 */
const invalidateBoards = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: ['board'] }),
    client.invalidateQueries({ queryKey: keys.projects }),
  ])

// ────────────────────────────────────────────────────────── projects ───

export const useProjects = () =>
  useQuery({ queryKey: keys.projects, queryFn: api.listProjects })

export const useProject = (projectId: string) =>
  useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => api.getProject(projectId),
  })

export function useCreateProject() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => invalidateBoards(client),
  })
}

export function useUpdateProject() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      projectId: string
      patch: Partial<Pick<Project, 'name' | 'description' | 'sigil' | 'accent'>>
    }) => api.updateProject(vars.projectId, vars.patch),
    onSuccess: () => invalidateBoards(client),
  })
}

export function useDeleteProject() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => invalidateBoards(client),
  })
}

// ───────────────────────────────────────────────────────────── board ───

export const useBoard = (scope: Scope) =>
  useQuery({
    queryKey: keys.board(scope),
    queryFn: () => api.getBoard(scope.projectId, scope.parentCardId),
  })

// ─────────────────────────────────────────────────────────── columns ───

export function useCreateColumn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.createColumn,
    onSuccess: () => invalidateBoards(client),
  })
}

export function useRenameColumn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { columnId: string; name: string }) =>
      api.renameColumn(vars.columnId, vars.name),
    onSuccess: () => invalidateBoards(client),
  })
}

export function useDeleteColumn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.deleteColumn,
    onSuccess: () => invalidateBoards(client),
  })
}

// ───────────────────────────────────────────────────────────── cards ───

export function useCreateCard() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.createCard,
    onSuccess: () => invalidateBoards(client),
  })
}

export function useUpdateCard() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { idOrKey: string; patch: api.UpdateCardPatch }) =>
      api.updateCard(vars.idOrKey, vars.patch),
    onSuccess: () => invalidateBoards(client),
  })
}

export function useDeleteCard() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCard,
    onSuccess: () => invalidateBoards(client),
  })
}

/**
 * The two mutations every card component needs, as plain async functions.
 *
 * A card's edit form wants `updateCard(id, patch)` — the shape it already had.
 * Wrapping `mutateAsync` here keeps that call shape at fourteen call sites
 * instead of spreading `mutate({ idOrKey, patch })` through all of them, and
 * makes the mutation objects themselves an implementation detail of this file.
 */
export function useCardActions() {
  const update = useUpdateCard()
  const remove = useDeleteCard()
  return {
    updateCard: (idOrKey: string, patch: api.UpdateCardPatch) =>
      update.mutateAsync({ idOrKey, patch }),
    deleteCard: (idOrKey: string) => remove.mutateAsync(idOrKey),
  }
}

/** The same, for the column header's rename and delete. */
export function useColumnActions() {
  const create = useCreateColumn()
  const rename = useRenameColumn()
  const remove = useDeleteColumn()
  return {
    createColumn: (scope: Scope, name: string) =>
      create.mutateAsync({
        projectId: scope.projectId,
        parentCardId: scope.parentCardId,
        name,
      }),
    renameColumn: (columnId: string, name: string) =>
      rename.mutateAsync({ columnId, name }),
    deleteColumn: (columnId: string) => remove.mutateAsync(columnId),
  }
}

/** Card creation, taking the scope-and-column shape the board already passes. */
export function useAddCard() {
  const create = useCreateCard()
  return (columnId: string, input: Omit<api.CreateCardInput, 'columnId'>) =>
    create.mutateAsync({ ...input, columnId })
}

// ────────────────────────────────────────────────── drag mutations ───

/**
 * Move and reorder are the two the board drives from a drag, so both take an
 * **optimistic** path: write the expected result into the cache immediately,
 * roll back if the server refuses, and refetch either way.
 *
 * This is what replaces the hand-rolled `localCards` / `localColumns` mirroring
 * in the Dexie version. Same instant feel, but the rollback is real — the old
 * mirror had no way to undo a write the store rejected, because the store never
 * rejected anything.
 *
 * `onMutate` cancels in-flight board fetches first. Without that, a refetch
 * started before the drag can land *after* the optimistic write and clobber it,
 * which looks exactly like the card springing back.
 */
export function useMoveCard(scope: Scope) {
  const client = useQueryClient()
  const key = keys.board(scope)

  return useMutation({
    mutationFn: (vars: { cardId: string; toColumnId: string; toIndex: number }) =>
      api.moveCard(vars.cardId, vars.toColumnId, vars.toIndex),

    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<Board>(key)
      if (previous) client.setQueryData(key, applyMove(previous, vars))
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}

export function useReorderColumns(scope: Scope) {
  const client = useQueryClient()
  const key = keys.board(scope)

  return useMutation({
    mutationFn: (orderedIds: string[]) => api.reorderColumns(orderedIds),

    onMutate: async (orderedIds) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<Board>(key)
      if (previous) {
        const byId = new Map(previous.columns.map((c) => [c.id, c]))
        client.setQueryData(key, {
          ...previous,
          columns: orderedIds
            .map((id, i) => {
              const column = byId.get(id)
              return column ? { ...column, order: i } : undefined
            })
            .filter((c) => c !== undefined),
        })
      }
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },

    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}

/**
 * The optimistic result of a move, computed the same way the server does it:
 * take the card out, splice it in at the index, renumber both affected columns
 * to `0..n-1`.
 *
 * Kept as a pure function so the rule is readable in one place. If this and the
 * server ever disagree, the card visibly jumps when the refetch lands — which is
 * an annoying bug but a self-announcing one.
 */
function applyMove(
  board: Board,
  vars: { cardId: string; toColumnId: string; toIndex: number },
): Board {
  const card = board.cards.find((c) => c.id === vars.cardId)
  if (!card) return board

  const from = card.columnId
  const others = board.cards
    .filter((c) => c.columnId === vars.toColumnId && c.id !== card.id)
    .sort((a, b) => a.order - b.order)

  const index = Math.min(vars.toIndex, others.length)
  const destination = [
    ...others.slice(0, index),
    { ...card, columnId: vars.toColumnId },
    ...others.slice(index),
  ].map((c, i) => ({ ...c, order: i }))

  const source =
    from === vars.toColumnId
      ? []
      : board.cards
          .filter((c) => c.columnId === from && c.id !== card.id)
          .sort((a, b) => a.order - b.order)
          .map((c, i) => ({ ...c, order: i }))

  const untouched = board.cards.filter(
    (c) => c.columnId !== from && c.columnId !== vars.toColumnId,
  )

  return { ...board, cards: [...untouched, ...source, ...destination] }
}
