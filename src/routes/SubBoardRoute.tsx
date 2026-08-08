import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useBoard, useCardActions, useColumnActions } from '../api/hooks'
import { Board } from '../board/Board'
import { Breadcrumb } from '../board/Breadcrumb'

export function SubBoardRoute() {
  const { projectId, cardId } = useParams({ from: '/p/$projectId/c/$cardId' })

  const { data: board, isFetched } = useBoard({ projectId, parentCardId: cardId })
  const project = board?.project
  // The card itself lives on the PARENT board, not on the sub-board it opens.
  const { data: parentBoard } = useBoard({ projectId })
  const card = parentBoard?.cards.find((c) => c.id === cardId)

  const { createColumn } = useColumnActions()
  const { updateCard } = useCardActions()

  const [editingTitle, setEditingTitle] = useState(false)
  const [draft, setDraft] = useState('')

  // A ref, not state: nothing renders differently while seeding, and setting
  // state inside the effect that reads it is the cascading-render pattern the
  // lint rule is there to catch.
  const seeding = useRef(false)

  /**
   * A sub-board opens empty the first time, so it gets the same four columns a
   * project does.
   *
   * ⚠ Guarded on `isFetched`, not on the count alone. Before the first response
   * lands there is no board at all, and "no columns yet" and "haven't asked yet"
   * would otherwise look identical — seeding on the second creates four columns
   * on every mount. `seeding` covers the window between firing the creates and
   * the refetch reporting them.
   */
  useEffect(() => {
    if (card?.type !== 'subboard' || !isFetched || seeding.current) return
    if (board && board.columns.length === 0) {
      seeding.current = true
      void (async () => {
        const scope = { projectId, parentCardId: cardId }
        for (const name of ['Backlog', 'In Progress', 'Review', 'Done']) {
          await createColumn(scope, name)
        }
        seeding.current = false
      })()
    }
  }, [card?.type, board, isFetched, projectId, cardId, createColumn])

  if (!project || !card) {
    return (
      <div className="px-8 py-24 md:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
          fetching the sub-board…
        </p>
        <Link
          to="/p/$projectId"
          params={{ projectId }}
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-vermillion"
        >
          ← back to project
        </Link>
      </div>
    )
  }

  if (card.type !== 'subboard') {
    return (
      <div className="px-8 py-24 md:px-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-mute">
          this card is not a sub-board.
        </p>
        <Link
          to="/p/$projectId"
          params={{ projectId }}
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-vermillion"
        >
          ← back to project
        </Link>
      </div>
    )
  }

  return (
    <div
      className="flex h-[calc(100vh-105px)] flex-col"
      style={{ viewTransitionName: `card-${cardId}` } as React.CSSProperties}
    >
      <section className="border-b border-[color:var(--color-rule)] px-8 pt-6 pb-5 md:px-12">
        <Breadcrumb
          crumbs={[
            { label: 'all projects', to: '/' },
            { label: project.name, to: '/p/$projectId', params: { projectId } },
            { label: card.title },
          ]}
        />
        {editingTitle ? (
          <form
            className="mt-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (draft.trim()) await updateCard(cardId, { title: draft })
              setEditingTitle(false)
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={async () => {
                if (draft.trim()) await updateCard(cardId, { title: draft })
                setEditingTitle(false)
              }}
              className="w-full max-w-2xl border-b border-ink bg-transparent font-display text-4xl leading-[0.95] tracking-[-0.01em] text-ink focus:outline-none"
            />
          </form>
        ) : (
          <h1
            onDoubleClick={() => {
              setDraft(card.title)
              setEditingTitle(true)
            }}
            className="mt-3 font-display text-[clamp(2rem,4vw,3.5rem)] leading-[0.95] tracking-[-0.02em] text-ink"
            title="double-click to rename"
          >
            {card.title}
          </h1>
        )}
        {card.notes && (
          <p className="mt-2 max-w-xl text-[14px] leading-[1.55] text-ink-soft">
            {card.notes}
          </p>
        )}
      </section>

      <Board scope={{ projectId, parentCardId: cardId }} project={project} />
    </div>
  )
}
