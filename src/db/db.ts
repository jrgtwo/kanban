import Dexie, { type Table } from 'dexie'
import { nanoid } from 'nanoid'
import type { Card, CardType, ChecklistItem, Column, Project } from './types'
import type { Scope } from '../lib/scope'
import type { Accent } from '../lib/accents'

class LedgerDB extends Dexie {
  projects!: Table<Project, string>
  columns!: Table<Column, string>
  cards!: Table<Card, string>

  constructor() {
    super('ledger')

    this.version(1).stores({
      projects: 'id, name, createdAt',
      columns: 'id, projectId, order, [projectId+order]',
      tasks: 'id, projectId, columnId, order, [columnId+order]',
    })

    this.version(2)
      .stores({
        projects: 'id, name, createdAt',
        columns: 'id, projectId, parentCardId, order, [projectId+order], [parentCardId+order]',
        cards:
          'id, projectId, parentCardId, columnId, order, type, [columnId+order]',
        tasks: null,
      })
      .upgrade(async (tx) => {
        const oldTasks = await tx.table('tasks').toArray()
        for (const t of oldTasks) {
          await tx.table('cards').add({
            id: t.id,
            projectId: t.projectId,
            columnId: t.columnId,
            order: t.order,
            type: 'task' as CardType,
            title: t.title,
            notes: t.notes,
            createdAt: t.createdAt,
          })
        }
      })
  }
}

export const db = new LedgerDB()

const id = () => nanoid(10)

// ——— projects ————————————————————————————————

const DEFAULT_COLUMNS = ['Backlog', 'In Progress', 'Review', 'Done']
const ACCENTS: Accent[] = ['vermillion', 'ochre', 'moss', 'ink']

export async function createProject(input: {
  name: string
  description?: string
  sigil?: string
  accent?: Accent
}): Promise<string> {
  const pid = id()
  const now = Date.now()
  const sigil =
    input.sigil?.trim().slice(0, 2) ||
    input.name.trim().charAt(0).toUpperCase() ||
    '·'
  const accent =
    input.accent ?? ACCENTS[Math.floor(Math.random() * ACCENTS.length)]!
  await db.transaction('rw', db.projects, db.columns, async () => {
    await db.projects.add({
      id: pid,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      sigil,
      accent,
      createdAt: now,
    })
    for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
      await db.columns.add({
        id: id(),
        projectId: pid,
        name: DEFAULT_COLUMNS[i]!,
        order: i,
        createdAt: now,
      })
    }
  })
  return pid
}

export async function renameProject(
  projectId: string,
  patch: { name?: string; description?: string; sigil?: string; accent?: Accent },
): Promise<void> {
  await db.projects.update(projectId, patch)
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.columns, db.cards, async () => {
    await db.cards.where({ projectId }).delete()
    await db.columns.where({ projectId }).delete()
    await db.projects.delete(projectId)
  })
}

// ——— columns ————————————————————————————————

async function columnsForScope(scope: Scope): Promise<Column[]> {
  if (scope.parentCardId) {
    return db.columns.where({ parentCardId: scope.parentCardId }).sortBy('order')
  }
  const all = await db.columns.where({ projectId: scope.projectId }).sortBy('order')
  return all.filter((c) => !c.parentCardId)
}

export async function createColumn(scope: Scope, name: string): Promise<string> {
  const cid = id()
  await db.transaction('rw', db.columns, async () => {
    const existing = await columnsForScope(scope)
    await db.columns.add({
      id: cid,
      projectId: scope.projectId,
      parentCardId: scope.parentCardId,
      name,
      order: existing.length,
      createdAt: Date.now(),
    })
  })
  return cid
}

export async function renameColumn(columnId: string, name: string): Promise<void> {
  await db.columns.update(columnId, { name })
}

export async function deleteColumn(columnId: string): Promise<void> {
  await db.transaction('rw', db.columns, db.cards, async () => {
    const col = await db.columns.get(columnId)
    if (!col) return
    const cards = await db.cards.where({ columnId }).toArray()
    for (const c of cards) {
      if (c.type === 'subboard') await cascadeDeleteSubBoard(c.id)
    }
    await db.cards.where({ columnId }).delete()
    await db.columns.delete(columnId)
    const scope: Scope = col.parentCardId
      ? { projectId: col.projectId, parentCardId: col.parentCardId }
      : { projectId: col.projectId }
    const remaining = await columnsForScope(scope)
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i]!.order !== i) {
        await db.columns.update(remaining[i]!.id, { order: i })
      }
    }
  })
}

export async function reorderColumns(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.columns, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.columns.update(orderedIds[i]!, { order: i })
    }
  })
}

// ——— cards ————————————————————————————————

export interface CreateCardInput {
  type: CardType
  title: string
  notes?: string
  dueAt?: number
  checklistItems?: ChecklistItem[]
}

export async function createCard(
  scope: Scope,
  columnId: string,
  input: CreateCardInput,
): Promise<string> {
  const cid = id()
  await db.transaction('rw', db.cards, async () => {
    const inCol = await db.cards.where({ columnId }).sortBy('order')
    await db.cards.add({
      id: cid,
      projectId: scope.projectId,
      parentCardId: scope.parentCardId,
      columnId,
      order: inCol.length,
      type: input.type,
      title: input.title,
      notes: input.notes,
      dueAt: input.dueAt,
      checklistItems: input.checklistItems,
      createdAt: Date.now(),
    })
  })
  return cid
}

export async function updateCard(
  cardId: string,
  patch: Partial<Pick<Card, 'title' | 'notes' | 'dueAt' | 'checklistItems'>>,
): Promise<void> {
  await db.cards.update(cardId, patch)
}

async function cascadeDeleteSubBoard(parentCardId: string): Promise<void> {
  const childCards = await db.cards.where({ parentCardId }).toArray()
  for (const c of childCards) {
    if (c.type === 'subboard') await cascadeDeleteSubBoard(c.id)
  }
  await db.cards.where({ parentCardId }).delete()
  await db.columns.where({ parentCardId }).delete()
}

export async function deleteCard(cardId: string): Promise<void> {
  await db.transaction('rw', db.cards, db.columns, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return
    if (card.type === 'subboard') await cascadeDeleteSubBoard(cardId)
    await db.cards.delete(cardId)
    const inCol = await db.cards.where({ columnId: card.columnId }).sortBy('order')
    for (let i = 0; i < inCol.length; i++) {
      if (inCol[i]!.order !== i) {
        await db.cards.update(inCol[i]!.id, { order: i })
      }
    }
  })
}

export async function moveCard(
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return
    const fromColumn = card.columnId
    await db.cards.update(cardId, { columnId: toColumnId, order: toIndex })

    if (fromColumn !== toColumnId) {
      const source = await db.cards.where({ columnId: fromColumn }).sortBy('order')
      for (let i = 0; i < source.length; i++) {
        if (source[i]!.order !== i) {
          await db.cards.update(source[i]!.id, { order: i })
        }
      }
    }

    const dest = await db.cards.where({ columnId: toColumnId }).sortBy('order')
    const without = dest.filter((c) => c.id !== cardId)
    const final = [
      ...without.slice(0, toIndex),
      { ...card, columnId: toColumnId, order: toIndex },
      ...without.slice(toIndex),
    ]
    for (let i = 0; i < final.length; i++) {
      if (final[i]!.order !== i || final[i]!.id === cardId) {
        await db.cards.update(final[i]!.id, { order: i })
      }
    }
  })
}
