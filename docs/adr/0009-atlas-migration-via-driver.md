# ADR-0009 — Database migration to Atlas via the Node driver (`aitl migrate-atlas`)

- **Status:** Accepted
- **Date:** 2026-06-24

## Context
We need to move the harness database from a local MongoDB (`mongodb-atlas-local`,
`:27018`) to a MongoDB Atlas cluster. The canonical tools are `mongodump`/`mongorestore`,
but on the target machine the **MongoDB Database Tools are not installed**, and the data
set is tiny (≈23 docs across 9 collections). We also hit two real constraints:

1. **Atlas Search / Vector indexes don't round-trip.** `mongorestore` migrates data and
   normal/text indexes, but Atlas Vector/Search indexes are a separate Atlas-managed
   feature and must be (re)created — for this repo, by `aitl init-db` against the target.
2. **Credentials + exfiltration guardrails.** Copying a DB to an external cluster with a
   plaintext credential is correctly blocked by the harness's auto-approval classifier
   when the agent tries to run it. The migration must be runnable **by the user** without
   embedding secrets in code.

## Decision
Add a first-class command **`aitl migrate-atlas <target-uri>`** (`src/migrate/atlas.ts`)
that copies a database between clusters using the Node driver:
- **Data only.** Indexes are deliberately left to `aitl init-db` on the target (correct
  text/vector specs, idempotent). The command prints the exact `init-db` follow-up.
- Source defaults to the configured `MONGODB_URI`/`MONGODB_DB`; `--from`, `--from-db`,
  `--to-db`, `--collections`, `--drop`, `--dry-run` cover the rest.
- **Pings the target first** so an un-allowlisted IP / bad auth fails fast.
- The **target URI (with any credential) is a CLI argument, never hardcoded**; the user
  runs the command, so it stays on the right side of the exfiltration guardrail.

## Consequences
- A repeatable, dependency-free migration (no Database Tools needed) — ideal for the
  small harness DB; for very large DBs, prefer `mongodump`/`mongorestore` + `--oplog`.
- One source of truth for indexes (`init-db`), including the vector index that doesn't
  migrate.
- The agent cannot run the external write itself (guardrail); this is by design — the
  command is the user's to execute, after rotating credentials and allowlisting their IP.
- Parity-neutral: TS-only operational tooling; not in the parity contract.
