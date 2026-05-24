import { useEffect, useState } from 'react'
import type { Card } from '../db/types'
import { deleteCard, updateCard } from '../db/db'
import { bandFor, formatMilestoneDate, type DateBand } from '../lib/dates'

const BAND_COLOR: Record<DateBand, string> = {
  past: 'var(--color-ink-mute)',
  near: 'var(--color-vermillion)',
  soon: 'var(--color-ochre)',
  far: 'var(--color-ink-mute)',
}

const BAND_LABEL: Record<DateBand, string> = {
  past: 'past',
  near: 'soon',
  soon: 'upcoming',
  far: 'scheduled',
}

export function MilestoneCard({
  card,
  dragging = false,
}: {
  card: Card
  dragging?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [dueStr, setDueStr] = useState(toDateInputValue(card.dueAt))

  useEffect(() => {
    setTitle(card.title)
    setDueStr(toDateInputValue(card.dueAt))
  }, [card.title, card.dueAt])

  const band = bandFor(card.dueAt)
  const color = BAND_COLOR[band]

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
        style={{ background: color }}
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
          <input
            type="date"
            value={dueStr}
            onChange={(e) => setDueStr(e.target.value)}
            className="mt-2 w-full border-b border-[color:var(--color-rule)] bg-transparent pb-1 font-mono text-[12px] text-ink-soft focus:outline-none"
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
                setDueStr(toDateInputValue(card.dueAt))
                setEditing(false)
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute hover:text-ink"
            >
              cancel
            </button>
            <button
              onClick={async () => {
                const ms = dueStr ? new Date(dueStr + 'T12:00:00').getTime() : undefined
                await updateCard(card.id, { title, dueAt: ms })
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
          <p className="pl-2 font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color }}>
            {BAND_LABEL[band]}
          </p>
          <p
            className="pl-2 font-display text-[28px] leading-none tracking-[-0.01em] text-ink"
            style={{ color }}
          >
            {formatMilestoneDate(card.dueAt)}
          </p>
          <p className="mt-1.5 pl-2 font-sans text-[13px] leading-[1.4] text-ink-soft">
            {card.title}
          </p>
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

function toDateInputValue(ms: number | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
