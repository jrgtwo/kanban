import { useEffect, useState } from 'react'
import type { Card, Project } from '../db/types'
import { ACCENT_TOKENS } from '../lib/accents'
import { deleteCard, updateCard } from '../db/db'

export function TaskCard({
  card,
  project,
  dragging = false,
}: {
  card: Card
  project: Project
  dragging?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [notes, setNotes] = useState(card.notes ?? '')

  useEffect(() => {
    setTitle(card.title)
    setNotes(card.notes ?? '')
  }, [card.title, card.notes])

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
            placeholder="notes…"
            className="mt-2 w-full resize-none bg-[color:var(--color-paper-2)] px-2 py-1 text-[12px] text-ink-soft placeholder:text-ink-mute/60 focus:outline-none"
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
          <p className="pl-2 font-sans text-[14px] font-medium leading-[1.4] text-ink">
            {card.title}
          </p>
          {card.notes && (
            <p className="mt-1.5 pl-2 text-[12px] leading-[1.5] text-ink-soft">
              {card.notes}
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
