import { useEffect, useRef } from 'react'
import type { Card, Project } from '../../shared/types'
import { ACCENT_TOKENS } from '../lib/accents'
import { formatMilestoneDate } from '../lib/dates'

/**
 * The full ticket, as a filed record.
 *
 * Cards on the board clamp their description to three lines, because a
 * migrated ticket body runs to nineteen kilobytes and one of them will
 * otherwise stretch a column past the fold. This is where the rest of it lives.
 *
 * Read-only on purpose. The card's own "edit" button still owns editing; a
 * second write path here would be two ways to change the same field, differing
 * in what they save.
 */
export function CardDetail({
  card,
  project,
  columnName,
  onClose,
}: {
  card: Card
  project: Project
  columnName?: string
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // The board scrolls horizontally behind the overlay; letting it move while
    // a ticket is open loses the reader's place in the column.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    panel.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const tokens = ACCENT_TOKENS[project.accent]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--color-ink)]/55 px-4 py-[6vh]"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${card.key ? card.key + ' — ' : ''}${card.title}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="reveal w-full max-w-3xl border border-ink bg-paper shadow-[8px_8px_0_0_var(--color-ink)] focus:outline-none"
      >
        {/* ── masthead ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-5 border-b border-[color:var(--color-rule)] px-7 pt-6 pb-5">
          {card.key && (
            // The key, set as a stamped mark — the same treatment the project
            // sigil gets on the index, because a ticket key is the same kind of
            // thing: the short name you file it under.
            <span
              className="stamp mt-0.5 shrink-0 px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em]"
              style={{ background: tokens.swatch, color: tokens.ink }}
            >
              {card.key}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.05] tracking-[-0.015em] text-ink">
              {card.title}
            </h2>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
              <span>{card.type === 'subboard' ? 'sub-board' : card.type}</span>
              {columnName && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-ink-soft">{columnName}</span>
                </>
              )}
              {card.dueAt && (
                <>
                  <span aria-hidden>·</span>
                  <span>{formatMilestoneDate(card.dueAt)}</span>
                </>
              )}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute transition hover:text-vermillion"
          >
            close ✕
          </button>
        </div>

        {/* ── filing metadata, only when there is any ───────────────── */}
        {(card.tags.length > 0 || card.dependsOn.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] px-7 py-3">
            {card.tags.length > 0 && (
              <Field label="tags">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-[color:var(--color-rule)] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em] text-ink-soft"
                  >
                    {tag}
                  </span>
                ))}
              </Field>
            )}
            {card.dependsOn.length > 0 && (
              <Field label="waits on">
                {card.dependsOn.map((key) => (
                  <span
                    key={key}
                    className="font-mono text-[11px] tracking-[0.1em] text-vermillion"
                  >
                    {key}
                  </span>
                ))}
              </Field>
            )}
          </div>
        )}

        {/* ── the body ─────────────────────────────────────────────── */}
        <div className="max-h-[62vh] overflow-y-auto px-7 py-6">
          {card.notes ? (
            <Markdown source={card.notes} />
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-mute">
              no description
            </p>
          )}

          {card.checklistItems.length > 0 && (
            <ul className="mt-6 border-t border-[color:var(--color-rule)] pt-4">
              {card.checklistItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline gap-2 py-0.5 text-[13px] leading-[1.6]"
                >
                  <span className="font-mono text-[11px] text-ink-mute">
                    {item.done ? '×' : '·'}
                  </span>
                  <span className={item.done ? 'text-ink-mute line-through' : 'text-ink-soft'}>
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-ink-mute">
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
    </div>
  )
}

/**
 * A markdown renderer for the subset the tickets actually use.
 *
 * Deliberately not a dependency. These bodies are `##` headings, `-` bullets,
 * `**bold**`, `` `code` ``, `>` quotes and paragraphs — nothing that earns 40 kB
 * of parser, and a renderer that only handles what is really there cannot
 * mangle what it does not recognise: anything unmatched falls through as plain
 * text rather than disappearing.
 */
function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = []
  const lines = source.split('\n')
  let paragraph: string[] = []
  let bullets: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(
      <p key={blocks.length} className="mb-3 text-[13.5px] leading-[1.65] text-ink-soft">
        {inline(paragraph.join(' '))}
      </p>,
    )
    paragraph = []
  }

  const flushBullets = () => {
    if (!bullets.length) return
    blocks.push(
      <ul key={blocks.length} className="mb-3 space-y-1">
        {bullets.map((b, i) => (
          <li
            key={i}
            className="flex gap-2.5 text-[13.5px] leading-[1.6] text-ink-soft"
          >
            <span className="mt-[2px] shrink-0 font-mono text-[11px] text-ink-mute" aria-hidden>
              —
            </span>
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    )
    bullets = []
  }

  const flush = () => {
    flushParagraph()
    flushBullets()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trim() === '') {
      flush()
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const depth = heading[1]!.length
      blocks.push(
        <h3
          key={blocks.length}
          className={
            depth <= 2
              ? 'mt-6 mb-2 border-b border-[color:var(--color-rule)] pb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute first:mt-0'
              : 'mt-4 mb-1.5 font-display text-[15px] text-ink first:mt-0'
          }
        >
          {heading[2]}
        </h3>,
      )
      continue
    }

    // A rule of three or more dashes/underscores, not a bullet.
    if (/^[-_*]{3,}$/.test(line.trim())) {
      flush()
      blocks.push(
        <hr key={blocks.length} className="my-5 border-[color:var(--color-rule)]" />,
      )
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushParagraph()
      bullets.push(bullet[1]!)
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      flush()
      blocks.push(
        <p
          key={blocks.length}
          className="mb-3 border-l-2 border-[color:var(--color-vermillion)] pl-3 font-display-wonk text-[13.5px] italic leading-[1.6] text-ink-soft"
        >
          {inline(quote[1]!)}
        </p>,
      )
      continue
    }

    // Lazy continuation: a plain line directly under a bullet belongs to that
    // bullet, not to a new paragraph. Ticket bodies wrap their bullets across
    // several lines, so without this every wrapped bullet breaks in half and
    // the second half loses its marker.
    if (bullets.length) {
      bullets[bullets.length - 1] += ` ${line.trim()}`
      continue
    }

    paragraph.push(line)
  }

  flush()
  return <>{blocks}</>
}

/** `**bold**` and `` `code` `` within a line. Everything else stays literal. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      out.push(
        <strong key={out.length} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      )
    } else {
      out.push(
        <code
          key={out.length}
          className="bg-[color:var(--color-paper-3)] px-1 py-[1px] font-mono text-[12px] text-ink"
        >
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = match.index + token.length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}
