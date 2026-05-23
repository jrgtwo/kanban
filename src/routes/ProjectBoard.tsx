import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createColumn,
  createTask,
  db,
  deleteColumn,
  deleteTask,
  moveTask,
  renameColumn,
  renameProject,
  reorderColumns,
  updateTask,
} from '../db/db'
import type { Column, Project, Task } from '../db/types'
import { ACCENT_TOKENS } from '../lib/accents'

export function ProjectBoard() {
  const { projectId } = useParams({ from: '/p/$projectId' })

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const columnsDb = useLiveQuery(
    () => db.columns.where({ projectId }).sortBy('order'),
    [projectId],
  )
  const tasksDb = useLiveQuery(
    () => db.tasks.where({ projectId }).sortBy('order'),
    [projectId],
  )

  // Local optimistic state for smooth dnd
  const [localTasks, setLocalTasks] = useState<Task[] | null>(null)
  const [localColumns, setLocalColumns] = useState<Column[] | null>(null)
  useEffect(() => {
    if (tasksDb) setLocalTasks(tasksDb)
  }, [tasksDb])
  useEffect(() => {
    if (columnsDb) setLocalColumns(columnsDb)
  }, [columnsDb])

  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeColumn, setActiveColumn] = useState<Column | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {}
    if (!localColumns || !localTasks) return map
    for (const c of localColumns) map[c.id] = []
    for (const t of localTasks) {
      if (!map[t.columnId]) map[t.columnId] = []
      map[t.columnId]!.push(t)
    }
    for (const k of Object.keys(map))
      map[k]!.sort((a, b) => a.order - b.order)
    return map
  }, [localColumns, localTasks])

  if (!project) {
    return (
      <div className="px-8 py-24 md:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
          fetching the page…
        </p>
        <Link
          to="/"
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-vermillion"
        >
          ← back to index
        </Link>
      </div>
    )
  }

  if (!localColumns || !localTasks) return null

  const tokens = ACCENT_TOKENS[project.accent]

  const findColumnIdOfTask = (taskId: string): string | undefined =>
    localTasks.find((t) => t.id === taskId)?.columnId

  const isColumnId = (id: string) => localColumns.some((c) => c.id === id)

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    const type = e.active.data.current?.type
    if (type === 'column') {
      const c = localColumns.find((x) => x.id === id)
      setActiveColumn(c ?? null)
      return
    }
    const t = localTasks.find((x) => x.id === id)
    setActiveTask(t ?? null)
  }

  // Cross-column reflow during drag (local-only). Column drags are handled in onDragEnd.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    if (active.data.current?.type === 'column') return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const fromColumn = findColumnIdOfTask(activeId)
    if (!fromColumn) return

    const overIsColumn = isColumnId(overId)
    const toColumn = overIsColumn ? overId : findColumnIdOfTask(overId)
    if (!toColumn) return

    if (fromColumn === toColumn) {
      // Re-order within same column
      setLocalTasks((curr) => {
        if (!curr) return curr
        const list = curr.filter((t) => t.columnId === toColumn)
        const oldIdx = list.findIndex((t) => t.id === activeId)
        const newIdx = list.findIndex((t) => t.id === overId)
        if (oldIdx === -1 || newIdx === -1) return curr
        const moved = arrayMove(list, oldIdx, newIdx).map((t, i) => ({
          ...t,
          order: i,
        }))
        return curr
          .filter((t) => t.columnId !== toColumn)
          .concat(moved)
      })
      return
    }

    // Move to a new column
    setLocalTasks((curr) => {
      if (!curr) return curr
      const moving = curr.find((t) => t.id === activeId)
      if (!moving) return curr
      const without = curr.filter((t) => t.id !== activeId)
      const target = without.filter((t) => t.columnId === toColumn)
      let insertIdx = target.length
      if (!overIsColumn) {
        const i = target.findIndex((t) => t.id === overId)
        if (i !== -1) insertIdx = i
      }
      const newMoving = { ...moving, columnId: toColumn }
      const targetWith = [
        ...target.slice(0, insertIdx),
        newMoving,
        ...target.slice(insertIdx),
      ].map((t, i) => ({ ...t, order: i }))

      const sourceRenum = without
        .filter((t) => t.columnId === moving.columnId)
        .map((t, i) => ({ ...t, order: i }))

      const rest = without.filter(
        (t) => t.columnId !== moving.columnId && t.columnId !== toColumn,
      )
      return [...rest, ...sourceRenum, ...targetWith]
    })
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const wasActiveColumn = activeColumn
    setActiveTask(null)
    setActiveColumn(null)

    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    // Column reorder
    if (active.data.current?.type === 'column' && wasActiveColumn) {
      if (activeId === overId) return
      // The drop target may be another column id, or a task whose column we resolve.
      let overColId: string | undefined
      if (isColumnId(overId)) overColId = overId
      else overColId = findColumnIdOfTask(overId)
      if (!overColId || overColId === activeId) return

      const oldIdx = localColumns.findIndex((c) => c.id === activeId)
      const newIdx = localColumns.findIndex((c) => c.id === overColId)
      if (oldIdx === -1 || newIdx === -1) return

      const next = arrayMove(localColumns, oldIdx, newIdx).map((c, i) => ({
        ...c,
        order: i,
      }))
      setLocalColumns(next)
      await reorderColumns(
        project.id,
        next.map((c) => c.id),
      )
      return
    }

    // Task reorder / move
    const task = localTasks.find((t) => t.id === activeId)
    if (!task) return

    const colTasks = localTasks
      .filter((t) => t.columnId === task.columnId)
      .sort((a, b) => a.order - b.order)
    const newIndex = colTasks.findIndex((t) => t.id === activeId)
    await moveTask(activeId, task.columnId, newIndex)
  }

  return (
    <div className="flex h-[calc(100vh-105px)] flex-col">
      {/* Project header */}
      <section className="border-b border-[color:var(--color-rule)] px-8 pt-6 pb-5 md:px-12">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <div
              className="stamp flex h-14 w-14 shrink-0 items-center justify-center font-display text-3xl leading-none"
              style={{ background: tokens.swatch, color: tokens.ink }}
            >
              {project.sigil}
            </div>
            <div>
              <Link
                to="/"
                className="mb-1 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute hover:text-vermillion"
              >
                ← all projects
              </Link>
              {editingTitle ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (titleDraft.trim())
                      await renameProject(project.id, { name: titleDraft })
                    setEditingTitle(false)
                  }}
                >
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    className="w-full max-w-2xl border-b border-ink bg-transparent font-display text-5xl leading-[0.95] tracking-[-0.01em] text-ink focus:outline-none"
                  />
                </form>
              ) : (
                <h1
                  onDoubleClick={() => {
                    setTitleDraft(project.name)
                    setEditingTitle(true)
                  }}
                  className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.02em] text-ink"
                  title="double-click to rename"
                >
                  {project.name}
                </h1>
              )}
              {project.description && (
                <p className="mt-2 max-w-xl text-[14px] leading-[1.55] text-ink-soft">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <BoardStats
            project={project}
            columns={localColumns}
            tasks={localTasks}
          />
        </div>
      </section>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveTask(null)
          setActiveColumn(null)
        }}
      >
        <div className="flex flex-1 gap-5 overflow-x-auto overflow-y-hidden px-8 py-6 md:px-12">
          <SortableContext
            items={localColumns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {localColumns.map((col, i) => (
              <BoardColumn
                key={col.id}
                column={col}
                index={i}
                tasks={tasksByColumn[col.id] ?? []}
                project={project}
              />
            ))}
          </SortableContext>
          <AddColumn projectId={project.id} />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rotate-[-2deg] cursor-grabbing">
              <TaskCardView task={activeTask} project={project} dragging />
            </div>
          ) : activeColumn ? (
            <ColumnDragPreview
              column={activeColumn}
              index={localColumns.findIndex((c) => c.id === activeColumn.id)}
              tasks={tasksByColumn[activeColumn.id] ?? []}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function BoardStats({
  project,
  columns,
  tasks,
}: {
  project: Project
  columns: Column[]
  tasks: Task[]
}) {
  const counts = columns.map((c) => ({
    name: c.name,
    n: tasks.filter((t) => t.columnId === c.id).length,
  }))
  const total = tasks.length
  return (
    <div className="hidden border-l border-[color:var(--color-rule)] pl-6 md:block">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
        the tally
      </p>
      <p className="font-display tabular text-5xl leading-none text-ink">
        {total.toString().padStart(2, '0')}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
        total cards · {ACCENT_TOKENS[project.accent].label.toLowerCase()}
      </p>
      <ul className="mt-3 space-y-0.5">
        {counts.map((c) => (
          <li
            key={c.name}
            className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft"
          >
            <span className="truncate">{c.name}</span>
            <span className="tabular text-ink-mute">
              {c.n.toString().padStart(2, '0')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BoardColumn({
  column,
  index,
  tasks,
  project,
}: {
  column: Column
  index: number
  tasks: Task[]
  project: Project
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const [adding, setAdding] = useState(false)

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="flex h-full w-[320px] shrink-0 flex-col border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]"
    >
      <header
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-baseline justify-between border-b border-[color:var(--color-rule)] bg-[color:var(--color-paper)] px-4 py-3 active:cursor-grabbing"
        title="drag to reorder"
      >
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono tabular text-[10px] uppercase tracking-[0.25em] text-ink-mute">
            {String.fromCharCode(65 + index)}.
          </span>
          {renaming ? (
            <form
              onPointerDown={(e) => e.stopPropagation()}
              onSubmit={async (e) => {
                e.preventDefault()
                await renameColumn(column.id, draft)
                setRenaming(false)
              }}
              className="flex-1"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={async () => {
                  await renameColumn(column.id, draft)
                  setRenaming(false)
                }}
                className="w-full border-b border-ink bg-transparent font-display text-lg leading-none focus:outline-none"
              />
            </form>
          ) : (
            <h2
              onDoubleClick={() => {
                setDraft(column.name)
                setRenaming(true)
              }}
              className="font-display text-lg leading-none text-ink"
              title="double-click to rename · drag header to reorder"
            >
              {column.name}
            </h2>
          )}
          <span className="font-mono tabular text-[10px] text-ink-mute">
            {tasks.length}
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (
              confirm(
                `Delete column "${column.name}" and ${tasks.length} card(s)?`,
              )
            ) {
              void deleteColumn(column.id)
            }
          }}
          className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-mute opacity-60 hover:text-vermillion hover:opacity-100"
          aria-label="Delete column"
        >
          ✕
        </button>
      </header>

      <ColumnDroppable columnId={column.id}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} project={project} />
            ))}
            {tasks.length === 0 && !adding && (
              <p className="select-none px-2 py-6 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute/60">
                ·  empty  ·
              </p>
            )}
            {adding && (
              <NewTaskInput
                onCommit={async (title) => {
                  if (title.trim())
                    await createTask(project.id, column.id, title)
                  setAdding(false)
                }}
                onCancel={() => setAdding(false)}
              />
            )}
          </div>
        </SortableContext>
      </ColumnDroppable>

      <footer className="border-t border-[color:var(--color-rule)] bg-[color:var(--color-paper)] px-3 py-2">
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-soft hover:text-vermillion"
        >
          <span className="font-display text-base leading-none">+</span> add a
          card
        </button>
      </footer>
    </section>
  )
}

function ColumnDroppable({
  columnId,
  children,
}: {
  columnId: string
  children: React.ReactNode
}) {
  const { setNodeRef } = useSortable({ id: columnId, data: { type: 'column' } })
  return (
    <div ref={setNodeRef} className="flex flex-1 flex-col">
      {children}
    </div>
  )
}

function NewTaskInput({
  onCommit,
  onCancel,
}: {
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onCommit(value)
      }}
      className="border border-ink bg-paper p-3 shadow-[3px_3px_0_0_var(--color-ink)]"
    >
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onCommit(value)
          } else if (e.key === 'Escape') {
            onCancel()
          }
        }}
        rows={2}
        placeholder="What's the task?"
        className="w-full resize-none bg-transparent font-sans text-[14px] leading-[1.45] text-ink placeholder:text-ink-mute/60 focus:outline-none"
      />
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-ink-mute">
        ↵ save · esc cancel
      </p>
    </form>
  )
}

