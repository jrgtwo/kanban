import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Project } from '../../shared/types'
import { TaskCard } from './TaskCard'
import { NoteCard } from './NoteCard'
import { ChecklistCard } from './ChecklistCard'
import { MilestoneCard } from './MilestoneCard'
import { SubBoardCard } from './SubBoardCard'

export function SortableCardShell({
  card,
  project,
  overlay = false,
}: {
  card: Card
  project: Project
  overlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: 'card', columnId: card.columnId } })

  const style: React.CSSProperties = overlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }

  const props = overlay ? {} : { ref: setNodeRef, ...attributes, ...listeners }

  return (
    <div {...props} style={style}>
      {renderCard(card, project, overlay)}
    </div>
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
