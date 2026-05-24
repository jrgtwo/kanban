import type { Card, Column, Project } from '../db/types'
import { ACCENT_TOKENS } from '../lib/accents'

export function BoardStats({
  project,
  columns,
  cards,
}: {
  project: Project
  columns: Column[]
  cards: Card[]
}) {
  const counts = columns.map((c) => ({
    name: c.name,
    n: cards.filter((t) => t.columnId === c.id).length,
  }))
  const total = cards.length
  return (
    <div className="hidden border-l border-[color:var(--color-rule)] pl-6 md:block">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
        the tally
      </p>
      <p className="font-display tabular text-5xl leading-none text-ink">
        {total.toString().padStart(2, '0')}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
        total cards · {ACCENT_TOKENS[project.accent].label.toLowerCase()}
      </p>
      <ul className="mt-3 space-y-0.5">
        {counts.map((c) => (
          <li
            key={c.name}
            className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft"
          >
            <span className="truncate">{c.name}</span>
            <span className="tabular text-ink-mute">
              {c.n.toString().padStart(2, '0')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