function SortableTaskCard({
  task,
  project,
}: {
  task: Task
  project: Project
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: 'task', columnId: task.columnId } })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCardView task={task} project={project} />
    </div>
  )
}

function TaskCardView({
  task,
  project,
  dragging = false,
}: {
  task: Task
  project: Project
  dragging?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')

  useEffect(() => {
    setTitle(task.title)
    setNotes(task.notes ?? '')
  }, [task.title, task.notes])

  const tokens = ACCENT_TOKENS[project.accent]

  return (
    <article
      className={`group relative cursor-grab border border-[color:var(--color-rule)] bg-paper px-3.5 py-3 transition active:cursor-grabbing ${
        dragging
          ? 'shadow-[6px_6px_0_0_var(--color-ink)] border-ink'
          : 'hover:border-ink hover:shadow-[3px_3px_0_0_var(--color-ink)]'
      }`}
    >
      <div
        className="absolute top-3 left-0 h-[calc(100%-1.5rem)] w-[3px]"
        style={{ background: tokens.swatch }}
        aria-hidden
      />
      {editing ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-b border-ink bg-transparent font-sans text-[14px] font-medium leading-[1.35] text-ink focus:outline-none"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="notes…"
            className="mt-2 w-full resize-none bg-[color:var(--color-paper-2)] px-2 py-1 text-[12px] text-ink-soft placeholder:text-ink-mute/60 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-3">
            <button
              onClick={async () => {
                await deleteTask(task.id)
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-vermillion hover:underline"
            >
              delete
            </button>
            <button
              onClick={() => {
                setTitle(task.title)
                setNotes(task.notes ?? '')
                setEditing(false)
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute hover:text-ink"
            >
              cancel
            </button>
            <button
              onClick={async () => {
                await updateTask(task.id, { title, notes })
                setEditing(false)
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink hover:text-vermillion"
            >
              save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="pl-2 font-sans text-[14px] font-medium leading-[1.4] text-ink">
            {task.title}
          </p>
          {task.notes && (
            <p className="mt-1.5 pl-2 text-[12px] leading-[1.5] text-ink-soft">
              {task.notes}
            </p>
          )}
          {!dragging && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              className="absolute top-2 right-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute opacity-0 transition hover:text-vermillion group-hover:opacity-100"
            >
              edit
            </button>
          )}
        </>
      )}
    </article>
  )
}

function ColumnDragPreview({
  column,
  index,
  tasks,
}: {
  column: Column
  index: number
  tasks: Task[]
}) {
  return (
    <section className="flex w-[320px] rotate-[-1.5deg] flex-col border border-ink bg-[color:var(--color-paper-2)] shadow-[8px_8px_0_0_var(--color-ink)]">
      <header className="flex items-baseline justify-between border-b border-ink bg-[color:var(--color-paper)] px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono tabular text-[10px] uppercase tracking-[0.25em] text-ink-mute">
            {String.fromCharCode(65 + Math.max(0, index))}.
          </span>
          <h2 className="font-display text-lg leading-none text-ink">
            {column.name}
          </h2>
          <span className="font-mono tabular text-[10px] text-ink-mute">
            {tasks.length}
          </span>
        </div>
      </header>
      <div className="p-3">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
          · moving ·
        </p>
      </div>
    </section>
  )
}

function AddColumn({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex h-full w-[260px] shrink-0 flex-col items-center justify-center gap-2 border border-dashed border-[color:var(--color-rule)] py-12 font-mono text-[11px] uppercase tracking-[0.3em] text-ink-mute transition hover:border-ink hover:text-vermillion"
      >
        <span className="font-display text-3xl leading-none">+</span>
        add a column
      </button>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (name.trim()) await createColumn(projectId, name)
        setName('')
        setAdding(false)
      }}
      className="flex h-full w-[260px] shrink-0 flex-col gap-3 border border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
        New column
      </span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (name.trim()) await createColumn(projectId, name)
          setName('')
          setAdding(false)
        }}
        placeholder="Title"
        className="border-b border-ink bg-transparent pb-1 font-display text-xl text-ink focus:outline-none"
      />
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-mute">
        ↵ save · esc cancel
      </p>
    </form>
  )
}
