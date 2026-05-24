import { useEffect, useMemo, useState } from 'react'
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
} from '@dnd-kit/sortable'
import { db, moveCard, reorderColumns } from '../db/db'
import type { Card, Column, Project } from '../db/types'
import type { Scope } from '../lib/scope'
import { BoardColumn } from './BoardColumn'
import { AddColumn } from './AddColumn'
import { ColumnDragPreview } from './ColumnDragPreview'
import { SortableCardShell } from '../cards/SortableCardShell'

export function Board({
  scope,
  project,
}: {
  scope: Scope
  project: Project
}) {
  const columnsDb = useLiveQuery(async () => {
    if (scope.parentCardId) {
      return db.columns.where({ parentCardId: scope.parentCardId }).sortBy('order')
    }
    const all = await db.columns.where({ projectId: scope.projectId }).sortBy('order')
    return all.filter((c) => !c.parentCardId)
  }, [scope.projectId, scope.parentCardId])

  const cardsDb = useLiveQuery(async () => {
    if (scope.parentCardId) {
      return db.cards.where({ parentCardId: scope.parentCardId }).sortBy('order')
    }
    const all = await db.cards.where({ projectId: scope.projectId }).sortBy('order')
    return all.filter((c) => !c.parentCardId)
  }, [scope.projectId, scope.parentCardId])

  const [localCards, setLocalCards] = useState<Card[] | null>(null)
  const [localColumns, setLocalColumns] = useState<Column[] | null>(null)
  useEffect(() => {
    if (cardsDb) setLocalCards(cardsDb)
  }, [cardsDb])
  useEffect(() => {
    if (columnsDb) setLocalColumns(columnsDb)
  }, [columnsDb])

  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [activeColumn, setActiveColumn] = useState<Column | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const cardsByColumn = useMemo(() => {
    const map: Record<string, Card[]> = {}
    if (!localColumns || !localCards) return map
    for (const c of localColumns) map[c.id] = []
    for (const t of localCards) {
      if (!map[t.columnId]) map[t.columnId] = []
      map[t.columnId]!.push(t)
    }
    for (const k of Object.keys(map))
      map[k]!.sort((a, b) => a.order - b.order)
    return map
  }, [localColumns, localCards])

  if (!localColumns || !localCards) return null

  const findColumnIdOfCard = (cardId: string): string | undefined =>
    localCards.find((t) => t.id === cardId)?.columnId

  const isColumnId = (cid: string) => localColumns.some((c) => c.id === cid)

  const onDragStart = (e: DragStartEvent) => {
    const dragId = String(e.active.id)
    const type = e.active.data.current?.type
    if (type === 'column') {
      setActiveColumn(localColumns.find((x) => x.id === dragId) ?? null)
      return
    }
    setActiveCard(localCards.find((x) => x.id === dragId) ?? null)
  }

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    if (active.data.current?.type === 'column') return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const fromColumn = findColumnIdOfCard(activeId)
    if (!fromColumn) return

    const overIsColumn = isColumnId(overId)
    const toColumn = overIsColumn ? overId : findColumnIdOfCard(overId)
    if (!toColumn) return

    if (fromColumn === toColumn) {
      setLocalCards((curr) => {
        if (!curr) return curr
        const list = curr.filter((t) => t.columnId === toColumn)
        const oldIdx = list.findIndex((t) => t.id === activeId)
        const newIdx = list.findIndex((t) => t.id === overId)
        if (oldIdx === -1 || newIdx === -1) return curr
        const moved = arrayMove(list, oldIdx, newIdx).map((t, i) => ({
          ...t,
          order: i,
        }))
        return curr.filter((t) => t.columnId !== toColumn).concat(moved)
      })
      return
    }

    setLocalCards((curr) => {
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
    setActiveCard(null)
    setActiveColumn(null)

    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    if (active.data.current?.type === 'column' && wasActiveColumn) {
      if (activeId === overId) return
      let overColId: string | undefined
      if (isColumnId(overId)) overColId = overId
      else overColId = findColumnIdOfCard(overId)
      if (!overColId || overColId === activeId) return

      const oldIdx = localColumns.findIndex((c) => c.id === activeId)
      const newIdx = localColumns.findIndex((c) => c.id === overColId)
      if (oldIdx === -1 || newIdx === -1) return

      const next = arrayMove(localColumns, oldIdx, newIdx).map((c, i) => ({
        ...c,
        order: i,
      }))
      setLocalColumns(next)
      await reorderColumns(next.map((c) => c.id))
      return
    }

    const card = localCards.find((t) => t.id === activeId)
    if (!card) return

    const colCards = localCards
      .filter((t) => t.columnId === card.columnId)
      .sort((a, b) => a.order - b.order)
    const newIndex = colCards.findIndex((t) => t.id === activeId)
    await moveCard(activeId, card.columnId, newIndex)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveCard(null)
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
              cards={cardsByColumn[col.id] ?? []}
              project={project}
              scope={scope}
            />
          ))}
        </SortableContext>
        <AddColumn scope={scope} />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="rotate-[-2deg] cursor-grabbing">
            <SortableCardShell card={activeCard} project={project} overlay />
          </div>
        ) : activeColumn ? (
          <ColumnDragPreview
            column={activeColumn}
            index={localColumns.findIndex((c) => c.id === activeColumn.id)}
            count={cardsByColumn[activeColumn.id]?.length ?? 0}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
