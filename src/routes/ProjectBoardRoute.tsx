import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, renameProject } from '../db/db'
import { ACCENT_TOKENS } from '../lib/accents'
import { Board } from '../board/Board'
import { BoardStats } from '../board/BoardStats'

export function ProjectBoardRoute() {
  const { projectId } = useParams({ from: '/p/$projectId' })
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])

  const columnsDb = useLiveQuery(
    async () => {
      const all = await db.columns.where({ projectId }).sortBy('order')
      return all.filter((c) => !c.parentCardId)
    },
    [projectId],
  )
  const cardsDb = useLiveQuery(
    async () => {
      const all = await db.cards.where({ projectId }).sortBy('order')
      return all.filter((c) => !c.parentCardId)
    },
    [projectId],
  )

  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)

  if (!project) {
    return (
      <div className="px-8 py-24 md:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
          fetching the page…
        </p>
        <Link
          to="/"
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-vermillion"
        >
          ← back to index
        </Link>
      </div>
    )
  }

  const tokens = ACCENT_TOKENS[project.accent]

  return (
    <div className="flex h-[calc(100vh-105px)] flex-col">
      <section className="border-b border-[color:var(--color-rule)] px-8 pt-6 pb-5 md:px-12">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <div
              className="stamp flex h-14 w-14 shrink-0 items-center justify-center font-display text-3xl leading-none"
              style={{ background: tokens.swatch, color: tokens.ink }}
            >
              {project.sigil}
            </div>
            <div>
              <Link
                to="/"
                className="mb-1 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute hover:text-vermillion"
              >
                ← all projects
              </Link>
              {editingTitle ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (titleDraft.trim())
                      await renameProject(project.id, { name: titleDraft })
                    setEditingTitle(false)
                  }}
                >
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    className="w-full max-w-2xl border-b border-ink bg-transparent font-display text-5xl leading-[0.95] tracking-[-0.01em] text-ink focus:outline-none"
                  />
                </form>
              ) : (
                <h1
                  onDoubleClick={() => {
                    setTitleDraft(project.name)
                    setEditingTitle(true)
                  }}
                  className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] tracking-[-0.02em] text-ink"
                  title="double-click to rename"
                >
                  {project.name}
                </h1>
              )}
              {project.description && (
                <p className="mt-2 max-w-xl text-[14px] leading-[1.55] text-ink-soft">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {columnsDb && cardsDb && (
            <BoardStats project={project} columns={columnsDb} cards={cardsDb} />
          )}
        </div>
      </section>

      <Board scope={{ projectId }} project={project} />
    </div>
  )
}
