// scripts/screenshot.mjs
// Capture marketing screenshots for the README.
// Usage: npm run screenshot   (dev server must be running on $PORT or 5273)

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'docs')
const PORT = process.env.PORT ?? 5273
const ORIGIN = `http://localhost:${PORT}`

const VIEWPORT = { width: 1440, height: 900 }

// ---------- Demo seed (runs in page context) ----------
async function seed(page) {
  await page.evaluate(async () => {
    // Wipe + reseed. Uses the same Dexie schema as the app.
    const Dexie = (await import('/node_modules/dexie/dist/modern/dexie.mjs'))
      .default
    const db = new Dexie('ledger')
    db.version(2).stores({
      projects: 'id, name, createdAt',
      columns: 'id, projectId, parentCardId, order, [projectId+order], [parentCardId+order]',
      cards: 'id, projectId, parentCardId, columnId, order, type, [columnId+order]',
    })
    await db.transaction('rw', db.projects, db.columns, db.cards, async () => {
      await db.cards.clear()
      await db.columns.clear()
      await db.projects.clear()
    })

    const nid = (n = 10) =>
      Array.from(crypto.getRandomValues(new Uint8Array(n)))
        .map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36])
        .join('')

    const now = Date.now()

    const projects = [
      {
        id: nid(),
        name: 'Spring Catalogue',
        description:
          'Editorial redesign of the seasonal print catalogue — type, layout, photography.',
        sigil: 'SC',
        accent: 'vermillion',
        createdAt: now - 1000 * 60 * 60 * 24 * 5,
        updatedAt: now,
      },
      {
        id: nid(),
        name: 'House move',
        description: 'Logistics for the September move. Boxes, utilities, mail.',
        sigil: 'H',
        accent: 'ochre',
        createdAt: now - 1000 * 60 * 60 * 24 * 12,
        updatedAt: now,
      },
      {
        id: nid(),
        name: 'Garden journal',
        description: 'Beds, varieties, planting & harvest log for the back garden.',
        sigil: 'G',
        accent: 'moss',
        createdAt: now - 1000 * 60 * 60 * 24 * 28,
        updatedAt: now,
      },
      {
        id: nid(),
        name: 'Reading list',
        description: 'Books to finish, to start, to set aside.',
        sigil: '¶',
        accent: 'ink',
        createdAt: now - 1000 * 60 * 60 * 24 * 40,
        updatedAt: now,
      },
    ]
    await db.projects.bulkAdd(projects)

    const defaults = ['Backlog', 'In Progress', 'Review', 'Done']

    // Tasks per project (we'll go deep on Spring Catalogue for the board shot).
    const taskSets = {
      'Spring Catalogue': {
        Backlog: [
          {
            title: 'Source paper stock samples',
            notes: 'Mohawk Superfine vs. Strathmore — request two of each.',
          },
          { title: 'Re-photograph the linen series' },
          { title: 'Draft cover treatment, option B' },
          { title: 'Pull quotes from designer interviews' },
        ],
        'In Progress': [
          {
            title: 'Set the masthead in Fraunces',
            notes: 'Try opsz 144 with SOFT 100, see how it reads at 80pt.',
          },
          { title: 'Lay out the table of contents' },
        ],
        Review: [
          { title: 'Editor pass on intro essay' },
          {
            title: 'Color proof of spread 12–13',
            notes: 'Vermillion is reading a touch orange. Compare against PMS 179.',
          },
        ],
        Done: [
          { title: 'Lock the grid system' },
          { title: 'Choose body face — Inter Tight 16/24' },
          { title: 'Confirm trim size with printer' },
        ],
      },
      'House move': {
        Backlog: [
          { title: 'Forward mail with USPS' },
          { title: 'Schedule cable transfer' },
          { title: 'Donate the bookshelf' },
        ],
        'In Progress': [{ title: 'Pack the studio — books first' }],
        Review: [],
        Done: [
          { title: 'Sign new lease' },
          { title: 'Hire movers (Sept 14)' },
        ],
      },
      'Garden journal': {
        Backlog: [{ title: 'Plant garlic by Oct 30' }],
        'In Progress': [
          { title: 'Sketch bed 3 with crop rotation', notes: '3-year cycle, nightshades last.' },
        ],
        Review: [],
        Done: [{ title: 'Harvest tomatoes — green tomato chutney' }],
      },
      'Reading list': {
        Backlog: [
          { title: 'Le Guin — The Dispossessed' },
          { title: 'Berger — Ways of Seeing' },
        ],
        'In Progress': [{ title: 'Calvino — Invisible Cities' }],
        Review: [],
        Done: [{ title: 'Beauty and aesthetics in design — finished' }],
      },
    }

    for (const project of projects) {
      const cols = defaults.map((name, i) => ({
        id: nid(),
        projectId: project.id,
        name,
        order: i,
        createdAt: now,
      }))
      await db.columns.bulkAdd(cols)
      const colByName = Object.fromEntries(cols.map((c) => [c.name, c]))

      const set = taskSets[project.name] ?? {}
      for (const [colName, items] of Object.entries(set)) {
        const col = colByName[colName]
        if (!col) continue
        await db.cards.bulkAdd(
          items.map((t, i) => ({
            id: nid(),
            projectId: project.id,
            columnId: col.id,
            type: 'task',
            title: t.title,
            notes: t.notes,
            order: i,
            createdAt: now,
            updatedAt: now,
          })),
        )
      }
    }
  })
}

async function waitForFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  // 1. Visit the app once so Dexie's IndexedDB origin is initialized.
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })

  // 2. Seed.
  await seed(page)

  // 3. Reload to pick up seeded data.
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
  await waitForFonts(page)
  await page.waitForTimeout(400)
  await page.screenshot({
    path: resolve(OUT_DIR, 'screenshot-index.png'),
    fullPage: false,
  })
  console.log('captured docs/screenshot-index.png')

  // 4. Navigate to the first project's board.
  const href = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/p/"]')
    return a?.getAttribute('href') ?? null
  })
  if (!href) throw new Error('no project link found on index page')

  await page.goto(`${ORIGIN}${href}`, { waitUntil: 'networkidle' })
  await waitForFonts(page)
  await page.waitForTimeout(400)
  await page.screenshot({
    path: resolve(OUT_DIR, 'screenshot-board.png'),
    fullPage: false,
  })
  console.log('captured docs/screenshot-board.png')

  await browser.close()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
