import { Link } from '@tanstack/react-router'

export interface Crumb {
  label: string
  to?: string
  params?: Record<string, string>
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-baseline gap-2">
            {c.to ? (
              <Link
                to={c.to}
                params={c.params}
                className="hover:text-vermillion"
              >
                {c.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-ink' : ''}>{c.label}</span>
            )}
            {!isLast && <span aria-hidden>›</span>}
          </span>
        )
      })}
    </nav>
  )
}
