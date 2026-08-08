import { useEffect, useState } from 'react'
import type { Card } from '../../shared/types'
import { useCardActions } from '../api/hooks'

export function NoteCard({
  card,
  dragging = false,
}: {
  card: Card
  dragging?: boolean
}) {
  const { updateCard, deleteCard } = useCardActions()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [notes, setNotes] = useState(card.notes ?? '')

  useEffect(() => {
    setTitle(card.title)
    setNotes(card.notes ?? '')
  }, [card.title, card.notes])

  return (
    <article
      className={`group relative cursor-grab border border-[color:var(--color-rule)] bg-[color:var(--color-paper-3)] px-3.5 py-3 transition active:cursor-grabbing ${
        dragging
          ? 'shadow-[6px_6px_0_0_var(--color-ink)] border-ink'
          : 'hover:border-ink hover:shadow-[3px_3px_0_0_var(--color-ink)]'
      }`}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-l border-b border-[color:var(--color-rule)] bg-paper"
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
            className="w-full border-b border-ink bg-transparent font-display text-[15px] leading-tight text-ink focus:outline-none"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="…"
            className="mt-2 w-full resize-none bg-transparent font-display-wonk text-[13px] italic leading-[1.5] text-ink-soft placeholder:text-ink-mute/60 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-3">
            <button
              onClick={async () => {
                await deleteCard(card.id)
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
          <p className="pr-4 font-display text-[15px] leading-tight text-ink">
            {card.title}
          </p>
          {card.notes && (
            <p className="mt-1.5 font-display-wonk text-[13px] italic leading-[1.5] text-ink-soft whitespace-pre-wrap">
              {card.notes}
            </p>
          )}
          {!dragging && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              className="absolute top-2 right-4 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute opacity-0 transition hover:text-vermillion group-hover:opacity-100"
            >
              edit
            </button>
          )}
        </>
      )}
    </article>
  )
}
