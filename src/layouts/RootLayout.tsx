import { Link, useMatches } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const formatDate = (d: Date) =>
  d
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase()

export function RootLayout({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const isBoard = matches.some((m) => m.routeId.includes('/p/$projectId'))

  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-10 border-b border-[color:var(--color-rule)]">
        <div className="flex items-end justify-between gap-6 px-8 pt-6 pb-3 md:px-12">
          <Link
            to="/"
            className="group flex items-baseline gap-3 no-underline"
          >
            <span className="font-display text-3xl leading-none tracking-tight text-ink md:text-4xl">
              Led<span className="italic">g</span>er
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.35em] text-ink-mute group-hover:text-vermillion md:inline">
              · a private record
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute tabular md:block">
              {formatDate(new Date())}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
              № {isBoard ? 'II — Board' : 'I — Index'}
            </span>
          </div>
        </div>

        {/* Double-rule masthead */}
        <div className="h-[3px] border-t border-b border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)]" />
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[color:var(--color-rule)] px-8 py-4 md:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
          Filed locally · IndexedDB · No server, no telemetry, no leakage
        </p>
      </footer>
    </div>
  )
}
