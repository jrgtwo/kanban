# Ledger

A quiet, local-only kanban for the projects you keep — built as a single-page React app. Each project gets its own board; every card you write lives in your browser's IndexedDB and nowhere else.

![Index view](docs/screenshot-index.png)

![Board view](docs/screenshot-board.png)

## What it does

- Create, rename, and delete multiple **projects**, each with its own sigil, accent color, and description.
- Each project has its own **board** with columns (`Backlog`, `In Progress`, `Review`, `Done` by default).
- Add columns, rename them (double-click the title), reorder them (drag the header), or delete them.
- Add task **cards** to any column, edit their title and notes, and drag them within or across columns.
- Everything persists to IndexedDB locally — no server, no telemetry, no account.

## Stack

- **Vite** + **React 19** + **TypeScript** (strict).
- **TanStack Router** for routing (code-based).
- **Dexie** + `dexie-react-hooks` for IndexedDB persistence and live queries.
- **`@dnd-kit`** for accessible drag and drop (cards and columns).
- **Tailwind v4** (CSS-first config in `src/index.css`) with a custom editorial design system: **Fraunces** display, **Inter Tight** body, **JetBrains Mono** captions, paper + ink palette with a vermillion accent.

## Running it

```bash
npm install
npm run dev        # http://localhost:5273 (auto-bumps if taken)
npm run build      # tsc -b && vite build
npm run preview    # serve the production build
```

## Regenerating the screenshots

The images in `docs/` are produced by a Playwright script that seeds the IndexedDB with demo data and captures both views. To regenerate them, start the dev server in one terminal and run the script in another:

```bash
npm run dev          # terminal 1
npm run screenshot   # terminal 2 — writes docs/screenshot-index.png and docs/screenshot-board.png
```

**The script wipes the Dexie database first** — run it in a separate browser profile, or back up your data before running.

## Project layout

```
src/
  main.tsx              React mount + RouterProvider
  router.tsx            TanStack Router (code-based) — root + two routes
  index.css             Tailwind import + @theme tokens + @utility helpers
  layouts/RootLayout    Masthead, date strip, footer
  routes/
    ProjectsIndex       Landing page + project cards + new-project dialog
    ProjectBoard        Board view (DndContext, columns, cards, stats)
  db/
    types.ts            Project, Column, Task interfaces
    db.ts               Dexie schema + all mutators
  lib/accents.ts        Accent palette tokens + roman-numeral helper
scripts/screenshot.mjs  Playwright README-screenshot generator
docs/                   Generated screenshots
current-status.md       Detailed app state, conventions, and architecture notes
CLAUDE.md               Guidance for AI coding assistants working in this repo
```

See `current-status.md` for the data model, the drag-and-drop architecture, design tokens, and known gaps.
