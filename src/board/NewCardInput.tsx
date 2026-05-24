import { useState } from 'react'
import { nanoid } from 'nanoid'
import type { CardType, ChecklistItem } from '../db/types'
import type { Scope } from '../lib/scope'
import { createCard } from '../db/db'
import { CardTypePicker } from '../cards/CardTypePicker'

export function NewCardInput({
  scope,
  columnId,
  onClose,
}: {
  scope: Scope
  columnId: string
  onClose: () => void
}) {
  const [chosenType, setChosenType] = useState<CardType | null>(null)
  const allowSubBoard = !scope.parentCardId

  if (!chosenType) {
    return <CardTypePicker onPick={setChosenType} onCancel={onClose} allowSubBoard={allowSubBoard} />
  }

  return (
    <TypeForm
      type={chosenType}
      onCancel={onClose}
      onCommit={async (input) => {
        await createCard(scope, columnId, input)
        onClose()
      }}
    />
  )
}

function TypeForm({
  type,
  onCancel,
  onCommit,
}: {
  type: CardType
  onCancel: () => void
  onCommit: (input: {
    type: CardType
    title: string
    notes?: string
    dueAt?: number
    checklistItems?: ChecklistItem[]
  }) => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [firstItem, setFirstItem] = useState('')
  const [dueAt, setDueAt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      onCancel()
      return
    }
    if (type === 'checklist') {
      const items: ChecklistItem[] = firstItem.trim()
        ? [{ id: nanoid(8), text: firstItem.trim(), done: false }]
        : []
      void onCommit({ type, title: trimmed, checklistItems: items })
      return
    }
    if (type === 'milestone') {
      const ms = dueAt ? new Date(dueAt + 'T12:00:00').getTime() : undefined
      void onCommit({ type, title: trimmed, dueAt: ms })
      return
    }
    void onCommit({ type, title: trimmed })
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={onKey}
      className="border border-ink bg-paper p-3 shadow-[3px_3px_0_0_var(--color-ink)]"
    >
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
        new {type === 'subboard' ? 'sub-board' : type}
      </p>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="title"
        className="w-full border-b border-ink bg-transparent pb-1 font-sans text-[14px] font-medium text-ink placeholder:text-ink-mute/60 focus:outline-none"
      />
      {type === 'checklist' && (
        <input
          value={firstItem}
          onChange={(e) => setFirstItem(e.target.value)}
          placeholder="first item (optional)"
          className="mt-2 w-full border-b border-[color:var(--color-rule)] bg-transparent pb-1 font-mono text-[12px] text-ink-soft placeholder:text-ink-mute/60 focus:outline-none"
        />
      )}
      {type === 'milestone' && (
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="mt-2 w-full border-b border-[color:var(--color-rule)] bg-transparent pb-1 font-mono text-[12px] text-ink-soft focus:outline-none"
        />
      )}
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.25em] text-ink-mute">
        ↵ save · esc cancel
      </p>
    </form>
  )
}
