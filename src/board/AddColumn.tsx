import { useState } from 'react'
import type { Scope } from '../lib/scope'
import { createColumn } from '../db/db'

export function AddColumn({ scope }: { scope: Scope }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex h-full w-[260px] shrink-0 flex-col items-center justify-center gap-2 border border-dashed border-[color:var(--color-rule)] py-12 font-mono text-[11px] uppercase tracking-[0.3em] text-ink-mute transition hover:border-ink hover:text-vermillion"
      >
        <span className="font-display text-3xl leading-none">+</span>
        add a column
      </button>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (name.trim()) await createColumn(scope, name)
        setName('')
        setAdding(false)
      }}
      className="flex h-full w-[260px] shrink-0 flex-col gap-3 border border-ink bg-paper p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
        New column
      </span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (name.trim()) await createColumn(scope, name)
          setName('')
          setAdding(false)
        }}
        placeholder="Title"
        className="border-b border-ink bg-transparent pb-1 font-display text-xl text-ink focus:outline-none"
      />
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-mute">
        ↵ save · esc cancel
      </p>
    </form>
  )
}
