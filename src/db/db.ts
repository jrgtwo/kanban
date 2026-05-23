import Dexie, { type Table } from 'dexie'
import { nanoid } from 'nanoid'
import type { Column, Project, Task } from './types'

export class LedgerDB extends Dexie {
  projects!: Table<Project, string>
  columns!: Table<Column, string>
  tasks!: Table<Task, string>

  constructor() {
    super('ledger')
    this.version(1).stores({
      projects: 'id, name, createdAt',
      columns: 'id, projectId, order, [projectId+order]',
      tasks: 'id, projectId, columnId, order, [columnId+order]',
    })
  }
}

export const db = new LedgerDB()

const ACCENTS: Project['accent'][] = ['vermillion', 'ochre', 'moss', 'ink']

export async function createProject(input: {
  name: string
  description?: string
  sigil?: string
  accent?: Project['accent']
}): Promise<string> {
  const id = nanoid(10)
  const now = Date.now()
  const sigil =
    input.sigil?.trim().slice(0, 2) ||
    input.name.trim().charAt(0).toUpperCase() ||
    '·'
  const accent =
    input.accent ?? ACCENTS[Math.floor(Math.random() * ACCENTS.length)]!

  await db.transaction('rw', db.projects, db.columns, async () => {
    await db.projects.add({
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      sigil,
      accent,
      createdAt: now,
      updatedAt: now,
    })

    const defaults = ['Backlog', 'In Progress', 'Review', 'Done']
    await db.columns.bulkAdd(
      defaults.map((name, i) => ({
        id: nanoid(10),
        projectId: id,
        name,
        order: i,
        createdAt: now,
      })),
    )
  })

  return id
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.columns, db.tasks, async () => {
    await db.tasks.where({ projectId }).delete()
    await db.columns.where({ projectId }).delete()
    await db.projects.delete(projectId)
  })
}

export async function renameProject(
  projectId: string,
  patch: Partial<Pick<Project, 'name' | 'description' | 'sigil' | 'accent'>>,
): Promise<void> {
  await db.projects.update(projectId, { ...patch, updatedAt: Date.now() })
}

export async function createColumn(
  projectId: string,
  name: string,
): Promise<string> {
  const id = nanoid(10)
  const max = await db.columns
    .where({ projectId })
    .toArray()
    .then((cs) => cs.reduce((m, c) => Math.max(m, c.order), -1))
  await db.columns.add({
    id,
    projectId,
    name: name.trim() || 'Untitled',
    order: max + 1,
    createdAt: Date.now(),
  })
  return id
}

export async function renameColumn(
  columnId: string,
  name: string,
): Promise<void> {
  await db.columns.update(columnId, { name: name.trim() || 'Untitled' })
}

export async function deleteColumn(columnId: string): Promise<void> {
  await db.transaction('rw', db.columns, db.tasks, async () => {
    await db.tasks.where({ columnId }).delete()
    await db.columns.delete(columnId)
  })
}

export async function createTask(
  projectId: string,
  columnId: string,
  title: string,
  notes?: string,
): Promise<string> {
  const id = nanoid(10)
  const now = Date.now()
  const max = await db.tasks
    .where({ columnId })
    .toArray()
    .then((ts) => ts.reduce((m, t) => Math.max(m, t.order), -1))
  await db.tasks.add({
    id,
    projectId,
    columnId,
    title: title.trim() || 'Untitled task',
    notes: notes?.trim() || undefined,
    order: max + 1,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateTask(
  taskId: string,
  patch: Partial<Pick<Task, 'title' | 'notes'>>,
): Promise<void> {
  await db.tasks.update(taskId, { ...patch, updatedAt: Date.now() })
}

export async function deleteTask(taskId: string): Promise<void> {
  await db.tasks.delete(taskId)
}

/**
 * Move a task to a new column at a target index.
 * Re-numbers `order` cleanly across affected columns.
 */
export async function moveTask(
  taskId: string,
  toColumnId: string,
  toIndex: number,
): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return

    const fromColumnId = task.columnId

    if (fromColumnId === toColumnId) {
      const list = await db.tasks
        .where({ columnId: toColumnId })
        .sortBy('order')
      const without = list.filter((t) => t.id !== taskId)
      const clamped = Math.max(0, Math.min(toIndex, without.length))
      without.splice(clamped, 0, task)
      await Promise.all(
        without.map((t, i) =>
          db.tasks.update(t.id, { order: i, updatedAt: Date.now() }),
        ),
      )
      return
    }

    // Remove from source column and renumber
    const sourceList = (
      await db.tasks.where({ columnId: fromColumnId }).sortBy('order')
    ).filter((t) => t.id !== taskId)
    await Promise.all(
      sourceList.map((t, i) => db.tasks.update(t.id, { order: i })),
    )

    // Insert into destination column at toIndex and renumber
    const destList = await db.tasks
      .where({ columnId: toColumnId })
      .sortBy('order')
    const clamped = Math.max(0, Math.min(toIndex, destList.length))
    destList.splice(clamped, 0, { ...task, columnId: toColumnId })
    await Promise.all(
      destList.map((t, i) =>
        db.tasks.update(t.id, {
          columnId: toColumnId,
          order: i,
          updatedAt: Date.now(),
        }),
      ),
    )
  })
}

export async function reorderColumns(
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction('rw', db.columns, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.columns.update(id, { order: i })),
    )
    void projectId
  })
}
