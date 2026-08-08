import type { Column } from '../../shared/types'

export function ColumnDragPreview({
  column,
  index,
  count,
}: {
  column: Column
  index: number
  count: number
}) {
  return (
    <section className="flex w-[320px] rotate-[-1.5deg] flex-col border border-ink bg-[color:var(--color-paper-2)] shadow-[8px_8px_0_0_var(--color-ink)]">
      <header className="flex items-baseline justify-between border-b border-ink bg-[color:var(--color-paper)] px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono tabular text-[10px] uppercase tracking-[0.25em] text-ink-mute">
            {String.fromCharCode(65 + Math.max(0, index))}.
          </span>
          <h2 className="font-display text-lg leading-none text-ink">
            {column.name}
          </h2>
          <span className="font-mono tabular text-[10px] text-ink-mute">
            {count}
          </span>
        </div>
      </header>
      <div className="p-3">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
          · moving ·
        </p>
      </div>
    </section>
  )
}
