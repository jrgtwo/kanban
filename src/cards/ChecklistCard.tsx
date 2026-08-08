import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import type { Card, ChecklistItem, Project } from '../../shared/types'
import { ACCENT_TOKENS, romanize } from '../lib/accents'
import { useCardActions } from '../api/hooks'

export function ChecklistCard({
  card,
  project,
  dragging = false,
}: {
  card: Card
  project: Project
  dragging?: boolean
}) {
  const { updateCard, deleteCard } = useCardActions()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [items, setItems] = useState<ChecklistItem[]>(card.checklistItems ?? [])
  const [newItem, setNewItem] = useState('')

  useEffect(() => {
    setTitle(card.title)
    setItems(card.checklistItems ?? [])
  }, [card.title, card.checklistItems])

  const tokens = ACCENT_TOKENS[project.accent]

  const toggle = async (itemId: string) => {
    const next = items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i))
    setItems(next)
    await updateCard(card.id, { checklistItems: next })
  }

  const totalDone = items.filter((i) => i.done).length

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
          <ul className="mt-2 space-y-1">
            {items.map((it, idx) => (
              <li key={it.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={() =>
                    setItems((curr) =>
                      curr.map((c) => (c.id === it.id ? { ...c, done: !c.done } : c)),
                    )
                  }
                />
                <input
                  value={it.text}
                  onChange={(e) =>
                    setItems((curr) =>
                      curr.map((c) => (c.id === it.id ? { ...c, text: e.target.value } : c)),
                    )
                  }
                  className="flex-1 border-b border-[color:var(--color-rule)] bg-transparent pb-0.5 font-mono text-[12px] text-ink focus:outline-none"
                />
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() =>
                    setItems((curr) => {
                      const next = [...curr]
                      const tmp = next[idx - 1]!
                      next[idx - 1] = next[idx]!
                      next[idx] = tmp
                      return next
                    })
                  }
                  className="font-mono text-[10px] text-ink-mute disabled:opacity-30 hover:text-vermillion"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={idx === items.length - 1}
                  onClick={() =>
                    setItems((curr) => {
                      const next = [...curr]
                      const tmp = next[idx + 1]!
                      next[idx + 1] = next[idx]!
                      next[idx] = tmp
                      return next
                    })
                  }
                  className="font-mono text-[10px] text-ink-mute disabled:opacity-30 hover:text-vermillion"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setItems((curr) => curr.filter((c) => c.id !== it.id))}
                  className="font-mono text-[10px] text-vermillion hover:underline"
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="add item"
              className="flex-1 border-b border-[color:var(--color-rule)] bg-transparent pb-0.5 font-mono text-[12px] text-ink placeholder:text-ink-mute/60 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim()) {
                  e.preventDefault()
                  setItems((curr) => [
                    ...curr,
                    { id: nanoid(8), text: newItem.trim(), done: false },
                  ])
                  setNewItem('')
                }
              }}
            />
          </div>
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
                setItems(card.checklistItems ?? [])
                setNewItem('')
                setEditing(false)
              }}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute hover:text-ink"
            >
              cancel
            </button>
            <button
              onClick={async () => {
                await updateCard(card.id, { title, checklistItems: items })
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
          {items.length > 0 && (
            <ul className="mt-1.5 pl-2 space-y-0.5">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-2 font-mono text-[11px] text-ink-soft"
                >
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={() => void toggle(it.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <span className={it.done ? 'line-through text-ink-mute' : ''}>
                    {it.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 pl-2 font-mono tabular text-[10px] uppercase tracking-[0.2em] text-ink-mute">
            ✓ {romanize(totalDone)} / {romanize(items.length)}
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
