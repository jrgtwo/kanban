import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useCreateProject, useDeleteProject, useProjects } from '../api/hooks'
import type { Project } from '../../shared/types'
import { ACCENT_TOKENS, romanize } from '../lib/accents'

export function ProjectsIndex() {
  const [creating, setCreating] = useState(false)
  const { data: projects } = useProjects()

  // The server counts cards per project in one grouped query, so this is a
  // lookup rather than a second round of requests.
  const counts: Record<string, number> = Object.fromEntries(
    (projects ?? []).map((p) => [p.id, p.cardCount ?? 0]),
  )

  if (projects === undefined) {
    return (
      <div className="px-8 py-24 md:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
          loading the ledger…
        </p>
      </div>
    )
  }

  return (
    <div className="px-8 pt-10 pb-24 md:px-12">
      {/* Editorial header */}
      <section className="reveal grid grid-cols-12 gap-6 border-b border-[color:var(--color-rule)] pb-10">
        <div className="col-span-12 md:col-span-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-vermillion">
            ◆ Volume I
          </p>
          <h1 className="font-display mt-3 text-[clamp(3rem,9vw,7.5rem)] leading-[0.92] tracking-[-0.02em] text-ink">
            Every project you{' '}
            <span className="font-display-wonk italic text-vermillion">
              keep
            </span>
            ,
            <br />
            and the work it asks of you.
          </h1>
        </div>
        <div className="col-span-12 flex flex-col justify-end gap-4 md:col-span-5 md:items-end">
          <p className="max-w-sm font-sans text-[15px] leading-[1.55] text-ink-soft md:text-right">
            A quiet kanban for the things you carry. Each project keeps its own
            board, its own cards, its own pace. Nothing leaves your browser.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="group flex items-center gap-3 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-paper transition hover:bg-vermillion hover:border-vermillion"
          >
            <span>Begin a new project</span>
            <span className="font-display text-base leading-none transition group-hover:translate-x-1">
              →
            </span>
          </button>
        </div>
      </section>

      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          existingCount={projects.length}
        />
      )}

      {/* Grid of projects */}
      {projects.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <section className="mt-12">
          <div className="mb-6 flex items-baseline justify-between border-b border-[color:var(--color-rule)] pb-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-soft">
              The Index
            </h2>
            <p className="font-mono tabular text-[11px] tracking-[0.2em] text-ink-mute">
              {projects.length.toString().padStart(2, '0')} ·{' '}
              {projects.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                index={projects.length - i}
                taskCount={counts?.[p.id] ?? 0}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  index,
  taskCount,
}: {
  project: Project
  index: number
  taskCount: number
}) {
  const deleteProject = useDeleteProject()
  const tokens = ACCENT_TOKENS[project.accent]
  return (
    <li className="reveal group relative">
      <Link
        to="/p/$projectId"
        params={{ projectId: project.id }}
        className="flex h-full flex-col border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] no-underline transition-all hover:border-ink hover:shadow-[6px_6px_0_0_var(--color-ink)]"
      >
        {/* Card head */}
        <div className="flex items-start justify-between border-b border-[color:var(--color-rule)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center font-display text-2xl leading-none"
              style={{ background: tokens.swatch, color: tokens.ink }}
            >
              {project.sigil}
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-mute">
                № {romanize(index)}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">
                {tokens.label}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault()
              if (
                confirm(
                  `Delete "${project.name}" and all its cards? This cannot be undone.`,
                )
              ) {
                deleteProject.mutate(project.id)
              }
            }}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mute opacity-0 transition hover:text-vermillion group-hover:opacity-100"
            aria-label="Delete project"
          >
            ✕ delete
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col justify-between gap-6 px-5 py-6">
          <div>
            <h3 className="font-display text-3xl leading-[1.05] tracking-[-0.01em] text-ink">
              {project.name}
            </h3>
            {project.description && (
              <p className="mt-3 text-[14px] leading-[1.55] text-ink-soft">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex items-end justify-between border-t border-dashed border-[color:var(--color-rule)] pt-3">
            <span className="font-mono tabular text-[11px] uppercase tracking-[0.2em] text-ink-mute">
              {taskCount.toString().padStart(2, '0')} task
              {taskCount === 1 ? '' : 's'}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink transition group-hover:text-vermillion">
              open →
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="reveal mt-16 grid grid-cols-12 gap-6">
      <div className="col-span-12 md:col-span-8 md:col-start-3">
        <div className="border border-dashed border-[color:var(--color-rule)] px-8 py-16 text-center">
          <p className="font-display-wonk text-[88px] leading-none text-vermillion-soft">
            ¶
          </p>
          <h2 className="font-display mt-6 text-3xl text-ink">
            The page is blank — for now.
          </h2>
          <p className="mt-3 text-[15px] text-ink-soft">
            Start your first project to populate the ledger.
          </p>
          <button
            onClick={onCreate}
            className="mt-8 border border-ink bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-paper transition hover:bg-vermillion hover:border-vermillion"
          >
            Begin →
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateProjectDialog({
  onClose,
  existingCount,
}: {
  onClose: () => void
  existingCount: number
}) {
  const createProject = useCreateProject()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [accent, setAccent] = useState<Project['accent']>('vermillion')
  const [sigil, setSigil] = useState('')

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createProject.mutateAsync({
      name,
      description,
      accent,
      sigil: sigil || undefined,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handle}
        onClick={(e) => e.stopPropagation()}
        className="reveal w-full max-w-lg border border-ink bg-paper shadow-[10px_10px_0_0_var(--color-ink)]"
      >
        <div className="flex items-baseline justify-between border-b border-[color:var(--color-rule)] px-6 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
            entry № {romanize(existingCount + 1)}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-mute hover:text-vermillion"
          >
            close ✕
          </button>
        </div>
        <div className="px-6 py-7">
          <h2 className="font-display text-4xl leading-[0.95] tracking-[-0.01em] text-ink">
            Name the new
            <br />
            <span className="font-display-wonk italic text-vermillion">
              project.
            </span>
          </h2>

          <label className="mt-7 block">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
              Title
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring catalogue"
              className="mt-2 w-full border-b border-ink bg-transparent pb-2 font-display text-2xl leading-tight text-ink placeholder:text-ink-mute/60 focus:outline-none"
            />
          </label>

          <label className="mt-6 block">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A short note for future you."
              className="mt-2 w-full resize-none border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] px-3 py-2 text-[14px] text-ink placeholder:text-ink-mute/60 focus:border-ink focus:outline-none"
            />
          </label>

          <div className="mt-6 flex gap-6">
            <label className="flex-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
                Sigil
              </span>
              <input
                value={sigil}
                onChange={(e) =>
                  setSigil(e.target.value.toUpperCase().slice(0, 2))
                }
                placeholder={name.charAt(0).toUpperCase() || 'A'}
                maxLength={2}
                className="mt-2 w-full border border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] px-3 py-2 text-center font-display text-2xl text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <div className="flex-[2]">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
                Accent
              </span>
              <div className="mt-2 flex gap-2">
                {(
                  Object.entries(ACCENT_TOKENS) as [
                    Project['accent'],
                    (typeof ACCENT_TOKENS)[Project['accent']],
                  ][]
                ).map(([key, tk]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAccent(key)}
                    aria-label={tk.label}
                    className={`relative h-11 flex-1 border transition ${
                      accent === key
                        ? 'border-ink shadow-[3px_3px_0_0_var(--color-ink)]'
                        : 'border-[color:var(--color-rule)]'
                    }`}
                    style={{ background: tk.swatch }}
                  >
                    {accent === key && (
                      <span
                        className="font-display text-lg"
                        style={{ color: tk.ink }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-[color:var(--color-rule)] bg-[color:var(--color-paper-2)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-mute hover:text-ink"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="border border-ink bg-ink px-5 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-paper transition hover:bg-vermillion hover:border-vermillion disabled:opacity-30"
          >
            File it →
          </button>
        </div>
      </form>
    </div>
  )
}
