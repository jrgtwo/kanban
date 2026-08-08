import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Card, Project } from '../../shared/types'
import { useBoard, useCardActions } from '../api/hooks'
import { ACCENT_TOKENS, romanize } from '../lib/accents'

type WithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => void
}

function navigateWithTransition(go: () => void) {
  const doc = document as WithViewTransition
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(go)
  } else {
    go()
  }
}

export function SubBoardCard({
  card,
  project,
  dragging = false,
}: {
  card: Card
  project: Project
  dragging?: boolean
}) {
  const navigate = useNavigate()
  const { updateCard, deleteCard } = useCardActions()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [notes, setNotes] = useState(card.notes ?? '')

  useEffect(() => {
    setTitle(card.title)
    setNotes(card.notes ?? '')
  }, [card.title, card.notes])

  // The progress readout needs this card's own sub-board, which is a different
  // board than the one this card is sitting on.
  const { data: childBoard } = useBoard({
    projectId: card.projectId,
    parentCardId: card.id,
  })
  const childCards = childBoard?.cards
  const childColumns = childBoard?.columns

  const tokens = ACCENT_TOKENS[project.accent]

  const total = childCards?.length ?? 0
  const lastColumnId = childColumns && childColumns.length > 0
    ? childColumns[childColumns.length - 1]!.id
    : undefined
  const done = lastColumnId && childCards
    ? childCards.filter((c) => c.columnId === lastColumnId).length
    : 0

  return (
    <article
      className={`group relative border border-[color:var(--color-rule)] bg-paper px-3.5 py-3 transition ${
        dragging
          ? 'shadow-[6px_6px_0_0_var(--color-ink)] border-ink'
          : 'hover:border-ink hover:shadow-[3px_3px_0_0_var(--color-ink)]'
      } ${editing ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div
        className="absolute top-3 left-0 h-[calc(100%-1.5rem)] w-[3px]"
        style={{ background: tokens.swatch }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1.5 right-1.5 h-2.5 w-2.5 border-t border-r border-ink"
        aria-hidden
      />
      {editing ? (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-b border-ink bg-transparent font-sans text-[14px] font-medium leading-[1.35] text-ink focus:outline-none"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="description…"
            className="mt-2 w-full resize-none bg-[color:var(--color-paper-2)] px-2 py-1 text-[12px] text-ink-soft placeholder:text-ink-mute/60 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-3">
            <button
              onClick={async () => {
                if (
                  confirm(
                    `Delete sub-board "${card.title}" and all of its cards?`,
                  )
                ) {
                  await deleteCard(card.id)
                }
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-vermillion hover:underline"
            >
              delete
            </button>
            <button
              onClick={() => {
                setTitle(card.title)
                setNotes(card.notes ?? '')
                setEditing(false)
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute hover:text-ink"
            >
              cancel
            </button>
            <button
              onClick={async () => {
                await updateCard(card.id, { title, notes })
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
          <button
            type="button"
            onClick={() =>
              navigateWithTransition(() =>
                navigate({
                  to: '/p/$projectId/c/$cardId',
                  params: { projectId: card.projectId, cardId: card.id },
                }),
              )
            }
            className="block w-full text-left"
            style={{ viewTransitionName: `card-${card.id}` } as React.CSSProperties}
          >
            <p className="pl-2 font-sans text-[14px] font-medium leading-[1.4] text-ink">
              {card.title}
            </p>
            {card.notes && (
              <p className="mt-1.5 pl-2 text-[12px] leading-[1.5] text-ink-soft">
                {card.notes}
              </p>
            )}
            <p className="mt-2 pl-2 font-mono tabular text-[10px] uppercase tracking-[0.25em] text-ink-mute">
              {total === 0 ? '· empty ·' : `${romanize(done)} / ${romanize(total)}`}
            </p>
          </button>
          {!dragging && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              className="absolute top-2 right-6 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute opacity-0 transition hover:text-vermillion group-hover:opacity-100"
            >
              edit
            </button>
          )}
        </>
      )}
    </article>
  )
}
