# 0037. Repo map is branch-aware with a constant storage footprint

- Status: accepted
- Date: 2026-07-01

## Context

The repo map (`symbols` collection) did not record which git branch it represented, and it
indexed build output (`dist/`) alongside source — roughly doubling the symbol set with
compiled-code noise that also polluted PageRank and the token budget of `get_repomap` /
`hydrate`. File paths were stored absolute (non-portable). Built on top of the now-Mongoose
Symbol model (ADR-0036).

## Decision

Add a `branch` field to the Symbol model. `RepoMap.build` stamps `currentBranch(root)` on
every symbol, stores paths relative to `root`, and keeps `deleteMany({project,repo})` +
`insertMany` so exactly one branch's snapshot exists at a time (constant footprint — not
per-branch accumulation). `walkSources` respects `.gitignore` via the `ignore` library
(excluding `dist/`, `logs/`, …) on top of the `.git`/`node_modules` baseline.
`RepoMap.render` emits a stderr staleness warning when the stored branch differs from the
current branch (no auto-rebuild on the per-prompt path). `buildSymbolGraph` propagates
`branch` to graph nodes; the DOT serializer (`graphToDot`) is unchanged.

## Consequences

- The map is a faithful projection of the active branch, portable, and free of `dist/`
  noise (a full index now excludes build output). Footprint stays constant across
  re-indexes and branch switches.
- A full parse still runs per index (`mtime` is stored but not used to skip — a future
  optimization).
- New tests: `repomap.test.ts` (dist exclusion, relative paths, branch stamping, constant
  count) + a graph branch-node test. Verified: typecheck 0, 51/51 tests, `aitl repomap`
  indexes with relative paths + branch, 0 `dist/` symbols.
