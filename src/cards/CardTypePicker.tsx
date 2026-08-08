import type { CardType } from '../../shared/types'

const ALL_TYPES: { type: CardType; label: string }[] = [
  { type: 'task', label: 'task' },
  { type: 'subboard', label: 'sub-board' },
  { type: 'note', label: 'note' },
  { type: 'checklist', label: 'checklist' },
  { type: 'milestone', label: 'milestone' },
]

export function CardTypePicker({
  onPick,
  onCancel,
  allowSubBoard,
}: {
  onPick: (type: CardType) => void
  onCancel: () => void
  allowSubBoard: boolean
}) {
  const visible = allowSubBoard ? ALL_TYPES : ALL_TYPES.filter((t) => t.type !== 'subboard')

  return (
    <div
      className="border border-ink bg-paper p-3 shadow-[3px_3px_0_0_var(--color-ink)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
        new card ——————————————
      </p>
      <ul>
        {visible.map((t) => (
          <li key={t.type}>
            <button
              autoFocus={t.type === 'task'}
              onClick={() => onPick(t.type)}
              className="flex w-full items-baseline gap-2 px-1 py-1 text-left font-mono text-[12px] lowercase tracking-[0.05em] text-ink hover:text-vermillion"
            >
              <span aria-hidden>›</span>
              <span>{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
