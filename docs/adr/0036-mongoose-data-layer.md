# 0036. Data layer migrated from the raw mongodb driver + Zod to Mongoose

- Status: accepted
- Date: 2026-07-01

## Context

The durable data layer was migrated, per an explicit directive, from the raw `mongodb`
driver with Zod document schemas to **Mongoose** models — a single source of shape +
validation + types. Hard constraint: keep the exact Atlas `mongodb+srv://` seedlist
connection (no shard hosts, no `directConnection`). No data migration: the same
collections and documents, only the access layer changes.

## Decision

All 20 collections now have Mongoose models under `src/models/*.model.ts`, migrated
incrementally: connection foundation (`src/db/mongoose.ts`: connect with primary→fallback
on the same srv URI; `getDb()` coexists) → isolated catalogs (softwares/repos/branches/
prompts/symbols/conventions/categories) → agents/skills (one `DefinitionRecord` schema,
two models via `.clone()`) + roles (stored in `agents`) → users/audit → mcp_context/
mcp_tool_calls → memory/messages/decisions/history/events (preserving `$vectorSearch`, the
vector→text→recency cascade, and append-only `*_history`) → runs.

`BASE_SCHEMA_OPTS` (`versionKey:false`, `timestamps:false`, `minimize:false`) keeps
documents byte-compatible with pre-migration data. `runs` uses `_id:String` (app-supplied
UUID) + `strict:false` so dynamic telemetry written via `$set` survives. Zod is retained
ONLY for non-collection shapes: MCP tool params (SDK requirement), config settings, and
the `Role` value-object. The raw driver `getDb()` is retained as a deliberate coexistence
layer for the hexagonal `graph/source` port, index bootstrap (`db/indexes.ts`, incl.
`createSearchIndex`), and a few cross-collection reads.

## Consequences

- Mongoose is the single source of document shape/types; ~180 call sites migrated across
  ~35 files; verified green at every phase (typecheck, tests, `aitl search`/`hydrate`/
  `role list`/`check-db`/`run-show`; no `__v` corruption; embeddings stripped on reads).
- `make*` builders call `validateSync()`, deprecated in Mongoose 9 and removed in 10 —
  convert to async `validate()` (or move validation to write time) when bumping to
  Mongoose 10.
- Two connection pools (Mongoose + the retained driver) coexist; they can be unified later
  by backing `getDb()` with `mongoose.connection`.
