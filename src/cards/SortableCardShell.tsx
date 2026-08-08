import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Project } from '../../shared/types'
import { TaskCard } from './TaskCard'
import { NoteCard } from './NoteCard'
import { ChecklistCard } from './ChecklistCard'
import { MilestoneCard } from './MilestoneCard'
import { SubBoardCard } from './SubBoardCard'
import { CardDetail } from './CardDetail'

/** Beyond this many pixels the gesture was a drag, not a click. Matches the
 *  pointer sensor's `activationConstraint.distance` in `Board.tsx` — if that
 *  changes, this has to move with it or a drag will also open the ticket. */
const DRAG_SLOP = 5

export function SortableCardShell({
  card,
  project,
  columnName,
  overlay = false,
}: {
  card: Card
  project: Project
  columnName?: string
  overlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: 'card', columnId: card.columnId } })

  const [open, setOpen] = useState(false)
  const origin = useRef<{ x: number; y: number } | null>(null)

  const style: React.CSSProperties = overlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }

  /**
   * Open the ticket on a click, but never at the end of a drag.
   *
   * dnd-kit's pointer sensor only *starts* a drag past its activation distance;
   * it does not suppress the click that follows one. So the distance is
   * measured here too, and a pointer that travelled counts as a drag even if
   * the drag never activated — which is the case when you nudge a card and let
   * go.
   *
   * Sub-boards are excluded: clicking one navigates into its board, and that is
   * a more useful thing for a click to do than describing the card you are
   * about to leave.
   */
  const openable = !overlay && card.type !== 'subboard'

  const gesture = openable
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          origin.current = { x: e.clientX, y: e.clientY }
        },
        onClick: (e: React.MouseEvent) => {
          // Anything with its own handler — the edit button, a checklist box —
          // stops propagation already; this is the card body itself.
          const from = origin.current
          origin.current = null
          if (!from) return
          if (
            Math.abs(e.clientX - from.x) > DRAG_SLOP ||
            Math.abs(e.clientY - from.y) > DRAG_SLOP
          ) {
            return
          }
          setOpen(true)
        },
      }
    : {}

  const props = overlay ? {} : { ref: setNodeRef, ...attributes, ...listeners }

  return (
    <>
      <div {...props} {...gesture} style={style}>
        {renderCard(card, project, overlay)}
      </div>
      {open && (
        <CardDetail
          card={card}
          project={project}
          columnName={columnName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function renderCard(card: Card, project: Project, dragging: boolean) {
  switch (card.type) {
    case 'task':
      return <TaskCard card={card} project={project} dragging={dragging} />
    case 'note':
      return <NoteCard card={card} dragging={dragging} />
    case 'checklist':
      return <ChecklistCard card={card} project={project} dragging={dragging} />
    case 'milestone':
      return <MilestoneCard card={card} dragging={dragging} />
    case 'subboard':
      return <SubBoardCard card={card} project={project} dragging={dragging} />
  }
}
