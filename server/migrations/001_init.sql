-- Initial schema.
--
-- Two things worth knowing before editing this file:
--
-- 1. `order` is a reserved word in SQL, so the column is `position` everywhere in
--    the database and is mapped back to `order` at the API boundary. The client
--    contract keeps the name it has always had; only storage differs.
--
-- 2. `columns.parent_card_id` and `cards.column_id` point at each other, so a
--    real foreign key in both directions would be circular. `cards.column_id`
--    carries the constraint because it is the one that must never dangle;
--    sub-board cascade is done in application code, in one place, the way
--    `cascadeDeleteSubBoard` did it in the Dexie version.

CREATE TABLE projects (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT,
  sigil       TEXT    NOT NULL,
  accent      TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE columns (
  id             TEXT    PRIMARY KEY,
  project_id     TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_card_id TEXT,
  name           TEXT    NOT NULL,
  position       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX columns_by_project ON columns(project_id, position);
CREATE INDEX columns_by_parent  ON columns(parent_card_id, position);

CREATE TABLE cards (
  id             TEXT    PRIMARY KEY,
  project_id     TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_card_id TEXT,
  column_id      TEXT    NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  type           TEXT    NOT NULL,

  -- The human key: "AG-06". Optional, but unique within a project when present.
  -- SQLite treats NULLs as distinct in a UNIQUE index, so any number of cards
  -- may have no key — which is what makes this addable to an existing board.
  key            TEXT,

  title          TEXT    NOT NULL,
  notes          TEXT,

  -- JSON-encoded arrays. SQLite has no array type and these are never queried
  -- by element, only read whole with the card.
  checklist_items TEXT   NOT NULL DEFAULT '[]',
  tags            TEXT   NOT NULL DEFAULT '[]',
  depends_on      TEXT   NOT NULL DEFAULT '[]',

  due_at         INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX cards_by_column  ON cards(column_id, position);
CREATE INDEX cards_by_project ON cards(project_id);
CREATE INDEX cards_by_parent  ON cards(parent_card_id);
CREATE UNIQUE INDEX cards_key_per_project ON cards(project_id, key);
