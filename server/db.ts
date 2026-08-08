import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * The database file. Overridable so tests can point at a temp file and so a
 * hosted deployment can put it on a mounted volume.
 */
export const DB_PATH =
  process.env.KANBAN_DB ?? path.resolve(here, '..', 'kanban.db')

export type DB = Database.Database

/**
 * Open a connection and bring it up to the latest schema.
 *
 * Migrations are numbered `.sql` files applied in filename order, each inside a
 * transaction, with the highest applied number recorded in `schema_version`.
 * That is the whole mechanism — no ORM, no migration library.
 *
 * ⚠ **Never edit an applied migration.** Add a new numbered file. An edited one
 * runs on nobody's database except a fresh clone's, which is the failure mode
 * where two developers have different schemas and both are "correct".
 */
export function openDb(file: string = DB_PATH): DB {
  const db = new Database(file)

  // Required for `ON DELETE CASCADE` to do anything at all — SQLite has foreign
  // keys off by default, and a schema full of ignored constraints looks exactly
  // like a schema full of enforced ones until something dangles.
  db.pragma('foreign_keys = ON')

  // WAL lets the API read while a write is in flight. The board is small enough
  // that it hardly matters today; it matters the first time an agent and a
  // browser touch it at once.
  db.pragma('journal_mode = WAL')

  migrate(db)
  return db
}

function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_version')
      .all()
      .map((r) => (r as { version: number }).version),
  )

  const dir = path.join(here, 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const version = Number(file.slice(0, file.indexOf('_')))
    if (Number.isNaN(version)) {
      throw new Error(
        `Migration "${file}" does not start with a number. Name them 001_thing.sql.`,
      )
    }
    if (applied.has(version)) continue

    const sql = readFileSync(path.join(dir, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.prepare(
        'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
      ).run(version, Date.now())
    })()
  }
}
