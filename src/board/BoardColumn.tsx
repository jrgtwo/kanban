import { useMemo, useState } from 'react'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Column, Project } from '../../shared/types'
import type { Scope } from '../lib/scope'
import { useColumnActions } from '../api/hooks'
import { SortableCardShell } from '../cards/SortableCardShell'
import { NewCardInput } from './NewCardInput'

export function BoardColumn({
  column,
  index,
  cards,
  project,
  scope,
}: {
  column: Column
  index: number
  cards: Card[]
  project: Project
  scope: Scope
}) {
  const { renameColumn, deleteColumn } = useColumnActions()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const [adding, setAdding] = useState(false)

  const cardIds = useMemo(() => cards.map((c) => c.id), [cards])

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: 'column' } })

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
              onKeyDown={(e) => e.stopPropagation()}
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
            {cards.length}
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (
              confirm(
                `Delete column "${column.name}" and ${cards.length} card(s)?`,
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
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {cards.map((card) => (
              <SortableCardShell key={card.id} card={card} project={project} />
            ))}
            {cards.length === 0 && !adding && (
              <p className="select-none px-2 py-6 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute/60">
                ·  empty  ·
              </p>
            )}
            {adding && (
              <NewCardInput
                scope={scope}
                columnId={column.id}
                onClose={() => setAdding(false)}
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
          <span className="font-display text-base leading-none">+</span> add a card
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
