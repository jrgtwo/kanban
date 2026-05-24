export type DateBand = 'past' | 'near' | 'soon' | 'far'

export function bandFor(dueAt: number | undefined, now: number = Date.now()): DateBand {
  if (!dueAt) return 'far'
  const days = (dueAt - now) / (1000 * 60 * 60 * 24)
  if (days < 0) return 'past'
  if (days <= 3) return 'near'
  if (days <= 14) return 'soon'
  return 'far'
}

export function formatMilestoneDate(dueAt: number | undefined): string {
  if (!dueAt) return '—'
  const d = new Date(dueAt)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
